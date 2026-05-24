/**
 * Sprint 48 — Materialização de expectativas de recebimento.
 *
 * Reaproveita 100% do avaliador de recorrência usado pelo Meu Turno
 * (`filterChecklistsByRecurrence`). Nenhum scheduler paralelo.
 *
 * Idempotência garantida via UNIQUE(checklist_id, expected_date) + ON CONFLICT
 * DO NOTHING — abrir o Meu Turno várias vezes nunca duplica linhas.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RecurrenceConfig, RecurrenceV2 } from '@/lib/types';
import { getBrazilNow } from '@/lib/utils/brazil-date';
import { filterChecklistsByRecurrence } from '@/lib/utils/should-checklist-appear-today';

type ReceivingChecklistRow = {
    id: string;
    restaurant_id: string;
    name?: string | null;
    supplier_name?: string | null;
    shift?: string | null;
    start_time?: string | null;
    end_time?: string | null;
    recurrence?: string | null;
    recurrence_config?: RecurrenceConfig | RecurrenceV2 | null;
    receiving_generation?: 'automatic' | 'manager_confirmation' | null;
};

/**
 * Materializa as expectativas de recebimento do dia (brazil) para um restaurante.
 * Retorna o número de linhas inseridas (excluindo as ignoradas pelo ON CONFLICT).
 *
 * Sprint 51: novas linhas em status='pending' disparam notification
 * RECEIVING_PENDING_CONFIRMATION para owner/manager. Reusa tabela `notifications`.
 */
export async function materializeReceivingForToday(
    supabase: SupabaseClient,
    restaurantId: string,
): Promise<{ inserted: number; evaluated: number }> {
    const brazil = getBrazilNow();

    const [{ data: checklists }, { data: shifts }] = await Promise.all([
        supabase
            .from('checklists')
            .select('id, restaurant_id, name, supplier_name, shift, start_time, end_time, recurrence, recurrence_config, receiving_generation')
            .eq('restaurant_id', restaurantId)
            .eq('checklist_type', 'receiving')
            .eq('receiving_mode', 'recurring')
            .eq('active', true)
            .eq('status', 'active'),
        supabase
            .from('shifts')
            .select('shift_type, days_of_week')
            .eq('restaurant_id', restaurantId)
            .eq('active', true),
    ]);

    if (!checklists || checklists.length === 0) {
        return { inserted: 0, evaluated: 0 };
    }

    const visible = filterChecklistsByRecurrence(
        checklists as ReceivingChecklistRow[],
        brazil.dayOfWeek,
        brazil.dateKey,
        shifts ?? [],
    );

    if (visible.length === 0) {
        return { inserted: 0, evaluated: checklists.length };
    }

    const rows = visible.map((c) => ({
        restaurant_id: c.restaurant_id,
        checklist_id: c.id,
        expected_date: brazil.dateKey,
        expected_window_start: c.start_time ?? null,
        expected_window_end: c.end_time ?? null,
        status: c.receiving_generation === 'manager_confirmation' ? 'pending' : 'confirmed',
    }));

    // ON CONFLICT (checklist_id, expected_date) DO NOTHING via upsert + ignoreDuplicates.
    const { data: inserted, error } = await supabase
        .from('receiving_expectations')
        .upsert(rows, { onConflict: 'checklist_id,expected_date', ignoreDuplicates: true })
        .select('id, checklist_id, status');

    if (error) {
        console.error('[materializeReceivingForToday] upsert error:', error);
        throw error;
    }

    // Sprint 51: notificar managers sobre novos pendings (somente os realmente inseridos
    // — upsert+ignoreDuplicates não retorna conflitos, então cada id aqui é uma linha nova).
    const pendingInserted = (inserted ?? []).filter((r) => r.status === 'pending');
    if (pendingInserted.length > 0) {
        await notifyManagersOfPending(supabase, restaurantId, pendingInserted, visible);
    }

    return { inserted: inserted?.length ?? 0, evaluated: visible.length };
}

async function notifyManagersOfPending(
    supabase: SupabaseClient,
    restaurantId: string,
    pendingRows: Array<{ id: string; checklist_id: string }>,
    visibleChecklists: ReceivingChecklistRow[],
): Promise<void> {
    const { data: managers } = await supabase
        .from('restaurant_users')
        .select('user_id')
        .eq('restaurant_id', restaurantId)
        .in('role', ['owner', 'manager'])
        .eq('active', true);
    const managerIds = (managers ?? []).map((m) => m.user_id);
    if (managerIds.length === 0) return;

    const checklistById = new Map(visibleChecklists.map((c) => [c.id, c]));
    const notifications: Array<Record<string, unknown>> = [];
    for (const row of pendingRows) {
        const cl = checklistById.get(row.checklist_id);
        const name = cl?.name || 'Recebimento';
        const supplier = cl?.supplier_name || null;
        const title = 'Novo recebimento aguardando confirmação';
        const description = supplier
            ? `${name} — ${supplier}: confirme para liberar à equipe.`
            : `${name}: confirme para liberar à equipe.`;
        for (const uid of managerIds) {
            notifications.push({
                restaurant_id: restaurantId,
                user_id: uid,
                type: 'RECEIVING_PENDING_CONFIRMATION',
                title,
                description,
                related_id: row.id,
                metadata: { expectation_id: row.id, checklist_id: row.checklist_id },
            });
        }
    }
    if (notifications.length === 0) return;

    const { error } = await supabase.from('notifications').insert(notifications);
    if (error) console.error('[materializeReceivingForToday] notify pending error:', error);
}
