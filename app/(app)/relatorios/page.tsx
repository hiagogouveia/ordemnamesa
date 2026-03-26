"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useRestaurantStore } from '@/lib/store/restaurant-store';
import { RelatoriosClient } from './_components/relatorios-client';

export default function RelatoriosPage() {
    const { restaurantId, userRole } = useRestaurantStore();
    const router = useRouter();

    useEffect(() => {
        if (userRole === 'staff') router.replace('/turno');
    }, [userRole, router]);

    if (!restaurantId || !userRole || userRole === 'staff') {
        return (
            <div className="flex-1 p-4 md:p-8 bg-[#101d22] animate-pulse">
                <div className="max-w-5xl mx-auto flex flex-col gap-6">
                    <div className="flex items-center justify-between">
                        <div className="h-8 w-40 rounded bg-[#233f48]" />
                        <div className="h-10 w-28 rounded-lg bg-[#233f48]" />
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className="bg-[#1a2c32] rounded-xl p-5 border border-[#233f48] flex flex-col gap-3">
                                <div className="h-3 w-20 rounded bg-[#233f48]" />
                                <div className="h-8 w-14 rounded bg-[#233f48]" />
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-[#1a2c32] rounded-xl border border-[#233f48] overflow-hidden">
                            <div className="h-12 bg-[#192d33] border-b border-[#233f48]" />
                            {[1, 2, 3].map(i => (
                                <div key={i} className="flex items-center gap-3 px-5 py-4 border-b border-[#233f48]">
                                    <div className="size-10 rounded-full bg-[#233f48] shrink-0" />
                                    <div className="flex-1 flex flex-col gap-2">
                                        <div className="h-3 w-28 rounded bg-[#233f48]" />
                                        <div className="h-2 w-full rounded-full bg-[#233f48]" />
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="bg-[#1a2c32] rounded-xl border border-[#233f48] overflow-hidden">
                            <div className="h-12 bg-[#192d33] border-b border-[#233f48]" />
                            {[1, 2, 3, 4].map(i => (
                                <div key={i} className="flex items-center gap-3 px-5 py-4 border-b border-[#233f48]">
                                    <div className="size-6 rounded-full bg-[#233f48] shrink-0" />
                                    <div className="flex-1 h-3 rounded bg-[#233f48]" />
                                    <div className="h-5 w-16 rounded-full bg-[#233f48]" />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return <RelatoriosClient restaurantId={restaurantId} />;
}
