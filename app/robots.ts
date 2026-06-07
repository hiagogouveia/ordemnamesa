import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/blog/",
          "/blog/*",
          "/modelos/",
          "/modelos/*",
          "/comparativos/",
          "/comparativos/*",
          "/execucao-operacional",
        ],
        disallow: [
          "/login",
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
          "/control-hub-admin/",
          "/conta-suspensa/",
          "/debug/",
        ],
      },
    ],
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
