"use client";

import {
  Activity,
  Camera,
  Check,
  CheckSquare,
  History,
  Smartphone,
  Users,
} from "@/components/landing/icons";
import {
  DEMO_AREA_PROGRESS,
  DEMO_CHECKLIST,
  DEMO_DASHBOARD_METRICS,
  DEMO_EVIDENCE,
  DEMO_PRIORITY_ALERTS,
  DEMO_RESTAURANT,
  DEMO_TEAM_MEMBERS,
  DEMO_TREND_BARS,
} from "../_mock/demo-data";
import type {
  DemoAreaProgress,
  DemoDashboardMetric,
  DemoPriorityAlert,
  DemoStepConfig,
  DemoTeamMember,
  DemoTrendBar,
} from "../_types/demo.types";
import { DemoMockPhoto } from "./DemoMockPhoto";

/**
 * Renderização do conteúdo visual de cada passo do walkthrough.
 *
 * NÃO reutiliza componentes complexos do app (RoutineCard, ChecklistCard, etc)
 * para evitar acoplamento com hooks/providers/queries do sistema real.
 * Toda UI aqui é simples, declarativa e usa apenas Tailwind + ícones já
 * presentes na landing (`components/landing/icons.tsx`).
 *
 * Paleta deliberadamente mais sóbria que a primeira versão:
 *  - Fundo escuro azul-petróleo em vez de preto puro
 *  - Acentos cyan/primary aplicados com baixa opacidade
 *  - Glow azul reduzido para sensação "SaaS premium" em vez de "neon"
 */

interface DemoContentProps {
  step: DemoStepConfig;
}

export function DemoContent({ step }: DemoContentProps) {
  switch (step.contentKey) {
    case "welcome":
      return <WelcomeContent />;
    case "checklist":
      return <ChecklistContent />;
    case "evidence":
      return <EvidenceContent />;
    case "dashboard":
      return <DashboardContent />;
    case "cta":
      return <CtaContent />;
    default:
      return null;
  }
}

/* =========================================================================
 * PASSO 1 — Welcome
 * ========================================================================= */
function WelcomeContent() {
  return (
    <div className="flex flex-col items-center text-center gap-6 py-6 sm:py-10">
      <div
        className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl flex items-center justify-center
                   bg-gradient-to-br from-primary/20 to-primary/[0.03]
                   border border-primary/25 text-primary/90
                   shadow-[0_18px_40px_-12px_rgba(19,182,236,0.18)]"
      >
        <Smartphone size={42} />
      </div>
      <div className="space-y-2">
        <div className="text-[11px] font-bold tracking-[0.25em] uppercase text-primary/80">
          Ordem na Mesa
        </div>
        <div className="text-2xl sm:text-3xl font-bold text-white tracking-tight max-w-md">
          Restaurantes rodando no padrão, todos os dias.
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 max-w-md w-full mt-2">
        <FeatureBadge icon={<CheckSquare size={16} />} label="Checklists" />
        <FeatureBadge icon={<Camera size={16} />} label="Evidências" />
        <FeatureBadge icon={<Activity size={16} />} label="Dashboard" />
      </div>
    </div>
  );
}

function FeatureBadge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div
      className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl
                 bg-white/[0.025] border border-white/10 text-text-secondary"
    >
      <div className="text-primary/80">{icon}</div>
      <div className="text-[11px] font-semibold">{label}</div>
    </div>
  );
}

/* =========================================================================
 * PASSO 2 — Checklist
 * ========================================================================= */
function ChecklistContent() {
  const progress =
    DEMO_CHECKLIST.totalCount > 0
      ? Math.round((DEMO_CHECKLIST.completedCount / DEMO_CHECKLIST.totalCount) * 100)
      : 0;

  return (
    <div className="w-full max-w-md mx-auto">
      <DemoPhoneFrame title={DEMO_RESTAURANT.shiftLabel} subtitle={DEMO_RESTAURANT.unit}>
        {/* Header do checklist */}
        <div className="px-4 pt-3 pb-4 border-b border-white/5">
          <div className="text-[10px] font-bold tracking-widest uppercase text-primary/80 mb-1">
            {DEMO_CHECKLIST.area}
          </div>
          <div className="text-base font-bold text-white leading-tight mb-3">
            {DEMO_CHECKLIST.name}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary/80 to-success/80 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="text-[11px] font-bold text-white tabular-nums">
              {DEMO_CHECKLIST.completedCount}/{DEMO_CHECKLIST.totalCount}
            </div>
          </div>
        </div>

        {/* Lista de tarefas */}
        <ul className="px-4 py-3 space-y-2 max-h-[260px] overflow-y-auto">
          {DEMO_CHECKLIST.tasks.map((task) => (
            <li
              key={task.id}
              className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
                task.status === "done"
                  ? "bg-success/[0.06] border-success/15"
                  : task.status === "in_progress"
                    ? "bg-primary/[0.06] border-primary/20"
                    : "bg-white/[0.02] border-white/10"
              }`}
            >
              <div
                className={`shrink-0 w-6 h-6 rounded-md flex items-center justify-center mt-0.5 ${
                  task.status === "done"
                    ? "bg-success text-white"
                    : task.status === "in_progress"
                      ? "bg-primary/15 text-primary/90 border border-primary/30"
                      : "bg-white/5 border border-white/15 text-text-secondary"
                }`}
              >
                {task.status === "done" ? <Check size={14} /> : null}
                {task.status === "in_progress" ? (
                  <span className="w-2 h-2 rounded-full bg-primary/80 animate-pulse" />
                ) : null}
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className={`text-[13px] font-semibold leading-tight ${
                    task.status === "done"
                      ? "text-text-secondary line-through"
                      : "text-white"
                  }`}
                >
                  {task.title}
                </div>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-text-secondary">
                  {task.requiresPhoto ? (
                    <span className="inline-flex items-center gap-1">
                      <Camera size={10} /> foto exigida
                    </span>
                  ) : null}
                  {task.completedAt ? (
                    <span className="tabular-nums">· {task.completedAt}</span>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </DemoPhoneFrame>
    </div>
  );
}

/* =========================================================================
 * PASSO 3 — Evidence (UI dominante sobre foto atmosférica)
 *
 * Estratégia v3: a foto vira atmosfera (DemoMockPhoto = bokeh + grain,
 * sem objetos literais). A UI domina via:
 *   - Viewfinder brackets nos 4 cantos (linguagem de "captura técnica")
 *   - Faixa metadata superior (tipo screenshot de app de câmera)
 *   - Badge ENVIADA sólido com ring pulsante
 *   - Geo label com ícone GPS SVG
 *   - Faixa metadata inferior sólida com timestamp/autor
 *   - Card detalhes embaixo da foto com hash mockado (rastreabilidade)
 * ========================================================================= */
function EvidenceContent() {
  return (
    <div className="w-full max-w-md mx-auto">
      <DemoPhoneFrame title="Evidência" subtitle={DEMO_EVIDENCE.area}>
        {/* Container da "foto" + overlays — aspect maior pra dar peso à UI */}
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-black">
          <DemoMockPhoto className="absolute inset-0 w-full h-full" />

          {/* Filtro escuro sutil reforçando contraste com a UI */}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/55"
          />

          {/* Viewfinder brackets — linguagem visual "captura técnica" */}
          <ViewfinderBrackets />

          {/* Faixa metadata superior — estilo HUD de câmera */}
          <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2 z-10">
            {/* Badge ENVIADA — sólido, com ring pulsante */}
            <div className="relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success/95 text-white text-[10px] font-extrabold tracking-[0.15em] shadow-lg shadow-success/30">
              <span className="relative flex w-2 h-2">
                <span className="absolute inset-0 rounded-full bg-white/90 animate-ping" />
                <span className="relative rounded-full w-2 h-2 bg-white" />
              </span>
              ENVIADA
            </div>

            {DEMO_EVIDENCE.geoLabel ? (
              <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-black/65 backdrop-blur-sm border border-white/10 text-[9px] font-bold text-white/95 tracking-wide">
                <GpsIcon />
                <span className="font-mono">{DEMO_EVIDENCE.geoLabel}</span>
              </div>
            ) : null}
          </div>

          {/* Faixa metadata inferior — sólida, estilo data strip */}
          <div className="absolute bottom-0 inset-x-0 z-10">
            <div className="bg-gradient-to-t from-black/85 via-black/55 to-transparent pt-6 pb-2.5 px-3">
              <div className="flex items-center justify-between gap-2 font-mono text-[10px] text-white/95">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-1 h-1 rounded-full bg-success" />
                  <span className="font-bold tracking-wide">REC · {DEMO_EVIDENCE.capturedAt}</span>
                </div>
                <span className="text-white/70">por {DEMO_EVIDENCE.capturedBy}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Card detalhes — fica como "log da evidência" */}
        <div className="px-4 py-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[10px] font-bold tracking-widest uppercase text-primary/80">
              Tarefa associada
            </div>
            <div className="text-[9px] font-mono text-text-secondary tracking-wider">
              ID #EV-2475
            </div>
          </div>
          <div className="text-sm font-bold text-white">{DEMO_EVIDENCE.taskTitle}</div>
          <div className="text-[12px] text-text-secondary leading-relaxed">
            {DEMO_EVIDENCE.caption}
          </div>
          <div className="flex items-center gap-2 pt-2 border-t border-white/5">
            <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-success/10 border border-success/20 text-success text-[10px] font-bold">
              <Check size={10} /> AUDITÁVEL
            </div>
            <div className="text-[10px] text-text-secondary font-mono truncate">
              sha256:a7f3…b21e
            </div>
          </div>
        </div>
      </DemoPhoneFrame>
    </div>
  );
}

/** Brackets de viewfinder nos 4 cantos — reforçam linguagem "captura técnica" */
function ViewfinderBrackets() {
  const stroke = "rgba(255,255,255,0.7)";
  const size = 18;
  const w = 2;
  return (
    <div className="absolute inset-3 pointer-events-none" aria-hidden="true">
      {/* TL */}
      <span
        className="absolute top-0 left-0"
        style={{ width: size, height: w, background: stroke }}
      />
      <span
        className="absolute top-0 left-0"
        style={{ width: w, height: size, background: stroke }}
      />
      {/* TR */}
      <span
        className="absolute top-0 right-0"
        style={{ width: size, height: w, background: stroke }}
      />
      <span
        className="absolute top-0 right-0"
        style={{ width: w, height: size, background: stroke }}
      />
      {/* BL */}
      <span
        className="absolute bottom-0 left-0"
        style={{ width: size, height: w, background: stroke }}
      />
      <span
        className="absolute bottom-0 left-0"
        style={{ width: w, height: size, background: stroke }}
      />
      {/* BR */}
      <span
        className="absolute bottom-0 right-0"
        style={{ width: size, height: w, background: stroke }}
      />
      <span
        className="absolute bottom-0 right-0"
        style={{ width: w, height: size, background: stroke }}
      />
    </div>
  );
}

function GpsIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="text-success"
    >
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="8" />
      <line x1="12" y1="2" x2="12" y2="4" />
      <line x1="12" y1="20" x2="12" y2="22" />
      <line x1="2" y1="12" x2="4" y2="12" />
      <line x1="20" y1="12" x2="22" y2="12" />
    </svg>
  );
}

/* =========================================================================
 * PASSO 4 — Visão gerencial completa (dashboard premium)
 * ========================================================================= */
function DashboardContent() {
  return (
    <div className="w-full max-w-5xl mx-auto">
      <div
        className="relative rounded-2xl overflow-hidden
                   bg-[#0a141a] border border-white/8
                   shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)]"
      >
        {/* Janela: chrome estilo macOS — sutilíssimo */}
        <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-white/5 bg-black/30">
          <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
          <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
          <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
          <div className="flex-1 text-center text-[10px] font-mono text-white/40 tracking-wider truncate">
            ordemnamesa.app / dashboard
          </div>
        </div>

        {/* Layout interno: sidebar + main (sidebar oculta em mobile) */}
        <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] min-h-[480px]">
          <DashboardSidebar />
          <DashboardMain />
        </div>
      </div>
    </div>
  );
}

function DashboardSidebar() {
  const items = [
    { label: "Dashboard", active: true },
    { label: "Meu Turno", badge: "11" },
    { label: "Checklists" },
    { label: "Equipe" },
    { label: "Recebimentos" },
    { label: "Relatórios" },
    { label: "Configurações" },
  ];
  return (
    <aside className="hidden sm:flex flex-col border-r border-white/5 bg-black/20 p-3 gap-1">
      {/* Restaurante atual */}
      <div className="rounded-lg p-2.5 mb-2 bg-white/[0.02] border border-white/8">
        <div className="text-[9px] uppercase tracking-widest text-text-secondary/70 mb-0.5">
          Restaurante Atual
        </div>
        <div className="text-[12px] font-bold text-white truncate">
          {DEMO_RESTAURANT.name}
        </div>
      </div>

      {items.map((it) => (
        <button
          type="button"
          key={it.label}
          disabled
          className={`flex items-center justify-between rounded-lg px-2.5 py-2 text-[12px] font-semibold transition-colors cursor-default ${
            it.active
              ? "bg-primary/10 text-primary/90 border border-primary/15"
              : "text-text-secondary hover:bg-white/[0.03]"
          }`}
        >
          <span>{it.label}</span>
          {it.badge ? (
            <span className="inline-flex items-center justify-center min-w-[20px] px-1.5 h-5 rounded-full bg-primary/15 text-primary/90 text-[10px] font-bold">
              {it.badge}
            </span>
          ) : null}
        </button>
      ))}

      {/* Footer user */}
      <div className="mt-auto pt-3 border-t border-white/5">
        <div className="flex items-center gap-2 px-1.5">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400/30 to-amber-600/10 border border-amber-300/20 text-amber-200 flex items-center justify-center text-[10px] font-bold">
            DM
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-white truncate">Daniela M.</div>
            <div className="text-[9px] text-text-secondary">Gerente</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function DashboardMain() {
  return (
    <div className="p-3 sm:p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
            Dashboard Geral
          </h3>
          <p className="text-[11px] text-text-secondary mt-0.5">
            Visão Geral Hoje · {DEMO_RESTAURANT.todayLabel} · {DEMO_RESTAURANT.name}
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <div className="px-2.5 py-1.5 rounded-md bg-white/[0.03] border border-white/8 text-[11px] text-text-secondary inline-flex items-center gap-1.5 min-w-[160px]">
            <span className="opacity-60">⌕</span>
            <span>Buscar área…</span>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {DEMO_DASHBOARD_METRICS.map((m) => (
          <KpiCard key={m.id} metric={m} />
        ))}
      </div>

      {/* Linha: tendências (esquerda) + alertas/equipe (direita) */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-3">
        <TrendsCard bars={DEMO_TREND_BARS} />
        <div className="space-y-3">
          <PriorityAlertsCard alerts={DEMO_PRIORITY_ALERTS} />
          <TeamCard members={DEMO_TEAM_MEMBERS} />
        </div>
      </div>

      {/* Progresso por área */}
      <AreaProgressCard areas={DEMO_AREA_PROGRESS} />
    </div>
  );
}

function KpiCard({ metric }: { metric: DemoDashboardMetric }) {
  const trendColor =
    metric.trend === "up"
      ? "text-emerald-300"
      : metric.trend === "down"
        ? "text-rose-300"
        : "text-text-secondary";
  return (
    <div className="rounded-xl p-3 bg-gradient-to-b from-white/[0.04] to-white/[0.01] border border-white/8">
      <div className="text-[9px] font-bold tracking-widest uppercase text-text-secondary/80 mb-1">
        {metric.label}
      </div>
      <div className="text-xl sm:text-2xl font-extrabold text-white tabular-nums leading-none">
        {metric.value}
      </div>
      <div className={`text-[10px] font-semibold mt-1.5 ${trendColor}`}>{metric.hint}</div>
    </div>
  );
}

function TrendsCard({ bars }: { bars: DemoTrendBar[] }) {
  const max = 100;
  return (
    <div className="rounded-xl bg-gradient-to-b from-white/[0.03] to-white/[0.005] border border-white/8 p-3 sm:p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-[10px] font-bold tracking-widest uppercase text-text-secondary/80">
            Tendências de Execução
          </div>
          <div className="text-[11px] text-text-secondary mt-0.5">
            Taxa de conclusão nos últimos 7 dias
          </div>
        </div>
        <div className="inline-flex rounded-md border border-white/10 overflow-hidden text-[10px] font-semibold">
          <span className="px-2 py-1 bg-white/5 text-white">Diário</span>
          <span className="px-2 py-1 text-text-secondary">Semanal</span>
          <span className="px-2 py-1 text-text-secondary">Mensal</span>
        </div>
      </div>

      {/* Gráfico SVG — 100% inline, sem libs */}
      <svg
        viewBox="0 0 700 200"
        className="w-full h-[160px] sm:h-[200px]"
        role="img"
        aria-label="Gráfico de tendência de conclusão semanal"
      >
        {/* Linha de meta 90% */}
        <line
          x1="0"
          y1={200 - (90 / max) * 180 - 10}
          x2="700"
          y2={200 - (90 / max) * 180 - 10}
          stroke="rgba(245,158,11,0.45)"
          strokeWidth="1"
          strokeDasharray="4 6"
        />
        <text
          x="694"
          y={200 - (90 / max) * 180 - 14}
          textAnchor="end"
          className="fill-amber-300/70"
          style={{ font: "bold 10px ui-sans-serif, system-ui" }}
        >
          Meta 90%
        </text>

        {bars.map((bar, i) => {
          const colWidth = 700 / bars.length;
          const barWidth = 36;
          const cx = i * colWidth + colWidth / 2;
          const h = Math.max((bar.value / max) * 180, 2);
          const y = 200 - h - 10;
          return (
            <g key={bar.label}>
              {/* Tooltip valor acima da barra (só dia atual e o de 0%) */}
              {bar.highlight || bar.value === 0 ? (
                <g>
                  <rect
                    x={cx - 18}
                    y={y - 22}
                    width="36"
                    height="16"
                    rx="3"
                    fill="rgba(255,255,255,0.06)"
                    stroke="rgba(255,255,255,0.1)"
                  />
                  <text
                    x={cx}
                    y={y - 11}
                    textAnchor="middle"
                    className="fill-white"
                    style={{ font: "bold 10px ui-sans-serif, system-ui" }}
                  >
                    {bar.value}%
                  </text>
                </g>
              ) : null}

              <rect
                x={cx - barWidth / 2}
                y={y}
                width={barWidth}
                height={h}
                rx="4"
                fill={
                  bar.highlight
                    ? "url(#trend-bar-active)"
                    : bar.value < 50
                      ? "rgba(244,63,94,0.55)"
                      : "rgba(148,163,184,0.30)"
                }
              />
              <text
                x={cx}
                y="196"
                textAnchor="middle"
                className="fill-text-secondary"
                style={{ font: "600 11px ui-sans-serif, system-ui" }}
              >
                {bar.label}
              </text>
            </g>
          );
        })}

        <defs>
          <linearGradient id="trend-bar-active" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#13b6ec" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#0d7ea3" stopOpacity="0.85" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

function PriorityAlertsCard({ alerts }: { alerts: DemoPriorityAlert[] }) {
  return (
    <div className="rounded-xl bg-gradient-to-b from-white/[0.03] to-white/[0.005] border border-white/8 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="text-rose-300/90">🔔</span>
          <div className="text-[11px] font-bold tracking-widest uppercase text-white">
            Alertas prioritários
          </div>
        </div>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-rose-500/15 border border-rose-400/25 text-rose-200 text-[10px] font-bold">
          {alerts.length} Novos
        </span>
      </div>
      <ul className="divide-y divide-white/5">
        {alerts.map((a) => (
          <li key={a.id} className="px-3 py-2.5 flex items-start gap-3">
            <div
              className={`w-1 self-stretch rounded-full ${
                a.severity === "critical"
                  ? "bg-rose-400"
                  : a.severity === "warning"
                    ? "bg-amber-400"
                    : "bg-sky-400"
              }`}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[12px] font-bold text-white truncate">
                  {a.title}
                </div>
                {a.badge ? (
                  <span className="shrink-0 text-[9px] font-bold text-rose-200 bg-rose-500/10 border border-rose-400/20 rounded px-1.5 py-0.5">
                    {a.badge}
                  </span>
                ) : null}
              </div>
              <div className="text-[11px] text-text-secondary mt-0.5">{a.subtitle}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TeamCard({ members }: { members: DemoTeamMember[] }) {
  return (
    <div className="rounded-xl bg-gradient-to-b from-white/[0.03] to-white/[0.005] border border-white/8 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Users size={14} className="text-primary/70" />
          <div className="text-[11px] font-bold tracking-widest uppercase text-white">
            Status da equipe
          </div>
        </div>
        <span className="text-[10px] font-semibold text-primary/80">Ver todos</span>
      </div>
      <ul className="divide-y divide-white/5">
        {members.map((m) => (
          <li key={m.id} className="px-3 py-2 flex items-center gap-2.5">
            <div className={`w-7 h-7 rounded-full border flex items-center justify-center text-[10px] font-bold ${avatarTone(m.tone)}`}>
              {m.initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-bold text-white truncate">{m.name}</div>
              <div className="text-[10px] text-text-secondary truncate">{m.role}</div>
            </div>
            <div className="text-[10px] font-bold text-emerald-300/90">{m.statusLabel}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function avatarTone(tone: DemoTeamMember["tone"]) {
  switch (tone) {
    case "teal":
      return "bg-teal-500/15 border-teal-400/25 text-teal-200";
    case "amber":
      return "bg-amber-500/15 border-amber-400/25 text-amber-200";
    case "violet":
      return "bg-violet-500/15 border-violet-400/25 text-violet-200";
    case "blue":
    default:
      return "bg-sky-500/15 border-sky-400/25 text-sky-200";
  }
}

function AreaProgressCard({ areas }: { areas: DemoAreaProgress[] }) {
  return (
    <div className="rounded-xl bg-gradient-to-b from-white/[0.03] to-white/[0.005] border border-white/8 p-3 sm:p-4">
      <div className="text-[10px] font-bold tracking-widest uppercase text-text-secondary/80 mb-3">
        Progresso por área
      </div>
      <div className="space-y-2.5">
        {areas.map((a) => {
          const pct =
            a.total > 0 ? Math.round((a.completed / a.total) * 100) : 0;
          return (
            <div key={a.id} className="flex items-center gap-3">
              <div className="w-32 sm:w-40 text-[12px] font-semibold text-white truncate">
                {a.name}
              </div>
              <div className="flex-1 h-2 rounded-full bg-white/[0.04] overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary/70 to-teal-400/60"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="w-20 text-right text-[11px] font-bold text-text-secondary tabular-nums">
                {a.completed}/{a.total} · {pct}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* =========================================================================
 * PASSO 5 — CTA Final
 * ========================================================================= */
function CtaContent() {
  return (
    <div className="flex flex-col items-center text-center gap-5 py-6 sm:py-10 max-w-md mx-auto">
      <div
        className="w-20 h-20 rounded-3xl flex items-center justify-center
                   bg-gradient-to-br from-success/25 to-success/[0.04]
                   border border-success/25 text-success/95
                   shadow-[0_18px_40px_-12px_rgba(34,197,94,0.22)]"
      >
        <Users size={42} />
      </div>
      <div className="space-y-2">
        <div className="text-[11px] font-bold tracking-[0.25em] uppercase text-success/90">
          Pronto para implementar
        </div>
        <p className="text-base sm:text-lg text-text-secondary leading-relaxed">
          Em poucos dias seu restaurante pode operar com checklists, evidências
          e dashboard como você viu aqui.
        </p>
      </div>
    </div>
  );
}

/* =========================================================================
 * Helpers visuais
 * ========================================================================= */

/**
 * Frame de celular leve — referência visual à landing sem GSAP/3D.
 * Mantém o feel mobile-first sem peso de animação.
 */
function DemoPhoneFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="relative rounded-[28px] overflow-hidden
                 bg-[#0a1418] border border-white/10
                 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.8)]"
    >
      {/* Status bar simulada */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2 text-[10px] font-bold text-text-secondary">
        <span className="tabular-nums">09:12</span>
        <div className="flex items-center gap-1">
          <span className="w-1 h-1 rounded-full bg-success" />
          <span>Cozinha · Manhã</span>
        </div>
      </div>

      {/* Header do app */}
      <div className="flex items-center justify-between px-4 pb-3 border-b border-white/5">
        <div>
          <div className="text-[10px] uppercase tracking-widest font-bold text-text-secondary">
            {subtitle}
          </div>
          <div className="text-sm font-bold text-white">{title}</div>
        </div>
        <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 text-primary/90 text-[11px] font-bold flex items-center justify-center">
          JS
        </div>
      </div>

      {children}
    </div>
  );
}
