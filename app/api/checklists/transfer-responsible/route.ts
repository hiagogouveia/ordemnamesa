import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAccountIdForRestaurant } from '@/lib/supabase/accounts';
import { getAccountBilling, canManageChecklists } from '@/lib/billing/subscription-access';
import { buildAccessDeniedResponse } from '@/lib/billing/errors';
import {
    fetchAreaIdsByChecklist,
    fetchResponsibleIdsByChecklist,
    replaceChecklistResponsibles,
} from '@/lib/api/area-links';
import { validateTransferTarget } from '@/lib/api/validate-transfer-target';
import { trackAdminEvent } from '@/lib/analytics/track-event';
import { emitDomainEvent } from '@/lib/notifications/emit';
import { getNowInTz } from '@/lib/utils/brazil-date';
import { getRestaurantTimezone } from '@/lib/utils/restaurant-time';

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
            .select('id, name, restaurant_id')
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

        // 5. Todas precisam ter EXATAMENTE UM responsável direto.
        // s92: com vários responsáveis a transferência fica ambígua ("tirar de quem?"),
        // então a operação segue restrita ao caso 1:1 — que é o que a UI oferece.
        const responsibleMap = await fetchResponsibleIdsByChecklist(adminSupabase, ids);
        if (rows.some((r) => (responsibleMap.get(r.id) ?? []).length !== 1)) {
            return NextResponse.json(
                { error: 'Apenas rotinas atribuídas diretamente a um único colaborador podem ser transferidas.' },
                { status: 422 }
            );
        }

        // 6. Origem única + mesmo conjunto de áreas
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

        // 7. Destino diferente da origem
        if (to_user_id === sourceUserId) {
            return NextResponse.json(
                { error: 'O colaborador de destino deve ser diferente do de origem.' },
                { status: 400 }
            );
        }

        // 8. Elegibilidade do destino (ativo na unidade + pertence a alguma área +
        //    cobre o turno de cada rotina).
        //
        // s94: extraído para `validateTransferTarget` e COMPARTILHADO com a
        // transferência temporária — as duas precisam respeitar exatamente as mesmas
        // regras de atribuição, e duas cópias divergiriam na primeira mudança.
        const targetErr = await validateTransferTarget(adminSupabase, {
            restaurantId: restaurant_id,
            toUserId: to_user_id,
            routines: rows,
            areaIds,
        });
        if (targetErr) {
            return NextResponse.json(targetErr, { status: 422 });
        }

        // 9. (s94 / R2) Nenhuma rotina pode ter transferência TEMPORÁRIA viva.
        //
        // Sem esta guarda, a "origem" lida no passo 5 seria o SUBSTITUTO (é ele que
        // está em checklist_responsibles durante a janela), e o reconciliador, ao
        // expirar, restauraria o original antigo — desfazendo a transferência
        // permanente que o gestor acabou de fazer. Bloquear é mais previsível do que
        // encerrar a temporária implicitamente por baixo dele.
        const { data: openTransfers } = await adminSupabase
            .from('checklist_temporary_transfers')
            .select('checklist_id')
            .in('checklist_id', ids)
            .in('status', ['scheduled', 'active']);

        if (openTransfers && openTransfers.length > 0) {
            return NextResponse.json(
                {
                    error: openTransfers.length === 1
                        ? 'Esta rotina tem uma transferência temporária em andamento. Encerre-a antes de transferir definitivamente.'
                        : `${openTransfers.length} rotinas têm transferência temporária em andamento. Encerre-as antes de transferir definitivamente.`,
                    code: 'TEMPORARY_TRANSFER_OPEN',
                },
                { status: 422 }
            );
        }

        // 10. Execução — troca o vínculo N:N de cada rotina. A coluna-sombra
        // `assigned_to_user_id` é reescrita pelo trigger; gravá-la direto deixaria a
        // junção desatualizada.
        try {
            for (const r of rows) {
                await replaceChecklistResponsibles(adminSupabase, restaurant_id, r.id, [to_user_id]);
            }
        } catch (updateErr) {
            console.error('[POST /api/checklists/transfer-responsible] Erro ao trocar responsável:', updateErr);
            return NextResponse.json({ error: 'Erro ao transferir o responsável.' }, { status: 500 });
        }

        // ── s90: a transferência passa a NOTIFICAR ───────────────────────────
        //
        // Até aqui, transferir o responsável de uma rotina não avisava ninguém: só
        // gravava telemetria. O gestor que não fez a transferência não tinha como
        // saber que a responsabilidade mudou.
        //
        // Um evento por rotina (cada um com seu deep-link exato), mas todos com a
        // mesma `group_key` — uma transferência em lote de 20 rotinas vira UMA linha
        // agrupada ("20 rotinas transferidas para Ana"), expansível.
        const [{ data: toUser }, { data: fromUser }] = await Promise.all([
            adminSupabase.from('users').select('name').eq('id', to_user_id).maybeSingle(),
            adminSupabase.from('users').select('name').eq('id', sourceUserId).maybeSingle(),
        ]);

        const tz = await getRestaurantTimezone(adminSupabase, restaurant_id);
        const transferDateKey = getNowInTz(tz).dateKey;

        for (const r of rows) {
            await emitDomainEvent(adminSupabase, 'ResponsibleTransferred', {
                restaurantId: restaurant_id,
                actorUserId: user.id,
                payload: {
                    checklist_id: r.id,
                    date_key: transferDateKey,
                    to_user_id,
                    from_user_id: sourceUserId,
                    checklist_name: r.name,
                    to_user_name: toUser?.name ?? 'Colaborador',
                    from_user_name: fromUser?.name ?? null,
                },
            });
        }

        // 11. Auditoria (event_logs) — best-effort, não bloqueia a resposta.
        await trackAdminEvent('checklist_responsible_transferred', {
            accountId,
            restaurantId: restaurant_id,
            userId: user.id,
            metadata: {
                from_user_id: sourceUserId,
                to_user_id,
                area_ids: areaIds,
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
