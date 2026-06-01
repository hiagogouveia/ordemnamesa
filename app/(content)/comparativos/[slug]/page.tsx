import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  buildMetadata,
  siteConfig,
  breadcrumbJsonLd,
  faqPageJsonLd,
} from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import {
  getAllComparisons,
  getComparisonBySlug,
} from "@/lib/comparisons";

interface Props {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return getAllComparisons().map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = getComparisonBySlug(slug);
  if (!page) return {};
  return buildMetadata({
    title: page.metaTitle,
    description: page.metaDescription,
    path: `/comparativos/${page.slug}`,
  });
}

export default async function ComparisonPage({ params }: Props) {
  const { slug } = await params;
  const page = getComparisonBySlug(slug);
  if (!page) notFound();

  return (
    <main className="mx-auto max-w-3xl px-4 py-24 sm:px-6 lg:px-8">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Início", path: "/" },
          { name: "Comparativos", path: "/comparativos" },
          { name: page.h1, path: `/comparativos/${page.slug}` },
        ])}
      />
      <JsonLd data={faqPageJsonLd(page.faqs)} />

      <nav className="mb-8 text-sm text-slate-500 dark:text-[#93adc8]">
        <Link href="/" className="hover:text-primary">Início</Link>
        <span className="mx-2">/</span>
        <Link href="/comparativos" className="hover:text-primary">Comparativos</Link>
      </nav>

      <article>
        <header className="mb-10">
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white mb-5">
            {page.h1}
          </h1>
          <p className="text-lg text-slate-700 dark:text-[#c5d6e6] leading-relaxed">
            {page.intro}
          </p>
        </header>

        <section className="mb-10">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
            As dores de usar {page.alternative}
          </h2>
          <ul className="space-y-2">
            {page.painPoints.map((p) => (
              <li
                key={p}
                className="flex gap-3 text-slate-700 dark:text-[#c5d6e6]"
              >
                <span aria-hidden className="text-red-400">✕</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
            {page.alternative} vs Ordem na Mesa
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-300 dark:border-[#233f48]">
                  <th className="py-3 pr-4 font-bold text-slate-900 dark:text-white">
                    Aspecto
                  </th>
                  <th className="py-3 pr-4 font-bold text-slate-600 dark:text-[#93adc8] capitalize">
                    {page.alternative}
                  </th>
                  <th className="py-3 font-bold text-primary">Ordem na Mesa</th>
                </tr>
              </thead>
              <tbody>
                {page.rows.map((row) => (
                  <tr
                    key={row.aspect}
                    className="border-b border-slate-200 dark:border-[#1b3038]"
                  >
                    <td className="py-3 pr-4 font-medium text-slate-900 dark:text-white">
                      {row.aspect}
                    </td>
                    <td className="py-3 pr-4 text-slate-600 dark:text-[#93adc8]">
                      {row.alternative}
                    </td>
                    <td className="py-3 text-slate-800 dark:text-[#c5d6e6]">
                      {row.ordemNaMesa}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
            Veredito
          </h2>
          <p className="text-slate-700 dark:text-[#c5d6e6] leading-relaxed">
            {page.verdict}
          </p>
        </section>

        <section className="mb-10 rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center">
          <p className="text-lg font-bold text-slate-900 dark:text-white">
            Pronto para trocar {page.alternative} por execução de verdade?
          </p>
          <p className="mt-2 text-slate-600 dark:text-[#93adc8]">
            O Ordem na Mesa é a {siteConfig.category.toLowerCase()}.
          </p>
          <Link
            href="/qualificacao"
            className="mt-4 inline-block rounded-full bg-primary px-6 py-3 font-bold text-white transition-opacity hover:opacity-90"
          >
            Agendar demonstração
          </Link>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
            Perguntas frequentes
          </h2>
          <div className="space-y-3">
            {page.faqs.map((f) => (
              <details
                key={f.q}
                className="rounded-xl border border-slate-200 dark:border-[#233f48] p-4"
              >
                <summary className="font-bold text-slate-900 dark:text-white cursor-pointer">
                  {f.q}
                </summary>
                <p className="mt-2 text-slate-700 dark:text-[#c5d6e6] leading-relaxed">
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </section>
      </article>
    </main>
  );
}
