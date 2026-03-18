import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/login", "/blog/", "/blog/*"],
        disallow: [
          "/dashboard/",
          "/checklists/",
          "/equipe/",
          "/relatorios/",
          "/configuracoes/",
          "/compras/",
          "/turno/",
          "/historico/",
          "/recebimento/",
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
