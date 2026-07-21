import { describe, it, expect } from 'vitest';
import { canExecuteChecklist, type VisibilityContext } from '../checklist-visibility';

/**
 * Sprint 92 — a rotina passou a ter 1..N áreas e 0..N responsáveis. A regra de
 * igualdade virou INTERSEÇÃO, mas a ordem das checagens não mudou:
 *   interseção de área → responsáveis específicos → cargo → distribuição por área.
 *
 * Estes testes travam as duas coisas: o comportamento novo (multi) e o antigo
 * (mono, via as colunas-sombra), porque o segundo é o que garante zero regressão
 * para as 433 rotinas já existentes.
 */

const GERENCIA = 'area-gerencia';
const ESTOQUE = 'area-estoque';
const COZINHA = 'area-cozinha';
const SALAO = 'area-salao';

const JOAO = 'user-joao';
const MARIA = 'user-maria';
const CARLOS = 'user-carlos';

const COZINHEIRO = 'role-cozinheiro';
const GARCOM = 'role-garcom';

function ctx(over: Partial<VisibilityContext> = {}): VisibilityContext {
    return { userId: JOAO, areaIds: [GERENCIA], roleIds: [], ...over };
}

describe('canExecuteChecklist — invariante de área', () => {
    it('rotina sem nenhuma área não é executável', () => {
        expect(canExecuteChecklist({ area_ids: [] }, ctx())).toBe(false);
        expect(canExecuteChecklist({ area_ids: [], area_id: null }, ctx())).toBe(false);
    });

    it('rotina cujas áreas não intersectam as do usuário fica invisível', () => {
        expect(canExecuteChecklist({ area_ids: [ESTOQUE, COZINHA] }, ctx())).toBe(false);
    });

    it('basta UMA área em comum para a rotina aparecer', () => {
        expect(canExecuteChecklist({ area_ids: [ESTOQUE, GERENCIA, COZINHA] }, ctx())).toBe(true);
    });
});

describe('canExecuteChecklist — múltiplas áreas, toda a equipe', () => {
    const recebimento = { area_ids: [GERENCIA, ESTOQUE, COZINHA] };

    it('qualquer colaborador de qualquer uma das áreas executa', () => {
        for (const area of [GERENCIA, ESTOQUE, COZINHA]) {
            expect(canExecuteChecklist(recebimento, ctx({ areaIds: [area] }))).toBe(true);
        }
    });

    it('colaborador de área de fora não executa', () => {
        expect(canExecuteChecklist(recebimento, ctx({ areaIds: [SALAO] }))).toBe(false);
    });
});

describe('canExecuteChecklist — múltiplos responsáveis específicos', () => {
    // João (Gerência), Maria (Estoque) e Carlos (Estoque) são elegíveis; só os
    // dois primeiros foram marcados como responsáveis.
    const rotina = {
        area_ids: [GERENCIA, ESTOQUE],
        responsible_user_ids: [JOAO, MARIA],
    };

    it('cada responsável marcado vê a rotina', () => {
        expect(canExecuteChecklist(rotina, ctx({ userId: JOAO, areaIds: [GERENCIA] }))).toBe(true);
        expect(canExecuteChecklist(rotina, ctx({ userId: MARIA, areaIds: [ESTOQUE] }))).toBe(true);
    });

    it('colaborador da mesma área que NÃO foi marcado não vê', () => {
        expect(canExecuteChecklist(rotina, ctx({ userId: CARLOS, areaIds: [ESTOQUE] }))).toBe(false);
    });

    it('responsável desvinculado da área perde a visibilidade', () => {
        // Regra preservada do modelo antigo: a interseção de área é checada ANTES
        // da atribuição individual.
        expect(canExecuteChecklist(rotina, ctx({ userId: MARIA, areaIds: [SALAO] }))).toBe(false);
    });

    it('atribuição individual tem precedência sobre cargo', () => {
        const comCargo = { ...rotina, role_id: COZINHEIRO };
        expect(canExecuteChecklist(comCargo, ctx({ userId: JOAO, areaIds: [GERENCIA], roleIds: [] }))).toBe(true);
        expect(canExecuteChecklist(comCargo, ctx({ userId: CARLOS, areaIds: [ESTOQUE], roleIds: [COZINHEIRO] }))).toBe(false);
    });
});

describe('canExecuteChecklist — distribuição por cargo', () => {
    const rotina = { area_ids: [GERENCIA, ESTOQUE], role_id: COZINHEIRO };

    it('exige o cargo quando não há responsável específico', () => {
        expect(canExecuteChecklist(rotina, ctx({ areaIds: [ESTOQUE], roleIds: [COZINHEIRO] }))).toBe(true);
        expect(canExecuteChecklist(rotina, ctx({ areaIds: [ESTOQUE], roleIds: [GARCOM] }))).toBe(false);
        expect(canExecuteChecklist(rotina, ctx({ areaIds: [ESTOQUE], roleIds: [] }))).toBe(false);
    });

    it('cargo certo em área de fora continua invisível', () => {
        expect(canExecuteChecklist(rotina, ctx({ areaIds: [SALAO], roleIds: [COZINHEIRO] }))).toBe(false);
    });
});

describe('canExecuteChecklist — compatibilidade com as colunas-sombra', () => {
    // Chamadores que ainda não carregam as listas N:N passam `area_id` /
    // `assigned_to_user_id`. O resultado tem de ser idêntico ao modelo antigo.
    it('área única via sombra', () => {
        expect(canExecuteChecklist({ area_id: GERENCIA }, ctx())).toBe(true);
        expect(canExecuteChecklist({ area_id: ESTOQUE }, ctx())).toBe(false);
    });

    it('responsável único via sombra', () => {
        const rotina = { area_id: GERENCIA, assigned_to_user_id: MARIA };
        expect(canExecuteChecklist(rotina, ctx({ userId: MARIA }))).toBe(true);
        expect(canExecuteChecklist(rotina, ctx({ userId: JOAO }))).toBe(false);
    });

    it('lista N:N tem precedência sobre a sombra quando ambas vêm preenchidas', () => {
        const rotina = {
            area_id: GERENCIA,
            area_ids: [ESTOQUE, COZINHA],
        };
        expect(canExecuteChecklist(rotina, ctx({ areaIds: [GERENCIA] }))).toBe(false);
        expect(canExecuteChecklist(rotina, ctx({ areaIds: [COZINHA] }))).toBe(true);
    });
});
