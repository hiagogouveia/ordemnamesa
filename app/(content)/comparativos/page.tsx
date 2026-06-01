import type { Metadata } from "next";
import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { getAllComparisons } from "@/lib/comparisons";

export const metadata: Metadata = buildMetadata({
  title: "Comparativos: Ordem na Mesa vs métodos antigos",
  description:
    "Compare o Ordem na Mesa com planilhas, checklist em papel, WhatsApp e Google Forms. Entenda por que a execução operacional digital vence o improviso.",
  path: "/comparativos",
});

export default function ComparativosIndexPage() {
  const pages = getAllComparisons();

  return (
    <main className="mx-auto max-w-4xl px-4 py-24 sm:px-6 lg:px-8">
      <h1 className="text-4xl font-black text-slate-900 dark:text-white mb-4">
        Comparativos
      </h1>
      <p className="text-lg text-slate-600 dark:text-[#93adc8] mb-12 max-w-2xl">
        Como a plataforma de execução operacional Ordem na Mesa se compara aos
        métodos que os restaurantes ainda usam para controlar rotinas.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {pages.map((page) => (
          <Link
            key={page.slug}
            href={`/comparativos/${page.slug}`}
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
