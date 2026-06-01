import type { ReactNode } from "react";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";

/**
 * Layout do grupo de conteúdo público (blog, modelos, comparativos,
 * execução operacional). Aplica o chrome global da marca — header + footer —
 * para que as páginas de conteúdo pareçam parte do mesmo produto.
 * Route group "(content)" NÃO altera as URLs públicas.
 */
export default function ContentLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader variant="solid" />
      {/* espaço para o header fixo (h-16 md:h-20) */}
      <div className="pt-16 md:pt-20">{children}</div>
      <SiteFooter />
    </>
  );
}
