import type { Metadata } from "next";

// Domínio de produção. Usa NEXT_PUBLIC_SITE_URL quando definido (ex.: nonprod),
// com fallback para o domínio verificado de produção.
// IMPORTANTE: o valor anterior ("ordennaMesa.com.br") era um typo que envenenava
// canonicals, sitemap, robots e Open Graph. O domínio correto é ordemnamesa.com.br.
const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL?.startsWith("http")
    ? process.env.NEXT_PUBLIC_SITE_URL
    : "https://ordemnamesa.com.br"
).replace(/\/$/, "");

export const siteConfig = {
  name: "Ordem na Mesa",
  url: SITE_URL,
  // Categoria-âncora — usar de forma consistente em metadata, schema, H1/H2 e conteúdo.
  category: "Plataforma de Execução Operacional para Restaurantes",
  description:
    "Plataforma de execução operacional para restaurantes. Checklists digitais com evidência fotográfica, abertura, fechamento, auditoria e recebimento — para a operação rodar no padrão todos os dias.",
  locale: "pt_BR",
  brandColor: "#13b6ec",
  whatsapp: "https://wa.me/5567991364767",
  instagram: "https://www.instagram.com/ordemnamesabr/",
} as const;

export function buildMetadata({
  title,
  description,
  path = "/",
  noindex = false,
  image,
}: {
  title?: string;
  description?: string;
  path?: string;
  noindex?: boolean;
  image?: string;
}): Metadata {
  const url = `${siteConfig.url}${path}`;
  const ogImage = image ?? `/opengraph-image`;
  const resolvedDescription = description ?? siteConfig.description;

  return {
    title: title
      ? { default: title, template: `%s | ${siteConfig.name}` }
      : siteConfig.name,
    description: resolvedDescription,
    metadataBase: new URL(siteConfig.url),
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: title ?? siteConfig.name,
      description: resolvedDescription,
      url,
      siteName: siteConfig.name,
      locale: siteConfig.locale,
      type: "website",
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: title ?? siteConfig.name,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: title ?? siteConfig.name,
      description: resolvedDescription,
      images: [ogImage],
    },
    robots: noindex
      ? {
          index: false,
          follow: false,
          googleBot: { index: false, follow: false },
        }
      : {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            "max-video-preview": -1,
            "max-image-preview": "large",
            "max-snippet": -1,
          },
        },
  };
}

// ---------------------------------------------------------------------------
// JSON-LD helpers reutilizáveis (schema.org) — usados em páginas e templates.
// Renderizar com <JsonLd data={...} /> (components/seo/JsonLd.tsx).
// ---------------------------------------------------------------------------

type Faq = { q: string; a: string };

/** FAQPage — usar em qualquer página com seção de perguntas frequentes. */
export function faqPageJsonLd(items: Faq[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}

/** BreadcrumbList — melhora navegação e rich results. */
export function breadcrumbJsonLd(crumbs: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      item: `${siteConfig.url}${crumb.path}`,
    })),
  };
}

/** HowTo — ideal para páginas de checklist (passo a passo executável). */
export function howToJsonLd(opts: {
  name: string;
  description: string;
  steps: { name: string; text: string }[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: opts.name,
    description: opts.description,
    step: opts.steps.map((step, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: step.name,
      text: step.text,
    })),
  };
}

/**
 * SoftwareApplication — entidade central do produto para SEO/GEO.
 * NÃO inclui Review/AggregateRating: não há avaliações reais ainda (G2/Capterra/
 * GetApp). Schema de avaliação só deve ser adicionado quando houver reviews
 * legítimas e verificáveis — caso contrário viola a política de structured data.
 */
export function softwareApplicationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: siteConfig.name,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: siteConfig.category,
    operatingSystem: "Web, iOS, Android",
    url: siteConfig.url,
    description: siteConfig.description,
    inLanguage: "pt-BR",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "BRL",
      description: "Teste grátis de 30 dias após aprovação",
    },
  };
}

/** Organization — entidade de marca para o Knowledge Graph e GEO. */
export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    // @id estável: permite que WebSite/AboutPage referenciem a mesma entidade,
    // formando um grafo coeso em vez de schemas soltos.
    "@id": `${siteConfig.url}/#organization`,
    name: siteConfig.name,
    // Reforça para o Google que estas variações são a mesma marca — ajuda a
    // desambiguar de "ordem na mesa" como expressão comum em português.
    alternateName: ["OrdemNaMesa", "Ordem na Mesa Software"],
    url: siteConfig.url,
    logo: {
      "@type": "ImageObject",
      url: `${siteConfig.url}/logo-ordem-na-mes.png`,
    },
    description: siteConfig.description,
    slogan: "Seu restaurante rodando no padrão. Todos os dias. Sem falhas.",
    areaServed: { "@type": "Country", name: "Brasil" },
    knowsAbout: [
      "execução operacional para restaurantes",
      "checklist operacional para restaurantes",
      "rotinas de abertura e fechamento",
      "auditoria operacional",
      "padronização operacional",
      "recebimento de mercadorias",
    ],
    sameAs: [siteConfig.instagram],
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      availableLanguage: "Portuguese",
      url: siteConfig.whatsapp,
    },
  };
}

/**
 * WebSite — sinal canônico que amarra o domínio ao NOME da marca.
 * É o schema central para o Google consolidar "Ordem na Mesa" como entidade
 * (e não como expressão comum) e habilitar sitelinks. Publisher referencia a
 * Organization via @id, formando um grafo de entidade coeso.
 * NÃO incluímos potentialAction/SearchAction porque o site não tem busca interna.
 */
export function webSiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${siteConfig.url}/#website`,
    name: siteConfig.name,
    alternateName: ["OrdemNaMesa", "Ordem na Mesa Software"],
    url: siteConfig.url,
    inLanguage: "pt-BR",
    description: siteConfig.description,
    publisher: { "@id": `${siteConfig.url}/#organization` },
  };
}
