import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white dark:bg-[#0d181b] border-t border-[#e7f0f3] dark:border-slate-800 pt-16 pb-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <Logo width={24} height={24} />
              <span className="text-lg font-bold text-slate-900 dark:text-white">
                Ordem na Mesa
              </span>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-500 mb-4">
              Tecnologia para quem alimenta o mundo.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
              Produto
            </h3>
            <ul className="space-y-3">
              <li>
                <a href="#por-que-sistema" className="text-sm text-slate-600 dark:text-slate-500 hover:text-primary transition-colors">
                  Benefícios
                </a>
              </li>
              <li>
                <Link href="/login" className="text-sm text-slate-600 dark:text-slate-500 hover:text-primary transition-colors">
                  Fazer Login
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
              Conteúdo
            </h3>
            <ul className="space-y-3">
              <li>
                <Link href="/blog" className="text-sm text-slate-600 dark:text-slate-500 hover:text-primary transition-colors">
                  Blog
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-[#e7f0f3] dark:border-slate-800 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-slate-600 dark:text-slate-500">
          <p>© {currentYear} Ordem na Mesa. Todos os direitos reservados.</p>
        </div>
      </div>
    </footer>
  );
}
