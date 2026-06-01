import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/login",
          "/blog/",
          "/blog/*",
          "/modelos/",
          "/modelos/*",
          "/comparativos/",
          "/comparativos/*",
          "/execucao-operacional",
        ],
        disallow: [
          "/dashboard/",
          "/checklists/",
          "/equipe/",
          "/relatorios/",
          "/configuracoes/",
          "/turno/",
          "/historico/",
          "/colaborador/",
          "/admin/",
          "/selecionar-restaurante/",
          "/api/",
        ],
      },
    ],
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
