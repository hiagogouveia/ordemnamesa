import { describe, expect, it } from "vitest";
import type { AnyNotification, NotificationOf } from "../contract";
import {
    type ChecklistPanelTarget,
    resolveNavigationTarget,
    targetToHref,
} from "../navigation";
import { adaptNotificationRow } from "../parse";

const base = {
    id: "n1",
    restaurant_id: "r1",
    user_id: "u-manager",
    title: "t",
    description: null,
    priority: "normal" as const,
    group_key: null,
    read: false,
    read_at: null,
    created_at: "2026-07-14T10:00:00Z",
    event_id: "e1",
};

const issuePayload = {
    issue_id: "issue-1",
    checklist_id: "chk-1",
    checklist_assumption_id: "asm-1",
    date_key: "2026-07-13", // ONTEM — o caso que era estruturalmente inalcançável
    task_id: "task-1",
    severity: "blocker" as const,
    reported_by_user_id: "u-staff",
    checklist_name: "Abertura Cozinha",
    task_title: "Conferir câmara fria",
    reported_by_name: "Ana",
    excerpt: "porta não veda",
};

describe("resolução de navegação — o clique leva ao evento exato", () => {
    it("impedimento → painel da rotina, aba Ocorrências, focado na ocorrência", () => {
        const n = { ...base, type: "BLOCKER_REPORTED", payload: issuePayload } as NotificationOf<"BLOCKER_REPORTED">;
        const target = resolveNavigationTarget(n) as ChecklistPanelTarget;

        expect(target.kind).toBe("checklist-panel");
        expect(target.restaurantId).toBe("r1");
        expect(target.checklistId).toBe("chk-1");
        expect(target.tab).toBe("issues");
        expect(target.issueId).toBe("issue-1");
        // O escopo temporal é o que destrava o histórico: antes do s90 o painel
        // era hardcoded em "hoje" e uma ocorrência de ontem não abria de jeito nenhum.
        expect(target.dateKey).toBe("2026-07-13");
        expect(target.assumptionId).toBe("asm-1");
    });

    it("ocorrência comum → mesmo destino do impedimento (mesma aba, item exato)", () => {
        const n = {
            ...base,
            type: "ISSUE_REPORTED",
            payload: { ...issuePayload, severity: "normal" as const },
        } as NotificationOf<"ISSUE_REPORTED">;
        const t = resolveNavigationTarget(n) as ChecklistPanelTarget;
        expect(t.tab).toBe("issues");
        expect(t.issueId).toBe("issue-1");
    });

    it("rotina com observação → aba Tarefas da rotina, no dia certo", () => {
        const n = {
            ...base,
            type: "TASK_COMPLETED_WITH_NOTE",
            payload: {
                checklist_id: "chk-9",
                checklist_assumption_id: "asm-9",
                date_key: "2026-07-14",
                completed_by_user_id: "u-staff",
                checklist_name: "Fechamento",
                completed_by_name: "Bruno",
                excerpt: "faltou detergente",
            },
        } as NotificationOf<"TASK_COMPLETED_WITH_NOTE">;
        const t = resolveNavigationTarget(n) as ChecklistPanelTarget;
        expect(t.checklistId).toBe("chk-9");
        expect(t.tab).toBe("tasks");
        expect(t.assumptionId).toBe("asm-9");
        expect(t.issueId).toBeUndefined();
    });

    it("senha alterada → informativa, sem destino (mas explicitamente)", () => {
        const n = {
            ...base,
            type: "PASSWORD_CHANGED_BY_ADMIN",
            payload: { changed_by_user_id: "u-owner" },
        } as NotificationOf<"PASSWORD_CHANGED_BY_ADMIN">;
        const t = resolveNavigationTarget(n);
        expect(t.kind).toBe("none");
        expect(targetToHref(t)).toBeNull();
    });

    it("tipo desconhecido NUNCA lança — degrada para 'sem destino'", () => {
        // Rede contra deploy futuro / rollback / dado corrompido.
        const unknown = adaptNotificationRow({
            ...base,
            type: "TIPO_DO_FUTURO",
            payload: { qualquer: "coisa" },
        });
        expect(() => resolveNavigationTarget(unknown)).not.toThrow();
        expect(resolveNavigationTarget(unknown).kind).toBe("none");
    });

    it("payload corrompido (sem os IDs) degrada em vez de navegar para lugar errado", () => {
        const corrupted = adaptNotificationRow({
            ...base,
            type: "BLOCKER_REPORTED",
            payload: { checklist_name: "Abertura" }, // faltam TODOS os IDs
        });
        expect(corrupted.type).toBe("__unknown__");
        expect(resolveNavigationTarget(corrupted).kind).toBe("none");
    });
});

describe("tradução intenção → URL", () => {
    it("monta a URL determinística, com tenant e modo Cards", () => {
        const n = { ...base, type: "BLOCKER_REPORTED", payload: issuePayload } as NotificationOf<"BLOCKER_REPORTED">;
        const href = targetToHref(resolveNavigationTarget(n), n.id)!;
        const url = new URL(href, "https://x");

        expect(url.pathname).toBe("/checklists");
        // O tenant vai na URL: sem isso, um link aberto em aba nova perdia o
        // restaurant_id (sessionStorage) e o deep-link morria em silêncio.
        expect(url.searchParams.get("restaurant_id")).toBe("r1");
        expect(url.searchParams.get("openId")).toBe("chk-1");
        expect(url.searchParams.get("view")).toBe("board"); // requisito: modo Cards
        expect(url.searchParams.get("tab")).toBe("issues");
        expect(url.searchParams.get("date_key")).toBe("2026-07-13");
        expect(url.searchParams.get("assumption_id")).toBe("asm-1");
        expect(url.searchParams.get("issue")).toBe("issue-1");
        expect(url.searchParams.get("nkey")).toBe("n1"); // handshake de leitura
    });

    it("a URL não carrega NENHUM texto — só IDs", () => {
        const n = { ...base, type: "BLOCKER_REPORTED", payload: issuePayload } as NotificationOf<"BLOCKER_REPORTED">;
        const href = targetToHref(resolveNavigationTarget(n), n.id)!;
        // Restrição dura do projeto: a navegação nunca depende de texto.
        expect(href).not.toContain("Abertura");
        expect(href).not.toContain("Ana");
        expect(href).not.toContain("veda");
    });

    it("é determinística: mesma notificação, mesma URL", () => {
        const n = { ...base, type: "BLOCKER_REPORTED", payload: issuePayload } as AnyNotification;
        const a = targetToHref(resolveNavigationTarget(n), n.id);
        const b = targetToHref(resolveNavigationTarget(n), n.id);
        expect(a).toBe(b);
    });

    it("omite params opcionais quando o payload não os tem", () => {
        const n = {
            ...base,
            type: "RESPONSIBLE_TRANSFERRED",
            payload: {
                checklist_id: "chk-2",
                date_key: "2026-07-14",
                to_user_id: "u2",
                from_user_id: null,
                checklist_name: "Salão",
                to_user_name: "Ana",
                from_user_name: null,
            },
        } as NotificationOf<"RESPONSIBLE_TRANSFERRED">;
        const url = new URL(targetToHref(resolveNavigationTarget(n), n.id)!, "https://x");
        expect(url.searchParams.get("issue")).toBeNull();
        expect(url.searchParams.get("assumption_id")).toBeNull();
    });
});
