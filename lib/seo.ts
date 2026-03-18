import type { Metadata } from "next";

export const siteConfig = {
  name: "Ordem na Mesa",
  url: "https://ordennaMesa.com.br",
  description:
    "Sistema de checklists para restaurantes. Controle operacional digital: abertura, fechamento, auditorias e checklists em tempo real.",
  locale: "pt_BR",
  brandColor: "#13b6ec",
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
