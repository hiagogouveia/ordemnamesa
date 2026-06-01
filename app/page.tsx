import type { Metadata } from "next";
import {
  buildMetadata,
  faqPageJsonLd,
  softwareApplicationJsonLd,
} from "@/lib/seo";
import { HOME_FAQ } from "@/lib/faq";
import { JsonLd } from "@/components/seo/JsonLd";
import { Navbar } from "@/components/landing/Navbar";
import { CinematicHero } from "@/components/landing/CinematicHero";
import { ProblemSection } from "@/components/landing/sections/ProblemSection";
import { SolutionSection } from "@/components/landing/sections/SolutionSection";
import { HowItWorks } from "@/components/landing/sections/HowItWorks";
import { BenefitsSection } from "@/components/landing/sections/BenefitsSection";
import { TestimonialsSection } from "@/components/landing/sections/TestimonialsSection";
import { CTASection } from "@/components/landing/sections/CTASection";
import { FAQSection } from "@/components/landing/sections/FAQSection";
import { Footer } from "@/components/landing/sections/Footer";

export const metadata: Metadata = buildMetadata({
  title: "Plataforma de Execução Operacional para Restaurantes",
  description:
    "Checklists digitais com evidência fotográfica, abertura, fechamento, auditoria e recebimento. A plataforma de execução operacional que faz seu restaurante rodar no padrão — todos os dias, sem falhas.",
  path: "/",
});

export default function LandingPage() {
  return (
    <>
      <JsonLd data={softwareApplicationJsonLd()} />
      <JsonLd data={faqPageJsonLd(HOME_FAQ)} />
      <main id="top" className="min-h-screen bg-background-dark text-white scroll-smooth">
        <Navbar />
        <CinematicHero />
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
