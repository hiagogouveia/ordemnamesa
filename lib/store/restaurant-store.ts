import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

const FALLBACK_TZ = 'America/Sao_Paulo'

export interface RestaurantStore {
    restaurantId: string | null
    restaurantName: string | null
    restaurantSlug: string | null
    userRole: 'owner' | 'manager' | 'staff' | null
    // Sprint 73 — fuso operacional do restaurante atual (fonte da verdade no client).
    timezone: string
    // Sprint 93 — `restaurants.logo_path` da unidade ativa (path no bucket 'brand',
    // NÃO url). Resolvido para URL em lib/branding/resolve.ts.
    logoPath: string | null
    setRestaurant: (data: { id: string; name: string; slug: string; role: 'owner' | 'manager' | 'staff'; timezone?: string | null; logoPath?: string | null }) => void
    // Sprint 73 — atualiza só o fuso (self-heal quando muda no banco sem relogin).
    setTimezone: (timezone: string) => void
    // Sprint 93 — atualiza só a logo (self-heal + resposta imediata ao upload).
    setLogoPath: (logoPath: string | null) => void
    clearRestaurant: () => void
}

export const useRestaurantStore = create<RestaurantStore>()(
    persist(
        (set) => ({
            restaurantId: null,
            restaurantName: null,
            restaurantSlug: null,
            userRole: null,
            timezone: FALLBACK_TZ,
            logoPath: null,
            setRestaurant: (data) =>
                set({
                    restaurantId: data.id,
                    restaurantName: data.name,
                    restaurantSlug: data.slug,
                    userRole: data.role,
                    timezone: data.timezone || FALLBACK_TZ,
                    // Sprint 93 — SEMPRE escrito, mesmo quando o chamador omite.
                    // `set()` faz merge raso: um campo não atribuído SOBREVIVE à troca
                    // de restaurante, então omitir aqui faria a logo do tenant anterior
                    // vazar para o próximo (A com logo → C sem logo mostraria a de A).
                    logoPath: data.logoPath ?? null,
                }),
            setTimezone: (timezone) => set({ timezone: timezone || FALLBACK_TZ }),
            setLogoPath: (logoPath) => set({ logoPath: logoPath || null }),
            clearRestaurant: () =>
                set({
                    restaurantId: null,
                    restaurantName: null,
                    restaurantSlug: null,
                    userRole: null,
                    timezone: FALLBACK_TZ,
                    // Sprint 93 — `enterGlobal()` chama clearRestaurant(): sem zerar
                    // aqui, a Visão Global exibiria a logo da última filial visitada.
                    logoPath: null,
                }),
        }),
        {
            name: 'restaurant-session',
            storage: createJSONStorage(() => sessionStorage),
            partialize: (state) => ({
                restaurantId: state.restaurantId,
                restaurantName: state.restaurantName,
                restaurantSlug: state.restaurantSlug,
                userRole: state.userRole,
                timezone: state.timezone,
                logoPath: state.logoPath,
            }),
        }
    )
)
