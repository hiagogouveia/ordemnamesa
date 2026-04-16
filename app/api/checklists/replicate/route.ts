import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

interface ReplicateBody {
    checklist_ids?: unknown;
    target_restaurant_ids?: unknown;
}

interface ReplicationRow {
    target_restaurant_id: string;
    source_checklist_id: string;
    status: 'created' | 'skipped' | 'error';
    new_checklist_id: string | null;
    error_message: string | null;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseUuidArray(raw: unknown): string[] | null {
    if (!Array.isArray(raw)) return null;
    const out: string[] = [];
    for (const v of raw) {
        if (typeof v !== 'string' || !UUID_REGEX.test(v)) return null;
        out.push(v);
    }
    return out;
}

function getAdminSupabase(): SupabaseClient {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

function getUserSupabase(token: string): SupabaseClient {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false, autoRefreshToken: false },
        }
    );
}

export async function POST(request: Request) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        }
        const token = authHeader.replace('Bearer ', '');

        const adminSupabase = getAdminSupabase();
        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);
        if (userError || !user) {
            return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        }

        const body: ReplicateBody = await request.json().catch(() => ({}));
        const checklistIds = parseUuidArray(body.checklist_ids);
        const targetRestaurantIds = parseUuidArray(body.target_restaurant_ids);

        if (!checklistIds || checklistIds.length === 0) {
            return NextResponse.json(
                { error: 'checklist_ids é obrigatório e deve conter UUIDs válidos.' },
                { status: 400 }
            );
        }
        if (!targetRestaurantIds || targetRestaurantIds.length === 0) {
            return NextResponse.json(
                { error: 'target_restaurant_ids é obrigatório e deve conter UUIDs válidos.' },
                { status: 400 }
            );
        }

        const userSupabase = getUserSupabase(token);
        const { data, error } = await userSupabase.rpc('replicate_checklists', {
            p_checklist_ids: checklistIds,
            p_target_restaurant_ids: targetRestaurantIds,
        });

        if (error) {
            const status = error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : 400;
            return NextResponse.json({ error: error.message }, { status });
        }

        const rows = (data ?? []) as ReplicationRow[];
        const summary = {
            created: rows.filter((r) => r.status === 'created').length,
            skipped: rows.filter((r) => r.status === 'skipped').length,
            errors: rows.filter((r) => r.status === 'error').length,
        };

        return NextResponse.json({ results: rows, summary });
    } catch (error: unknown) {
        console.error('[POST /api/checklists/replicate] Erro inesperado:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
