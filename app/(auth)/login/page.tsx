"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
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

        router.push("/selecionar-restaurante");
    };

    return (
        <div className="flex flex-1 min-h-screen w-full overflow-hidden font-sans">
            {/* Left Side: Hero/Visual (Desktop only) */}
            <div
                className="hidden lg:flex lg:w-1/2 relative flex-col justify-between p-12 bg-cover bg-center"
                title="Chef focused on tablet in a professional dark modern kitchen"
                style={{
                    backgroundImage: 'linear-gradient(135deg, rgba(16, 29, 34, 0.85) 0%, rgba(19, 182, 236, 0.15) 100%), url("https://lh3.googleusercontent.com/aida-public/AB6AXuCg8U_knVO_aLFmbysfseFa-c0Wo4w2SXpyjYmR5g_l42K0HEvFiHqT4REa6CS_ZMJ1XON5fm3ylaRwYzmehb27CY7NTBcEm7KmIX5hObewmOzB3Xx_xGGgEOR4AmTodClW89OFDhrqMca73R7zVpiUqEH0Af7YK9Nxh4IYfVkBl_-LZ_VjVHn_JBsaLHzxaa3rOvwK6_3hCxCeaWe5L_E7DOTDnzf_mtOE0CllDGxBP1oS4QZLmqgkV69jOGKigFuyNAeGXg3DgipA")'
                }}
            >
                <div className="relative z-10 flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[#13b6ec] text-[#111e22] shadow-lg shadow-[#13b6ec]/20">
                        <span className="material-symbols-outlined text-[24px]">restaurant</span>
                    </div>
                    <span className="text-white text-xl font-bold tracking-tight">Restaurante Gestão</span>
                </div>

                <div className="relative z-10 max-w-lg mb-12">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/10 backdrop-blur-md mb-6">
                        <span className="w-2 h-2 rounded-full bg-[#13b6ec] animate-pulse"></span>
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
            <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-6 lg:p-24 bg-[#101d22] relative">
                <div className="absolute top-0 right-0 p-8">
                    <a className="text-sm font-medium text-[#92bbc9] hover:text-[#13b6ec] transition-colors" href="#">Precisa de ajuda?</a>
                </div>

                <div className="w-full max-w-[440px] flex flex-col gap-8 animate-fade-in">
                    {/* Mobile Brand (Visible only on small screens) */}
                    <div className="lg:hidden flex items-center gap-2 mb-4 self-center">
                        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[#13b6ec] text-[#111e22]">
                            <span className="material-symbols-outlined text-[24px]">restaurant</span>
                        </div>
                        <h2 className="text-white text-lg font-bold">Restaurante Gestão</h2>
                    </div>

                    <div className="flex flex-col gap-2 text-center lg:text-left">
                        <h2 className="text-3xl font-bold text-white tracking-tight">Bem-vindo de volta</h2>
                        <p className="text-[#92bbc9] text-base">Insira suas credenciais para acessar o painel administrativo.</p>
                    </div>

                    {/* Login Form */}
                    <form className="flex flex-col gap-5" onSubmit={handleLogin}>
                        {/* Email Field */}
                        <div className="flex flex-col gap-2">
                            <label className="text-white text-sm font-semibold leading-normal" htmlFor="email">
                                E-mail ou Usuário
                            </label>
                            <div className="relative group">
                                <div className="absolute left-0 top-0 bottom-0 pl-4 flex items-center pointer-events-none text-[#92bbc9] group-focus-within:text-[#13b6ec] transition-colors">
                                    <span className="material-symbols-outlined text-[20px]">person</span>
                                </div>
                                <input
                                    className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg text-white focus:outline-0 focus:ring-1 border border-[#325a67] bg-[#192d33] focus:border-[#13b6ec] focus:ring-[#13b6ec] h-12 lg:h-14 placeholder:text-[#5a7b88] pl-11 pr-4 text-base font-normal leading-normal transition-all shadow-sm"
                                    id="email"
                                    placeholder="ex: gerente@restaurante.com.br"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                />
                            </div>
                        </div>

                        {/* Password Field */}
                        <div className="flex flex-col gap-2">
                            <div className="flex justify-between items-center">
                                <label className="text-white text-sm font-semibold leading-normal" htmlFor="password">
                                    Senha
                                </label>
                            </div>
                            <div className="relative flex w-full items-center group">
                                <div className="absolute left-0 top-0 bottom-0 pl-4 flex items-center pointer-events-none text-[#92bbc9] group-focus-within:text-[#13b6ec] transition-colors">
                                    <span className="material-symbols-outlined text-[20px]">lock</span>
                                </div>
                                <input
                                    className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-lg text-white focus:outline-0 focus:ring-1 border border-[#325a67] bg-[#192d33] focus:border-[#13b6ec] focus:ring-[#13b6ec] h-12 lg:h-14 placeholder:text-[#5a7b88] pl-11 pr-12 text-base font-normal leading-normal transition-all shadow-sm"
                                    id="password"
                                    placeholder="Digite sua senha"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="flex justify-end mt-1">
                                <a className="text-sm font-semibold text-[#13b6ec] hover:text-[#13b6ec]/80 transition-colors" href="#">Esqueceu a senha?</a>
                            </div>
                        </div>

                        {error && (
                            <p className="text-red-500 text-sm mt-1">{error}</p>
                        )}

                        {/* Submit Button */}
                        <button
                            className="mt-4 flex w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg h-12 lg:h-14 px-4 bg-[#13b6ec] hover:bg-[#0ea5d6] text-[#111e22] text-base font-bold leading-normal tracking-[0.015em] transition-all duration-200 transform active:scale-[0.99] shadow-[0_4px_14px_0_rgba(19,182,236,0.39)] disabled:opacity-70 disabled:cursor-not-allowed"
                            type="submit"
                            disabled={loading}
                        >
                            {loading ? (
                                <span className="material-symbols-outlined animate-spin">progress_activity</span>
                            ) : (
                                <span className="truncate">Entrar no Sistema</span>
                            )}
                        </button>
                    </form>

                    {/* Bottom Links */}
                    <div className="flex flex-col gap-6 items-center justify-center mt-2">
                        <div className="flex items-center w-full gap-4">
                            <div className="h-px flex-1 bg-[#233f48]"></div>
                            <span className="text-xs font-medium text-[#5a7b88] uppercase tracking-wider">Ou</span>
                            <div className="h-px flex-1 bg-[#233f48]"></div>
                        </div>

                        <p className="text-[#92bbc9] text-sm text-center">
                            Novo gerente?{" "}
                            <a className="font-bold text-white hover:text-[#13b6ec] transition-colors" href="#">
                                Solicite seu acesso aqui
                            </a>
                        </p>

                        <div className="flex gap-6 mt-4">
                            <a className="text-[#5a7b88] hover:text-[#13b6ec] text-xs font-medium transition-colors" href="#">Termos de Uso</a>
                            <a className="text-[#5a7b88] hover:text-[#13b6ec] text-xs font-medium transition-colors" href="#">Política de Privacidade</a>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
