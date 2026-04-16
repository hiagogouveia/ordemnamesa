import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type AccountMode = 'single' | 'global'

export interface AccountSessionStore {
    accountId: string | null
    accountName: string | null
    mode: AccountMode
    setAccount: (data: { id: string; name: string }) => void
    setMode: (mode: AccountMode) => void
    clearAccount: () => void
}

export const useAccountSessionStore = create<AccountSessionStore>()(
    persist(
        (set) => ({
            accountId: null,
            accountName: null,
            mode: 'single',
            setAccount: (data) =>
                set({
                    accountId: data.id,
                    accountName: data.name,
                    mode: 'single',
                }),
            setMode: (mode) => set({ mode }),
            clearAccount: () =>
                set({
                    accountId: null,
                    accountName: null,
                    mode: 'single',
                }),
        }),
        {
            name: 'account-session',
            storage: createJSONStorage(() => sessionStorage),
            partialize: (state) => ({
                accountId: state.accountId,
                accountName: state.accountName,
                mode: state.mode,
            }),
        }
    )
)
