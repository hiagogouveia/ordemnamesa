import type { Metadata } from "next";
import { buildMetadata, siteConfig } from "@/lib/seo";
import { Navbar } from "@/components/landing/Navbar";
import { Hero } from "@/components/landing/Hero";
import { ProblemSolution } from "@/components/landing/ProblemSolution";
import { CTASection } from "@/components/landing/CTASection";
import { Footer } from "@/components/landing/Footer";

export const metadata: Metadata = buildMetadata({
  title: "Checklists Digitais para Restaurantes",
  description:
    "Transforme aberturas, fechamentos e auditorias em processos rápidos e à prova de falhas. Controle sua cozinha direto do celular e economize horas da sua equipe.",
  path: "/",
});

const softwareJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: siteConfig.name,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web, iOS, Android",
  description:
    "Sistema de checklists digitais para restaurantes com controle de abertura, fechamento, auditorias e monitoramento da equipe em tempo real.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "BRL",
    description: "Teste grátis disponível",
  },
  inLanguage: "pt-BR",
};

export default function LandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
      />
      <main className="min-h-screen">
        <Navbar />
        <Hero />
        <ProblemSolution />
        <CTASection />
        <Footer />
      </main>
    </>
  );
}
