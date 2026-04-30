import type { ReactNode } from "react";
import { Camera, Check, Plus } from "../icons";
import { Reveal } from "../Reveal";

interface Step {
  n: string;
  title: string;
  text: string;
  visual: ReactNode;
}

const STEPS: Step[] = [
  {
    n: "01",
    title: "Crie suas rotinas",
    text: "Monte checklists por área (cozinha, salão, bar) e turno (abertura, fechamento). Use modelos prontos ou crie do zero em minutos.",
    visual: <EditorMockup />,
  },
  {
    n: "02",
    title: "Equipe executa pelo celular",
    text: "Cada funcionário abre o app no início do turno. Vê só o que é dele. Marca conforme conclui — sem precisar pensar.",
    visual: <ExecutionMockup />,
  },
  {
    n: "03",
    title: "Registra com foto",
    text: "Tarefas críticas exigem evidência fotográfica. A foto fica anexada ao registro — fim da discussão sobre o que foi feito.",
    visual: <PhotoMockup />,
  },
  {
    n: "04",
    title: "Você acompanha tudo",
    text: "Painel em tempo real: o que está em dia, em andamento, atrasado. Decida com dados, não com achismo.",
    visual: <DashboardMockup />,
  },
];

export function HowItWorks() {
  return (
    <section id="como-funciona" className="bg-background-dark py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="max-w-2xl mb-12 md:mb-16">
          <div className="text-xs font-mono uppercase tracking-widest text-primary mb-3">
            03 — Como Funciona
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-white">
            Quatro passos.{" "}
            <span className="italic font-light text-text-secondary">Zero burocracia.</span>
          </h2>
          <p className="mt-4 text-lg text-text-secondary">
            Do cadastro à execução em menos de uma hora. Sem instalação, sem treinamento longo.
          </p>
        </Reveal>

        <div className="space-y-16 md:space-y-24">
          {STEPS.map((step, i) => {
            const reversed = i % 2 === 1;
            return (
              <Reveal key={step.n}>
                <div
                  className={`grid lg:grid-cols-2 gap-8 md:gap-12 items-center ${
                    reversed ? "lg:grid-flow-dense" : ""
                  }`}
                >
                  <div className={reversed ? "lg:col-start-2" : ""}>
                    <div className="text-xs font-mono uppercase tracking-widest text-primary mb-3">
                      Passo {step.n}
                    </div>
                    <h3 className="text-2xl md:text-3xl font-black tracking-tight text-white mb-4">
                      {step.title}
                    </h3>
                    <p className="text-base md:text-lg text-text-secondary leading-relaxed">
                      {step.text}
                    </p>
                  </div>
                  <div className={reversed ? "lg:col-start-1" : ""}>{step.visual}</div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function MockupShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-surface-dark border border-border-dark shadow-2xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border-dark bg-surface-deep/50">
        <span className="w-2.5 h-2.5 rounded-full bg-border-dark" />
        <span className="w-2.5 h-2.5 rounded-full bg-border-dark" />
        <span className="w-2.5 h-2.5 rounded-full bg-border-dark" />
        <span className="ml-2 text-[11px] font-mono uppercase tracking-widest text-text-secondary">
          {title}
        </span>
      </div>
      <div className="p-4 md:p-5 space-y-2.5">{children}</div>
    </div>
  );
}

interface TaskTileProps {
  text: string;
  meta?: string;
  done?: boolean;
  warning?: boolean;
}

function TaskTile({ text, meta, done, warning }: TaskTileProps) {
  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-xl border bg-surface-deep/40 ${
        warning ? "border-l-4 border-l-yellow-500/80 border-border-dark" : "border-border-dark"
      }`}
    >
      <div
        className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${
          done ? "bg-success" : "border border-border-dark"
        }`}
      >
        {done && <Check size={12} />}
      </div>
      <div className={`flex-1 text-sm ${done ? "text-text-secondary line-through" : "text-white"}`}>
        {text}
      </div>
      {meta && (
        <span
          className={`text-[10px] font-mono uppercase tracking-widest ${
            warning ? "text-yellow-500" : "text-text-secondary"
          }`}
        >
          {meta}
        </span>
      )}
    </div>
  );
}

function EditorMockup() {
  return (
    <MockupShell title="Editor · Cozinha — Abertura">
      <TaskTile text="Limpar chapa do grill" meta="📷" />
      <TaskTile text="Conferir estoque de proteínas" meta="CRÍTICA" />
      <div className="flex items-center gap-3 p-3 rounded-xl border border-dashed border-border-dark">
        <div className="w-5 h-5 rounded-md border-2 border-dashed border-border-dark" />
        <div className="flex-1 text-sm text-text-secondary inline-flex items-center gap-2">
          <Plus size={14} /> Adicionar tarefa
        </div>
      </div>
    </MockupShell>
  );
}

function ExecutionMockup() {
  return (
    <MockupShell title="App · Juliana — Salão">
      <TaskTile text="Repor guardanapos nas mesas" meta="✓ 08:42" done />
      <TaskTile text="Conferir cardápios" meta="✓ 08:45" done />
      <TaskTile text="Acender luminárias" meta="—" />
    </MockupShell>
  );
}

function PhotoMockup() {
  return (
    <MockupShell title="Foto · Chapa do grill">
      <div className="relative aspect-[16/10] rounded-xl bg-gradient-to-br from-surface-dark to-surface-deep border border-border-dark flex flex-col items-center justify-center gap-2 overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, rgba(255,255,255,0.04) 0 4px, transparent 4px 12px)",
          }}
        />
        <div className="relative text-text-secondary">
          <Camera size={48} />
        </div>
        <div className="relative text-[10px] font-mono uppercase tracking-widest text-text-secondary">
          Evidência · 08:42 · Carlos
        </div>
      </div>
      <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-success/10 border border-success/20 text-sm text-success">
        <Check size={14} />
        Tarefa registrada com evidência
      </div>
    </MockupShell>
  );
}

function DashboardMockup() {
  return (
    <MockupShell title="Painel · Hoje · Restaurante Centro">
      <div className="grid grid-cols-3 gap-2.5">
        <Stat label="Conclusão" value="92%" tone="success" />
        <Stat label="Alertas" value="2" tone="warning" />
        <Stat label="Equipe" value="8" tone="default" />
      </div>
      <TaskTile text="Cozinha — Abertura" meta="12/12" done />
      <TaskTile text="Bar — Reposição" meta="4/6 · ATRASO" warning />
    </MockupShell>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "warning" | "default";
}) {
  const toneMap = {
    success: "text-success",
    warning: "text-yellow-500",
    default: "text-white",
  } as const;
  return (
    <div className="px-3 py-3 rounded-lg bg-surface-deep/60 border border-border-dark">
      <div className="text-[9px] font-mono uppercase tracking-widest text-text-secondary mb-1.5">
        {label}
      </div>
      <div className={`text-2xl font-black tracking-tight leading-none ${toneMap[tone]}`}>
        {value}
      </div>
    </div>
  );
}
