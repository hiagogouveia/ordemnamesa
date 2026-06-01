import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  buildMetadata,
  siteConfig,
  breadcrumbJsonLd,
  faqPageJsonLd,
  howToJsonLd,
} from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import {
  getAllChecklists,
  getChecklistBySlug,
} from "@/lib/programmatic";

interface Props {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return getAllChecklists().map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = getChecklistBySlug(slug);
  if (!page) return {};
  return buildMetadata({
    title: page.metaTitle,
    description: page.metaDescription,
    path: `/modelos/${page.slug}`,
  });
}

export default async function ChecklistModelPage({ params }: Props) {
  const { slug } = await params;
  const page = getChecklistBySlug(slug);
  if (!page) notFound();

  const related = page.relatedSlugs
    .map((s) => getChecklistBySlug(s))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  return (
    <main className="mx-auto max-w-3xl px-4 py-24 sm:px-6 lg:px-8">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Início", path: "/" },
          { name: "Modelos de checklist", path: "/modelos" },
          { name: page.h1, path: `/modelos/${page.slug}` },
        ])}
      />
      <JsonLd
        data={howToJsonLd({
          name: page.h1,
          description: page.intro,
          steps: page.groups.flatMap((g) =>
            g.items.map((item) => ({ name: g.title, text: item }))
          ),
        })}
      />
      <JsonLd data={faqPageJsonLd(page.faqs)} />

      <nav className="mb-8 text-sm text-slate-500 dark:text-[#93adc8]">
        <Link href="/" className="hover:text-primary">Início</Link>
        <span className="mx-2">/</span>
        <Link href="/modelos" className="hover:text-primary">Modelos de checklist</Link>
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
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
            Por que esse checklist importa
          </h2>
          <p className="text-slate-700 dark:text-[#c5d6e6] leading-relaxed">
            {page.whyItMatters}
          </p>
        </section>

        {page.groups.map((group) => (
          <section key={group.title} className="mb-10">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
              {group.title}
            </h2>
            <ul className="space-y-2">
              {group.items.map((item) => (
                <li
                  key={item}
                  className="flex gap-3 text-slate-700 dark:text-[#c5d6e6]"
                >
                  <span
                    aria-hidden
                    className="mt-1 shrink-0 w-4 h-4 rounded border border-primary/50 bg-primary/10"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <section className="mb-10">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
            Erros comuns nesse checklist
          </h2>
          <ul className="space-y-2">
            {page.commonMistakes.map((m) => (
              <li
                key={m}
                className="flex gap-3 text-slate-700 dark:text-[#c5d6e6]"
              >
                <span aria-hidden className="text-red-400">✕</span>
                <span>{m}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mb-10 rounded-2xl border border-primary/30 bg-primary/5 p-6">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
            Como digitalizar esse checklist no Ordem na Mesa
          </h2>
          <p className="text-slate-700 dark:text-[#c5d6e6] leading-relaxed mb-4">
            Um checklist de papel não avisa quando uma tarefa é esquecida e não
            comprova o que foi feito. O Ordem na Mesa é a{" "}
            <Link href="/execucao-operacional" className="text-primary font-semibold">
              {siteConfig.category.toLowerCase()}
            </Link>{" "}
            que transforma o checklist de {page.routine} de {page.establishment}{" "}
            em rotina executável: cada item pode exigir foto, seguir uma ordem
            obrigatória, ter responsável e ficar no histórico auditável. O gestor
            acompanha tudo em tempo real, pelo celular.
          </p>
          <Link
            href="/qualificacao"
            className="inline-block rounded-full bg-primary px-6 py-3 font-bold text-white transition-opacity hover:opacity-90"
          >
            Agendar demonstração
          </Link>
        </section>

        <section className="mb-10">
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

        {related.length > 0 && (
          <section className="border-t border-slate-200 dark:border-[#233f48] pt-8">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
              Checklists relacionados
            </h2>
            <ul className="space-y-2">
              {related.map((r) => (
                <li key={r.slug}>
                  <Link
                    href={`/modelos/${r.slug}`}
                    className="text-primary hover:underline"
                  >
                    {r.h1}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </main>
  );
}
