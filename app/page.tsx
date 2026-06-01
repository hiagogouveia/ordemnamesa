import type { Metadata } from "next";
import {
  buildMetadata,
  faqPageJsonLd,
  softwareApplicationJsonLd,
} from "@/lib/seo";
import { HOME_FAQ } from "@/lib/faq";
import { JsonLd } from "@/components/seo/JsonLd";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { CinematicHero } from "@/components/landing/CinematicHero";
import { ProblemSection } from "@/components/landing/sections/ProblemSection";
import { SolutionSection } from "@/components/landing/sections/SolutionSection";
import { HowItWorks } from "@/components/landing/sections/HowItWorks";
import { BenefitsSection } from "@/components/landing/sections/BenefitsSection";
import { TestimonialsSection } from "@/components/landing/sections/TestimonialsSection";
import { CTASection } from "@/components/landing/sections/CTASection";
import { FAQSection } from "@/components/landing/sections/FAQSection";
import { SiteFooter } from "@/components/layout/SiteFooter";

export const metadata: Metadata = buildMetadata({
  // Página index (/) — o template do layout raiz NÃO se aplica aqui, então a
  // marca é incluída manualmente (resulta em sufixo único, sem duplicação).
  title: "Software de Checklist para Restaurante | Ordem na Mesa",
  description:
    "Checklists digitais com foto, abertura, fechamento e auditoria para sua equipe executar a operação no padrão. Agende uma demonstração do Ordem na Mesa.",
  path: "/",
});

export default function LandingPage() {
  return (
    <>
      <JsonLd data={softwareApplicationJsonLd()} />
      <JsonLd data={faqPageJsonLd(HOME_FAQ)} />
      <main id="top" className="min-h-screen bg-background-dark text-white scroll-smooth">
        <SiteHeader variant="transparent" />
        <CinematicHero />
        <ProblemSection />
        <SolutionSection />
        <HowItWorks />
        <BenefitsSection />
        <TestimonialsSection />
        <CTASection />
        <FAQSection />
        <SiteFooter />
      </main>
    </>
  );
}
