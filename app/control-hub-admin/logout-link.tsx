'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export function LogoutLink() {
    const router = useRouter()

    async function handleLogout() {
        const supabase = createClient()
        await supabase.auth.signOut()
        router.push('/control-hub-admin/login')
        router.refresh()
    }

    return (
        <button
            type="button"
            onClick={handleLogout}
            className="rounded-md border border-border-dark px-2.5 py-1 text-xs font-semibold text-text-secondary transition-colors hover:border-primary/40 hover:text-white"
        >
            Sair
        </button>
    )
}
