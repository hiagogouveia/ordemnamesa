"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const supabase = createClient();
        const { error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (signInError) {
            setError("Email ou senha inválidos. Tente novamente.");
            setLoading(false);
            return;
        }

        router.push("/selecionar-account");
    };

    return (
        <div className="flex flex-1 min-h-screen w-full overflow-hidden">
            {/* Left Side: Hero/Visual (Desktop only) */}
            <div
                className="hidden lg:flex lg:w-1/2 relative flex-col justify-between p-12 bg-cover bg-center"
                style={{
                    backgroundImage: 'linear-gradient(135deg, rgba(16, 29, 34, 0.85) 0%, rgba(19, 182, 236, 0.15) 100%), url("https://lh3.googleusercontent.com/aida-public/AB6AXuCg8U_knVO_aLFmbysfseFa-c0Wo4w2SXpyjYmR5g_l42K0HEvFiHqT4REa6CS_ZMJ1XON5fm3ylaRwYzmehb27CY7NTBcEm7KmIX5hObewmOzB3Xx_xGGgEOR4AmTodClW89OFDhrqMca73R7zVpiUqEH0Af7YK9Nxh4IYfVkBl_-LZ_VjVHn_JBsaLHzxaa3rOvwK6_3hCxCeaWe5L_E7DOTDnzf_mtOE0CllDGxBP1oS4QZLmqgkV69jOGKigFuyNAeGXg3DgipA")'
                }}
            >
                {/* Brand Logo Area */}
                <Link href="/" className="relative z-10 flex items-center gap-3 w-fit">
                    <Logo width={40} height={40} />
                    <span className="text-white text-xl font-bold tracking-tight">Ordem na Mesa</span>
                </Link>

                {/* Hero Content */}
                <div className="relative z-10 max-w-lg mb-12">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/10 backdrop-blur-md mb-6">
                        <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                        <span className="text-xs font-medium text-white tracking-wide uppercase">App de Gestão Interna</span>
                    </div>
                    <h1 className="text-5xl font-black text-white leading-[1.1] mb-6 tracking-tight">
                        Controle total da operação em suas mãos.
                    </h1>
                    <p className="text-gray-300 text-lg font-medium leading-relaxed max-w-md">
                        Organize tarefas, monitore a execução da equipe em tempo real e garanta a excelência no atendimento.
                    </p>
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-[#101d22] via-transparent to-transparent opacity-60"></div>
            </div>

            {/* Right Side: Login Form */}
            <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-6 lg:p-24 bg-background-light dark:bg-background-dark relative">
                <div className="absolute top-0 right-0 p-8">
                    <Link href="/" className="text-sm font-medium text-slate-500 dark:text-[#93adc8] hover:text-primary transition-colors">
                        Voltar ao Início
                    </Link>
                </div>

                <div className="w-full max-w-[440px] flex flex-col gap-8 animate-fade-in">
                    {/* Mobile Brand */}
                    <div className="lg:hidden flex items-center gap-2 mb-4 self-center">
                        <Logo width={40} height={40} />
                        <h2 className="text-slate-900 dark:text-white text-lg font-bold">Ordem na Mesa</h2>
                    </div>

                    <div className="flex flex-col gap-2 text-center lg:text-left">
                        <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Bem-vindo de volta</h2>
                        <p className="text-slate-500 dark:text-[#93adc8] text-base">Insira suas credenciais para acessar o painel administrativo.</p>
                    </div>

                    {/* Login Form */}
                    <form className="flex flex-col gap-5" onSubmit={handleLogin}>
                        <div className="flex flex-col gap-2">
                            <label className="text-slate-700 dark:text-white text-sm font-semibold leading-normal" htmlFor="email">
                                E-mail ou Usuário
                            </label>
                            <div className="relative group">
                                <div className="absolute left-0 top-0 bottom-0 pl-4 flex items-center pointer-events-none text-slate-400 dark:text-[#93adc8] group-focus-within:text-primary transition-colors">
                                    <span className="material-symbols-outlined text-[20px]">person</span>
                                </div>
                                <input
                                    id="email"
                                    type="text"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="ex: gerente@restaurante.com.br"
                                    className="flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg text-slate-900 dark:text-white focus:outline-0 focus:ring-0 border border-slate-200 dark:border-border-dark bg-white dark:bg-surface-dark focus:border-primary dark:focus:border-primary h-12 lg:h-14 placeholder:text-slate-400 dark:placeholder:text-[#5a7b88] pl-11 pr-4 text-base font-normal leading-normal transition-all shadow-sm"
                                    required
                                />
                            </div>
                        </div>

                        <div className="flex flex-col gap-2">
                            <div className="flex justify-between items-center">
                                <label className="text-slate-700 dark:text-white text-sm font-semibold leading-normal" htmlFor="password">
                                    Senha
                                </label>
                                <a href="#" className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors">
                                    Esqueceu a senha?
                                </a>
                            </div>
                            <div className="relative flex w-full items-center group">
                                <div className="absolute left-0 top-0 bottom-0 pl-4 flex items-center pointer-events-none text-slate-400 dark:text-[#93adc8] group-focus-within:text-primary transition-colors">
                                    <span className="material-symbols-outlined text-[20px]">lock</span>
                                </div>
                                <input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Digite sua senha"
                                    className="flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg text-slate-900 dark:text-white focus:outline-0 focus:ring-0 border border-slate-200 dark:border-border-dark bg-white dark:bg-surface-dark focus:border-primary dark:focus:border-primary h-12 lg:h-14 placeholder:text-slate-400 dark:placeholder:text-[#5a7b88] pl-11 pr-12 text-base font-normal leading-normal transition-all shadow-sm"
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

                        {error && (
                            <p className="text-red-500 text-sm mt-1">{error}</p>
                        )}
                        <button
                            type="submit"
                            disabled={loading}
                            className="mt-4 flex w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg h-12 lg:h-14 px-4 bg-primary hover:bg-[#0ea5d6] text-[#111e22] text-base font-bold leading-normal tracking-[0.015em] transition-all duration-200 transform active:scale-[0.99] shadow-[0_4px_14px_0_rgba(19,182,236,0.39)] disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <span className="material-symbols-outlined animate-spin">progress_activity</span>
                            ) : (
                                <span className="truncate">Entrar no Sistema</span>
                            )}
                        </button>
                    </form>

                    <div className="flex flex-col gap-6 items-center justify-center mt-2">
                        <div className="flex items-center w-full gap-4 mt-6">
                            <div className="h-px flex-1 bg-slate-200 dark:bg-border-dark"></div>
                            <span className="text-xs font-medium text-slate-400 dark:text-[#5a7b88] uppercase tracking-wider">Ou</span>
                            <div className="h-px flex-1 bg-slate-200 dark:bg-border-dark"></div>
                        </div>

                        <p className="text-slate-500 dark:text-[#93adc8] text-sm text-center">
                            Novo gerente?{" "}
                            <a className="font-bold text-slate-700 dark:text-white hover:text-primary transition-colors" href="#">
                                Solicite seu acesso aqui
                            </a>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
