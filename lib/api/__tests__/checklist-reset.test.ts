import { describe, it, expect } from 'vitest';
import {
    determineChecklistResets,
    periodStartFor,
    RESET_DELETABLE_STATUS,
    type ResettableChecklist,
} from '@/lib/api/checklist-reset';

// Quarta-feira, 30/06/2026 (getDay() = 3).
const today = new Date(2026, 5, 30);

describe('RESET_DELETABLE_STATUS — trava da correção do bug', () => {
    it('o reset só pode apagar execuções em andamento (doing), nunca histórico concluído', () => {
        expect(RESET_DELETABLE_STATUS).toBe('doing');
    });
});

describe('periodStartFor', () => {
    it('daily/weekdays → início é o próprio dia', () => {
        expect(periodStartFor('daily', today)?.getTime()).toBe(today.getTime());
        expect(periodStartFor('weekdays', today)?.getTime()).toBe(today.getTime());
    });
    it('weekly → início da semana (domingo)', () => {
        const ws = periodStartFor('weekly', today)!;
        expect(ws.getFullYear()).toBe(2026);
        expect(ws.getMonth()).toBe(5);
        expect(ws.getDate()).toBe(28); // domingo anterior a 30/06 (quarta)
    });
    it('monthly → 1º dia do mês', () => {
        const ms = periodStartFor('monthly', today)!;
        expect(ms.getDate()).toBe(1);
        expect(ms.getMonth()).toBe(5);
    });
    it('yearly → 1º de janeiro', () => {
        const ys = periodStartFor('yearly', today)!;
        expect(ys.getMonth()).toBe(0);
        expect(ys.getDate()).toBe(1);
    });
    it('sem recorrência conhecida → null', () => {
        expect(periodStartFor(null, today)).toBeNull();
        expect(periodStartFor('shift_days', today)).toBeNull();
    });
});

describe('determineChecklistResets', () => {
    const base = (over: Partial<ResettableChecklist>): ResettableChecklist => ({
        id: 'c1', recurrence: 'daily', is_one_shot: false, last_reset_at: null, restaurant_id: 'r1', ...over,
    });

    it('reseta diária que nunca resetou', () => {
        const out = determineChecklistResets([base({})], today);
        expect(out).toHaveLength(1);
        expect(out[0].checklistId).toBe('c1');
        expect(out[0].periodStartISO).toBe(today.toISOString());
    });

    it('NÃO reseta diária já resetada hoje', () => {
        const out = determineChecklistResets([base({ last_reset_at: today.toISOString() })], today);
        expect(out).toHaveLength(0);
    });

    it('reseta diária resetada ontem', () => {
        const ontem = new Date(2026, 5, 29).toISOString();
        const out = determineChecklistResets([base({ last_reset_at: ontem })], today);
        expect(out).toHaveLength(1);
    });

    it('ignora checklist sem recorrência e one-shot', () => {
        const out = determineChecklistResets([
            base({ id: 'sem', recurrence: null }),
            base({ id: 'oneshot', is_one_shot: true }),
            base({ id: 'shift', recurrence: 'shift_days' }),
        ], today);
        expect(out.map(r => r.checklistId)).toEqual([]); // shift_days não tem período → não reseta
    });

    it('weekly só reseta uma vez por semana', () => {
        const dentroDaSemana = new Date(2026, 5, 29).toISOString(); // segunda desta semana
        const out = determineChecklistResets([base({ recurrence: 'weekly', last_reset_at: dentroDaSemana })], today);
        expect(out).toHaveLength(0);
    });

    it('usa restaurant_id do checklist, com fallback', () => {
        const out = determineChecklistResets([
            base({ id: 'a', restaurant_id: 'rA' }),
            base({ id: 'b', restaurant_id: null }),
        ], today, 'fallback');
        expect(out.find(r => r.checklistId === 'a')?.restaurantId).toBe('rA');
        expect(out.find(r => r.checklistId === 'b')?.restaurantId).toBe('fallback');
    });
});
