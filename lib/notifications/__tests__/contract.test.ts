import { describe, expect, it } from "vitest";
import {
    DEDUP_KEYS,
    DEPRECATED_TYPES,
    type IssuePayload,
    type NotificationType,
    isDeprecatedType,
} from "../contract";
import { NOTIFICATION_DESCRIPTORS, assertEmittableType, colorFor, iconFor } from "../registry";
import { NAVIGATION_RESOLVERS } from "../navigation";
import { PAYLOAD_PARSERS } from "../parse";

/**
 * A promessa da arquitetura: adicionar um tipo custa EXATAMENTE quatro coisas
 * (evento, renderer, ícone, deep-link) — e o compilador cobra cada uma.
 *
 * O TypeScript já garante isso em tempo de build (os três mapas são indexados por
 * `NotificationType`; faltar uma chave é `TS2739`). Estes testes são a rede em
 * runtime: pegam divergências que um `as any` ou um merge mal resolvido criaria.
 */
describe("contrato de notificações — exaustividade", () => {
    const types = Object.keys(NOTIFICATION_DESCRIPTORS) as NotificationType[];

    it("todo tipo do registry tem resolver de navegação e parser", () => {
        for (const t of types) {
            expect(NAVIGATION_RESOLVERS[t], `sem resolver de navegação: ${t}`).toBeTypeOf("function");
            expect(PAYLOAD_PARSERS[t], `sem parser: ${t}`).toBeTypeOf("function");
        }
    });

    it("os três mapas cobrem exatamente o mesmo conjunto de tipos", () => {
        const registry = Object.keys(NOTIFICATION_DESCRIPTORS).sort();
        const nav = Object.keys(NAVIGATION_RESOLVERS).sort();
        const parsers = Object.keys(PAYLOAD_PARSERS).sort();
        expect(nav).toEqual(registry);
        expect(parsers).toEqual(registry);
    });

    it("todo tipo tem ícone e cor próprios (nada cai em fallback silencioso)", () => {
        // Era exatamente esta a falha do sistema antigo: os mapas eram
        // Record<string, string>, então PASSWORD_CHANGED_BY_ADMIN não estava em
        // nenhum dos dois e caía no ícone genérico sem ninguém perceber.
        for (const t of types) {
            const d = NOTIFICATION_DESCRIPTORS[t];
            expect(d.icon, `sem ícone: ${t}`).toBeTruthy();
            expect(iconFor(t)).toBe(d.icon);
            expect(colorFor(t)).toMatch(/^#[0-9a-f]{6}$/i);
        }
    });

    it("ocorrência e impedimento têm identidade visual e prioridade DISTINTAS", () => {
        const issue = NOTIFICATION_DESCRIPTORS.ISSUE_REPORTED;
        const blocker = NOTIFICATION_DESCRIPTORS.BLOCKER_REPORTED;
        expect(blocker.icon).not.toBe(issue.icon);
        expect(blocker.priority).toBe("critical"); // trava a operação
        expect(issue.priority).toBe("high");
    });
});

describe("emissão — tipos deprecados são renderizáveis, mas não emitíveis", () => {
    it("assertEmittableType aceita os tipos vivos", () => {
        expect(() => assertEmittableType("BLOCKER_REPORTED")).not.toThrow();
        expect(() => assertEmittableType("TASK_COMPLETED_WITH_NOTE")).not.toThrow();
    });

    it("assertEmittableType recusa tipo deprecado", () => {
        for (const t of DEPRECATED_TYPES) {
            expect(() => assertEmittableType(t)).toThrow(/deprecado/i);
            expect(isDeprecatedType(t)).toBe(true);
        }
    });

    it("assertEmittableType recusa tipo fora do contrato", () => {
        // Substitui a garantia que o CHECK de `type` dava no banco (removido no s90).
        expect(() => assertEmittableType("INVENTADO")).toThrow(/fora do contrato/i);
    });

    it("tipos deprecados AINDA têm descriptor (a UI nunca cai no vazio)", () => {
        for (const t of DEPRECATED_TYPES) {
            expect(NOTIFICATION_DESCRIPTORS[t].deprecated).toBe(true);
            expect(NOTIFICATION_DESCRIPTORS[t].icon).toBeTruthy();
        }
    });
});

describe("dedup keys — idempotência", () => {
    const issue: IssuePayload = {
        issue_id: "i1",
        checklist_id: "c1",
        checklist_assumption_id: "a1",
        date_key: "2026-07-14",
        task_id: "t1",
        severity: "blocker",
        reported_by_user_id: "u1",
        checklist_name: "Abertura",
        task_title: "Conferir câmara",
        reported_by_name: "Ana",
        excerpt: "porta quebrada",
    };

    it("a mesma ocorrência produz sempre a mesma chave", () => {
        expect(DEDUP_KEYS.IssueReported(issue)).toBe("issue:i1");
        expect(DEDUP_KEYS.IssueReported({ ...issue })).toBe(DEDUP_KEYS.IssueReported(issue));
    });

    it("RoutineDelayed inclui o dia — é o que torna o cron de 5min seguro", () => {
        // O cron varre a cada 5 minutos. Sem o date_key na chave, a mesma rotina
        // atrasada geraria uma notificação a cada varredura (spam). Com ele, o
        // índice UNIQUE colide e a segunda emissão vira no-op.
        const p = {
            checklist_id: "c1",
            checklist_assumption_id: null,
            date_key: "2026-07-14",
            checklist_name: "Fechamento",
            area_name: null,
        };
        const k1 = DEDUP_KEYS.RoutineDelayed(p);
        const k2 = DEDUP_KEYS.RoutineDelayed(p);
        expect(k1).toBe("delayed:c1:2026-07-14");
        expect(k2).toBe(k1);

        // Dia seguinte ⇒ chave diferente ⇒ notifica de novo (correto).
        expect(DEDUP_KEYS.RoutineDelayed({ ...p, date_key: "2026-07-15" })).not.toBe(k1);
    });
});
