import { create } from 'zustand'

export interface RestaurantStore {
    restaurantId: string | null
    restaurantName: string | null
    restaurantSlug: string | null
    userRole: 'owner' | 'manager' | 'staff' | null
    setRestaurant: (data: { id: string; name: string; slug: string; role: 'owner' | 'manager' | 'staff' }) => void
    clearRestaurant: () => void
}

export const useRestaurantStore = create<RestaurantStore>((set) => ({
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
}))
