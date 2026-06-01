import type { ComponentType } from "react";
import type { FAQItem } from "@/lib/faq";
import ChecklistsDigitaisBody from "@/content/blog/checklists-digitais-para-restaurantes";
import HigieneCozinhaBody from "@/content/blog/higiene-na-cozinha-como-garantir";
import ControleTarefasBody from "@/content/blog/controle-de-tarefas-em-restaurantes";
import ChecklistVsExecucaoBody from "@/content/blog/software-de-checklist-vs-execucao-operacional";

export interface BlogPost {
  slug: string;
  /** Título exibido como H1 (pode ser longo/descritivo). */
  title: string;
  /** Título para o <title>/SERP quando o H1 é longo. Cai para `title` se ausente. */
  metaTitle?: string;
  description: string;
  publishedAt: string; // ISO date string
  updatedAt?: string; // ISO date string
  author: string;
  tags: string[];
  /** Agrupamento opcional (ex.: "Guia") — usado no índice/related em escala. */
  category?: string;
  /** Perguntas frequentes — fonte única do FAQPage schema e do acordeão visual. */
  faqs?: FAQItem[];
  /** Corpo do artigo como componente versionado em content/blog/<slug>.tsx */
  Body: ComponentType;
}

// Posts versionados em content/blog/*.tsx (corpo) + metadados aqui.
export const blogPosts: BlogPost[] = [
  {
    slug: "software-de-checklist-vs-execucao-operacional",
    title:
      "Software de checklist para restaurante vs plataforma de execução operacional: qual a diferença e qual você precisa?",
    metaTitle: "Software de Checklist para Restaurante vs Execução Operacional",
    description:
      "Qual a diferença entre um software de checklist para restaurante e uma plataforma de execução operacional? Entenda o que cada um resolve, as limitações e como escolher.",
    publishedAt: "2026-06-01",
    updatedAt: "2026-06-01",
    author: "Equipe Ordem na Mesa",
    category: "Guia",
    tags: ["software de checklist", "execução operacional", "guia"],
    faqs: [
      {
        q: "Qual a diferença entre software de checklist e execução operacional?",
        a: "Um software de checklist digitaliza e organiza listas de tarefas. Uma plataforma de execução operacional garante que essas tarefas sejam cumpridas no padrão, com responsável, ordem, evidência fotográfica e histórico auditável, por turno e unidade. O checklist é a ferramenta; a execução operacional é a categoria que a torna confiável.",
      },
      {
        q: "Checklist digital é a mesma coisa que execução operacional?",
        a: "Não. O checklist digital é uma parte da execução operacional. Ele resolve o 'o que fazer'; a execução operacional resolve o 'garantir que foi feito no padrão, com prova'.",
      },
      {
        q: "Quando um restaurante precisa de algo além de um checklist?",
        a: "Quando tem mais de um turno, equipe rotativa, mais de uma unidade, ou precisa comprovar execução e conformidade sanitária. Nesses cenários, marcar uma lista não basta.",
      },
      {
        q: "Checklist digital é a mesma coisa que auditoria operacional?",
        a: "Não. Auditoria é a conferência periódica do que foi feito; o checklist é a execução diária da rotina. A execução operacional une as duas: a equipe executa com evidência e a gestão audita pelo histórico.",
      },
      {
        q: "Um software de checklist serve para a vigilância sanitária (RDC 216)?",
        a: "Em parte. A RDC 216/2004 exige boas práticas e o registro delas. Um checklist simples registra a marcação; a comprovação confiável (com foto, data, hora e responsável) costuma exigir a camada de execução operacional.",
      },
      {
        q: "Preciso dos dois — checklist e execução operacional?",
        a: "Na prática, não são dois produtos: a plataforma de execução operacional já inclui o checklist. A pergunta certa é se você precisa apenas da lista ou também da garantia de execução.",
      },
      {
        q: "Execução operacional substitui o PDV?",
        a: "Não. O PDV cuida de pedidos e vendas; a execução operacional cuida das rotinas que sustentam a operação. São camadas complementares.",
      },
    ],
    Body: ChecklistVsExecucaoBody,
  },
  {
    slug: "checklists-digitais-para-restaurantes",
    title: "Por que checklists digitais transformam a operação do restaurante",
    description:
      "Entenda como substituir papéis e planilhas por checklists digitais reduz erros, aumenta a rastreabilidade e libera o gestor para o que importa.",
    publishedAt: "2025-01-10",
    updatedAt: "2026-06-01",
    author: "Equipe Ordem na Mesa",
    tags: ["execução operacional", "checklists", "restaurantes"],
    Body: ChecklistsDigitaisBody,
  },
  {
    slug: "higiene-na-cozinha-como-garantir",
    title: "Higiene na cozinha: como garantir padrões com tecnologia",
    description:
      "Protocolos de higiene são obrigação legal e diferencial competitivo. Veja como a tecnologia torna o monitoramento simples e auditável.",
    publishedAt: "2025-02-05",
    updatedAt: "2026-06-01",
    author: "Equipe Ordem na Mesa",
    tags: ["higiene", "vigilância sanitária", "operações"],
    Body: HigieneCozinhaBody,
  },
  {
    slug: "controle-de-tarefas-em-restaurantes",
    title: "Controle de tarefas em restaurantes: do papel ao digital",
    description:
      "Como uma gestão eficiente de tarefas operacionais reduz retrabalho, melhora a comunicação entre turnos e aumenta a satisfação da equipe.",
    publishedAt: "2025-03-01",
    updatedAt: "2026-06-01",
    author: "Equipe Ordem na Mesa",
    tags: ["tarefas", "produtividade", "gestão de equipe"],
    Body: ControleTarefasBody,
  },
];

export function getPostBySlug(slug: string): BlogPost | undefined {
  return blogPosts.find((post) => post.slug === slug);
}

export function getAllPosts(): BlogPost[] {
  return [...blogPosts].sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
}
