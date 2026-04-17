import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface RestaurantStore {
    restaurantId: string | null
    restaurantName: string | null
    restaurantSlug: string | null
    userRole: 'owner' | 'manager' | 'staff' | null
    setRestaurant: (data: { id: string; name: string; slug: string; role: 'owner' | 'manager' | 'staff' }) => void
    clearRestaurant: () => void
}

export const useRestaurantStore = create<RestaurantStore>()(
    persist(
        (set) => ({
            restaurantId: null,
            restaurantName: null,
            restaurantSlug: null,
            userRole: null,
            setRestaurant: (data) =>
                set({
                    restaurantId: data.id,
                    restaurantName: data.name,
                    restaurantSlug: data.slug,
                    userRole: data.role,
                }),
            clearRestaurant: () =>
                set({
                    restaurantId: null,
                    restaurantName: null,
                    restaurantSlug: null,
                    userRole: null,
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
            }),
        }
    )
)
