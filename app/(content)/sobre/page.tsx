import type { Metadata } from "next";
import Link from "next/link";
import { buildMetadata, siteConfig, breadcrumbJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import { Instagram, WhatsApp } from "@/components/landing/icons";

export const metadata: Metadata = buildMetadata({
  title:
    "Sobre o Ordem na Mesa — Software de Execução Operacional para Restaurantes",
  description:
    "O Ordem na Mesa é um software de execução operacional para restaurantes: checklists digitais com foto, abertura, fechamento, higiene e recebimento. Conheça a empresa, a missão e como falar com a gente.",
  path: "/sobre",
});

// AboutPage referenciando a Organization via @id — reforça a entidade de marca
// na própria página institucional.
const aboutPageJsonLd = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  name: "Sobre o Ordem na Mesa",
  url: `${siteConfig.url}/sobre`,
  inLanguage: "pt-BR",
  mainEntity: { "@id": `${siteConfig.url}/#organization` },
};

const PRINCIPIOS = [
  {
    t: "Execução acima de intenção",
    d: "Plano bonito no papel não sustenta restaurante. O que importa é a rotina cumprida no padrão, todos os dias — com responsável, ordem e prova.",
  },
  {
    t: "Evidência, não 'achismo'",
    d: "Cada tarefa crítica vira foto com data, hora e responsável. A gestão decide com base no que aconteceu de fato, não no que alguém disse que fez.",
  },
  {
    t: "Simples para a equipe",
    d: "Quem está no chão do turno executa pelo celular, sem treinamento longo. Se for difícil de usar, não é usado — e rotina não usada não protege a operação.",
  },
  {
    t: "Padrão que escala",
    d: "O mesmo padrão em todos os turnos e unidades é o que permite crescer sem que a qualidade dependa da presença do dono.",
  },
];

export default function SobrePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-24 sm:px-6 lg:px-8">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Início", path: "/" },
          { name: "Sobre", path: "/sobre" },
        ])}
      />
      <JsonLd data={aboutPageJsonLd} />

      <nav className="mb-8 text-sm text-slate-500 dark:text-[#93adc8]">
        <Link href="/" className="hover:text-primary">
          Início
        </Link>
        <span className="mx-2">/</span>
        <span>Sobre</span>
      </nav>

      <article className="text-slate-700 dark:text-[#c5d6e6] leading-relaxed">
        <header className="mb-10">
          <p className="text-xs font-mono uppercase tracking-widest text-primary mb-3">
            Quem somos
          </p>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-slate-900 dark:text-white mb-5">
            Sobre o Ordem na Mesa
          </h1>
          <p className="text-lg rounded-2xl border border-primary/30 bg-primary/5 p-5 text-slate-800 dark:text-[#dce8f3]">
            <strong>
              O Ordem na Mesa é uma plataforma de execução operacional para
              restaurantes — um software que transforma as rotinas do dia a dia
              em checklists digitais executáveis, com evidência fotográfica,
              ordem das tarefas e histórico auditável.
            </strong>{" "}
            Ajudamos donos e gerentes a garantir que a operação rode no padrão
            todos os dias, sem depender da memória da equipe nem da presença
            constante do dono.
          </p>
          <p className="mt-5 text-xs text-slate-500 dark:text-[#7e98ac]">
            Equipe Ordem na Mesa · Brasil
          </p>
        </header>

        <section className="mb-12">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
            Por que existimos
          </h2>
          <p className="mb-4">
            Restaurante quase nunca quebra na venda — quebra na execução: a
            tarefa que ninguém lembrou de fazer, a câmara fria fora da
            temperatura, o pão que faltou no pico, o padrão de limpeza que cai
            quando o dono não está. Vender é a parte visível; sustentar a
            operação por trás da venda é o que separa o restaurante que cresce
            do que vive apagando incêndio.
          </p>
          <p>
            Criamos o {siteConfig.name} para fechar exatamente esse vazio: a
            camada que costuma ficar sem dono — a execução das rotinas que
            sustentam a operação. Não substituímos o PDV nem o ERP; cuidamos de
            como a operação roda no chão do turno. Para entender a categoria a
            fundo, veja o nosso guia de{" "}
            <Link
              href="/execucao-operacional"
              className="text-primary hover:underline"
            >
              execução operacional para restaurantes
            </Link>
            .
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
            O que acreditamos
          </h2>
          <div className="space-y-4">
            {PRINCIPIOS.map((p) => (
              <div key={p.t}>
                <h3 className="font-bold text-slate-900 dark:text-white">
                  {p.t}
                </h3>
                <p className="mt-1">{p.d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
            Para quem é
          </h2>
          <p>
            Hamburguerias, pizzarias, cafeterias, bares, açaiterias,
            restaurantes self-service, dark kitchens e franquias — qualquer
            operação com equipe que executa rotinas e precisa de padrão entre
            turnos e unidades. Conheça os{" "}
            <Link href="/modelos" className="text-primary hover:underline">
              modelos de checklist prontos
            </Link>{" "}
            ou compare o {siteConfig.name} com os{" "}
            <Link href="/comparativos" className="text-primary hover:underline">
              métodos antigos
            </Link>
            .
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
            Fale com a gente
          </h2>
          <p className="mb-4">
            Quer entender se o {siteConfig.name} se encaixa na rotina do seu
            restaurante? Estamos no WhatsApp e no Instagram.
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              href={siteConfig.whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 dark:border-[#233f48] px-5 py-2.5 font-medium text-slate-900 dark:text-white transition-colors hover:border-primary/40"
            >
              <WhatsApp size={16} /> WhatsApp
            </a>
            <a
              href={siteConfig.instagram}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 dark:border-[#233f48] px-5 py-2.5 font-medium text-slate-900 dark:text-white transition-colors hover:border-primary/40"
            >
              <Instagram size={16} /> @ordemnamesabr
            </a>
          </div>
        </section>

        <section className="rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center">
          <p className="text-lg font-bold text-slate-900 dark:text-white">
            Pronto para colocar sua operação no padrão?
          </p>
          <p className="mt-2 text-slate-600 dark:text-[#93adc8]">
            Conheça o {siteConfig.name} na prática.
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
