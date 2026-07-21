import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAccountIdForRestaurant } from '@/lib/supabase/accounts';
import { getAccountBilling, canManageChecklists } from '@/lib/billing/subscription-access';
import { buildAccessDeniedResponse } from '@/lib/billing/errors';
import {
    fetchAreaIdsByChecklist,
    fetchResponsibleIdsByChecklist,
} from '@/lib/api/area-links';
import { validateTransferTarget } from '@/lib/api/validate-transfer-target';
import { trackAdminEvent } from '@/lib/analytics/track-event';
import { getNowInTz } from '@/lib/utils/brazil-date';
import { getRestaurantTimezone } from '@/lib/utils/restaurant-time';
import { isTransferReasonCode, validateWindow } from '@/lib/utils/temporary-transfer';
import { activateTransfer, TRANSFER_COLUMNS, type TemporaryTransferRow } from '@/lib/api/temporary-transfer';

const getAdminSupabase = () => {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
};

/**
 * POST /api/checklists/temporary-transfer
 *
 * Agenda uma transferência TEMPORÁRIA de responsável: durante a janela a rotina fica
 * com o substituto e, no fim, volta sozinha para o original (job `temporary-transfers`).
 *
 * Diferença para `transfer-responsible` (permanente): aqui o vínculo original é
 * guardado no ledger `checklist_temporary_transfers` e restaurado automaticamente.
 * As REGRAS DE ELEGIBILIDADE do destino são as mesmas — literalmente a mesma função
 * (`validateTransferTarget`), para que não possam divergir.
 *
 * Toda validação ocorre ANTES de qualquer escrita (all-or-nothing), como na rota
 * permanente. Aceita `checklist_ids[]` para permitir ação em massa no futuro sem
 * mudança de contrato.
 */
export async function POST(request: Request) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Não autorizado. Token ausente.' }, { status: 401 });
        }
        const token = authHeader.replace('Bearer ', '');

        const adminSupabase = getAdminSupabase();
        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);

        if (userError || !user) {
            console.error('[POST /api/checklists/temporary-transfer] Auth error:', userError);
            return NextResponse.json({ error: 'Não autorizado ou token inválido.' }, { status: 401 });
        }

        const body = await request.json();
        const {
            restaurant_id,
            checklist_ids,
            to_user_id,
            starts_on,
            ends_on,
            reason_code,
            reason_note,
        } = body as {
            restaurant_id?: string;
            checklist_ids?: string[];
            to_user_id?: string;
            starts_on?: string;
            ends_on?: string;
            reason_code?: string | null;
            reason_note?: string | null;
        };

        // 1. Validação de entrada
        if (!restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório.' }, { status: 400 });
        }
        if (!Array.isArray(checklist_ids) || checklist_ids.length === 0) {
            return NextResponse.json({ error: 'Selecione ao menos uma rotina.' }, { status: 400 });
        }
        if (!to_user_id) {
            return NextResponse.json({ error: 'Selecione o colaborador de destino.' }, { status: 400 });
        }
        const ids = [...new Set(checklist_ids)];

        // 2. Permissão (manager/owner)
        const { data: userRole } = await adminSupabase
            .from('restaurant_users')
            .select('role')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .eq('active', true)
            .single();

        if (!userRole || userRole.role === 'staff') {
            return NextResponse.json({ error: 'Permissões insuficientes.' }, { status: 403 });
        }

        // 3. Billing
        const accountId = await getAccountIdForRestaurant(adminSupabase, restaurant_id);
        if (!accountId) {
            return NextResponse.json({ error: 'Unidade não pertence a nenhuma account.' }, { status: 404 });
        }
        const billing = await getAccountBilling(adminSupabase, accountId);
        const access = canManageChecklists(billing);
        if (!access.allowed) return buildAccessDeniedResponse(access);

        // 4. Janela — validada no FUSO DO RESTAURANTE (ADR-1), nunca no do servidor.
        const tz = await getRestaurantTimezone(adminSupabase, restaurant_id);
        const today = getNowInTz(tz).dateKey;

        const windowErr = validateWindow(starts_on, ends_on, today);
        if (windowErr) {
            return NextResponse.json({ error: windowErr }, { status: 400 });
        }

        // 5. Motivo (ADR-3) — opcional, mas se vier tem de ser do vocabulário.
        const note = typeof reason_note === 'string' ? reason_note.trim() : '';
        if (reason_code != null && reason_code !== '' && !isTransferReasonCode(reason_code)) {
            return NextResponse.json({ error: 'Motivo inválido.' }, { status: 400 });
        }
        if (reason_code === 'outro' && note.length === 0) {
            return NextResponse.json(
                { error: 'Descreva o motivo quando selecionar "Outro".' },
                { status: 400 }
            );
        }

        // 6. Carregar rotinas selecionadas (escopo do restaurante)
        const { data: rows, error: rowsErr } = await adminSupabase
            .from('checklists')
            .select('id, name, restaurant_id')
            .in('id', ids)
            .eq('restaurant_id', restaurant_id);

        if (rowsErr) {
            console.error('[POST /api/checklists/temporary-transfer] Erro ao buscar rotinas:', rowsErr);
            return NextResponse.json({ error: 'Erro ao carregar rotinas.' }, { status: 500 });
        }
        if (!rows || rows.length !== ids.length) {
            return NextResponse.json(
                { error: 'Uma ou mais rotinas selecionadas não pertencem a esta unidade.' },
                { status: 422 }
            );
        }

        // 7. Exatamente UM responsável direto (mesma restrição da transferência
        //    permanente: com 2+ responsáveis, "quem sai?" fica ambíguo).
        const responsibleMap = await fetchResponsibleIdsByChecklist(adminSupabase, ids);
        if (rows.some((r) => (responsibleMap.get(r.id) ?? []).length !== 1)) {
            return NextResponse.json(
                { error: 'Apenas rotinas atribuídas diretamente a um único colaborador podem ser transferidas.' },
                { status: 422 }
            );
        }

        // 8. Origem única + mesmo conjunto de áreas
        const sourceUserId = (responsibleMap.get(rows[0].id) ?? [])[0];
        const areaMap = await fetchAreaIdsByChecklist(adminSupabase, ids);
        const areaKey = (id: string) => [...(areaMap.get(id) ?? [])].sort().join(',');
        const baseAreaKey = areaKey(rows[0].id);
        const areaIds = areaMap.get(rows[0].id) ?? [];

        if (rows.some((r) => (responsibleMap.get(r.id) ?? [])[0] !== sourceUserId)) {
            return NextResponse.json(
                { error: 'Selecione rotinas de um único colaborador de origem.' },
                { status: 422 }
            );
        }
        if (areaIds.length === 0 || rows.some((r) => areaKey(r.id) !== baseAreaKey)) {
            return NextResponse.json(
                { error: 'Selecione rotinas com o mesmo conjunto de áreas.' },
                { status: 422 }
            );
        }

        if (to_user_id === sourceUserId) {
            return NextResponse.json(
                { error: 'O colaborador de destino deve ser diferente do de origem.' },
                { status: 400 }
            );
        }

        // 9. Elegibilidade do destino — MESMA função da transferência permanente.
        const targetErr = await validateTransferTarget(adminSupabase, {
            restaurantId: restaurant_id,
            toUserId: to_user_id,
            routines: rows,
            areaIds,
        });
        if (targetErr) {
            return NextResponse.json(targetErr, { status: 422 });
        }

        // 10. Nenhuma transferência viva nas rotinas selecionadas. Checado ANTES de
        //     escrever para dar erro legível; o índice único `uq_ctt_one_open` é a
        //     garantia real contra a corrida entre dois gestores simultâneos.
        const { data: openRows } = await adminSupabase
            .from('checklist_temporary_transfers')
            .select('checklist_id')
            .in('checklist_id', ids)
            .in('status', ['scheduled', 'active']);

        if (openRows && openRows.length > 0) {
            return NextResponse.json(
                {
                    error: openRows.length === 1
                        ? 'Esta rotina já tem uma transferência temporária em andamento. Encerre-a antes de criar outra.'
                        : `${openRows.length} rotinas já têm transferência temporária em andamento. Encerre-as antes de criar outra.`,
                    code: 'TRANSFER_ALREADY_OPEN',
                },
                { status: 409 }
            );
        }

        // 11. Grava o ledger. Nasce 'scheduled'; a ativação é do reconciliador —
        //     inclusive quando começa hoje (ver passo 12), para que exista UM só
        //     caminho de ativação e o swap não tenha duas implementações.
        const payload = ids.map((checklistId) => ({
            restaurant_id,
            checklist_id: checklistId,
            original_user_id: sourceUserId,
            temporary_user_id: to_user_id,
            starts_on,
            ends_on,
            status: 'scheduled' as const,
            reason_code: reason_code || null,
            reason_note: note.length > 0 ? note : null,
            created_by: user.id,
        }));

        const { data: created, error: insertErr } = await adminSupabase
            .from('checklist_temporary_transfers')
            .insert(payload)
            .select(TRANSFER_COLUMNS);

        if (insertErr) {
            // 23505 = índice único parcial: outro gestor criou entre o passo 10 e aqui.
            if (insertErr.code === '23505') {
                return NextResponse.json(
                    {
                        error: 'Esta rotina acabou de receber outra transferência temporária. Recarregue a página.',
                        code: 'TRANSFER_ALREADY_OPEN',
                    },
                    { status: 409 }
                );
            }
            console.error('[POST /api/checklists/temporary-transfer] Erro ao gravar:', insertErr);
            return NextResponse.json({ error: 'Erro ao agendar a transferência.' }, { status: 500 });
        }

        // 12. Se a janela já começou hoje, ativa AGORA em vez de esperar o job.
        //     Sem isto, o gestor transferiria "a partir de hoje" e veria a rotina
        //     inalterada por até 15 minutos — parecendo que a ação não funcionou.
        //     Reusa `activateTransfer`: um único caminho de ativação, sempre.
        const rowsCreated = (created ?? []) as unknown as TemporaryTransferRow[];
        let activatedNow = 0;
        for (const t of rowsCreated) {
            if (t.starts_on <= today) {
                if (await activateTransfer(adminSupabase, t)) activatedNow += 1;
            }
        }

        // 13. Auditoria (event_logs) — espelho do ledger, best-effort.
        await trackAdminEvent('temporary_transfer_created', {
            accountId,
            restaurantId: restaurant_id,
            userId: user.id,
            metadata: {
                from_user_id: sourceUserId,
                to_user_id,
                area_ids: areaIds,
                checklist_count: ids.length,
                checklist_ids: ids,
                starts_on,
                ends_on,
                reason_code: reason_code || null,
                reason_note: note.length > 0 ? note : null,
                activated_immediately: activatedNow > 0,
            },
        });

        return NextResponse.json({
            transferred_count: rowsCreated.length,
            checklist_ids: ids,
            from_user_id: sourceUserId,
            to_user_id,
            starts_on,
            ends_on,
            activated_now: activatedNow,
            transfers: rowsCreated.map((t) => ({ id: t.id, checklist_id: t.checklist_id })),
        });
    } catch (error: unknown) {
        console.error('[POST /api/checklists/temporary-transfer] Unexpected error:', error);
        return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
    }
}

/**
 * GET /api/checklists/temporary-transfer?checklist_id=...
 *
 * Histórico completo de transferências temporárias de uma rotina — a superfície de
 * AUDITORIA: quem transferiu, quando, para quem, por quanto tempo, por quê, e como
 * terminou (automático / antecipado / substituído / substituto desativado).
 */
export async function GET(request: Request) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Não autorizado. Token ausente.' }, { status: 401 });
        }
        const token = authHeader.replace('Bearer ', '');

        const adminSupabase = getAdminSupabase();
        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);
        if (userError || !user) {
            return NextResponse.json({ error: 'Não autorizado ou token inválido.' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const checklistId = searchParams.get('checklist_id');
        if (!checklistId) {
            return NextResponse.json({ error: 'checklist_id é obrigatório.' }, { status: 400 });
        }

        // Escopo do tenant: o usuário precisa ser membro ativo da unidade da rotina.
        const { data: checklist } = await adminSupabase
            .from('checklists')
            .select('id, restaurant_id')
            .eq('id', checklistId)
            .maybeSingle();

        if (!checklist) {
            return NextResponse.json({ error: 'Rotina não encontrada.' }, { status: 404 });
        }

        const { data: membership } = await adminSupabase
            .from('restaurant_users')
            .select('role')
            .eq('restaurant_id', checklist.restaurant_id)
            .eq('user_id', user.id)
            .eq('active', true)
            .maybeSingle();

        if (!membership) {
            return NextResponse.json({ error: 'Permissões insuficientes.' }, { status: 403 });
        }

        const { data: transfers } = await adminSupabase
            .from('checklist_temporary_transfers')
            .select(
                'id, checklist_id, starts_on, ends_on, status, ended_reason, reason_code, reason_note, ' +
                'created_at, activated_at, ended_at, ' +
                'original:users!original_user_id ( id, name ), ' +
                'temporary:users!temporary_user_id ( id, name ), ' +
                'created_by_user:users!created_by ( id, name ), ' +
                'ended_by_user:users!ended_by ( id, name )'
            )
            .eq('checklist_id', checklistId)
            .order('created_at', { ascending: false });

        return NextResponse.json({ transfers: transfers ?? [] });
    } catch (error: unknown) {
        console.error('[GET /api/checklists/temporary-transfer] Unexpected error:', error);
        return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
    }
}
