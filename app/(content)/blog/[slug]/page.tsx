import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildMetadata, siteConfig, breadcrumbJsonLd, faqPageJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import { getAllPosts, getPostBySlug, getRelatedPosts } from "@/lib/blog";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const posts = getAllPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) return {};

  return buildMetadata({
    title: post.metaTitle ?? post.title,
    description: post.description,
    path: `/blog/${post.slug}`,
  });
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) notFound();

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt ?? post.publishedAt,
    author: {
      "@type": "Organization",
      name: post.author,
      url: siteConfig.url,
    },
    publisher: {
      "@type": "Organization",
      name: siteConfig.name,
      logo: {
        "@type": "ImageObject",
        url: `${siteConfig.url}/logo-ordem-na-mes.png`,
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${siteConfig.url}/blog/${post.slug}`,
    },
  };

  const Body = post.Body;
  const related = getRelatedPosts(post.slug, 3);

  return (
    <main className="mx-auto max-w-3xl px-4 py-24 sm:px-6 lg:px-8">
      <JsonLd data={articleJsonLd} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Início", path: "/" },
          { name: "Blog", path: "/blog" },
          { name: post.title, path: `/blog/${post.slug}` },
        ])}
      />
      {post.faqs && post.faqs.length > 0 && (
        <JsonLd data={faqPageJsonLd(post.faqs)} />
      )}

      <nav className="mb-8 text-sm text-slate-500 dark:text-[#93adc8]">
        <Link href="/" className="hover:text-primary">Início</Link>
        <span className="mx-2">/</span>
        <Link href="/blog" className="hover:text-primary">Blog</Link>
      </nav>

      <article>
        <header className="mb-12">
          <div className="flex gap-2 mb-4 flex-wrap">
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary"
              >
                {tag}
              </span>
            ))}
          </div>
          <h1 className="text-4xl font-black text-slate-900 dark:text-white mb-4">
            {post.title}
          </h1>
          <p className="text-xl text-slate-600 dark:text-[#93adc8] mb-6">
            {post.description}
          </p>
          <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-[#93adc8] border-t border-slate-200 dark:border-[#233f48] pt-6">
            <time dateTime={post.publishedAt}>
              {new Date(post.publishedAt).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </time>
            <span>·</span>
            <span>{post.author}</span>
          </div>
        </header>

        <div className="prose prose-slate dark:prose-invert max-w-none prose-headings:font-bold prose-a:text-primary">
          <Body />
        </div>

        {post.faqs && post.faqs.length > 0 && (
          <section className="mt-12">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
              Perguntas frequentes
            </h2>
            <div className="space-y-3">
              {post.faqs.map((f) => (
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
        )}

        {related.length > 0 && (
          <section className="mt-12 border-t border-slate-200 dark:border-[#233f48] pt-8">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
              Conteúdos relacionados
            </h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {related.map((r) => (
                <Link
                  key={r.slug}
                  href={`/blog/${r.slug}`}
                  className="block rounded-xl border border-slate-200 dark:border-[#233f48] p-4 hover:border-primary/40 transition-colors"
                >
                  <span className="block font-bold text-slate-900 dark:text-white text-sm leading-snug">
                    {r.title}
                  </span>
                  <span className="mt-2 block text-xs text-slate-600 dark:text-[#93adc8] line-clamp-3">
                    {r.description}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <div className="mt-12 rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center">
          <p className="text-lg font-bold text-slate-900 dark:text-white">
            Quer rodar sua operação no padrão todos os dias?
          </p>
          <p className="mt-2 text-slate-600 dark:text-[#93adc8]">
            O Ordem na Mesa é a plataforma de execução operacional para
            restaurantes. Fale com a gente e veja na prática.
          </p>
          <Link
            href="/qualificacao"
            className="mt-4 inline-block rounded-full bg-primary px-6 py-3 font-bold text-white transition-opacity hover:opacity-90"
          >
            Agendar demonstração
          </Link>
        </div>
      </article>
    </main>
  );
}
