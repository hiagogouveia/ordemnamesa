import type { ComponentType } from "react";
import type { FAQItem } from "@/lib/faq";
import ChecklistsDigitaisBody from "@/content/blog/checklists-digitais-para-restaurantes";
import HigieneCozinhaBody from "@/content/blog/higiene-na-cozinha-como-garantir";
import ControleTarefasBody from "@/content/blog/controle-de-tarefas-em-restaurantes";
import ChecklistVsExecucaoBody from "@/content/blog/software-de-checklist-vs-execucao-operacional";
import QuantoCustaBody from "@/content/blog/quanto-custa-software-checklist-restaurante";

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
    slug: "quanto-custa-software-checklist-restaurante",
    title: "Quanto custa um software de checklist para restaurante?",
    metaTitle: "Quanto Custa um Software de Checklist para Restaurante?",
    description:
      "Quanto custa um software de checklist para restaurante? Veja preços públicos vs sob consulta, modelos de cobrança, custos ocultos e como estimar o custo da sua operação.",
    publishedAt: "2026-06-01",
    updatedAt: "2026-06-01",
    author: "Equipe Ordem na Mesa",
    category: "Guia",
    tags: ["software de checklist", "preço", "guia"],
    faqs: [
      {
        q: "Quanto custa um software de checklist para restaurante?",
        a: "Depende do modelo de cobrança. Há opção pública a partir de cerca de R$ 99/mês por loja (ex.: Checkbits); a maioria trabalha sob consulta, com valor definido por unidades, usuários e recursos.",
      },
      {
        q: "Existe software de checklist com preço público?",
        a: "Sim. Em junho de 2026, o Checkbits divulga preço aberto, por loja (CNPJ). A maioria dos demais (Koncluí, Sults, Food Sistemas, Checklist Fácil) trabalha sob consulta.",
      },
      {
        q: "Por que tantos sistemas não mostram o preço?",
        a: "Porque o escopo varia muito entre uma operação de uma unidade e uma rede de franquias. O fornecedor avalia porte, número de unidades e recursos antes de propor um valor.",
      },
      {
        q: "O preço é por usuário ou por loja?",
        a: "Varia por fornecedor. Alguns cobram por loja (CNPJ) com usuários inclusos; outros por usuário; redes costumam ter modelo por unidade ou enterprise. Confirme sempre qual modelo se aplica.",
      },
      {
        q: "Há custos além da mensalidade?",
        a: "Pode haver: implantação, treinamento, limites de usuários/checklists, armazenamento de fotos e fidelidade. Pergunte antes de fechar.",
      },
      {
        q: "Existe teste grátis?",
        a: "Vários oferecem. Os prazos variam por fornecedor (por exemplo, 7, 14 ou 30 dias). Confirme a duração e o que está liberado no teste.",
      },
      {
        q: "Quanto custa o Ordem na Mesa?",
        a: "A proposta é sob medida, conforme unidades, equipe e recursos, com 30 dias grátis para testar. Você pode pedir um valor para o seu cenário específico.",
      },
    ],
    Body: QuantoCustaBody,
  },
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

/**
 * Curadoria fixa por slug — usada onde queremos destaque estratégico
 * (ex.: "Leitura recomendada" na pílula). Preserva a ordem informada e
 * descarta slugs inexistentes.
 */
export function getPostsBySlugs(slugs: string[]): BlogPost[] {
  return slugs
    .map((slug) => getPostBySlug(slug))
    .filter((post): post is BlogPost => post !== undefined);
}

/**
 * Posts relacionados — seleção genérica por afinidade, sem lógica por slug.
 * Pontua por categoria em comum (peso 3) + tags em comum (peso 1) e ordena
 * por score e, em empate, por data. Completa com os mais recentes (fallback)
 * para nunca devolver menos que `limit` quando houver outros posts.
 */
export function getRelatedPosts(slug: string, limit = 3): BlogPost[] {
  const current = getPostBySlug(slug);
  if (!current) return [];

  const sharedTagCount = (a: string[], b: string[]): number =>
    a.filter((tag) => b.includes(tag)).length;

  const scored = blogPosts
    .filter((post) => post.slug !== slug)
    .map((post) => ({
      post,
      score:
        (post.category && current.category && post.category === current.category
          ? 3
          : 0) + sharedTagCount(post.tags, current.tags),
    }))
    .sort((a, b) =>
      b.score !== a.score
        ? b.score - a.score
        : new Date(b.post.publishedAt).getTime() -
          new Date(a.post.publishedAt).getTime()
    );

  const related = scored.filter((s) => s.score > 0).map((s) => s.post);
  if (related.length >= limit) return related.slice(0, limit);

  // Fallback: completa com os mais recentes ainda não incluídos.
  const chosen = new Set(related.map((post) => post.slug));
  const fillers = getAllPosts().filter(
    (post) => post.slug !== slug && !chosen.has(post.slug)
  );
  return [...related, ...fillers].slice(0, limit);
}
