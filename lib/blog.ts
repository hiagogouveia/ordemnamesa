import type { ComponentType } from "react";
import ChecklistsDigitaisBody from "@/content/blog/checklists-digitais-para-restaurantes";
import HigieneCozinhaBody from "@/content/blog/higiene-na-cozinha-como-garantir";
import ControleTarefasBody from "@/content/blog/controle-de-tarefas-em-restaurantes";

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  publishedAt: string; // ISO date string
  updatedAt?: string; // ISO date string
  author: string;
  tags: string[];
  /** Corpo do artigo como componente versionado em content/blog/<slug>.tsx */
  Body: ComponentType;
}

// Posts versionados em content/blog/*.tsx (corpo) + metadados aqui.
export const blogPosts: BlogPost[] = [
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
