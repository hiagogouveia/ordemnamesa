'use client';

import { useState, useEffect } from 'react';
import { getPhotoSignedUrl } from '@/lib/supabase/storage';

/** Resolve um path de storage em uma signed URL. Retorna null enquanto carrega ou se falhar. */
export function useSignedUrl(filePath: string | null | undefined): string | null {
    const [url, setUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!filePath) {
            setUrl(null);
            return;
        }

        let cancelled = false;

        getPhotoSignedUrl(filePath).then((signed) => {
            if (!cancelled) setUrl(signed);
        });

        return () => { cancelled = true; };
    }, [filePath]);

    return url;
}
