'use client';

import { useEffect } from 'react';
import { boot } from '@/lib/photo-trace';

export function PhotoTraceProvider() {
    useEffect(() => {
        boot();
    }, []);
    return null;
}
