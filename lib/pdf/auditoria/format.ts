import {
    AUDIT_STATUS_LABEL,
    AUDIT_TASK_STATUS_LABEL,
    SHIFT_LABEL,
    TASK_ISSUE_STATUS_LABEL,
} from "@/lib/types/audit";
import type {
    AuditExecutionDetail,
    AuditTaskDetail,
    AuditTaskStatus,
} from "@/lib/types/audit";

/**
 * Camada de transformação `AuditExecutionDetail` → dados prontos para o
 * documento react-pdf. Sem I/O: as imagens já chegam resolvidas como data URLs
 * (carregadas pelo orquestrador em `generate.tsx`) via o mapa `imageByUrl`.
 *
 * `mode = 'summary'` omite toda a carga fotográfica (evidências e fotos de
 * ocorrência) — é o principal alívio de tamanho/memória.
 */

export type ReportMode = "full" | "summary";

export interface ReportImage {
    dataUrl: string;
    caption: string;
    sub?: string;
}

export interface ReportIssue {
    taskTitle: string;
    statusLabel: string;
    description: string;
    reporterLine: string;
    managerComment: string | null;
    photoCount: number;
}

export interface ReportTaskRow {
    index: number;
    title: string;
    isCritical: boolean;
    description: string | null;
    statusLabel: string;
    statusBg: string;
    statusColor: string;
    time: string;
    observation: string | null;
    impedimentReason: string | null;
    ratingStars: string | null;
    ratingValue: number | null;
}

export interface ReportMetaItem {
    label: string;
    value: string;
}

export interface AuditReportData {
    documentUuid: string;
    assumptionId: string;
    checklistName: string;
    statusLabel: string;
    hadImpediment: boolean;
    isImpediment: boolean;
    dateLabel: string;
    unitName: string | null;
    metaTop: ReportMetaItem[];
    metaTimes: ReportMetaItem[];
    issues: ReportIssue[];
    issuesTitle: string | null;
    issuesLead: string | null;
    impedimentReason: string | null;
    hasTaskDetail: boolean;
    finalizedWithoutDetail: boolean;
    tasks: ReportTaskRow[];
    evidences: ReportImage[];
}

export interface AuditDocumentData {
    restaurantName: string;
    exportedBy: string;
    generatedAt: string;
    mode: ReportMode;
    logoDataUrl?: string;
    brandLogoDataUrl?: string;
    reports: AuditReportData[];
}

const STATUS_COLORS: Record<AuditTaskStatus, { bg: string; color: string }> = {
    completed: { bg: "#dcfce7", color: "#15803d" },
    impediment: { bg: "#ffedd5", color: "#c2410c" },
    incomplete: { bg: "#fef3c7", color: "#a16207" },
    pending: { bg: "#f1f5f9", color: "#64748b" },
};

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("pt-BR");
}
function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function formatDateTime(iso: string): string {
    return new Date(iso).toLocaleString("pt-BR", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
}
function formatStars(rating: number): string {
    const filled = Math.max(0, Math.min(5, Math.round(rating)));
    return "★".repeat(filled) + "☆".repeat(5 - filled);
}
function formatDuration(seconds: number | null): string {
    if (seconds === null) return "—";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m < 60) return s > 0 ? `${m}min ${s}s` : `${m}min`;
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return rm > 0 ? `${h}h ${rm}min` : `${h}h`;
}

function buildTaskRows(tasks: AuditTaskDetail[]): ReportTaskRow[] {
    return tasks.map((t, idx) => {
        const colors = STATUS_COLORS[t.status];
        const isRating = t.task_type === "rating" && t.value_rating != null;
        return {
            index: idx + 1,
            title: t.title,
            isCritical: t.is_critical,
            description: t.description,
            statusLabel: AUDIT_TASK_STATUS_LABEL[t.status],
            statusBg: colors.bg,
            statusColor: colors.color,
            time: t.executed_at ? formatTime(t.executed_at) : "—",
            observation: t.observation,
            impedimentReason: t.impediment_reason,
            ratingStars: isRating ? formatStars(t.value_rating!) : null,
            ratingValue: isRating ? t.value_rating : null,
        };
    });
}

function buildEvidences(
    tasks: AuditTaskDetail[],
    imageByUrl: Map<string, string>,
): ReportImage[] {
    const out: ReportImage[] = [];
    for (const t of tasks) {
        const valid = t.evidences.filter(ev => !!ev.signed_url);
        valid.forEach((ev, i) => {
            const dataUrl = ev.signed_url ? imageByUrl.get(ev.signed_url) : undefined;
            if (!dataUrl) return; // imagem que falhou ao carregar é omitida (erro parcial silencioso no doc)
            out.push({
                dataUrl,
                caption: t.title,
                sub: valid.length > 1 ? `${i + 1}/${valid.length}` : undefined,
            });
        });
    }
    return out;
}

/**
 * Monta os dados de UM relatório. `imageByUrl` resolve signed URLs → data URLs
 * (vazio em `mode='summary'`, onde nenhuma foto é embutida).
 */
export function buildReportData(
    detail: AuditExecutionDetail,
    documentUuid: string,
    mode: ReportMode,
    imageByUrl: Map<string, string>,
): AuditReportData {
    const isImpediment = detail.status === "impediment";
    const hasTaskDetail = detail.tasks.some(t => t.execution_id !== null);

    const metaTop: ReportMetaItem[] = [
        { label: "Área", value: detail.area?.name ?? "—" },
        { label: "Turno", value: detail.checklist.shift ? SHIFT_LABEL[detail.checklist.shift] : "—" },
        { label: "Responsável", value: detail.user.name },
        { label: "Duração", value: formatDuration(detail.duration_seconds) },
    ];
    const metaTimes: ReportMetaItem[] = [
        { label: "Iniciado em", value: formatDateTime(detail.assumed_at) },
        { label: "Concluído em", value: detail.completed_at ? formatDateTime(detail.completed_at) : "—" },
    ];

    const issues: ReportIssue[] = detail.issues.map(issue => ({
        taskTitle: issue.task_title,
        statusLabel: issue.is_pending ? "Pendente" : TASK_ISSUE_STATUS_LABEL[issue.status],
        description: issue.description,
        reporterLine: `Reportado por ${issue.reporter_name} · ${formatDateTime(issue.created_at)}`
            + (issue.photos.length > 0 ? ` · ${issue.photos.length} foto(s)` : ""),
        managerComment: issue.manager_comment,
        photoCount: issue.photos.length,
    }));

    return {
        documentUuid,
        assumptionId: detail.assumption_id,
        checklistName: detail.checklist.name,
        statusLabel: AUDIT_STATUS_LABEL[detail.status],
        hadImpediment: detail.had_impediment,
        isImpediment,
        dateLabel: formatDate(detail.assumed_at),
        unitName: detail.unit?.name ?? null,
        metaTop,
        metaTimes,
        issues,
        issuesTitle: detail.issues.length > 0 ? `Ocorrências durante execução (${detail.issues.length})` : null,
        issuesLead: detail.issues.length === 0 ? null : (isImpediment
            ? "Rotina encerrada com ocorrência pendente (tarefa afetada não concluída). Status final: Com impedimento."
            : "Houve ocorrência durante a execução, mas a rotina foi concluída. Status final: Concluída."),
        impedimentReason: detail.impediment_reason,
        hasTaskDetail,
        finalizedWithoutDetail: !hasTaskDetail && detail.tasks.length > 0,
        tasks: buildTaskRows(detail.tasks),
        evidences: mode === "full" ? buildEvidences(detail.tasks, imageByUrl) : [],
    };
}

/** Todas as signed URLs (evidências + fotos de ocorrência) de um detalhe — o
 *  orquestrador as pré-carrega como data URLs no modo 'full'. */
export function collectImageUrls(detail: AuditExecutionDetail): string[] {
    const urls: string[] = [];
    for (const t of detail.tasks) {
        for (const ev of t.evidences) if (ev.signed_url) urls.push(ev.signed_url);
    }
    for (const issue of detail.issues) {
        for (const p of issue.photos) if (p.signed_url) urls.push(p.signed_url);
    }
    return urls;
}
