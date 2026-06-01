import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { Instagram, WhatsApp } from "@/components/landing/icons";

const WHATSAPP_URL = "https://wa.me/5567991364767";
const INSTAGRAM_URL = "https://www.instagram.com/ordemnamesabr/";

// Âncoras cross-page (/#...) para funcionarem em qualquer página pública.
const PRODUCT_LINKS = [
  { href: "/#problema", label: "Problema" },
  { href: "/#solucao", label: "Solução" },
  { href: "/#como-funciona", label: "Como funciona" },
  { href: "/#beneficios", label: "Benefícios" },
  { href: "/#faq", label: "FAQ" },
];

// Páginas de conteúdo (SEO/GEO) — links visíveis para evitar páginas órfãs.
const RESOURCE_LINKS = [
  { href: "/execucao-operacional", label: "Execução operacional" },
  { href: "/modelos", label: "Modelos de checklist" },
  { href: "/comparativos", label: "Comparativos" },
  { href: "/blog", label: "Blog" },
];

export function SiteFooter() {
  return (
    <footer className="bg-surface-deep border-t border-border-dark pt-16 pb-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-10 md:gap-12 mb-12">
          <div className="sm:col-span-2 lg:col-span-1 md:max-w-sm">
            <div className="flex items-center gap-3 mb-4">
              <Logo width={32} height={32} />
              <span className="text-lg font-black tracking-tight text-white">
                Ordem <span className="italic font-light text-text-secondary">na Mesa</span>
              </span>
            </div>
            <p className="text-sm text-text-secondary leading-relaxed">
              Sistema operacional para restaurantes que querem rodar no padrão — todos os dias, sem
              falhas.
            </p>
          </div>

          <div>
            <div className="text-xs font-mono uppercase tracking-widest text-primary mb-4">
              Produto
            </div>
            <ul className="space-y-2.5">
              {PRODUCT_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-sm text-text-secondary hover:text-white transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
              <li>
                <Link
                  href="/login"
                  className="text-sm text-text-secondary hover:text-white transition-colors"
                >
                  Entrar
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <div className="text-xs font-mono uppercase tracking-widest text-primary mb-4">
              Recursos
            </div>
            <ul className="space-y-2.5">
              {RESOURCE_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-text-secondary hover:text-white transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="text-xs font-mono uppercase tracking-widest text-primary mb-4">
              Contato
            </div>
            <ul className="space-y-2.5">
              <li>
                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-white transition-colors"
                >
                  <WhatsApp size={14} /> WhatsApp
                </a>
              </li>
              <li>
                <a
                  href={INSTAGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-white transition-colors"
                >
                  <Instagram size={14} /> @ordemnamesabr
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between gap-3 pt-8 border-t border-border-dark text-xs font-mono uppercase tracking-widest text-text-secondary">
          <div>© 2026 Ordem na Mesa</div>
          <div>Operação no padrão · Todos os dias</div>
        </div>
      </div>
    </footer>
  );
}
