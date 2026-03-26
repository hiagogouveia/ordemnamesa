import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Area } from '@/lib/types';

const getAdminSupabase = () =>
    createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

async function resolveUserRole(token: string, restaurantId: string) {
    const adminSupabase = getAdminSupabase();
    const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);
    if (userError || !user) return { user: null, role: null, adminSupabase };

    const { data: userRole } = await adminSupabase
        .from('restaurant_users')
        .select('role')
        .eq('restaurant_id', restaurantId)
        .eq('user_id', user.id)
        .eq('active', true)
        .single();

    return { user, role: userRole?.role ?? null, adminSupabase };
}

export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Não autorizado. Token ausente.' }, { status: 401 });
        }
        const token = authHeader.replace('Bearer ', '');

        const body = await request.json();
        const { restaurant_id, name, description, color } = body as Partial<Area>;

        if (!restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório.' }, { status: 400 });
        }

        const { user, role, adminSupabase } = await resolveUserRole(token, restaurant_id);
        if (!user) {
            return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        }
        if (!role || role === 'staff') {
            return NextResponse.json({ error: 'Permissão negada.' }, { status: 403 });
        }

        const updateData: Partial<Area> = {};
        if (name !== undefined) updateData.name = name.trim();
        if (description !== undefined) updateData.description = description?.trim() || null;
        if (color !== undefined) updateData.color = color;

        const { data: area, error } = await adminSupabase
            .from('areas')
            .update(updateData)
            .eq('id', id)
            .eq('restaurant_id', restaurant_id)
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                return NextResponse.json({ error: 'Já existe uma área com esse nome.' }, { status: 409 });
            }
            console.error('[PUT /api/areas/:id] Erro ao atualizar área:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(area);
    } catch (error: unknown) {
        console.error('[PUT /api/areas/:id] Erro inesperado:', error);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Não autorizado. Token ausente.' }, { status: 401 });
        }
        const token = authHeader.replace('Bearer ', '');

        const { searchParams } = new URL(request.url);
        const restaurant_id = searchParams.get('restaurant_id');
        if (!restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório.' }, { status: 400 });
        }

        const { user, role, adminSupabase } = await resolveUserRole(token, restaurant_id);
        if (!user) {
            return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        }
        if (role !== 'owner') {
            return NextResponse.json({ error: 'Apenas proprietários podem excluir áreas.' }, { status: 403 });
        }

        const { error } = await adminSupabase
            .from('areas')
            .delete()
            .eq('id', id)
            .eq('restaurant_id', restaurant_id);

        if (error) {
            console.error('[DELETE /api/areas/:id] Erro ao excluir área:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        console.error('[DELETE /api/areas/:id] Erro inesperado:', error);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}
