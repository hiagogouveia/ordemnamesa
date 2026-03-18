"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 z-50 w-full transition-all duration-300 ${
        isScrolled
          ? "bg-white dark:bg-[#101d22] shadow-sm border-b border-[#e7f0f3] dark:border-[#233f48]"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-20 items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo width={32} height={32} />
            <span
              className={`text-xl font-black ${
                isScrolled
                  ? "text-slate-900 dark:text-white"
                  : "text-slate-900 dark:text-white"
              } hidden sm:block tracking-tight`}
            >
              Ordem na Mesa
            </span>
          </div>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center gap-8">
            <a
              href="#por-que-sistema"
              className="text-sm font-semibold text-slate-600 dark:text-[#93adc8] hover:text-primary transition-colors"
            >
              Benefícios
            </a>
            <a
              href="#como-funciona"
              className="text-sm font-semibold text-slate-600 dark:text-[#93adc8] hover:text-primary transition-colors"
            >
              Como Funciona
            </a>
            <div className="flex items-center gap-4 border-l border-slate-200 dark:border-[#293a41] pl-8">
              <Link
                href="/login"
                className="text-sm font-bold text-slate-900 dark:text-white hover:text-primary transition-colors"
              >
                Fazer Login
              </Link>
              <button className="rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-white hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20">
                Criar Conta
              </button>
            </div>
          </div>

          {/* Mobile menu button */}
          <div className="flex items-center gap-4 md:hidden">
            <Link href="/login" className="text-sm font-bold text-primary">
              Login
            </Link>
            <button className="text-slate-900 dark:text-white p-2">
              <span className="material-symbols-outlined">menu</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
