import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/seo";
import { getAllPosts } from "@/lib/blog";
import { getAllChecklists } from "@/lib/programmatic";
import { getAllComparisons } from "@/lib/comparisons";

export default function sitemap(): MetadataRoute.Sitemap {
  const posts = getAllPosts();
  const checklists = getAllChecklists();
  const comparisons = getAllComparisons();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: siteConfig.url,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${siteConfig.url}/execucao-operacional`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${siteConfig.url}/modelos`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${siteConfig.url}/comparativos`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${siteConfig.url}/blog`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${siteConfig.url}/sobre`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];

  const blogRoutes: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${siteConfig.url}/blog/${post.slug}`,
    lastModified: new Date(post.updatedAt ?? post.publishedAt),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  const checklistRoutes: MetadataRoute.Sitemap = checklists.map((page) => ({
    url: `${siteConfig.url}/modelos/${page.slug}`,
    lastModified: new Date(page.publishedAt),
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));

  const comparisonRoutes: MetadataRoute.Sitemap = comparisons.map((page) => ({
    url: `${siteConfig.url}/comparativos/${page.slug}`,
    lastModified: new Date(page.publishedAt),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  return [
    ...staticRoutes,
    ...checklistRoutes,
    ...comparisonRoutes,
    ...blogRoutes,
  ];
}
