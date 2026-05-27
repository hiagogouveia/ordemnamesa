/**
 * Tipos isolados da demonstração visual.
 *
 * IMPORTANTE: Estes tipos NÃO derivam de lib/types/index.ts para
 * manter o módulo demo completamente desacoplado do app real.
 * Qualquer mudança nas entidades do sistema NÃO deve quebrar a demo.
 */

export type DemoShift = "morning" | "afternoon" | "evening";

export type DemoTaskStatus = "done" | "pending" | "in_progress";

export interface DemoTask {
  id: string;
  title: string;
  status: DemoTaskStatus;
  requiresPhoto: boolean;
  hasPhoto?: boolean;
  completedAt?: string; // formato display, ex: "08:42"
  assignee?: string;
}

export interface DemoChecklist {
  id: string;
  name: string;
  area: string;
  shift: DemoShift;
  completedCount: number;
  totalCount: number;
  assignee: string;
  tasks: DemoTask[];
}

export interface DemoEvidence {
  id: string;
  taskTitle: string;
  area: string;
  capturedAt: string; // ex: "Hoje · 08:42"
  capturedBy: string;
  caption: string;
  /** Tag pequena exibida no canto da "foto" (ex: "GPS · Cozinha Central") */
  geoLabel?: string;
}

export interface DemoDashboardMetric {
  id: string;
  label: string;
  value: string;
  hint: string;
  trend: "up" | "down" | "flat";
}

export interface DemoAuditEntry {
  id: string;
  time: string; // ex: "08:42"
  area: string;
  action: string;
  actor: string;
  status: "ok" | "warn" | "info";
}

/* ─────────────────────────────────────────────────────────────
 * Novos tipos — passo "Visão gerencial completa"
 * ───────────────────────────────────────────────────────────── */

/** Barra do gráfico semanal de tendências */
export interface DemoTrendBar {
  label: string; // "Ter", "Qua", "Qui"...
  value: number; // 0–100 (taxa de conclusão %)
  highlight?: boolean; // destaca dia "hoje"
}

/** Linha de progresso por área */
export interface DemoAreaProgress {
  id: string;
  name: string;
  emoji?: string;
  completed: number;
  total: number;
}

/** Card de alerta prioritário */
export interface DemoPriorityAlert {
  id: string;
  title: string;
  subtitle: string;
  severity: "critical" | "warning" | "info";
  badge?: string; // ex: "Atrasado"
}

/** Linha de status de equipe / top performers */
export interface DemoTeamMember {
  id: string;
  name: string;
  role: string;
  initials: string;
  statusLabel: string; // ex: "Concluiu", "2 tarefas"
  /** Cor opcional do avatar — paleta dark/petróleo */
  tone?: "blue" | "teal" | "amber" | "violet";
}

/** Configuração de um passo do walkthrough */
export interface DemoStepConfig {
  id: number;
  title: string;
  description: string;
  /** Texto opcional acima do título (kicker) */
  kicker?: string;
  /** Identificador do conteúdo visual a renderizar */
  contentKey:
    | "welcome"
    | "checklist"
    | "evidence"
    | "dashboard"
    | "cta";
  /** Texto do botão primário (default: "Próximo") */
  primaryLabel?: string;
  /** Mostra botão "Voltar" (default: true a partir do passo 2) */
  showBack?: boolean;
}
