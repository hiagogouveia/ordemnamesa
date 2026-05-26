#!/usr/bin/env -S node --experimental-strip-types
/**
 * scripts/security-audit.ts — auditoria estática de RLS/SECURITY DEFINER.
 *
 * Roda 6 checks lendo o catálogo do Postgres via service_role:
 *   1. tabelas em public sem RLS habilitado
 *   2. policies com WITH CHECK (true) em INSERT/UPDATE
 *   3. policies com o bug histórico ru.restaurant_id = ru.restaurant_id
 *   4. SECURITY DEFINER em public sem search_path fixo
 *   5. SECURITY DEFINER callable por anon que NÃO seja signup_create_restaurant
 *   6. (info) tabelas operacionais com policies ainda usando EXISTS inline em
 *      vez do helper is_restaurant_member
 *
 * Modo CLI: imprime relatório e sai com exit code != 0 se houver `severity:'error'`.
 * Modo módulo: exporta `runSecurityAudit()` para uso em testes.
 *
 * Uso:
 *   TEST_ENV_FILE=.env.nonprod node --experimental-strip-types scripts/security-audit.ts
 *   ou via npm: npm run security:audit
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type Severity = "error" | "warn" | "info";

export interface Finding {
    id: string;
    severity: Severity;
    title: string;
    detail: string;
}

export interface AuditReport {
    findings: Finding[];
    countsBySeverity: Record<Severity, number>;
    ok: boolean;
}

/* -------------------- env loader (idem load-env.ts, sem deps) ------------- */
function loadEnvFromFile(filePath: string): void {
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, "utf-8");
    for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        if (process.env[key] === undefined) process.env[key] = value;
    }
}

function getServiceClient(): SupabaseClient {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        throw new Error(
            "NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não definidas. Use TEST_ENV_FILE=.env.nonprod.",
        );
    }
    if (url.includes("buucddacymkybkrszcqy")) {
        // PROD detectado — recusa para preservar o contrato do script.
        throw new Error("Recusando rodar contra PROD. Aponte para NONPROD.");
    }
    return createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
}

interface PgRow {
    [key: string]: unknown;
}

function getProjectRef(): string {
    if (process.env.SUPABASE_NONPROD_PROJECT_REF) return process.env.SUPABASE_NONPROD_PROJECT_REF;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const m = url.match(/^https?:\/\/([a-z0-9]+)\.supabase\.co/i);
    if (!m) throw new Error("Não consegui derivar project ref de NEXT_PUBLIC_SUPABASE_URL.");
    return m[1];
}

async function runSql<T extends PgRow>(
    _sb: SupabaseClient,
    sql: string,
): Promise<T[]> {
    const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
    if (!accessToken) {
        throw new Error(
            "SUPABASE_ACCESS_TOKEN ausente. Crie em https://supabase.com/dashboard/account/tokens e exporte antes de rodar.",
        );
    }
    const ref = getProjectRef();
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ query: sql }),
    });
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Management API ${res.status}: ${body.slice(0, 200)}`);
    }
    const json = (await res.json()) as T[];
    return Array.isArray(json) ? json : [];
}

/* -------------------- checks --------------------------------------------- */

async function checkRlsDisabled(sb: SupabaseClient): Promise<Finding[]> {
    const rows = await runSql<{ tablename: string }>(
        sb,
        `SELECT c.relname AS tablename
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relkind = 'r' AND n.nspname = 'public' AND NOT c.relrowsecurity
          ORDER BY 1;`,
    );
    return rows.map((r) => ({
        id: "rls-disabled-in-public",
        severity: "error" as Severity,
        title: `RLS desabilitado em public.${r.tablename}`,
        detail:
            "Habilite com ALTER TABLE public." +
            r.tablename +
            " ENABLE ROW LEVEL SECURITY na próxima migration.",
    }));
}

async function checkPermissivePolicies(sb: SupabaseClient): Promise<Finding[]> {
    const rows = await runSql<{
        tablename: string;
        policyname: string;
        cmd: string;
    }>(
        sb,
        `SELECT tablename, policyname, cmd
           FROM pg_policies
          WHERE schemaname='public'
            AND cmd IN ('INSERT','UPDATE','ALL')
            AND (with_check IS NOT NULL AND trim(with_check) IN ('true','TRUE'))
          ORDER BY tablename, policyname;`,
    );
    return rows.map((r) => ({
        id: "with-check-true",
        severity: "error" as Severity,
        title: `Policy permissiva em public.${r.tablename}`,
        detail: `Policy ${r.policyname} (${r.cmd}) tem WITH CHECK (true). Restrinja por restaurant_id/auth.uid().`,
    }));
}

async function checkHistoricalBug(sb: SupabaseClient): Promise<Finding[]> {
    const rows = await runSql<{ tablename: string; policyname: string }>(
        sb,
        `SELECT tablename, policyname
           FROM pg_policies
          WHERE schemaname='public'
            AND (qual ILIKE '%ru.restaurant_id = ru.restaurant_id%'
              OR with_check ILIKE '%ru.restaurant_id = ru.restaurant_id%')
          ORDER BY tablename, policyname;`,
    );
    return rows.map((r) => ({
        id: "ru-restaurant-id-self-eq",
        severity: "error" as Severity,
        title: `Bug histórico em public.${r.tablename}`,
        detail: `Policy ${r.policyname} contém ru.restaurant_id = ru.restaurant_id (sempre true). Vazamento cross-tenant.`,
    }));
}

async function checkSecurityDefinerSearchPath(
    sb: SupabaseClient,
): Promise<Finding[]> {
    const rows = await runSql<{ proname: string; args: string }>(
        sb,
        `SELECT p.proname,
                pg_get_function_identity_arguments(p.oid) AS args,
                COALESCE(p.proconfig, ARRAY[]::text[]) AS config
           FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname='public' AND p.prosecdef = true
            AND NOT EXISTS (
                SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) c
                 WHERE c ILIKE 'search_path=%'
            )
          ORDER BY 1;`,
    );
    return rows.map((r) => ({
        id: "secdef-no-search-path",
        severity: "error" as Severity,
        title: `SECURITY DEFINER sem search_path: ${r.proname}(${r.args})`,
        detail:
            "Adicione SET search_path = public, pg_temp à função para mitigar schema hijack.",
    }));
}

async function checkSecurityDefinerAnonExecute(
    sb: SupabaseClient,
): Promise<Finding[]> {
    const allowAnon = new Set(["signup_create_restaurant"]);
    const rows = await runSql<{ proname: string; args: string }>(
        sb,
        `SELECT p.proname,
                pg_get_function_identity_arguments(p.oid) AS args
           FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname='public' AND p.prosecdef = true
            AND has_function_privilege('anon', p.oid, 'EXECUTE')
          ORDER BY 1;`,
    );
    return rows
        .filter((r) => !allowAnon.has(r.proname))
        .map((r) => ({
            id: "secdef-anon-execute",
            severity: "warn" as Severity,
            title: `SECURITY DEFINER callable por anon: ${r.proname}(${r.args})`,
            detail: `REVOKE EXECUTE ON FUNCTION public.${r.proname}(${r.args}) FROM anon, PUBLIC;`,
        }));
}

async function checkInlineExistsPolicies(
    sb: SupabaseClient,
): Promise<Finding[]> {
    const rows = await runSql<{
        tablename: string;
        policyname: string;
        cmd: string;
    }>(
        sb,
        `SELECT tablename, policyname, cmd
           FROM pg_policies
          WHERE schemaname='public'
            AND tablename IN (
                'areas','checklist_orders',
                'roles','shifts','user_areas','user_roles','user_shifts',
                'checklists','checklist_tasks','task_executions','receiving_expectations'
            )
            AND COALESCE(qual,'') !~* 'is_restaurant_member'
            AND COALESCE(with_check,'') !~* 'is_restaurant_member'
            AND (COALESCE(qual,'') ~* 'restaurant_users' OR COALESCE(with_check,'') ~* 'restaurant_users')
          ORDER BY tablename, policyname;`,
    );
    return rows.map((r) => ({
        id: "policy-inline-exists",
        severity: "info" as Severity,
        title: `Policy ainda usa EXISTS inline: ${r.tablename}.${r.policyname}`,
        detail: `Migrar para public.is_restaurant_member(...). Comando: ${r.cmd}`,
    }));
}

/* -------------------- runner --------------------------------------------- */

export async function runSecurityAudit(): Promise<AuditReport> {
    const sb = getServiceClient();
    const all: Finding[] = [];
    const checks = [
        checkRlsDisabled,
        checkPermissivePolicies,
        checkHistoricalBug,
        checkSecurityDefinerSearchPath,
        checkSecurityDefinerAnonExecute,
        checkInlineExistsPolicies,
    ];
    for (const c of checks) {
        try {
            all.push(...(await c(sb)));
        } catch (e) {
            all.push({
                id: "check-runtime-error",
                severity: "error",
                title: `Check ${c.name} falhou em runtime`,
                detail: String((e as Error).message),
            });
        }
    }
    const counts: Record<Severity, number> = { error: 0, warn: 0, info: 0 };
    for (const f of all) counts[f.severity]++;
    return { findings: all, countsBySeverity: counts, ok: counts.error === 0 };
}

/* -------------------- CLI ------------------------------------------------- */

function isMain(): boolean {
    return process.argv[1] && import.meta.url === `file://${process.argv[1]}`
        ? true
        : (process.argv[1] ?? "").endsWith("security-audit.ts");
}

async function main(): Promise<void> {
    const root = path.resolve(__dirname, "..");
    loadEnvFromFile(path.join(root, process.env.TEST_ENV_FILE ?? ".env.nonprod"));

    const report = await runSecurityAudit();

    const grouped: Record<Severity, Finding[]> = { error: [], warn: [], info: [] };
    for (const f of report.findings) grouped[f.severity].push(f);

    const lines: string[] = [];
    lines.push(`# security-audit — ${new Date().toISOString()}`);
    lines.push("");
    lines.push(
        `Resumo: ${report.countsBySeverity.error} ERROR · ${report.countsBySeverity.warn} WARN · ${report.countsBySeverity.info} INFO`,
    );
    lines.push("");
    for (const sev of ["error", "warn", "info"] as const) {
        if (grouped[sev].length === 0) continue;
        lines.push(`## ${sev.toUpperCase()}`);
        for (const f of grouped[sev]) {
            lines.push(`- [${f.id}] ${f.title}`);
            lines.push(`  ↳ ${f.detail}`);
        }
        lines.push("");
    }
    process.stdout.write(lines.join("\n") + "\n");

    process.exit(report.ok ? 0 : 1);
}

if (isMain()) {
    main().catch((e) => {
        console.error(e);
        process.exit(2);
    });
}
