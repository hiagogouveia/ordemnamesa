"use client";

import { useState } from "react";
import { Plus } from "../icons";
import { HOME_FAQ as FAQ_ITEMS } from "@/lib/faq";

export function FAQSection() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="bg-background-dark py-20 md:py-28">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12 md:mb-16">
          <div className="inline-flex items-center gap-2 mb-3 text-xs font-mono uppercase tracking-widest text-primary">
            <span className="w-6 h-px bg-primary" />
            07 — Perguntas Frequentes
            <span className="w-6 h-px bg-primary" />
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-white">
            Dúvidas <span className="italic font-light text-text-secondary">direto ao ponto</span>.
          </h2>
          <p className="mt-4 text-lg text-text-secondary">
            Se a sua não estiver aqui, manda no WhatsApp.
          </p>
        </div>

        <div className="space-y-3">
          {FAQ_ITEMS.map((item, i) => {
            const isOpen = open === i;
            return (
              <div
                key={item.q}
                className={`rounded-2xl border transition-colors duration-200 ${
                  isOpen
                    ? "bg-surface-dark border-primary/40"
                    : "bg-surface-dark/60 border-border-dark"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="w-full flex items-center justify-between gap-4 px-5 md:px-6 py-4 md:py-5 text-left"
                  aria-expanded={isOpen}
                >
                  <span className="text-base md:text-lg font-bold text-white tracking-tight">
                    {item.q}
                  </span>
                  <span
                    className={`shrink-0 w-8 h-8 rounded-full bg-primary/10 border border-primary/30 text-primary flex items-center justify-center transition-transform duration-300 ${
                      isOpen ? "rotate-45" : ""
                    }`}
                  >
                    <Plus size={14} />
                  </span>
                </button>
                <div
                  className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                    isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  }`}
                >
                  <div className="overflow-hidden">
                    <p className="px-5 md:px-6 pb-5 md:pb-6 text-sm md:text-base text-text-secondary leading-relaxed">
                      {item.a}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
