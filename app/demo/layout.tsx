import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * Layout isolado da demonstração visual.
 *
 * - NÃO importa SessionProvider
 * - NÃO importa Supabase
 * - NÃO importa stores do app (Zustand)
 * - NÃO faz queries
 *
 * O root layout (`app/layout.tsx`) já fornece <html>, <body>, fonte e
 * QueryProvider. Este layout é um simples wrapper visual que apenas
 * delimita o módulo /demo e injeta metadata de não-indexação.
 */
export const metadata: Metadata = {
  title: "Demonstração",
  description:
    "Demonstração guiada do Ordem na Mesa — veja a operação de um restaurante funcionando em checklists, evidências e dashboard.",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default function DemoLayout({ children }: { children: ReactNode }) {
  return (
    <div
      data-demo-root="true"
      className="min-h-screen w-full bg-background-dark text-white"
    >
      {children}
    </div>
  );
}
