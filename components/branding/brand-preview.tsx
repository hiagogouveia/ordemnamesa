"use client";

/* eslint-disable @next/next/no-img-element */

/**
 * Sprint 93 — Prévia da logo DENTRO DO CHROME REAL.
 *
 * Não é enfeite: é o único mecanismo que expõe, antes de publicar, o modo de falha
 * que nenhuma validação automática pega — logo clara (ou com contorno branco) que
 * simplesmente some no fundo escuro da sidebar (`#111e22`).
 *
 * Os outros dois modos de falha já são resolvidos sem interação:
 *   - margem vazia excessiva → auto-trim em lib/branding/normalize.ts
 *   - proporção inadequada   → validação com mensagem, no mesmo módulo
 *
 * Por isso NÃO existe editor de crop/reposicionamento aqui: ele não resolveria melhor
 * nenhum dos três, e logo — diferente de avatar — já vem recortada da origem.
 *
 * Usa <img> cru de propósito: a fonte é um blob: URL local (pré-upload), que o
 * otimizador do next/image não processa.
 */

interface BrandPreviewProps {
    /** blob: URL da imagem normalizada, ou URL pública de uma logo já salva. */
    src: string;
    /** Nome exibido ao lado da logo na prévia da sidebar. */
    restaurantName: string;
}

export function BrandPreview({ src, restaurantName }: BrandPreviewProps) {
    return (
        <div className="grid gap-4 sm:grid-cols-2">
            {/* Sidebar — mesmas medidas de components/layout/sidebar.tsx */}
            <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#92bbc9] mb-2">
                    Menu lateral
                </p>
                <div className="rounded-lg border border-[#233f48] overflow-hidden">
                    <div className="w-full bg-[#111e22] px-4 py-5">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="relative flex items-center shrink-0 h-10 max-w-[120px]">
                                <img
                                    src={src}
                                    alt="Prévia da logo no menu lateral"
                                    className="h-full w-auto object-contain object-left"
                                />
                            </div>
                            <div className="flex flex-col min-w-0">
                                <span className="text-white font-bold text-sm leading-tight">
                                    Ordem na Mesa
                                </span>
                                <span className="text-[#92bbc9] text-xs truncate">
                                    {restaurantName}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Header mobile — mesmas medidas de components/layout/header.tsx */}
            <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#92bbc9] mb-2">
                    Topo no celular
                </p>
                <div className="rounded-lg border border-[#233f48] overflow-hidden">
                    <div className="w-full bg-[#111e22] px-4 py-4 flex items-center justify-between">
                        <div className="relative flex items-center shrink-0 h-8 max-w-[104px]">
                            <img
                                src={src}
                                alt="Prévia da logo no topo"
                                className="h-full w-auto object-contain object-left"
                            />
                        </div>
                        <div className="flex items-center gap-3 text-[#92bbc9]">
                            <span className="material-symbols-outlined text-[20px]">notifications</span>
                            <span className="material-symbols-outlined text-[20px]">menu</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Documento — o PDF/impressão sai em fundo claro, então o risco de contraste
                é o oposto: logo clara aqui some no branco. */}
            <div className="sm:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#92bbc9] mb-2">
                    Relatórios e PDFs
                </p>
                <div className="rounded-lg border border-[#233f48] overflow-hidden">
                    <div className="w-full bg-white px-5 py-4 flex items-center gap-4">
                        <div className="relative flex items-center shrink-0 h-12 max-w-[180px]">
                            <img
                                src={src}
                                alt="Prévia da logo no documento"
                                className="h-full w-auto object-contain object-left"
                            />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold">
                                {restaurantName}
                            </p>
                            <p className="text-base font-black text-slate-900 leading-tight">
                                Relatório oficial de auditoria
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
