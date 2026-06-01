import type { Metadata } from "next";
import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { getAllPosts, type BlogPost } from "@/lib/blog";

export const metadata: Metadata = buildMetadata({
  title: "Blog — Gestão de Restaurantes",
  description:
    "Artigos sobre gestão operacional de restaurantes, checklists digitais, higiene e controle de equipe.",
  path: "/blog",
});

const FALLBACK_GROUP = "Artigos";

// Rótulo de exibição da categoria (singular no dado → título do grupo).
function groupLabel(key: string): string {
  return key === "Guia" ? "Guias" : key;
}

export default function BlogIndexPage() {
  const posts = getAllPosts();

  // Agrupa por category; posts sem categoria caem em "Artigos".
  const groups = new Map<string, BlogPost[]>();
  for (const post of posts) {
    const key = post.category ?? FALLBACK_GROUP;
    groups.set(key, [...(groups.get(key) ?? []), post]);
  }
  // Categorias nomeadas primeiro; "Artigos" por último.
  const orderedGroups = [...groups.entries()].sort(([a], [b]) => {
    if (a === FALLBACK_GROUP) return 1;
    if (b === FALLBACK_GROUP) return -1;
    return 0;
  });
  // Só mostra cabeçalhos de grupo quando há de fato categorias além de "Artigos".
  const showHeadings = !(
    orderedGroups.length === 1 && orderedGroups[0][0] === FALLBACK_GROUP
  );

  return (
    <main className="mx-auto max-w-4xl px-4 py-24 sm:px-6 lg:px-8">
      <h1 className="text-4xl font-black text-slate-900 dark:text-white mb-4">
        Blog
      </h1>
      <p className="text-lg text-slate-600 dark:text-[#93adc8] mb-12">
        Conteúdo prático para gestores de restaurantes.
      </p>

      <div className="space-y-12">
        {orderedGroups.map(([key, items]) => (
          <section key={key}>
            {showHeadings && (
              <h2 className="text-xs font-mono uppercase tracking-widest text-primary mb-4">
                {groupLabel(key)}
              </h2>
            )}
            <div className="grid gap-8">
              {items.map((post) => (
                <article
                  key={post.slug}
                  className="border border-slate-200 dark:border-[#233f48] rounded-xl p-6 hover:border-primary/40 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    <time
                      className="text-sm text-slate-500 dark:text-[#93adc8]"
                      dateTime={post.publishedAt}
                    >
                      {new Date(post.publishedAt).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                      })}
                    </time>
                    {post.category && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary font-semibold">
                        {post.category}
                      </span>
                    )}
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mt-2 mb-3">
                    <Link
                      href={`/blog/${post.slug}`}
                      className="hover:text-primary transition-colors"
                    >
                      {post.title}
                    </Link>
                  </h3>
                  <p className="text-slate-600 dark:text-[#93adc8]">
                    {post.description}
                  </p>
                  <div className="flex gap-2 mt-4 flex-wrap">
                    {post.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
