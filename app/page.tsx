import type { Metadata } from "next";
import { buildMetadata, siteConfig } from "@/lib/seo";
import { Navbar } from "@/components/landing/Navbar";
import { Hero } from "@/components/landing/Hero";
import { ProblemSection } from "@/components/landing/sections/ProblemSection";
import { SolutionSection } from "@/components/landing/sections/SolutionSection";
import { HowItWorks } from "@/components/landing/sections/HowItWorks";
import { BenefitsSection } from "@/components/landing/sections/BenefitsSection";
import { TestimonialsSection } from "@/components/landing/sections/TestimonialsSection";
import { CTASection } from "@/components/landing/sections/CTASection";
import { FAQSection } from "@/components/landing/sections/FAQSection";
import { Footer } from "@/components/landing/sections/Footer";

export const metadata: Metadata = buildMetadata({
  title: "Checklists Digitais para Restaurantes",
  description:
    "Sistema operacional para restaurantes. Checklists com evidência fotográfica e histórico auditável. Pare de apagar incêndio na sua operação.",
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
      <main id="top" className="min-h-screen bg-background-dark text-white scroll-smooth">
        <Navbar />
        <Hero />
        <ProblemSection />
        <SolutionSection />
        <HowItWorks />
        <BenefitsSection />
        <TestimonialsSection />
        <CTASection />
        <FAQSection />
        <Footer />
      </main>
    </>
  );
}
