"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { createClient } from "@/lib/supabase/client";

// ── Máscaras ──────────────────────────────────────────────
function maskCnpj(v: string): string {
    return v.replace(/\D/g, '').slice(0, 14)
        .replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2')
}

function maskPhone(v: string): string {
    return v.replace(/\D/g, '').slice(0, 11)
        .replace(/^(\d{2})(\d)/, '($1) $2')
        .replace(/(\d{5})(\d)/, '$1-$2')
}

function maskCep(v: string): string {
    return v.replace(/\D/g, '').slice(0, 8)
        .replace(/^(\d{5})(\d)/, '$1-$2')
}

// ── Componente ────────────────────────────────────────────
export default function SignupPage() {
    const router = useRouter();
    const [form, setForm] = useState({
        nome_responsavel: '',
        email: '',
        senha: '',
        nome_fantasia: '',
        cnpj: '',
        telefone: '',
        cep: '',
        endereco: '',
    });
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleChange = (field: keyof typeof form) =>
        (e: React.ChangeEvent<HTMLInputElement>) => {
            let value = e.target.value;
            if (field === 'cnpj') value = maskCnpj(value);
            if (field === 'telefone') value = maskPhone(value);
            if (field === 'cep') value = maskCep(value);
            setForm(prev => ({ ...prev, [field]: value }));
        };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const res = await fetch('/api/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(form),
        });

        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            setError(data.error ?? 'Erro ao criar conta. Tente novamente.');
            setLoading(false);
            return;
        }

        // Auto-login após cadastro bem-sucedido
        const supabase = createClient();
        const { error: signInError } = await supabase.auth.signInWithPassword({
            email: form.email,
            password: form.senha,
        });

        if (signInError) {
            setError('Conta criada! Houve um erro ao fazer login automático. Acesse /login.');
            setLoading(false);
            return;
        }

        router.push('/selecionar-restaurante');
    };

    // Classe base dos inputs (idêntica ao login)
    const inputBase =
        "flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg text-slate-900 dark:text-white focus:outline-0 focus:ring-0 border border-slate-200 dark:border-border-dark bg-white dark:bg-surface-dark focus:border-primary dark:focus:border-primary h-12 lg:h-14 placeholder:text-slate-400 dark:placeholder:text-[#5a7b88] text-base font-normal leading-normal transition-all shadow-sm";

    return (
        <div className="flex flex-1 min-h-screen w-full overflow-hidden">
            {/* Coluna esquerda: visual (somente desktop) */}
            <div
                className="hidden lg:flex lg:w-1/2 relative flex-col justify-between p-12 bg-cover bg-center"
                style={{
                    backgroundImage: 'linear-gradient(135deg, rgba(16, 29, 34, 0.85) 0%, rgba(19, 182, 236, 0.15) 100%), url("https://lh3.googleusercontent.com/aida-public/AB6AXuCg8U_knVO_aLFmbysfseFa-c0Wo4w2SXpyjYmR5g_l42K0HEvFiHqT4REa6CS_ZMJ1XON5fm3ylaRwYzmehb27CY7NTBcEm7KmIX5hObewmOzB3Xx_xGGgEOR4AmTodClW89OFDhrqMca73R7zVpiUqEH0Af7YK9Nxh4IYfVkBl_-LZ_VjVHn_JBsaLHzxaa3rOvwK6_3hCxCeaWe5L_E7DOTDnzf_mtOE0CllDGxBP1oS4QZLmqgkV69jOGKigFuyNAeGXg3DgipA")'
                }}
            >
                <Link href="/" className="relative z-10 flex items-center gap-3 w-fit">
                    <Logo width={40} height={40} />
                    <span className="text-white text-xl font-bold tracking-tight">Ordem na Mesa</span>
                </Link>

                <div className="relative z-10 max-w-lg mb-12">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/10 backdrop-blur-md mb-6">
                        <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                        <span className="text-xs font-medium text-white tracking-wide uppercase">30 dias grátis</span>
                    </div>
                    <h1 className="text-5xl font-black text-white leading-[1.1] mb-6 tracking-tight">
                        Comece a organizar seu restaurante hoje.
                    </h1>
                    <p className="text-gray-300 text-lg font-medium leading-relaxed max-w-md">
                        Checklists digitais, gestão de equipe e controle total da operação — sem papel, sem complicação.
                    </p>
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-[#101d22] via-transparent to-transparent opacity-60"></div>
            </div>

            {/* Coluna direita: formulário */}
            <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-6 lg:p-16 bg-background-light dark:bg-background-dark relative overflow-y-auto">
                <div className="absolute top-0 right-0 p-8">
                    <Link href="/" className="text-sm font-medium text-slate-500 dark:text-[#93adc8] hover:text-primary transition-colors">
                        Voltar ao Início
                    </Link>
                </div>

                <div className="w-full max-w-[440px] flex flex-col gap-6 py-12">
                    {/* Logo mobile */}
                    <div className="lg:hidden flex items-center gap-2 mb-2 self-center">
                        <Logo width={40} height={40} />
                        <h2 className="text-slate-900 dark:text-white text-lg font-bold">Ordem na Mesa</h2>
                    </div>

                    <div className="flex flex-col gap-1 text-center lg:text-left">
                        <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Criar conta grátis</h2>
                        <p className="text-slate-500 dark:text-[#93adc8] text-base">30 dias gratuitos, sem cartão de crédito.</p>
                    </div>

                    <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
                        {/* ── Dados do responsável ── */}
                        <p className="text-xs font-semibold text-slate-400 dark:text-[#5a7b88] uppercase tracking-widest">Dados do responsável</p>

                        {/* Nome */}
                        <div className="flex flex-col gap-2">
                            <label className="text-slate-700 dark:text-white text-sm font-semibold" htmlFor="nome_responsavel">
                                Nome completo
                            </label>
                            <div className="relative group">
                                <div className="absolute left-0 top-0 bottom-0 pl-4 flex items-center pointer-events-none text-slate-400 dark:text-[#93adc8] group-focus-within:text-primary transition-colors">
                                    <span className="material-symbols-outlined text-[20px]">person</span>
                                </div>
                                <input
                                    id="nome_responsavel"
                                    type="text"
                                    value={form.nome_responsavel}
                                    onChange={handleChange('nome_responsavel')}
                                    placeholder="ex: João Silva"
                                    className={`${inputBase} pl-11 pr-4`}
                                    required
                                />
                            </div>
                        </div>

                        {/* E-mail */}
                        <div className="flex flex-col gap-2">
                            <label className="text-slate-700 dark:text-white text-sm font-semibold" htmlFor="email">
                                E-mail
                            </label>
                            <div className="relative group">
                                <div className="absolute left-0 top-0 bottom-0 pl-4 flex items-center pointer-events-none text-slate-400 dark:text-[#93adc8] group-focus-within:text-primary transition-colors">
                                    <span className="material-symbols-outlined text-[20px]">mail</span>
                                </div>
                                <input
                                    id="email"
                                    type="email"
                                    value={form.email}
                                    onChange={handleChange('email')}
                                    placeholder="ex: joao@restaurante.com.br"
                                    className={`${inputBase} pl-11 pr-4`}
                                    required
                                />
                            </div>
                        </div>

                        {/* Senha */}
                        <div className="flex flex-col gap-2">
                            <label className="text-slate-700 dark:text-white text-sm font-semibold" htmlFor="senha">
                                Senha
                            </label>
                            <div className="relative flex w-full items-center group">
                                <div className="absolute left-0 top-0 bottom-0 pl-4 flex items-center pointer-events-none text-slate-400 dark:text-[#93adc8] group-focus-within:text-primary transition-colors">
                                    <span className="material-symbols-outlined text-[20px]">lock</span>
                                </div>
                                <input
                                    id="senha"
                                    type={showPassword ? "text" : "password"}
                                    value={form.senha}
                                    onChange={handleChange('senha')}
                                    placeholder="Mínimo 6 caracteres"
                                    className={`${inputBase} pl-11 pr-12`}
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-0 top-0 bottom-0 flex items-center pr-4 cursor-pointer text-slate-400 dark:text-[#93adc8] hover:text-slate-600 dark:hover:text-white transition-colors focus:outline-none"
                                >
                                    <span className="material-symbols-outlined text-[20px]">
                                        {showPassword ? "visibility" : "visibility_off"}
                                    </span>
                                </button>
                            </div>
                        </div>

                        {/* ── Divisor ── */}
                        <div className="flex items-center gap-4 pt-1">
                            <div className="h-px flex-1 bg-slate-200 dark:bg-border-dark"></div>
                            <span className="text-xs font-semibold text-slate-400 dark:text-[#5a7b88] uppercase tracking-widest whitespace-nowrap">Dados do Restaurante</span>
                            <div className="h-px flex-1 bg-slate-200 dark:bg-border-dark"></div>
                        </div>

                        {/* Nome fantasia */}
                        <div className="flex flex-col gap-2">
                            <label className="text-slate-700 dark:text-white text-sm font-semibold" htmlFor="nome_fantasia">
                                Nome do restaurante
                            </label>
                            <div className="relative group">
                                <div className="absolute left-0 top-0 bottom-0 pl-4 flex items-center pointer-events-none text-slate-400 dark:text-[#93adc8] group-focus-within:text-primary transition-colors">
                                    <span className="material-symbols-outlined text-[20px]">restaurant</span>
                                </div>
                                <input
                                    id="nome_fantasia"
                                    type="text"
                                    value={form.nome_fantasia}
                                    onChange={handleChange('nome_fantasia')}
                                    placeholder="ex: Pizzaria do João"
                                    className={`${inputBase} pl-11 pr-4`}
                                    required
                                />
                            </div>
                        </div>

                        {/* CNPJ */}
                        <div className="flex flex-col gap-2">
                            <label className="text-slate-700 dark:text-white text-sm font-semibold" htmlFor="cnpj">
                                CNPJ
                            </label>
                            <div className="relative group">
                                <div className="absolute left-0 top-0 bottom-0 pl-4 flex items-center pointer-events-none text-slate-400 dark:text-[#93adc8] group-focus-within:text-primary transition-colors">
                                    <span className="material-symbols-outlined text-[20px]">badge</span>
                                </div>
                                <input
                                    id="cnpj"
                                    type="text"
                                    inputMode="numeric"
                                    value={form.cnpj}
                                    onChange={handleChange('cnpj')}
                                    placeholder="00.000.000/0000-00"
                                    className={`${inputBase} pl-11 pr-4`}
                                    required
                                />
                            </div>
                        </div>

                        {/* Telefone */}
                        <div className="flex flex-col gap-2">
                            <label className="text-slate-700 dark:text-white text-sm font-semibold" htmlFor="telefone">
                                Telefone / WhatsApp
                            </label>
                            <div className="relative group">
                                <div className="absolute left-0 top-0 bottom-0 pl-4 flex items-center pointer-events-none text-slate-400 dark:text-[#93adc8] group-focus-within:text-primary transition-colors">
                                    <span className="material-symbols-outlined text-[20px]">phone</span>
                                </div>
                                <input
                                    id="telefone"
                                    type="text"
                                    inputMode="numeric"
                                    value={form.telefone}
                                    onChange={handleChange('telefone')}
                                    placeholder="(00) 00000-0000"
                                    className={`${inputBase} pl-11 pr-4`}
                                    required
                                />
                            </div>
                        </div>

                        {/* CEP */}
                        <div className="flex flex-col gap-2">
                            <label className="text-slate-700 dark:text-white text-sm font-semibold" htmlFor="cep">
                                CEP
                            </label>
                            <div className="relative group">
                                <div className="absolute left-0 top-0 bottom-0 pl-4 flex items-center pointer-events-none text-slate-400 dark:text-[#93adc8] group-focus-within:text-primary transition-colors">
                                    <span className="material-symbols-outlined text-[20px]">location_on</span>
                                </div>
                                <input
                                    id="cep"
                                    type="text"
                                    inputMode="numeric"
                                    value={form.cep}
                                    onChange={handleChange('cep')}
                                    placeholder="00000-000"
                                    className={`${inputBase} pl-11 pr-4`}
                                    required
                                />
                            </div>
                        </div>

                        {/* Endereço */}
                        <div className="flex flex-col gap-2">
                            <label className="text-slate-700 dark:text-white text-sm font-semibold" htmlFor="endereco">
                                Endereço completo
                            </label>
                            <div className="relative group">
                                <div className="absolute left-0 top-0 bottom-0 pl-4 flex items-center pointer-events-none text-slate-400 dark:text-[#93adc8] group-focus-within:text-primary transition-colors">
                                    <span className="material-symbols-outlined text-[20px]">home</span>
                                </div>
                                <input
                                    id="endereco"
                                    type="text"
                                    value={form.endereco}
                                    onChange={handleChange('endereco')}
                                    placeholder="Rua, número, bairro, cidade - UF"
                                    className={`${inputBase} pl-11 pr-4`}
                                    required
                                />
                            </div>
                        </div>

                        {/* Erro */}
                        {error && (
                            <p className="text-red-500 text-sm">{error}</p>
                        )}

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="mt-2 flex w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg h-12 lg:h-14 px-4 bg-primary hover:bg-[#0ea5d6] text-[#111e22] text-base font-bold leading-normal tracking-[0.015em] transition-all duration-200 transform active:scale-[0.99] shadow-[0_4px_14px_0_rgba(19,182,236,0.39)] disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <span className="material-symbols-outlined animate-spin">progress_activity</span>
                            ) : (
                                <span className="truncate">Criar conta grátis</span>
                            )}
                        </button>
                    </form>

                    <p className="text-slate-500 dark:text-[#93adc8] text-sm text-center">
                        Já tem conta?{" "}
                        <Link href="/login" className="font-bold text-slate-700 dark:text-white hover:text-primary transition-colors">
                            Fazer login
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
