import type { SupabaseClient } from '@supabase/supabase-js';
import { replaceChecklistResponsibles } from '@/lib/api/area-links';
import { getNowInTz } from '@/lib/utils/brazil-date';
import { getRestaurantTimezones } from '@/lib/utils/restaurant-time';
import {
    shouldActivate,
    shouldExpire,
    type DateKey,
    type TemporaryTransferEndedReason,
    type TemporaryTransferStatus,
} from '@/lib/utils/temporary-transfer';

/**
 * Sprint 94 — Máquina de estados da transferência temporária + RECONCILIADOR.
 *
 * ── Por que reconciliação, e não "job que apaga o que venceu" ────────────────
 *
 * A alternativa ingênua (um job diário que remove transferências expiradas) tem uma
 * falha estrutural: ela reage a um EVENTO (a virada do dia). Se o worker estiver fora
 * do ar naquele momento, o evento passa e a rotina fica com o responsável errado
 * indefinidamente — e nada no sistema volta a olhar para ela.
 *
 * Aqui o job compara ESTADO DESEJADO com ESTADO ATUAL e converge. Consequências:
 *   • idempotente        — rodar 2× tem o mesmo efeito de rodar 1×;
 *   • auto-curável       — worker fora por 3 dias converge na primeira execução após voltar;
 *   • sem ordem temporal — não importa QUANDO roda, só que eventualmente rode.
 *
 * O dead-man's-switch do scheduler (s91, `isJobOverdue`) cobre o "eventualmente".
 *
 * ── Onde mora o responsável efetivo ──────────────────────────────────────────
 *
 * Em `checklist_responsibles` (s92), sempre. Este módulo faz o swap lá; é isso que faz
 * Meu Turno, Dashboard, filtros, relatórios e notificações refletirem o substituto sem
 * nenhuma mudança nesses caminhos. A tabela `checklist_temporary_transfers` é ledger
 * (agenda + auditoria) e NUNCA é consultada para decidir visibilidade.
 */

export interface TemporaryTransferRow {
    id: string;
    restaurant_id: string;
    checklist_id: string;
    original_user_id: string;
    temporary_user_id: string;
    starts_on: DateKey;
    ends_on: DateKey;
    status: TemporaryTransferStatus;
    reason_code: string | null;
    reason_note: string | null;
}

/**
 * Colunas do ledger que este módulo precisa. Uma constante para não divergirem.
 *
 * Por ser uma string montada (e não literal), o supabase-js não consegue inferir o
 * shape do retorno — daí os `as unknown as TemporaryTransferRow[]` nos call-sites.
 * O ganho de ter UMA lista de colunas supera o de uma inferência que, com `select('*')`
 * ou string literal repetida em 5 lugares, sairia igualmente frouxa.
 */
export const TRANSFER_COLUMNS =
    'id, restaurant_id, checklist_id, original_user_id, temporary_user_id, ' +
    'starts_on, ends_on, status, reason_code, reason_note';

/**
 * ATIVA uma transferência: o substituto passa a ser o responsável da rotina.
 *
 * A escrita vai para a junção N:N via `replaceChecklistResponsibles` — nunca direto em
 * `checklists.assigned_to_user_id`, que desde a s92 é sombra mantida por trigger
 * (escrever nela deixaria a junção desatualizada, que é a fonte da verdade).
 *
 * Só transiciona a partir de 'scheduled' (o `.eq('status', 'scheduled')` no UPDATE é o
 * que torna a operação segura sob concorrência: dois workers competindo, um só vence).
 */
export async function activateTransfer(
    admin: SupabaseClient,
    t: TemporaryTransferRow,
): Promise<boolean> {
    const { data, error } = await admin
        .from('checklist_temporary_transfers')
        .update({ status: 'active', activated_at: new Date().toISOString() })
        .eq('id', t.id)
        .eq('status', 'scheduled')
        .select('id');

    if (error) throw new Error(`activateTransfer(${t.id}): ${error.message}`);
    // Outro worker já ativou — não reaplica o swap.
    if (!data || data.length === 0) return false;

    await replaceChecklistResponsibles(
        admin, t.restaurant_id, t.checklist_id, [t.temporary_user_id],
    );
    return true;
}

/**
 * ENCERRA uma transferência e devolve a rotina ao responsável original.
 *
 * `restoreOriginal = false` só no caso 'superseded': ali o gestor JÁ trocou os
 * responsáveis à mão, e restaurar sobrescreveria a decisão dele com um valor obsoleto.
 *
 * Idem `activateTransfer`: o filtro por status no UPDATE serializa concorrentes.
 */
export async function endTransfer(
    admin: SupabaseClient,
    t: TemporaryTransferRow,
    reason: TemporaryTransferEndedReason,
    options: { endedBy?: string | null; restoreOriginal?: boolean } = {},
): Promise<boolean> {
    const { endedBy = null, restoreOriginal = true } = options;

    const { data, error } = await admin
        .from('checklist_temporary_transfers')
        .update({
            status: 'ended',
            ended_reason: reason,
            ended_at: new Date().toISOString(),
            ended_by: endedBy,
        })
        .eq('id', t.id)
        .in('status', ['scheduled', 'active'])
        .select('id');

    if (error) throw new Error(`endTransfer(${t.id}): ${error.message}`);
    if (!data || data.length === 0) return false;

    // Uma transferência ainda 'scheduled' nunca chegou a trocar ninguém — restaurar
    // seria sobrescrever os responsáveis atuais com um valor que nunca vigorou.
    if (restoreOriginal && t.status === 'active') {
        await replaceChecklistResponsibles(
            admin, t.restaurant_id, t.checklist_id, [t.original_user_id],
        );
    }
    return true;
}

/**
 * Busca a transferência VIVA (scheduled|active) de uma rotina, se houver.
 * O índice único parcial `uq_ctt_one_open` garante que exista no máximo uma.
 */
export async function findOpenTransfer(
    admin: SupabaseClient,
    checklistId: string,
): Promise<TemporaryTransferRow | null> {
    const { data } = await admin
        .from('checklist_temporary_transfers')
        .select(TRANSFER_COLUMNS)
        .eq('checklist_id', checklistId)
        .in('status', ['scheduled', 'active'])
        .maybeSingle();

    return (data as unknown as TemporaryTransferRow | null) ?? null;
}

/** Idem, em lote: `checklist_id` → transferência viva. Usado pela view da listagem. */
export async function fetchOpenTransfersByChecklist(
    admin: SupabaseClient,
    checklistIds: string[],
): Promise<Map<string, TemporaryTransferRow>> {
    const map = new Map<string, TemporaryTransferRow>();
    if (checklistIds.length === 0) return map;

    // Fatiado para manter a URL do PostgREST em tamanho sadio (mesmo padrão de
    // lib/api/area-links.ts). Sem paginação: o índice único parcial limita o
    // resultado a no máximo 1 linha por rotina, então nunca chega perto do teto de 1000.
    for (let i = 0; i < checklistIds.length; i += 200) {
        const chunk = checklistIds.slice(i, i + 200);
        const { data } = await admin
            .from('checklist_temporary_transfers')
            .select(TRANSFER_COLUMNS)
            .in('checklist_id', chunk)
            .in('status', ['scheduled', 'active']);

        for (const row of (data ?? []) as unknown as TemporaryTransferRow[]) {
            map.set(row.checklist_id, row);
        }
    }
    return map;
}

export interface ReconcileResult {
    activated: number;
    expired: number;
    targetInactive: number;
    restaurants: number;
}

/**
 * O RECONCILIADOR. Converge o estado das transferências para o que a janela manda,
 * no fuso de CADA restaurante.
 *
 * Por que o fuso importa aqui: "hoje" não é global. Às 23h30 em Manaus já é o dia
 * seguinte em São Paulo. Avaliar tudo com um único `hoje` do servidor encerraria
 * transferências cedo (ou tarde) demais nas unidades de fuso diferente — a mesma
 * classe de bug dos falsos "ATRASADO" já diagnosticada no projeto.
 *
 * Uma só query de transferências vivas para TODOS os restaurantes (o índice parcial
 * `idx_ctt_open_window` cobre), agrupada por unidade e avaliada com o `dateKey` dela.
 */
export async function reconcileTemporaryTransfers(
    options: { admin: SupabaseClient },
): Promise<ReconcileResult> {
    const { admin } = options;
    const result: ReconcileResult = { activated: 0, expired: 0, targetInactive: 0, restaurants: 0 };

    const { data, error } = await admin
        .from('checklist_temporary_transfers')
        .select(TRANSFER_COLUMNS)
        .in('status', ['scheduled', 'active']);

    if (error) throw new Error(`reconcile: ${error.message}`);

    const open = (data ?? []) as unknown as TemporaryTransferRow[];
    if (open.length === 0) return result;

    const restaurantIds = [...new Set(open.map((t) => t.restaurant_id))];
    const tzByRestaurant = await getRestaurantTimezones(admin, restaurantIds);
    result.restaurants = restaurantIds.length;

    // Substitutos que deixaram de ser membros ativos: a rotina sumiria do Meu Turno de
    // TODO MUNDO (o original não a vê mais; o substituto não existe mais). Devolver ao
    // original é a única saída que não deixa a rotina órfã.
    const activeTargets = [...new Set(
        open.filter((t) => t.status === 'active').map((t) => t.temporary_user_id),
    )];
    const inactiveTargets = await findInactiveMembers(admin, open, activeTargets);

    for (const t of open) {
        const today = getNowInTz(tzByRestaurant[t.restaurant_id]).dateKey;

        if (t.status === 'active' && inactiveTargets.has(`${t.restaurant_id}:${t.temporary_user_id}`)) {
            if (await endTransfer(admin, t, 'target_inactive')) result.targetInactive += 1;
            continue;
        }

        if (shouldActivate(t, today)) {
            // Janela inteiramente no passado (transferência criada e o worker ficou dias
            // fora): ativar para expirar em seguida seria trocar o responsável por nada.
            // Encerra direto — convergir para o estado final é o que importa, não
            // encenar as transições intermediárias.
            if (t.ends_on < today) {
                if (await endTransfer(admin, t, 'expired', { restoreOriginal: false })) {
                    result.expired += 1;
                }
                continue;
            }
            if (await activateTransfer(admin, t)) result.activated += 1;
            continue;
        }

        if (shouldExpire(t, today)) {
            if (await endTransfer(admin, t, 'expired')) result.expired += 1;
        }
    }

    return result;
}

/**
 * Quais (restaurante, usuário) deixaram de ser membros ATIVOS.
 * Chave `"<restaurant_id>:<user_id>"` — a mesma pessoa pode ser ativa numa filial e
 * inativa em outra, então o par é que importa, não o usuário isolado.
 */
async function findInactiveMembers(
    admin: SupabaseClient,
    open: TemporaryTransferRow[],
    userIds: string[],
): Promise<Set<string>> {
    const inactive = new Set<string>();
    if (userIds.length === 0) return inactive;

    const restaurantIds = [...new Set(open.map((t) => t.restaurant_id))];
    const { data } = await admin
        .from('restaurant_users')
        .select('restaurant_id, user_id')
        .in('restaurant_id', restaurantIds)
        .in('user_id', userIds)
        .eq('active', true);

    const activePairs = new Set(
        ((data ?? []) as Array<{ restaurant_id: string; user_id: string }>)
            .map((r) => `${r.restaurant_id}:${r.user_id}`),
    );

    for (const t of open) {
        if (t.status !== 'active') continue;
        const key = `${t.restaurant_id}:${t.temporary_user_id}`;
        if (!activePairs.has(key)) inactive.add(key);
    }
    return inactive;
}
