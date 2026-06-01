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
    setRestaurant: (data: { id: string; name: string; slug: string; role: 'owner' | 'manager' | 'staff'; timezone?: string | null }) => void
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
            setRestaurant: (data) =>
                set({
                    restaurantId: data.id,
                    restaurantName: data.name,
                    restaurantSlug: data.slug,
                    userRole: data.role,
                    timezone: data.timezone || FALLBACK_TZ,
                }),
            clearRestaurant: () =>
                set({
                    restaurantId: null,
                    restaurantName: null,
                    restaurantSlug: null,
                    userRole: null,
                    timezone: FALLBACK_TZ,
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
            }),
        }
    )
)
