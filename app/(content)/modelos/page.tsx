import type { Metadata } from "next";
import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { getAllChecklists } from "@/lib/programmatic";

export const metadata: Metadata = buildMetadata({
  title: "Modelos de Checklist para Restaurantes",
  description:
    "Modelos prontos de checklist operacional para restaurantes: abertura, fechamento, recebimento, estoque, limpeza e troca de turno. Copie e digitalize no Ordem na Mesa.",
  path: "/modelos",
});

export default function ModelosIndexPage() {
  const pages = getAllChecklists();

  return (
    <main className="mx-auto max-w-4xl px-4 py-24 sm:px-6 lg:px-8">
      <h1 className="text-4xl font-black text-slate-900 dark:text-white mb-4">
        Modelos de checklist para restaurantes
      </h1>
      <p className="text-lg text-slate-600 dark:text-[#93adc8] mb-12 max-w-2xl">
        Modelos prontos e completos de checklist operacional — abertura,
        fechamento, recebimento, estoque, limpeza e troca de turno. Copie,
        adapte e digitalize na plataforma de execução operacional para
        restaurantes.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {pages.map((page) => (
          <Link
            key={page.slug}
            href={`/modelos/${page.slug}`}
            className="block border border-slate-200 dark:border-[#233f48] rounded-xl p-5 hover:border-primary/40 transition-colors"
          >
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {page.h1}
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-[#93adc8] line-clamp-2">
              {page.metaDescription}
            </p>
          </Link>
        ))}
      </div>
    </main>
  );
}
