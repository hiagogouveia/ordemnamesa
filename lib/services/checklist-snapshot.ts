import type { SupabaseClient } from '@supabase/supabase-js';
import type { TaskSnapshot, TaskType } from '@/lib/types';

/**
 * Sprint 88 — Composição da rotina no momento em que a sessão foi assumida.
 *
 * A Auditoria monta a lista de tarefas de uma execução passada a partir DESTE snapshot, e não
 * mais da definição viva do checklist. Isso é o que permite que a rotina evolua (tarefas sejam
 * renomeadas ou removidas) sem reescrever o passado: o relatório do dia 10 continua mostrando as
 * 40 tarefas que existiam no dia 10.
 *
 * CONGELADO: gravado uma única vez, na criação da `checklist_assumptions`. Nunca é atualizado —
 * nem quando o gestor edita a rotina com a sessão em andamento (a execução é o contrato firmado
 * no assume). Tarefas removidas durante uma sessão aberta aparecem na auditoria daquele dia como
 * `removed`, não como `pending`.
 */

/**
 * Monta o snapshot da composição atual de um checklist.
 *
 * Todo ponto que cria uma `checklist_assumptions` DEVE chamar esta função e gravar o resultado em
 * `tasks_snapshot`. Centralizar aqui evita que um caminho novo de criação de sessão nasça sem
 * snapshot — o que faria a auditoria daquela execução silenciosamente cair no fallback (definição
 * atual) e voltar a ser reescrita por edições futuras.
 *
 * Funciona com o client admin e com o do browser (mesma API supabase-js).
 */
export async function buildTasksSnapshot(
    supabase: SupabaseClient,
    checklistId: string,
): Promise<TaskSnapshot[]> {
    // `order` é palavra reservada — só pode aparecer no ORDER BY, via a string do supabase-js.
    const { data, error } = await supabase
        .from('checklist_tasks')
        .select('id, title, description, is_critical, requires_photo, requires_observation, type, max_photos, task_config, order')
        .eq('checklist_id', checklistId)
        .order('order', { ascending: true })
        .order('created_at', { ascending: true });

    if (error) throw error;

    return (data ?? []).map((t, idx) => ({
        task_id: t.id as string,
        title: (t.title as string) ?? '',
        description: (t.description as string | null) ?? null,
        is_critical: !!t.is_critical,
        requires_photo: !!t.requires_photo,
        requires_observation: !!t.requires_observation,
        type: ((t.type as TaskType | null) ?? 'boolean') as TaskType,
        max_photos: (t.max_photos as number | null) ?? null,
        task_config: (t.task_config as Record<string, unknown> | null) ?? null,
        order: typeof t.order === 'number' ? (t.order as number) : idx,
    }));
}
