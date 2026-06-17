import { describe, expect, it } from "vitest";
import { runSecurityAudit, type Finding } from "../../../scripts/security-audit";

/**
 * Garante que os bugs corrigidos nas Fases 1–4 não retornem.
 * Reaproveita os checks de scripts/security-audit.ts.
 */
describe("Regression · bugs históricos", () => {
    let auditPromise: ReturnType<typeof runSecurityAudit> | null = null;

    function audit() {
        if (!auditPromise) auditPromise = runSecurityAudit();
        return auditPromise;
    }

    function findingsById(findings: Finding[], id: string): Finding[] {
        return findings.filter((f) => f.id === id);
    }

    it("Bug 1 (s39): nenhuma policy com ru.restaurant_id = ru.restaurant_id", async () => {
        const r = await audit();
        const buggy = findingsById(r.findings, "ru-restaurant-id-self-eq");
        expect(buggy, JSON.stringify(buggy, null, 2)).toEqual([]);
    });

    it("Bug 2 (s38): nenhuma policy de INSERT/UPDATE com WITH CHECK (true)", async () => {
        const r = await audit();
        const permissive = findingsById(r.findings, "with-check-true");
        expect(permissive, JSON.stringify(permissive, null, 2)).toEqual([]);
    });

    it("Bug 3 (s38): toda SECURITY DEFINER em public tem search_path fixo", async () => {
        const r = await audit();
        const noSearchPath = findingsById(r.findings, "secdef-no-search-path");
        expect(noSearchPath, JSON.stringify(noSearchPath, null, 2)).toEqual([]);
    });

    it("Sanidade: auditoria retorna zero ERRORs", async () => {
        const r = await audit();
        const errs = r.findings.filter((f) => f.severity === "error");
        expect(errs, JSON.stringify(errs, null, 2)).toEqual([]);
    });
});
