import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getNowInTz } from '@/lib/utils/brazil-date';
import { getRestaurantTimezone } from '@/lib/utils/restaurant-time';
import { getAccountIdForRestaurant } from '@/lib/supabase/accounts';
import { getAccountBilling, canExecuteTasks } from '@/lib/billing/subscription-access';
import { buildAccessDeniedResponse } from '@/lib/billing/errors';
import { trackChecklistEvent } from '@/lib/analytics/track-event';
import { buildTasksSnapshot } from '@/lib/services/checklist-snapshot';
import { emitDomainEvent } from '@/lib/notifications/emit';

const getAdminSupabase = () =>
    createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id: checklistId } = await params;
        const body = await request.json();
        const { restaurant_id, observation } = body;

        if (!restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório' }, { status: 400 });
        }

        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }
        const token = authHeader.replace('Bearer ', '');
        const adminSupabase = getAdminSupabase();

        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);
        if (userError || !user) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }

        const { data: membership } = await adminSupabase
            .from('restaurant_users')
            .select('id')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .eq('active', true)
            .maybeSingle();
        if (!membership) {
            return NextResponse.json({ error: 'Sem acesso a este restaurante' }, { status: 403 });
        }

        // Enforcement billing
        const accountId = await getAccountIdForRestaurant(adminSupabase, restaurant_id);
        if (!accountId) {
            return NextResponse.json({ error: 'Unidade não pertence a nenhuma account.' }, { status: 404 });
        }
        const billing = await getAccountBilling(adminSupabase, accountId);
        const accessCheck = canExecuteTasks(billing);
        if (!accessCheck.allowed) return buildAccessDeniedResponse(accessCheck);

        const { data: checklistOwner } = await adminSupabase
            .from('checklists')
            .select('id, restaurant_id')
            .eq('id', checklistId)
            .maybeSingle();
        if (!checklistOwner || checklistOwner.restaurant_id !== restaurant_id) {
            return NextResponse.json({ error: 'Checklist inválido' }, { status: 404 });
        }

        const userName = user.user_metadata?.name || user.email || 'Funcionário';
        const dateKey = getNowInTz(await getRestaurantTimezone(adminSupabase, restaurant_id)).dateKey;
        const now = new Date().toISOString();

        // Upsert assumption with completion data
        const { data: existing } = await adminSupabase
            .from('checklist_assumptions')
            .select('id')
            .eq('checklist_id', checklistId)
            .eq('date_key', dateKey)
            .maybeSingle();

        let assumption;
        if (existing) {
            const { data, error } = await adminSupabase
                .from('checklist_assumptions')
                .update({
                    completed_at: now,
                    execution_status: 'done',
                    completed_by_user_id: user.id,
                    completed_by_user_name: userName,
                    ...(observation !== undefined && { observation }),
                })
                .eq('id', existing.id)
                .select()
                .single();
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            assumption = data;
        } else {
            // Sprint 88 — sessão criada direto na conclusão (rotina concluída sem assume prévio).
            // Também precisa do snapshot da composição, senão a auditoria dessa execução cairia no
            // fallback (definição atual) e voltaria a ser reescrita por edições futuras da rotina.
            const tasksSnapshot = await buildTasksSnapshot(adminSupabase, checklistId);

            const { data, error } = await adminSupabase
                .from('checklist_assumptions')
                .insert({
                    restaurant_id,
                    checklist_id: checklistId,
                    user_id: user.id,
                    user_name: userName,
                    date_key: dateKey,
                    completed_at: now,
                    execution_status: 'done',
                    completed_by_user_id: user.id,
                    completed_by_user_name: userName,
                    tasks_snapshot: tasksSnapshot,
                    ...(observation !== undefined && { observation }),
                })
                .select()
                .single();
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            assumption = data;
        }

        await trackChecklistEvent('checklist_completed', {
            accountId,
            restaurantId: restaurant_id,
            userId: user.id,
            metadata: {
                checklist_id: checklistId,
                assumption_id: assumption?.id ?? null,
                date_key: dateKey,
                has_observation: !!observation?.trim(),
            },
        });

        // Sprint 53 — auto-archive de one-shot: agora que a assumption foi
        // marcada com completed_at, instâncias descartáveis (ex.: recebimento
        // rápido) saem das queries active=true. Histórico fica preservado pela
        // assumption. Só dispara quando o checklist é is_one_shot=true; rotinas
        // recorrentes não são afetadas. Idempotente (set active=false várias
        // vezes é no-op). Falha aqui apenas loga — não invalida a conclusão.
        try {
            const { data: clMeta } = await adminSupabase
                .from('checklists')
                .select('is_one_shot, active')
                .eq('id', checklistId)
                .maybeSingle();
            if (clMeta?.is_one_shot && clMeta.active) {
                const { error: archiveError } = await adminSupabase
                    .from('checklists')
                    .update({ active: false })
                    .eq('id', checklistId)
                    .eq('is_one_shot', true);
                if (archiveError) {
                    console.error('[POST /api/checklists/[id]/complete] auto-archive falhou:', archiveError, { checklist_id: checklistId });
                }
            }
        } catch (archiveErr) {
            console.error('[POST /api/checklists/[id]/complete] auto-archive exception:', archiveErr, { checklist_id: checklistId });
        }

        // ── s90: a notificação vira CONSEQUÊNCIA de um evento de domínio ─────
        //
        // Antes, esta rota montava a notificação inline: escolhia os destinatários,
        // escrevia o texto e o `related_id`, e engolia qualquer erro num `catch`. Era
        // a "lógica espalhada" que o redesenho veio matar — e, se o insert falhasse, a
        // notificação sumia sem deixar rastro.
        //
        // Agora a rota só DECLARA o que aconteceu. Destinatário, prioridade, texto e
        // destino são decididos pelo materializador, em um só lugar. Falha vira um
        // evento `pending` com `last_error`, reprocessado pelo cron.
        //
        // O `date_key` e o `assumption_id` viajam no payload — é o que permite ao
        // deep-link abrir a execução do dia CERTO, e não a de hoje.
        if (observation && observation.trim()) {
            const { data: checklist } = await adminSupabase
                .from('checklists')
                .select('name')
                .eq('id', checklistId)
                .maybeSingle();

            const text = observation.trim();

            await emitDomainEvent(adminSupabase, 'RoutineCompletedWithNote', {
                restaurantId: restaurant_id,
                actorUserId: user.id,
                payload: {
                    checklist_id: checklistId,
                    checklist_assumption_id: assumption?.id ?? null,
                    date_key: dateKey,
                    completed_by_user_id: user.id,
                    checklist_name: checklist?.name ?? 'Rotina',
                    completed_by_name: userName,
                    excerpt: text.length > 120 ? `${text.slice(0, 120)}…` : text,
                },
            });
        }

        return NextResponse.json({ assumption });
    } catch (error: unknown) {
        console.error('[POST /api/checklists/[id]/complete] Erro:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
