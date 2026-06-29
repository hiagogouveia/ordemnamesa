import { describe, it, expect } from 'vitest';
import { execMatchesAssumption } from '@/lib/services/audit-service';

// Assumption do dia 23/06 (cenário do bug original).
const assumption23 = {
    id: 'assump-23',
    assumed_at: '2026-06-23T23:45:00.000Z',
    completed_at: '2026-06-23T23:48:00.000Z',
};

// Assumption de outro dia (29/06) — execuções dela NÃO podem vazar para a de 23/06.
const assumption29 = {
    id: 'assump-29',
    assumed_at: '2026-06-29T22:47:00.000Z',
    completed_at: '2026-06-29T22:48:30.000Z',
};

describe('execMatchesAssumption — vínculo canônico com fallback de janela', () => {
    it('vincula por checklist_assumption_id quando presente (precedência absoluta)', () => {
        const exec = { checklist_assumption_id: 'assump-23', executed_at: '2026-06-23T23:46:00.000Z' };
        expect(execMatchesAssumption(exec, assumption23)).toBe(true);
    });

    it('NÃO vincula execução de outra assumption mesmo que caia na janela temporal', () => {
        // Execução vinculada à de 29/06, porém com executed_at editado para dentro da janela de 23/06.
        const exec = { checklist_assumption_id: 'assump-29', executed_at: '2026-06-23T23:46:00.000Z' };
        expect(execMatchesAssumption(exec, assumption23)).toBe(false);
    });

    it('vincula linha legada (coluna null) dentro da janela', () => {
        const exec = { checklist_assumption_id: null, executed_at: '2026-06-23T23:46:00.000Z' };
        expect(execMatchesAssumption(exec, assumption23)).toBe(true);
    });

    it('NÃO vincula linha legada (coluna null) fora da janela', () => {
        // Cenário do bug: execução de 29/06 não pode aparecer no relatório de 23/06.
        const exec = { checklist_assumption_id: null, executed_at: '2026-06-29T22:47:00.000Z' };
        expect(execMatchesAssumption(exec, assumption23)).toBe(false);
    });

    it('vincula por id mesmo com executed_at fora da janela (re-execução tardia preservada)', () => {
        const exec = { checklist_assumption_id: 'assump-23', executed_at: '2026-06-24T10:00:00.000Z' };
        expect(execMatchesAssumption(exec, assumption23)).toBe(true);
    });

    it('linha sem executed_at e sem vínculo não casa', () => {
        const exec = { checklist_assumption_id: null, executed_at: null };
        expect(execMatchesAssumption(exec, assumption23)).toBe(false);
    });

    it('fallback de 48h quando a assumption não foi concluída', () => {
        const open = { id: 'open-1', assumed_at: '2026-06-23T10:00:00.000Z', completed_at: null };
        const within = { checklist_assumption_id: null, executed_at: '2026-06-24T09:00:00.000Z' }; // +23h
        const beyond = { checklist_assumption_id: null, executed_at: '2026-06-25T11:00:00.000Z' }; // +49h
        expect(execMatchesAssumption(within, open)).toBe(true);
        expect(execMatchesAssumption(beyond, open)).toBe(false);
    });
});
