import { describe, it, expect } from 'vitest';
import {
    addDays,
    daysBetweenInclusive,
    describeTransferPeriod,
    endDateForPreset,
    formatShortBR,
    isTransferActive,
    isTransferOpen,
    isTransferReasonCode,
    isValidDateKey,
    isWithinWindow,
    reasonLabel,
    shouldActivate,
    shouldExpire,
    validateWindow,
    PERIOD_PRESETS,
    TRANSFER_REASONS,
    type TransferWindow,
} from '../temporary-transfer';
import { getNowInTz } from '../brazil-date';

/**
 * Sprint 94 — a janela da transferência temporária.
 *
 * O que estes testes travam, e por quê:
 *   1. A janela é INCLUSIVA nas duas pontas. Off-by-one aqui significa a rotina
 *      voltando ao original um dia cedo demais — no último dia de férias de alguém.
 *   2. As transições (`shouldActivate` / `shouldExpire`) são funções do par
 *      (estado, hoje), sem efeito colateral. É isso que torna o reconciliador
 *      idempotente: aplicá-las de novo sobre o resultado não muda nada.
 *   3. `hoje` vem sempre do FUSO DO RESTAURANTE. O último bloco prova que duas
 *      unidades em fusos diferentes viram o dia em momentos diferentes (ADR-1).
 */

const window = (
    starts_on: string,
    ends_on: string,
    status: TransferWindow['status'] = 'scheduled',
): TransferWindow => ({ starts_on, ends_on, status });

describe('isValidDateKey', () => {
    it('aceita YYYY-MM-DD válida', () => {
        expect(isValidDateKey('2026-07-22')).toBe(true);
        expect(isValidDateKey('2028-02-29')).toBe(true); // 2028 é bissexto
    });

    it('rejeita data que não existe no calendário', () => {
        // 2026 não é bissexto: 29/02 não existe e o roundtrip cai em 01/03.
        expect(isValidDateKey('2026-02-29')).toBe(false);
        expect(isValidDateKey('2026-02-30')).toBe(false);
        expect(isValidDateKey('2026-13-01')).toBe(false);
    });

    it('rejeita formatos fora do padrão', () => {
        expect(isValidDateKey('22/07/2026')).toBe(false);
        expect(isValidDateKey('2026-7-2')).toBe(false);
        expect(isValidDateKey('')).toBe(false);
        expect(isValidDateKey(null)).toBe(false);
        expect(isValidDateKey(20260722)).toBe(false);
    });
});

describe('addDays', () => {
    it('soma dentro do mês', () => {
        expect(addDays('2026-07-22', 7)).toBe('2026-07-29');
    });

    it('atravessa a virada de mês e de ano', () => {
        expect(addDays('2026-07-28', 5)).toBe('2026-08-02');
        expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    });

    it('subtrai com dias negativos', () => {
        expect(addDays('2026-08-02', -5)).toBe('2026-07-28');
    });

    it('atravessa 29/02 em ano bissexto', () => {
        expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
        expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
    });
});

describe('daysBetweenInclusive', () => {
    it('conta o mesmo dia como 1 — a rotina fica com o substituto o dia inteiro', () => {
        expect(daysBetweenInclusive('2026-07-22', '2026-07-22')).toBe(1);
    });

    it('22/07 a 29/07 são 8 dias, não 7', () => {
        expect(daysBetweenInclusive('2026-07-22', '2026-07-29')).toBe(8);
    });

    it('conta certo atravessando o mês', () => {
        expect(daysBetweenInclusive('2026-07-30', '2026-08-02')).toBe(4);
    });
});

describe('presets de período', () => {
    it('"Hoje" resulta em janela de um único dia', () => {
        expect(endDateForPreset('2026-07-22', 1)).toBe('2026-07-22');
    });

    it('"1 semana" a partir de 22/07 termina em 28/07 (7 dias inclusivos)', () => {
        const end = endDateForPreset('2026-07-22', 7);
        expect(end).toBe('2026-07-28');
        expect(daysBetweenInclusive('2026-07-22', end)).toBe(7);
    });

    it('todo preset produz exatamente o número de dias que promete', () => {
        for (const p of PERIOD_PRESETS) {
            const end = endDateForPreset('2026-07-22', p.days);
            expect(daysBetweenInclusive('2026-07-22', end)).toBe(p.days);
        }
    });
});

describe('isWithinWindow — inclusiva nas DUAS pontas', () => {
    const w = window('2026-07-22', '2026-07-29');

    it('inclui o primeiro dia', () => {
        expect(isWithinWindow(w, '2026-07-22')).toBe(true);
    });

    it('inclui o ÚLTIMO dia (o off-by-one que devolveria a rotina cedo demais)', () => {
        expect(isWithinWindow(w, '2026-07-29')).toBe(true);
    });

    it('exclui a véspera e o dia seguinte', () => {
        expect(isWithinWindow(w, '2026-07-21')).toBe(false);
        expect(isWithinWindow(w, '2026-07-30')).toBe(false);
    });
});

describe('shouldActivate / shouldExpire — limites', () => {
    it('ativa quando a janela abre hoje', () => {
        expect(shouldActivate(window('2026-07-22', '2026-07-29'), '2026-07-22')).toBe(true);
    });

    it('não ativa antes do início', () => {
        expect(shouldActivate(window('2026-07-22', '2026-07-29'), '2026-07-21')).toBe(false);
    });

    it('ativa mesmo se o job atrasou (início já passou)', () => {
        expect(shouldActivate(window('2026-07-22', '2026-07-29'), '2026-07-25')).toBe(true);
    });

    it('NÃO expira no último dia da janela', () => {
        expect(shouldExpire(window('2026-07-22', '2026-07-29', 'active'), '2026-07-29')).toBe(false);
    });

    it('expira no primeiro dia após a janela', () => {
        expect(shouldExpire(window('2026-07-22', '2026-07-29', 'active'), '2026-07-30')).toBe(true);
    });

    it('só ativa a partir de scheduled e só expira a partir de active', () => {
        expect(shouldActivate(window('2026-07-22', '2026-07-29', 'active'), '2026-07-25')).toBe(false);
        expect(shouldExpire(window('2026-07-22', '2026-07-29', 'scheduled'), '2026-07-30')).toBe(false);
        expect(shouldActivate(window('2026-07-22', '2026-07-29', 'ended'), '2026-07-25')).toBe(false);
        expect(shouldExpire(window('2026-07-22', '2026-07-29', 'ended'), '2026-07-30')).toBe(false);
    });
});

describe('idempotência das transições (a propriedade que sustenta o reconciliador)', () => {
    /** Uma passada do reconciliador sobre uma janela, em memória. */
    const step = (w: TransferWindow, today: string): TransferWindow => {
        if (shouldActivate(w, today)) return { ...w, status: 'active' };
        if (shouldExpire(w, today)) return { ...w, status: 'ended' };
        return w;
    };

    it('rodar 2× no mesmo dia tem o mesmo efeito de rodar 1×', () => {
        const today = '2026-07-22';
        const once = step(window('2026-07-22', '2026-07-29'), today);
        const twice = step(once, today);
        expect(twice).toEqual(once);
        expect(twice.status).toBe('active');
    });

    it('rodar 5× seguidas converge e para', () => {
        let w = window('2026-07-22', '2026-07-29');
        for (let i = 0; i < 5; i += 1) w = step(w, '2026-07-30');
        // Ativa na 1ª passada, expira na 2ª, e daí não muda mais.
        expect(w.status).toBe('ended');
    });

    it('worker fora do ar por dias converge assim que volta', () => {
        // Criada dia 22 e ninguém rodou nada até o dia 30.
        let w = window('2026-07-22', '2026-07-29');
        w = step(w, '2026-07-30'); // ativa (o início já passou)
        w = step(w, '2026-07-30'); // expira no mesmo tick seguinte
        expect(w.status).toBe('ended');
    });
});

describe('validateWindow', () => {
    const today = '2026-07-22';

    it('aceita janela começando hoje', () => {
        expect(validateWindow(today, today, today)).toBeNull();
    });

    it('aceita janela futura (agendar férias com antecedência)', () => {
        expect(validateWindow('2026-08-01', '2026-08-15', today)).toBeNull();
    });

    it('rejeita início no passado', () => {
        expect(validateWindow('2026-07-21', '2026-07-25', today)).toMatch(/início/i);
    });

    it('rejeita fim antes do início', () => {
        expect(validateWindow('2026-07-25', '2026-07-24', today)).toMatch(/fim/i);
    });

    it('rejeita datas inválidas', () => {
        expect(validateWindow('ontem', '2026-07-25', today)).toBeTruthy();
        expect(validateWindow(today, null, today)).toBeTruthy();
    });
});

describe('motivo (ADR-3)', () => {
    it('rotula os códigos do vocabulário', () => {
        expect(reasonLabel('ferias')).toBe('Férias');
        expect(reasonLabel('cobertura_turno')).toBe('Cobertura de turno');
    });

    it('devolve null quando não há motivo (o campo é opcional)', () => {
        expect(reasonLabel(null)).toBeNull();
        expect(reasonLabel(undefined)).toBeNull();
        expect(reasonLabel('')).toBeNull();
    });

    it('não rotula código fora do vocabulário', () => {
        expect(reasonLabel('demissao')).toBeNull();
        expect(isTransferReasonCode('demissao')).toBe(false);
    });

    it('todo código do vocabulário tem rótulo — o CHECK do banco e a UI não divergem', () => {
        for (const r of TRANSFER_REASONS) {
            expect(isTransferReasonCode(r.code)).toBe(true);
            expect(reasonLabel(r.code)).toBe(r.label);
        }
    });
});

describe('formatação para a UI', () => {
    it('formata sem o ano — a janela é curta', () => {
        expect(formatShortBR('2026-07-22')).toBe('22/07');
    });

    it('descreve o período com a contagem inclusiva', () => {
        expect(describeTransferPeriod('2026-07-22', '2026-07-29')).toBe('22/07 até 29/07 (8 dias)');
    });

    it('usa singular no período de um dia só', () => {
        expect(describeTransferPeriod('2026-07-22', '2026-07-22')).toBe('22/07 até 22/07 (1 dia)');
    });
});

describe('estado exposto à UI', () => {
    it('só "active" conta como vigente', () => {
        expect(isTransferActive({ status: 'active' })).toBe(true);
        expect(isTransferActive({ status: 'scheduled' })).toBe(false);
        expect(isTransferActive({ status: 'ended' })).toBe(false);
        expect(isTransferActive(null)).toBe(false);
    });

    it('"viva" inclui a agendada — é ela que ocupa a vaga do índice único', () => {
        expect(isTransferOpen({ status: 'scheduled' })).toBe(true);
        expect(isTransferOpen({ status: 'active' })).toBe(true);
        expect(isTransferOpen({ status: 'ended' })).toBe(false);
        expect(isTransferOpen(undefined)).toBe(false);
    });
});

/**
 * ADR-1 — a prova de que `date` + fuso do restaurante é a semântica certa.
 *
 * São Paulo (UTC-3) e Manaus (UTC-4) NÃO viram o dia no mesmo instante. Uma janela
 * idêntica precisa expirar em momentos diferentes nas duas unidades. Se o
 * reconciliador usasse um único "hoje" do servidor, uma das duas erraria por horas.
 */
describe('ADR-1 — a virada do dia é por FUSO DO RESTAURANTE', () => {
    // SP é UTC-3 e Manaus é UTC-4, então existe UMA HORA por dia em que as duas
    // unidades estão em datas civis diferentes: entre 03:00Z e 04:00Z.
    //   02:30Z → SP 23:30 de 29/07 | Manaus 22:30 de 29/07  (ambas em 29/07)
    //   03:30Z → SP 00:30 de 30/07 | Manaus 23:30 de 29/07  (DIVERGEM)
    const antesDaVirada = new Date('2026-07-30T02:30:00Z');
    const entreAsViradas = new Date('2026-07-30T03:30:00Z');

    it('antes das duas viradas, as duas unidades estão no mesmo dia', () => {
        expect(getNowInTz('America/Sao_Paulo', antesDaVirada).dateKey).toBe('2026-07-29');
        expect(getNowInTz('America/Manaus', antesDaVirada).dateKey).toBe('2026-07-29');
    });

    it('entre as viradas, o MESMO instante é um dateKey diferente em cada fuso', () => {
        expect(getNowInTz('America/Sao_Paulo', entreAsViradas).dateKey).toBe('2026-07-30');
        expect(getNowInTz('America/Manaus', entreAsViradas).dateKey).toBe('2026-07-29');
    });

    it('a janela expira em SP e continua ativa em Manaus no mesmo instante', () => {
        const w = window('2026-07-22', '2026-07-29', 'active');

        const hojeSP = getNowInTz('America/Sao_Paulo', entreAsViradas).dateKey;
        const hojeManaus = getNowInTz('America/Manaus', entreAsViradas).dateKey;

        // É exatamente isto que um "hoje" único do servidor erraria: devolveria a
        // rotina ao original em Manaus uma hora antes do fim do último dia de férias.
        expect(shouldExpire(w, hojeSP)).toBe(true);
        expect(shouldExpire(w, hojeManaus)).toBe(false);
    });
});
