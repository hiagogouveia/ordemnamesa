import { useMemo, useEffect, useState } from 'react';
import { Checklist } from '@/lib/types';
import { sortChecklistsByPriority } from '@/lib/utils/checklist-priority';

export function useSortedChecklists<T extends Partial<Checklist>>(checklists: T[] | undefined) {
    // Tick de horário a cada um minuto para reagir à mudança de prioridade
    const [currentMinutes, setCurrentMinutes] = useState(() => {
        const d = new Date();
        return d.getHours() * 60 + d.getMinutes();
    });

    useEffect(() => {
        const interval = setInterval(() => {
            const d = new Date();
            setCurrentMinutes(d.getHours() * 60 + d.getMinutes());
        }, 60000); // 1 minuto
        return () => clearInterval(interval);
    }, []);

    const sortedChecklists = useMemo(() => {
        if (!checklists) return [];
        // Clona para não mutar array original
        return [...checklists].sort((a, b) => {
            // Prioridade do sistema é sempre o critério primário
            const priorityDiff = sortChecklistsByPriority(a, b, currentMinutes);
            if (priorityDiff !== 0) return priorityDiff;

            // Mesmo grupo de prioridade: desempatar por order_index (manual)
            const hasManualA = a.order_index !== null && a.order_index !== undefined;
            const hasManualB = b.order_index !== null && b.order_index !== undefined;

            if (hasManualA && hasManualB) {
                return (a.order_index as number) - (b.order_index as number);
            }
            if (hasManualA) return -1;
            if (hasManualB) return 1;
            return 0;
        });
    }, [checklists, currentMinutes]);

    return { sortedChecklists, currentMinutes };
}
