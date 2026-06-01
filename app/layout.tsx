import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import QueryProvider from "@/components/providers/query-provider";
import { PhotoTraceProvider } from "@/components/photo-trace-provider";
import { siteConfig, organizationJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: siteConfig.name,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  keywords: [
    "execução operacional para restaurantes",
    "software de execução operacional restaurante",
    "checklist operacional restaurante",
    "checklist digital restaurante",
    "software de checklist para restaurante",
    "rotina de abertura e fechamento restaurante",
    "auditoria operacional restaurante",
    "padronização operacional restaurante",
    "gestão operacional de restaurante",
    "ordem na mesa",
  ],
  authors: [{ name: siteConfig.name, url: siteConfig.url }],
  creator: siteConfig.name,
  openGraph: {
    type: "website",
    locale: siteConfig.locale,
    url: siteConfig.url,
    siteName: siteConfig.name,
    title: siteConfig.name,
    description: siteConfig.description,
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: siteConfig.name,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.name,
    description: siteConfig.description,
    images: ["/opengraph-image"],
  },
  icons: {
    icon: "/logo-icon.png",
    apple: "/logo-icon.png",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="dark" suppressHydrationWarning>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
        <JsonLd data={organizationJsonLd()} />
      </head>
      <body
        className={`${inter.variable} font-display antialiased bg-background-light dark:bg-background-dark text-slate-900 dark:text-white selection:bg-primary/30 selection:text-primary`}
        suppressHydrationWarning
      >
        <QueryProvider>{children}</QueryProvider>
        <PhotoTraceProvider />
      </body>
    </html>
  );
}
