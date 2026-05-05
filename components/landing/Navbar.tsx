"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { Menu, X } from "./icons";

const SIGNUP_CTA_URL = "/qualificacao";

const NAV_LINKS = [
  { href: "#problema", label: "Problema" },
  { href: "#solucao", label: "Solução" },
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#depoimentos", label: "Depoimentos" },
  { href: "#faq", label: "FAQ" },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <nav
      className={`fixed top-0 z-50 w-full transition-all duration-300 ${
        scrolled
          ? "bg-background-dark/90 backdrop-blur-md border-b border-border-dark"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 md:h-20 items-center justify-between gap-4">
          <Link href="#top" className="flex items-center gap-3 shrink-0">
            <Logo width={32} height={32} />
            <span className="text-lg md:text-xl font-black tracking-tight text-white hidden sm:block">
              Ordem <span className="italic font-light text-text-secondary">na Mesa</span>
            </span>
          </Link>

          <div className="hidden lg:flex items-center gap-8">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-semibold text-text-secondary hover:text-white transition-colors"
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/login"
              className="inline-flex items-center justify-center px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg
                         border border-primary/40 text-primary
                         hover:bg-primary/10 hover:border-primary hover:text-white
                         transition-colors duration-200
                         text-sm font-semibold"
            >
              Entrar
            </Link>

            <Link
              href={SIGNUP_CTA_URL}
              className="hidden sm:inline-flex items-center gap-2 px-4 lg:px-5 py-2 lg:py-2.5 rounded-lg
                         bg-success text-white font-semibold text-sm
                         hover:bg-success/90 transition-colors duration-200
                         shadow-lg shadow-success/20"
            >
              Faça seu cadastro agora
            </Link>

            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="lg:hidden p-2 rounded-lg text-white hover:bg-surface-dark transition-colors"
              aria-label={open ? "Fechar menu" : "Abrir menu"}
              aria-expanded={open}
            >
              {open ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
      </div>

      {open && (
        <div className="lg:hidden border-t border-border-dark bg-background-dark/95 backdrop-blur-md">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4 flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="px-3 py-3 rounded-lg text-base font-semibold text-text-secondary hover:text-white hover:bg-surface-dark transition-colors"
              >
                {link.label}
              </a>
            ))}
            <Link
              href={SIGNUP_CTA_URL}
              onClick={() => setOpen(false)}
              className="mt-2 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-success text-white font-semibold text-base shadow-lg shadow-success/20"
            >
              Faça seu cadastro agora
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
