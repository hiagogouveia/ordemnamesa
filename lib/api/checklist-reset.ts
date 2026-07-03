// Lógica pura do reset de recorrência do quadro (kanban), extraída para teste unitário.
//
// IMPORTANTE (imutabilidade do histórico): o reset NÃO apaga execuções concluídas. Ele só limpa
// execuções AINDA EM ANDAMENTO (`status='doing'`) órfãs de períodos anteriores, para o quadro do
// novo período começar limpo e o contador de tarefas simultâneas não acumular linhas abandonadas.
// O escopo de status do delete é fixado aqui e verificado por teste.

/** Único status que o reset pode remover. Histórico concluído (done/skipped/flagged/blocked) é imutável. */
export const RESET_DELETABLE_STATUS = 'doing' as const;

export type ResettableChecklist = {
    id: string;
    recurrence: string | null;
    is_one_shot?: boolean | null;
    last_reset_at?: string | null;
    restaurant_id?: string | null;
};

export type ChecklistReset = {
    checklistId: string;
    restaurantId: string | null;
    periodStartISO: string;
};

/** Início do período atual conforme a recorrência (em horário local), ou null se não recorre. */
export function periodStartFor(recurrence: string | null, todayLocal: Date): Date | null {
    if (recurrence === 'daily' || recurrence === 'weekdays') {
        return todayLocal;
    }
    if (recurrence === 'weekly') {
        const startOfWeek = new Date(todayLocal);
        startOfWeek.setDate(todayLocal.getDate() - todayLocal.getDay());
        return startOfWeek;
    }
    if (recurrence === 'monthly') {
        return new Date(todayLocal.getFullYear(), todayLocal.getMonth(), 1);
    }
    if (recurrence === 'yearly') {
        return new Date(todayLocal.getFullYear(), 0, 1);
    }
    return null;
}

/**
 * Decide quais checklists precisam resetar neste período. Puro (sem I/O).
 * Regras: ignora não-recorrentes e one-shot; reseta quando nunca resetou ou o último reset foi
 * antes do início do período corrente.
 */
export function determineChecklistResets(
    checklists: ResettableChecklist[],
    todayLocal: Date,
    fallbackRestaurantId: string | null = null,
): ChecklistReset[] {
    const resets: ChecklistReset[] = [];
    for (const cl of checklists) {
        if (!cl.recurrence) continue;
        if (cl.is_one_shot) continue;

        const periodStart = periodStartFor(cl.recurrence, todayLocal);
        if (!periodStart) continue;

        const lastReset = cl.last_reset_at ? new Date(cl.last_reset_at) : null;
        if (!lastReset || lastReset < periodStart) {
            resets.push({
                checklistId: cl.id,
                restaurantId: cl.restaurant_id ?? fallbackRestaurantId,
                periodStartISO: periodStart.toISOString(),
            });
        }
    }
    return resets;
}
