import type { Metadata } from "next";
import Link from "next/link";
import {
  buildMetadata,
  siteConfig,
  breadcrumbJsonLd,
  faqPageJsonLd,
} from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import { getAllChecklists } from "@/lib/programmatic";

export const metadata: Metadata = buildMetadata({
  title: "Execução Operacional para Restaurantes: o que é e como funciona",
  description:
    "O que é execução operacional para restaurantes, por que é diferente de um PDV e quais rotinas (abertura, fechamento, higiene, recebimento) ela padroniza. O guia da categoria.",
  path: "/execucao-operacional",
});

const FAQS = [
  {
    q: "O que é execução operacional para restaurantes?",
    a: "É a disciplina de garantir que as rotinas do restaurante — abertura, fechamento, higiene, recebimento, troca de turno — sejam realmente executadas no padrão, todos os dias. Uma plataforma de execução operacional digitaliza esses checklists, exige evidência (foto), define responsáveis e mantém um histórico auditável.",
  },
  {
    q: "Qual a diferença entre execução operacional e um PDV?",
    a: "Um PDV (ponto de venda) cuida de pedidos, vendas e delivery — o dinheiro entrando. A execução operacional cuida de como a operação roda por trás da venda: as rotinas, a equipe e os padrões. São camadas complementares; o Ordem na Mesa é a de execução, não substitui o seu sistema de vendas.",
  },
  {
    q: "Que tipos de restaurante usam uma plataforma de execução operacional?",
    a: "Hamburguerias, pizzarias, cafeterias, bares, açaiterias, restaurantes self-service, dark kitchens e franquias de alimentação — qualquer operação com equipe que executa rotinas e precisa de padrão entre turnos e unidades.",
  },
  {
    q: "Por que evidência fotográfica e histórico auditável importam?",
    a: "Porque tornam a execução verificável. A foto acaba com o 'achismo' e muda o comportamento da equipe; o histórico com data, hora e responsável serve para a gestão e para comprovar conformidade à vigilância sanitária.",
  },
];

export default function ExecucaoOperacionalPage() {
  const checklists = getAllChecklists();

  return (
    <main className="mx-auto max-w-3xl px-4 py-24 sm:px-6 lg:px-8">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Início", path: "/" },
          { name: "Execução operacional", path: "/execucao-operacional" },
        ])}
      />
      <JsonLd data={faqPageJsonLd(FAQS)} />

      <article>
        <header className="mb-12">
          <p className="text-xs font-mono uppercase tracking-widest text-primary mb-3">
            Guia da categoria
          </p>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-slate-900 dark:text-white mb-5">
            O que é execução operacional para restaurantes?
          </h1>
          <p className="text-lg text-slate-700 dark:text-[#c5d6e6] leading-relaxed">
            Execução operacional é o que garante que as rotinas do seu
            restaurante sejam <strong>executadas</strong> — não apenas
            planejadas. O Ordem na Mesa é a plataforma que transforma abertura,
            fechamento, higiene, recebimento e troca de turno em checklists
            digitais com evidência fotográfica, responsável e histórico
            auditável. Sua operação rodando no padrão, todos os dias, sem falhas.
          </p>
        </header>

        <section className="mb-12">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
            Execução operacional não é PDV
          </h2>
          <p className="text-slate-700 dark:text-[#c5d6e6] leading-relaxed">
            Vale deixar claro: o Ordem na Mesa <strong>não é um PDV</strong>, não
            gerencia pedidos e não controla vendas. Um PDV cuida do dinheiro
            entrando. A execução operacional cuida de como a operação roda por
            trás da venda. São camadas diferentes e complementares — e a de
            execução é justamente a que costuma faltar.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
            Os quatro pilares da execução operacional
          </h2>
          <div className="space-y-4">
            {[
              {
                t: "Checklists digitais",
                d: "Rotinas de abertura, fechamento, higiene e recebimento que a equipe executa pelo celular, na ordem certa.",
              },
              {
                t: "Evidência fotográfica",
                d: "Tarefas críticas exigem foto. O que é registrado com foto é feito com cuidado — acaba o 'achismo'.",
              },
              {
                t: "Histórico auditável",
                d: "Cada execução fica gravada com data, hora e responsável. Prova para a gestão e para a vigilância sanitária.",
              },
              {
                t: "Gestão por turnos e unidades",
                d: "Acompanhamento em tempo real, por turno e por unidade. Padrão consistente mesmo sem o dono presente.",
              },
            ].map((p) => (
              <div
                key={p.t}
                className="rounded-xl border border-slate-200 dark:border-[#233f48] p-5"
              >
                <h3 className="font-bold text-slate-900 dark:text-white">
                  {p.t}
                </h3>
                <p className="mt-1 text-slate-700 dark:text-[#c5d6e6]">{p.d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
            Comece pelos checklists essenciais
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {checklists.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/modelos/${c.slug}`}
                  className="text-primary hover:underline"
                >
                  {c.h1}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
            Perguntas frequentes
          </h2>
          <div className="space-y-3">
            {FAQS.map((f) => (
              <details
                key={f.q}
                className="rounded-xl border border-slate-200 dark:border-[#233f48] p-4"
              >
                <summary className="font-bold text-slate-900 dark:text-white cursor-pointer">
                  {f.q}
                </summary>
                <p className="mt-2 text-slate-700 dark:text-[#c5d6e6] leading-relaxed">
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center">
          <p className="text-lg font-bold text-slate-900 dark:text-white">
            Pronto para colocar sua operação no padrão?
          </p>
          <p className="mt-2 text-slate-600 dark:text-[#93adc8]">
            Conheça a {siteConfig.category.toLowerCase()} na prática.
          </p>
          <Link
            href="/qualificacao"
            className="mt-4 inline-block rounded-full bg-primary px-6 py-3 font-bold text-white transition-opacity hover:opacity-90"
          >
            Agendar demonstração
          </Link>
        </section>
      </article>
    </main>
  );
}
