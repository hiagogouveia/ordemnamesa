'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { removeStaffAction } from './actions'

export function RemoveStaffButton({ staffId }: { staffId: string }) {
    const router = useRouter()
    const [pending, start] = useTransition()

    function handle() {
        if (!confirm('Remover este membro do staff?')) return
        start(async () => {
            const r = await removeStaffAction(staffId)
            if (r.error) alert(r.error)
            else router.refresh()
        })
    }

    return (
        <button
            type="button"
            onClick={handle}
            disabled={pending}
            className="text-xs font-semibold text-red-300 transition-colors hover:text-red-200 hover:underline disabled:opacity-60"
        >
            {pending ? '…' : 'Remover'}
        </button>
    )
}
