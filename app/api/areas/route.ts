import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Area } from '@/lib/types';

const getAdminSupabase = () =>
    createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const restaurant_id = searchParams.get('restaurant_id');
        // scope=all → return all restaurant areas (for admin management views)
        // scope omitted → return only the user's own areas (for filter bars)
        const scope = searchParams.get('scope'); // 'all' | null

        if (!restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório' }, { status: 400 });
        }

        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Não autorizado. Token ausente.' }, { status: 401 });
        }
        const token = authHeader.replace('Bearer ', '');
        const adminSupabase = getAdminSupabase();

        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);
        if (userError || !user) {
            return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        }

        const { data: membership } = await adminSupabase
            .from('restaurant_users')
            .select('role')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .eq('active', true)
            .single();

        if (!membership) {
            return NextResponse.json({ error: 'Acesso ao restaurante não encontrado.' }, { status: 403 });
        }

        const userRole = membership.role as 'owner' | 'manager' | 'staff';

        // scope=all: return all areas (requires owner or manager role)
        if (scope === 'all') {
            if (userRole === 'staff') {
                return NextResponse.json({ error: 'Permissão negada.' }, { status: 403 });
            }
            const { data: areas, error } = await adminSupabase
                .from('areas')
                .select('*')
                .eq('restaurant_id', restaurant_id)
                .order('name', { ascending: true });

            if (error) {
                console.error('[GET /api/areas] Erro ao buscar todas as áreas:', error);
                return NextResponse.json({ error: error.message }, { status: 500 });
            }
            return NextResponse.json(areas || []);
        }

        // Default: return only the user's assigned areas
        // OWNER exception: sees all areas (manages everything)
        if (userRole === 'owner') {
            const { data: areas, error } = await adminSupabase
                .from('areas')
                .select('*')
                .eq('restaurant_id', restaurant_id)
                .order('name', { ascending: true });

            if (error) {
                console.error('[GET /api/areas] Erro ao buscar áreas do owner:', error);
                return NextResponse.json({ error: error.message }, { status: 500 });
            }
            return NextResponse.json(areas || []);
        }

        // For manager and staff: return only areas they belong to
        const { data: userAreaRows } = await adminSupabase
            .from('user_areas')
            .select('area:areas(*)')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id);

        const areas = (userAreaRows ?? [])
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((row: any) => row.area)
            .filter(Boolean)
            .sort((a: Area, b: Area) => a.name.localeCompare(b.name));

        return NextResponse.json(areas);
    } catch (error: unknown) {
        console.error('[GET /api/areas] Erro inesperado:', error);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Não autorizado. Token ausente.' }, { status: 401 });
        }
        const token = authHeader.replace('Bearer ', '');
        const adminSupabase = getAdminSupabase();

        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);
        if (userError || !user) {
            return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        }

        const body = await request.json();
        const { restaurant_id, name, description, color } = body as Partial<Area>;
        const rawMaxTasks = body.max_parallel_tasks;

        if (!restaurant_id || !name) {
            return NextResponse.json({ error: 'restaurant_id e name são obrigatórios.' }, { status: 400 });
        }

        // Validar max_parallel_tasks: null/undefined OK, inteiro >= 1 OK
        const maxParallelTasks = rawMaxTasks == null ? null : Number(rawMaxTasks);
        if (maxParallelTasks !== null && (!Number.isInteger(maxParallelTasks) || maxParallelTasks < 1)) {
            return NextResponse.json({ error: 'max_parallel_tasks deve ser null ou um inteiro >= 1.' }, { status: 400 });
        }

        const { data: userRole } = await adminSupabase
            .from('restaurant_users')
            .select('role')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .eq('active', true)
            .single();

        if (!userRole || userRole.role === 'staff') {
            return NextResponse.json({ error: 'Permissão negada. Apenas gerentes e proprietários podem criar áreas.' }, { status: 403 });
        }

        const { data: area, error } = await adminSupabase
            .from('areas')
            .insert({
                restaurant_id,
                name: name.trim(),
                description: description?.trim() || null,
                color: color || '#13b6ec',
                max_parallel_tasks: maxParallelTasks,
            })
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                return NextResponse.json({ error: 'Já existe uma área com esse nome neste restaurante.' }, { status: 409 });
            }
            console.error('[POST /api/areas] Erro ao criar área:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(area, { status: 201 });
    } catch (error: unknown) {
        console.error('[POST /api/areas] Erro inesperado:', error);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}
