import type { Metadata } from "next";
import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { getAllPosts } from "@/lib/blog";

export const metadata: Metadata = buildMetadata({
  title: "Blog — Gestão de Restaurantes",
  description:
    "Artigos sobre gestão operacional de restaurantes, checklists digitais, higiene e controle de equipe.",
  path: "/blog",
});

export default function BlogIndexPage() {
  const posts = getAllPosts();

  return (
    <main className="mx-auto max-w-4xl px-4 py-24 sm:px-6 lg:px-8">
      <h1 className="text-4xl font-black text-slate-900 dark:text-white mb-4">
        Blog
      </h1>
      <p className="text-lg text-slate-600 dark:text-[#93adc8] mb-12">
        Conteúdo prático para gestores de restaurantes.
      </p>

      <div className="grid gap-8">
        {posts.map((post) => (
          <article
            key={post.slug}
            className="border border-slate-200 dark:border-[#233f48] rounded-xl p-6 hover:border-primary/40 transition-colors"
          >
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
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mt-2 mb-3">
              <Link
                href={`/blog/${post.slug}`}
                className="hover:text-primary transition-colors"
              >
                {post.title}
              </Link>
            </h2>
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
    </main>
  );
}
