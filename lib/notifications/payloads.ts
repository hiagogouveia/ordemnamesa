import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { IssuePayload, IssueSeverity } from "./contract";
import { getNowInTz } from "@/lib/utils/brazil-date";
import { getRestaurantTimezone } from "@/lib/utils/restaurant-time";

/**
 * Construtores de payload a partir das linhas do domínio.
 *
 * Moram aqui (e não dentro de uma rota) porque MAIS DE UMA rota emite eventos sobre a
 * mesma entidade: `POST /api/task-issues` (ocorrência criada) e
 * `PATCH /api/task-issues/[id]` (ocorrência resolvida). Duplicar a construção do payload
 * entre elas seria a porta de entrada para os dois lados divergirem — exatamente o
 * problema que o contrato único veio resolver.
 */

export interface TaskIssueRow {
    id: string;
    restaurant_id: string;
    checklist_id: string;
    checklist_assumption_id: string | null;
    task_id: string;
    severity: string;
    reported_by: string;
    description: string;
}

/**
 * Monta o payload de uma ocorrência.
 *
 * O `date_key` é o que destrava o deep-link histórico: sem ele, o painel só sabe falar
 * do "hoje" e uma ocorrência de ontem fica inalcançável. A fonte preferencial é a
 * assumption (o dia em que a rotina foi assumida). Sem assumption, cai no dia corrente
 * NO FUSO DO RESTAURANTE — nunca no fuso do servidor.
 */
export async function buildIssuePayload(
    admin: SupabaseClient,
    issue: TaskIssueRow,
): Promise<IssuePayload> {
    const [assumptionRes, checklistRes, taskRes, reporterRes] = await Promise.all([
        issue.checklist_assumption_id
            ? admin
                  .from("checklist_assumptions")
                  .select("date_key")
                  .eq("id", issue.checklist_assumption_id)
                  .maybeSingle()
            : Promise.resolve({ data: null }),
        admin.from("checklists").select("name").eq("id", issue.checklist_id).maybeSingle(),
        admin.from("checklist_tasks").select("title").eq("id", issue.task_id).maybeSingle(),
        admin.from("users").select("name").eq("id", issue.reported_by).maybeSingle(),
    ]);

    let dateKey = (assumptionRes.data as { date_key?: string } | null)?.date_key;
    if (!dateKey) {
        const tz = await getRestaurantTimezone(admin, issue.restaurant_id);
        dateKey = getNowInTz(tz).dateKey;
    }

    const text = (issue.description ?? "").trim();

    return {
        issue_id: issue.id,
        checklist_id: issue.checklist_id,
        checklist_assumption_id: issue.checklist_assumption_id,
        date_key: dateKey,
        task_id: issue.task_id,
        severity: (issue.severity === "blocker" ? "blocker" : "normal") as IssueSeverity,
        reported_by_user_id: issue.reported_by,
        checklist_name: (checklistRes.data as { name?: string } | null)?.name ?? "Rotina",
        task_title: (taskRes.data as { title?: string } | null)?.title ?? "Tarefa",
        reported_by_name: (reporterRes.data as { name?: string } | null)?.name ?? "Colaborador",
        excerpt: text.length > 120 ? `${text.slice(0, 120)}…` : text,
    };
}
