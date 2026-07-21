import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type AccountMode = 'single' | 'global'

export interface AccountSessionStore {
    accountId: string | null
    accountName: string | null
    // Sprint 93 — `accounts.logo_path` (path no bucket 'brand', NÃO url).
    // Sustenta dois casos: fallback das filiais sem logo própria e a única marca
    // possível na Visão Global, onde não existe filial única a representar.
    accountLogoPath: string | null
    mode: AccountMode
    setAccount: (data: { id: string; name: string; logoPath?: string | null }) => void
    // Sprint 93 — atualiza só a logo do grupo (self-heal + resposta imediata ao upload).
    setAccountLogoPath: (logoPath: string | null) => void
    setMode: (mode: AccountMode) => void
    clearAccount: () => void
}

export const useAccountSessionStore = create<AccountSessionStore>()(
    persist(
        (set) => ({
            accountId: null,
            accountName: null,
            accountLogoPath: null,
            mode: 'single',
            setAccount: (data) =>
                set({
                    accountId: data.id,
                    accountName: data.name,
                    // Sprint 93 — SEMPRE escrito: `set()` faz merge raso, então omitir
                    // faria a logo do grupo anterior sobreviver à troca de conta.
                    accountLogoPath: data.logoPath ?? null,
                    mode: 'single',
                }),
            setAccountLogoPath: (logoPath) => set({ accountLogoPath: logoPath || null }),
            setMode: (mode) => set({ mode }),
            clearAccount: () =>
                set({
                    accountId: null,
                    accountName: null,
                    accountLogoPath: null,
                    mode: 'single',
                }),
        }),
        {
            name: 'account-session',
            storage: createJSONStorage(() => sessionStorage),
            partialize: (state) => ({
                accountId: state.accountId,
                accountName: state.accountName,
                accountLogoPath: state.accountLogoPath,
                mode: state.mode,
            }),
        }
    )
)
