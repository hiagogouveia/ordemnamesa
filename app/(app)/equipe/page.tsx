"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useRestaurantStore } from '@/lib/store/restaurant-store';
import { useAccountSessionStore } from '@/lib/store/account-session-store';
import { EquipeClient } from './_components/equipe-client';

export default function EquipePage() {
    const { restaurantId, userRole } = useRestaurantStore();
    const accountId = useAccountSessionStore((s) => s.accountId);
    const accountMode = useAccountSessionStore((s) => s.mode);
    const isGlobal = accountMode === 'global';
    const router = useRouter();

    useEffect(() => {
        if (userRole === 'staff') router.replace('/turno');
    }, [userRole, router]);

    if (isGlobal && accountId) {
        return <EquipeClient restaurantId={null} accountId={accountId} isGlobal userRole={userRole ?? 'manager'} />;
    }

    if (!restaurantId || !userRole || userRole === 'staff') {
        return (
            <div className="flex-1 p-4 md:p-8 bg-[#101d22] animate-pulse">
                <div className="max-w-6xl mx-auto flex flex-col gap-6">
                    <div className="flex items-center justify-between">
                        <div className="h-8 w-48 rounded bg-[#233f48]" />
                        <div className="h-10 w-36 rounded-lg bg-[#233f48]" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="bg-[#1a2c32] rounded-xl p-5 border border-[#233f48] flex flex-col gap-3">
                                <div className="h-3 w-20 rounded bg-[#233f48]" />
                                <div className="h-8 w-14 rounded bg-[#233f48]" />
                            </div>
                        ))}
                    </div>
                    <div className="bg-[#1a2c32] rounded-xl border border-[#233f48] overflow-hidden">
                        <div className="h-14 bg-[#192d33] border-b border-[#233f48]" />
                        {[1, 2, 3, 4, 5].map(i => (
                            <div key={i} className="flex items-center gap-4 px-6 py-4 border-b border-[#233f48]">
                                <div className="size-10 rounded-full bg-[#233f48] shrink-0" />
                                <div className="flex flex-col gap-2 flex-1">
                                    <div className="h-3 w-32 rounded bg-[#233f48]" />
                                    <div className="h-2 w-48 rounded bg-[#233f48]" />
                                </div>
                                <div className="h-6 w-16 rounded-full bg-[#233f48]" />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return <EquipeClient restaurantId={restaurantId} userRole={userRole} />;
}

