import { describe, it, expect } from "vitest";
import {
    filterChecklistsByCollaborator,
    type CollaboratorInfo,
} from "../filter-checklists-by-collaborator";
import type { Checklist } from "@/lib/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const THALYTA_ID = "user-thalyta-111";
const LARISSA_ID = "user-larissa-222";
const AREA_COZINHA_ID = "area-cozinha";
const AREA_SALAO_ID = "area-salao";

function makeChecklist(overrides: Partial<Checklist> = {}): Checklist {
    return {
        id: "cl-" + Math.random().toString(36).slice(2, 8),
        restaurant_id: "rest-1",
        name: "Checklist Teste",
        shift: "morning",
        status: "active",
        active: true,
        created_by: "owner-1",
        created_at: "2026-01-01",
        ...overrides,
    };
}

const collaborators: CollaboratorInfo[] = [
    {
        user_id: THALYTA_ID,
        areas: [
            { id: AREA_COZINHA_ID, name: "Cozinha" },
        ],
    },
    {
        user_id: LARISSA_ID,
        areas: [
            { id: AREA_COZINHA_ID, name: "Cozinha" },
            { id: AREA_SALAO_ID, name: "Salão" },
        ],
    },
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("filterChecklistsByCollaborator", () => {
    // ─── Sem filtro selecionado ───────────────────────────────────────────────
    it("retorna todos os checklists quando collaboratorId é vazio", () => {
        const checklists = [makeChecklist(), makeChecklist()];
        const result = filterChecklistsByCollaborator(checklists, "", collaborators);
        expect(result).toHaveLength(2);
    });

    // ─── Colaborador não encontrado ───────────────────────────────────────────
    it("retorna vazio quando colaborador não existe na lista", () => {
        const checklists = [makeChecklist()];
        const result = filterChecklistsByCollaborator(checklists, "user-inexistente", collaborators);
        expect(result).toHaveLength(0);
    });

    // ─── Atribuição direta via responsible.id ─────────────────────────────────
    it("retorna checklist diretamente atribuído ao colaborador (responsible.id)", () => {
        const checklists = [
            makeChecklist({
                id: "cl-thalyta",
                assigned_to_user_id: THALYTA_ID,
                responsible: { id: THALYTA_ID, name: "Thalyta" },
            }),
            makeChecklist({
                id: "cl-larissa",
                assigned_to_user_id: LARISSA_ID,
                responsible: { id: LARISSA_ID, name: "Larissa" },
            }),
        ];

        const result = filterChecklistsByCollaborator(checklists, THALYTA_ID, collaborators);

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe("cl-thalyta");
    });

    // ─── Atribuição direta via assigned_to_user_id (fallback) ─────────────────
    it("retorna checklist diretamente atribuído (assigned_to_user_id sem responsible)", () => {
        const checklists = [
            makeChecklist({
                id: "cl-thalyta",
                assigned_to_user_id: THALYTA_ID,
                responsible: null,
            }),
        ];

        const result = filterChecklistsByCollaborator(checklists, THALYTA_ID, collaborators);
        expect(result).toHaveLength(1);
    });

    // ─── Distribuído por área — ninguém assumiu ───────────────────────────────
    it("retorna checklist de área quando ninguém assumiu", () => {
        const checklists = [
            makeChecklist({
                id: "cl-area",
                area_id: AREA_COZINHA_ID,
                assigned_to_user_id: undefined,
                assumed_by_user_id: undefined,
            }),
        ];

        const result = filterChecklistsByCollaborator(checklists, THALYTA_ID, collaborators);
        expect(result).toHaveLength(1);
    });

    // ─── Distribuído por área — colaborador selecionado assumiu ───────────────
    it("retorna checklist de área assumido pelo próprio colaborador", () => {
        const checklists = [
            makeChecklist({
                id: "cl-area-thalyta",
                area_id: AREA_COZINHA_ID,
                assigned_to_user_id: undefined,
                assumed_by_user_id: THALYTA_ID,
                assumed_by_name: "Thalyta",
            }),
        ];

        const result = filterChecklistsByCollaborator(checklists, THALYTA_ID, collaborators);
        expect(result).toHaveLength(1);
    });

    // ─── BUG ORIGINAL: área — OUTRO colaborador assumiu ──────────────────────
    it("NÃO retorna checklist de área assumido por OUTRO colaborador", () => {
        const checklists = [
            makeChecklist({
                id: "cl-area-larissa",
                area_id: AREA_COZINHA_ID,
                assigned_to_user_id: undefined,
                assumed_by_user_id: LARISSA_ID,
                assumed_by_name: "Larissa",
            }),
        ];

        const result = filterChecklistsByCollaborator(checklists, THALYTA_ID, collaborators);
        expect(result).toHaveLength(0);
    });

    // ─── Colaborador sem tarefas ──────────────────────────────────────────────
    it("retorna vazio quando colaborador não tem tarefas atribuídas nem área", () => {
        const soloCollaborators: CollaboratorInfo[] = [
            { user_id: "user-solo", areas: [] },
        ];

        const checklists = [
            makeChecklist({
                assigned_to_user_id: THALYTA_ID,
                responsible: { id: THALYTA_ID, name: "Thalyta" },
            }),
        ];

        const result = filterChecklistsByCollaborator(checklists, "user-solo", soloCollaborators);
        expect(result).toHaveLength(0);
    });

    // ─── Área diferente ──────────────────────────────────────────────────────
    it("NÃO retorna checklist de área à qual o colaborador não pertence", () => {
        const checklists = [
            makeChecklist({
                id: "cl-salao",
                area_id: AREA_SALAO_ID,
                assigned_to_user_id: undefined,
            }),
        ];

        // Thalyta só está na Cozinha, não no Salão
        const result = filterChecklistsByCollaborator(checklists, THALYTA_ID, collaborators);
        expect(result).toHaveLength(0);
    });

    // ─── Cenário misto ──────────────────────────────────────────────────────
    it("filtra corretamente cenário misto com vários tipos de checklists", () => {
        const checklists = [
            // 1. Direto para Thalyta → deve aparecer
            makeChecklist({
                id: "cl-direto-thalyta",
                assigned_to_user_id: THALYTA_ID,
                responsible: { id: THALYTA_ID, name: "Thalyta" },
            }),
            // 2. Direto para Larissa → NÃO deve aparecer
            makeChecklist({
                id: "cl-direto-larissa",
                assigned_to_user_id: LARISSA_ID,
                responsible: { id: LARISSA_ID, name: "Larissa" },
            }),
            // 3. Área Cozinha, não assumido → deve aparecer
            makeChecklist({
                id: "cl-area-livre",
                area_id: AREA_COZINHA_ID,
                assigned_to_user_id: undefined,
                assumed_by_user_id: undefined,
            }),
            // 4. Área Cozinha, assumido por Thalyta → deve aparecer
            makeChecklist({
                id: "cl-area-thalyta",
                area_id: AREA_COZINHA_ID,
                assigned_to_user_id: undefined,
                assumed_by_user_id: THALYTA_ID,
            }),
            // 5. Área Cozinha, assumido por Larissa → NÃO deve aparecer
            makeChecklist({
                id: "cl-area-larissa",
                area_id: AREA_COZINHA_ID,
                assigned_to_user_id: undefined,
                assumed_by_user_id: LARISSA_ID,
            }),
            // 6. Área Salão (Thalyta não pertence) → NÃO deve aparecer
            makeChecklist({
                id: "cl-salao",
                area_id: AREA_SALAO_ID,
                assigned_to_user_id: undefined,
            }),
        ];

        const result = filterChecklistsByCollaborator(checklists, THALYTA_ID, collaborators);
        const resultIds = result.map((c) => c.id);

        expect(resultIds).toEqual([
            "cl-direto-thalyta",
            "cl-area-livre",
            "cl-area-thalyta",
        ]);
    });

    // ─── Troca rápida de filtros ──────────────────────────────────────────────
    it("resultados são determinísticos — mesma entrada, mesma saída (sem side effects)", () => {
        const checklists = [
            makeChecklist({
                id: "cl-1",
                area_id: AREA_COZINHA_ID,
                assigned_to_user_id: undefined,
                assumed_by_user_id: THALYTA_ID,
            }),
        ];

        const result1 = filterChecklistsByCollaborator(checklists, THALYTA_ID, collaborators);
        const result2 = filterChecklistsByCollaborator(checklists, THALYTA_ID, collaborators);
        const result3 = filterChecklistsByCollaborator(checklists, LARISSA_ID, collaborators);

        expect(result1).toEqual(result2);
        expect(result1).toHaveLength(1);
        expect(result3).toHaveLength(0); // Thalyta assumiu, não Larissa
    });

    // ─── Não muta o array original ───────────────────────────────────────────
    it("não muta o array original de checklists", () => {
        const checklists = [makeChecklist(), makeChecklist()];
        const original = [...checklists];

        filterChecklistsByCollaborator(checklists, THALYTA_ID, collaborators);

        expect(checklists).toEqual(original);
    });

    // ─── Sprint 21: Rotinas globais (assignment_type = 'all') ─────────────────

    it("retorna checklist global (sem área e sem usuário) para qualquer colaborador", () => {
        const checklists = [
            makeChecklist({
                id: "cl-global",
                area_id: undefined,
                assigned_to_user_id: undefined,
                assumed_by_user_id: undefined,
            }),
        ];

        const result = filterChecklistsByCollaborator(checklists, THALYTA_ID, collaborators);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe("cl-global");
    });

    it("retorna checklist global assumido pelo próprio colaborador", () => {
        const checklists = [
            makeChecklist({
                id: "cl-global-assumido",
                area_id: undefined,
                assigned_to_user_id: undefined,
                assumed_by_user_id: THALYTA_ID,
            }),
        ];

        const result = filterChecklistsByCollaborator(checklists, THALYTA_ID, collaborators);
        expect(result).toHaveLength(1);
    });

    it("NÃO retorna checklist global assumido por OUTRO colaborador", () => {
        const checklists = [
            makeChecklist({
                id: "cl-global-outro",
                area_id: undefined,
                assigned_to_user_id: undefined,
                assumed_by_user_id: LARISSA_ID,
            }),
        ];

        const result = filterChecklistsByCollaborator(checklists, THALYTA_ID, collaborators);
        expect(result).toHaveLength(0);
    });

    // ─── Sprint 21: Atribuição direta SEM área ───────────────────────────────

    it("retorna checklist atribuído diretamente ao usuário mesmo sem área", () => {
        const checklists = [
            makeChecklist({
                id: "cl-user-sem-area",
                area_id: undefined,
                assigned_to_user_id: THALYTA_ID,
                responsible: { id: THALYTA_ID, name: "Thalyta" },
            }),
        ];

        const result = filterChecklistsByCollaborator(checklists, THALYTA_ID, collaborators);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe("cl-user-sem-area");
    });

    it("NÃO retorna checklist atribuído a outro usuário sem área", () => {
        const checklists = [
            makeChecklist({
                id: "cl-user-outro-sem-area",
                area_id: undefined,
                assigned_to_user_id: LARISSA_ID,
                responsible: { id: LARISSA_ID, name: "Larissa" },
            }),
        ];

        const result = filterChecklistsByCollaborator(checklists, THALYTA_ID, collaborators);
        expect(result).toHaveLength(0);
    });

    // ─── Sprint 21: Cenário misto completo com globais ────────────────────────

    it("filtra corretamente cenário misto incluindo checklists globais", () => {
        const checklists = [
            // 1. Direto para Thalyta → deve aparecer
            makeChecklist({
                id: "cl-direto-thalyta",
                assigned_to_user_id: THALYTA_ID,
                responsible: { id: THALYTA_ID, name: "Thalyta" },
            }),
            // 2. Global sem ninguém assumir → deve aparecer
            makeChecklist({
                id: "cl-global-livre",
                area_id: undefined,
                assigned_to_user_id: undefined,
                assumed_by_user_id: undefined,
            }),
            // 3. Global assumido por outro → NÃO deve aparecer
            makeChecklist({
                id: "cl-global-larissa",
                area_id: undefined,
                assigned_to_user_id: undefined,
                assumed_by_user_id: LARISSA_ID,
            }),
            // 4. Área Cozinha livre → deve aparecer
            makeChecklist({
                id: "cl-area-livre",
                area_id: AREA_COZINHA_ID,
                assigned_to_user_id: undefined,
            }),
            // 5. Direto para Thalyta SEM área → deve aparecer
            makeChecklist({
                id: "cl-user-sem-area",
                area_id: undefined,
                assigned_to_user_id: THALYTA_ID,
            }),
        ];

        const result = filterChecklistsByCollaborator(checklists, THALYTA_ID, collaborators);
        const resultIds = result.map((c) => c.id);

        expect(resultIds).toEqual([
            "cl-direto-thalyta",
            "cl-global-livre",
            "cl-area-livre",
            "cl-user-sem-area",
        ]);
    });
});
