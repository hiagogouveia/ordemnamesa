import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

interface AccountUnit {
    id: string;
    name: string;
}

export function useAccountUnits(accountId: string | undefined | null) {
    return useQuery<AccountUnit[]>({
        queryKey: ['account-units', accountId],
        queryFn: async () => {
            if (!accountId) return [];
            const supabase = createClient();
            const { data, error } = await supabase
                .from('restaurants')
                .select('id, name')
                .eq('account_id', accountId)
                .eq('active', true)
                .order('is_primary', { ascending: false })
                .order('created_at', { ascending: true });
            if (error || !data) return [];
            return data as AccountUnit[];
        },
        enabled: !!accountId,
        staleTime: 5 * 60 * 1000,
    });
}
