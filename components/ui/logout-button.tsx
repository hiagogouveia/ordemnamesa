'use client'

import { useRestaurantStore } from '@/lib/store/restaurant-store'

export function LogoutButton() {
    const clearRestaurant = useRestaurantStore((state) => state.clearRestaurant)

    const handleLogout = async () => {
        clearRestaurant()

        // Limpar cookies de contexto do restaurante
        const expired = 'expires=Thu, 01 Jan 1970 00:00:01 GMT; path=/; SameSite=Strict';
        document.cookie = `x-restaurant-role=; ${expired}`;
        document.cookie = `x-restaurant-id=; ${expired}`;
        document.cookie = `x-restaurant-name=; ${expired}`;
        document.cookie = `x-restaurant-slug=; ${expired}`;

        // Calls the sign out API route
        await fetch('/api/auth/signout', {
            method: 'POST',
        })

        // Redirect happens on the client to ensure proper state clearing
        window.location.href = '/login'
    }

    return (
        <div
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-3 text-[#92bbc9] hover:text-white cursor-pointer transition-colors"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Space') {
                    handleLogout()
                }
            }}
        >
            <span className="material-symbols-outlined">logout</span>
            <p className="text-sm font-medium leading-normal">Sair</p>
        </div>
    )
}
