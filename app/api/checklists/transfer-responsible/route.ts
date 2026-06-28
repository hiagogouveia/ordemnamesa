import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAccountIdForRestaurant } from '@/lib/supabase/accounts';
import { getAccountBilling, canManageChecklists } from '@/lib/billing/subscription-access';
import { buildAccessDeniedResponse } from '@/lib/billing/errors';
import { fetchShiftIdsByChecklist } from '@/lib/api/shift-links';
import { validateShiftAssignment, SHIFT_ASSIGNMENT_ERROR } from '@/lib/api/validate-shift-assignment';
import { trackAdminEvent } from '@/lib/analytics/track-event';

const getAdminSupabase = () => {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
};

/**
 * POST /api/checklists/transfer-responsible
 *
 * Transfere o RESPONSÁVEL DIRETO (assigned_to_user_id) de um conjunto de rotinas
 * de um colaborador para outro da MESMA área. Altera somente o vínculo de
 * responsável — nada mais (área, recorrência, turnos, ordem, histórico, execuções,
 * fotos e IDs permanecem intactos).
 *
 * Toda a validação ocorre ANTES de qualquer escrita (all-or-nothing) e a alteração
 * é feita em um único UPDATE em lote (atômico). Gera registro auditável em event_logs.
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
            console.error('[POST /api/checklists/transfer-responsible] Auth error:', userError);
            return NextResponse.json({ error: 'Não autorizado ou token inválido.' }, { status: 401 });
        }

        const body = await request.json();
        const { restaurant_id, checklist_ids, to_user_id } = body as {
            restaurant_id?: string;
            checklist_ids?: string[];
            to_user_id?: string;
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

        // 4. Carregar rotinas selecionadas (escopo do restaurante)
        const { data: rows, error: rowsErr } = await adminSupabase
            .from('checklists')
            .select('id, name, area_id, assigned_to_user_id, restaurant_id')
            .in('id', ids)
            .eq('restaurant_id', restaurant_id);

        if (rowsErr) {
            console.error('[POST /api/checklists/transfer-responsible] Erro ao buscar rotinas:', rowsErr);
            return NextResponse.json({ error: 'Erro ao carregar rotinas.' }, { status: 500 });
        }

        // Alguma rotina não pertence à unidade (ou não existe)
        if (!rows || rows.length !== ids.length) {
            return NextResponse.json(
                { error: 'Uma ou mais rotinas selecionadas não pertencem a esta unidade.' },
                { status: 422 }
            );
        }

        // 5. Todas precisam ter responsável direto
        if (rows.some((r) => !r.assigned_to_user_id)) {
            return NextResponse.json(
                { error: 'Apenas rotinas atribuídas diretamente a um colaborador podem ser transferidas.' },
                { status: 422 }
            );
        }

        // 6. Origem única + área única
        const sourceUserId = rows[0].assigned_to_user_id as string;
        const areaId = rows[0].area_id as string | null;
        if (rows.some((r) => r.assigned_to_user_id !== sourceUserId)) {
            return NextResponse.json(
                { error: 'Selecione rotinas de um único colaborador de origem.' },
                { status: 422 }
            );
        }
        if (!areaId || rows.some((r) => r.area_id !== areaId)) {
            return NextResponse.json(
                { error: 'Selecione rotinas de uma única área.' },
                { status: 422 }
            );
        }

        // 7. Destino diferente da origem
        if (to_user_id === sourceUserId) {
            return NextResponse.json(
                { error: 'O colaborador de destino deve ser diferente do de origem.' },
                { status: 400 }
            );
        }

        // 8. Destino ativo na unidade
        const { data: destMember } = await adminSupabase
            .from('restaurant_users')
            .select('role, active')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', to_user_id)
            .eq('active', true)
            .maybeSingle();

        if (!destMember) {
            return NextResponse.json(
                { error: 'O colaborador de destino não está ativo nesta unidade.' },
                { status: 422 }
            );
        }

        // 9. Destino pertence à área
        const { data: destArea } = await adminSupabase
            .from('user_areas')
            .select('id')
            .eq('user_id', to_user_id)
            .eq('area_id', areaId)
            .maybeSingle();

        if (!destArea) {
            return NextResponse.json(
                { error: 'O colaborador selecionado não pertence à área escolhida.' },
                { status: 422 }
            );
        }

        // 10. Regra de turno (mesma da edição): destino deve cobrir o turno de cada rotina.
        const shiftMap = await fetchShiftIdsByChecklist(adminSupabase, ids);
        const shiftBlocked: string[] = [];
        for (const r of rows) {
            const err = await validateShiftAssignment(
                adminSupabase,
                restaurant_id,
                to_user_id,
                shiftMap.get(r.id) ?? []
            );
            if (err) shiftBlocked.push(r.name);
        }
        if (shiftBlocked.length > 0) {
            return NextResponse.json(
                {
                    error: SHIFT_ASSIGNMENT_ERROR,
                    code: 'SHIFT_ASSIGNMENT_INVALID',
                    blocked_routines: shiftBlocked,
                },
                { status: 422 }
            );
        }

        // 11. Execução atômica — UPDATE em lote (somente o responsável)
        const { error: updateErr } = await adminSupabase
            .from('checklists')
            .update({ assigned_to_user_id: to_user_id })
            .in('id', ids)
            .eq('restaurant_id', restaurant_id);

        if (updateErr) {
            console.error('[POST /api/checklists/transfer-responsible] Erro no update em lote:', updateErr);
            return NextResponse.json({ error: 'Erro ao transferir o responsável.' }, { status: 500 });
        }

        // 12. Auditoria (event_logs) — best-effort, não bloqueia a resposta.
        await trackAdminEvent('checklist_responsible_transferred', {
            accountId,
            restaurantId: restaurant_id,
            userId: user.id,
            metadata: {
                from_user_id: sourceUserId,
                to_user_id,
                area_id: areaId,
                checklist_count: ids.length,
                checklist_ids: ids,
            },
        });

        return NextResponse.json({
            transferred_count: ids.length,
            checklist_ids: ids,
            from_user_id: sourceUserId,
            to_user_id,
        });
    } catch (error: unknown) {
        console.error('[POST /api/checklists/transfer-responsible] Unexpected error:', error);
        return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
    }
}
