/**
 * Mock data 100% fictício para o walkthrough da demo.
 *
 * IMPORTANTE:
 * - Nada aqui vem de Supabase, cookies, localStorage ou contexto real.
 * - Tudo é constante estática avaliada em build time.
 * - Nomes, áreas e métricas são propositalmente fictícios.
 * - Não importar nada de `lib/supabase/`, `lib/hooks/`, `lib/store/`.
 */

import type {
  DemoAreaProgress,
  DemoAuditEntry,
  DemoChecklist,
  DemoDashboardMetric,
  DemoEvidence,
  DemoPriorityAlert,
  DemoStepConfig,
  DemoTeamMember,
  DemoTrendBar,
} from "../_types/demo.types";

export const DEMO_WHATSAPP_URL = "https://wa.me/5567991364767";

/** Restaurante fictício exibido nos headers da demo */
export const DEMO_RESTAURANT = {
  name: "Bistrô Demonstração",
  unit: "Unidade Centro",
  shiftLabel: "Turno da manhã",
  /** Data fixa exibida no dashboard — fictícia, formato display */
  todayLabel: "Seg., 25 de Mai.",
};

/** Checklist exemplo — passo 2 do walkthrough */
export const DEMO_CHECKLIST: DemoChecklist = {
  id: "demo-checklist-1",
  name: "Abertura da Cozinha Central",
  area: "Cozinha Central",
  shift: "morning",
  completedCount: 6,
  totalCount: 8,
  assignee: "Joana S.",
  tasks: [
    {
      id: "t1",
      title: "Verificar temperatura das câmaras frias",
      status: "done",
      requiresPhoto: true,
      hasPhoto: true,
      completedAt: "07:12",
      assignee: "Joana S.",
    },
    {
      id: "t2",
      title: "Higienizar bancadas e utensílios",
      status: "done",
      requiresPhoto: true,
      hasPhoto: true,
      completedAt: "07:24",
      assignee: "Joana S.",
    },
    {
      id: "t3",
      title: "Conferir validade dos perecíveis",
      status: "done",
      requiresPhoto: false,
      completedAt: "07:35",
      assignee: "Joana S.",
    },
    {
      id: "t4",
      title: "Preparar mise en place do almoço",
      status: "in_progress",
      requiresPhoto: false,
      assignee: "Joana S.",
    },
    {
      id: "t5",
      title: "Registrar lote dos insumos recebidos",
      status: "pending",
      requiresPhoto: true,
    },
  ],
};

/** Evidência fotográfica exemplo — passo 3 */
export const DEMO_EVIDENCE: DemoEvidence = {
  id: "demo-ev-1",
  taskTitle: "Higienizar bancadas e utensílios",
  area: "Cozinha Central · Abertura",
  capturedAt: "Hoje · 07:24",
  capturedBy: "Joana S.",
  caption:
    "Bancada principal higienizada com solução clorada 200ppm — utensílios secos e organizados.",
  geoLabel: "Cozinha Central · GPS verificado",
};

/* ─────────────────────────────────────────────────────────────
 * Dashboard gerencial — passo 4 (Visão gerencial completa)
 * ───────────────────────────────────────────────────────────── */

export const DEMO_DASHBOARD_METRICS: DemoDashboardMetric[] = [
  {
    id: "m1",
    label: "Conclusão diária",
    value: "94%",
    hint: "+6% vs. semana passada",
    trend: "up",
  },
  {
    id: "m2",
    label: "Tempo médio por rotina",
    value: "32 min",
    hint: "−4 min vs. ontem",
    trend: "up",
  },
  {
    id: "m3",
    label: "Tarefas concluídas",
    value: "187",
    hint: "Hoje, todas as áreas",
    trend: "flat",
  },
  {
    id: "m4",
    label: "Checklists atrasados",
    value: "2",
    hint: "Cobertura imediata",
    trend: "down",
  },
];

/** Gráfico semanal de tendências — eixo Ter → Seg, 0-100% */
export const DEMO_TREND_BARS: DemoTrendBar[] = [
  { label: "Ter", value: 78 },
  { label: "Qua", value: 0 },
  { label: "Qui", value: 82 },
  { label: "Sex", value: 88 },
  { label: "Sáb", value: 71 },
  { label: "Dom", value: 64 },
  { label: "Seg", value: 94, highlight: true },
];

/** Progresso por área — barra horizontal */
export const DEMO_AREA_PROGRESS: DemoAreaProgress[] = [
  { id: "ap1", name: "Cozinha Central", completed: 18, total: 20 },
  { id: "ap2", name: "Área de Estoque", completed: 11, total: 14 },
  { id: "ap3", name: "Salão", completed: 9, total: 12 },
  { id: "ap4", name: "Recebimento", completed: 6, total: 8 },
];

/** Alertas prioritários */
export const DEMO_PRIORITY_ALERTS: DemoPriorityAlert[] = [
  {
    id: "al1",
    title: "Rotina de Higienização",
    subtitle: "Prazo 08:55 — rotina não assumida",
    severity: "critical",
    badge: "Atrasado",
  },
  {
    id: "al2",
    title: "Checklist de Abertura — Salão",
    subtitle: "1 tarefa pendente há 12 min",
    severity: "warning",
  },
];

/** Status / Melhores desempenhos da equipe */
export const DEMO_TEAM_MEMBERS: DemoTeamMember[] = [
  {
    id: "u1",
    name: "Joana S.",
    role: "Cozinha Central",
    initials: "JS",
    statusLabel: "Concluiu · 2 rotinas",
    tone: "teal",
  },
  {
    id: "u2",
    name: "Carlos M.",
    role: "Salão",
    initials: "CM",
    statusLabel: "Em execução",
    tone: "blue",
  },
  {
    id: "u3",
    name: "André P.",
    role: "Estoque",
    initials: "AP",
    statusLabel: "100% no prazo",
    tone: "amber",
  },
];

/** Histórico auditável — usado em texto descritivo, não no dashboard novo */
export const DEMO_AUDIT_ENTRIES: DemoAuditEntry[] = [
  {
    id: "a1",
    time: "08:42",
    area: "Cozinha Central",
    action: "Checklist Abertura concluído",
    actor: "Joana S.",
    status: "ok",
  },
  {
    id: "a2",
    time: "08:15",
    area: "Salão",
    action: "Tarefa Mise en place mesas",
    actor: "Carlos M.",
    status: "ok",
  },
  {
    id: "a3",
    time: "07:58",
    area: "Estoque",
    action: "Recebimento Hortifruti",
    actor: "André P.",
    status: "warn",
  },
];

/** Configuração linear dos 5 passos do walkthrough */
export const DEMO_STEPS: DemoStepConfig[] = [
  {
    id: 1,
    title: "Bem-vindo ao Ordem na Mesa",
    description:
      "Veja como restaurantes organizam a operação no dia a dia — checklists, evidências e visão gerencial em tempo real.",
    kicker: "Demonstração guiada · 1 min",
    contentKey: "welcome",
    primaryLabel: "Começar",
    showBack: false,
  },
  {
    id: 2,
    title: "Checklists operacionais",
    description:
      "Checklists garantem que tarefas importantes sejam executadas corretamente, na ordem certa e por quem precisa.",
    kicker: "Passo 1 de 4",
    contentKey: "checklist",
  },
  {
    id: 3,
    title: "Evidência fotográfica",
    description:
      "Cada execução pode exigir evidência fotográfica auditável. Acabou improviso — tudo fica registrado.",
    kicker: "Passo 2 de 4",
    contentKey: "evidence",
  },
  {
    id: 4,
    title: "Visão gerencial completa",
    description:
      "Em um só lugar: métricas do dia, tendências, alertas prioritários e desempenho da equipe — sem planilha, sem ruído.",
    kicker: "Passo 3 de 4",
    contentKey: "dashboard",
  },
  {
    id: 5,
    title: "Sua operação pode funcionar assim",
    description:
      "Fale com nossa equipe e veja como implementar o Ordem na Mesa no seu restaurante.",
    kicker: "Passo 4 de 4",
    contentKey: "cta",
    primaryLabel: "Falar no WhatsApp",
  },
];
