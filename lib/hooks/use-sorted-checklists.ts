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
        return [...checklists].sort((a, b) => sortChecklistsByPriority(a, b, currentMinutes));
    }, [checklists, currentMinutes]);

    return { sortedChecklists, currentMinutes };
}
