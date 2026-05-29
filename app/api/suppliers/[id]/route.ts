import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Supplier } from '@/lib/types';

const getAdminSupabase = () =>
    createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
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

/**
 * PATCH /api/suppliers/:id
 * Body: { restaurant_id, name?, cnpj?, active? }
 * Permissões: owner/manager.
 */
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params;
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        }
        const token = authHeader.replace('Bearer ', '');

        const body = await request.json().catch(() => ({}));
        const { restaurant_id, name, cnpj, active } = body as {
            restaurant_id?: string;
            name?: string;
            cnpj?: string | null;
            active?: boolean;
        };

        if (!restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório.' }, { status: 400 });
        }

        const { user, role, adminSupabase } = await resolveUserRole(token, restaurant_id);
        if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        if (!role || role === 'staff') {
            return NextResponse.json({ error: 'Permissão negada.' }, { status: 403 });
        }

        const updateData: Record<string, unknown> = {};
        if (name !== undefined) {
            const cleanName = name.trim();
            if (!cleanName) {
                return NextResponse.json({ error: 'name não pode ser vazio.' }, { status: 400 });
            }
            updateData.name = cleanName;
        }
        if (cnpj !== undefined) {
            if (cnpj === null || cnpj === '') {
                updateData.cnpj = null;
            } else {
                const cleanCnpj = cnpj.trim().replace(/[^\d]/g, '');
                if (cleanCnpj.length !== 14) {
                    return NextResponse.json({ error: 'CNPJ deve ter 14 dígitos.' }, { status: 400 });
                }
                updateData.cnpj = cleanCnpj;
            }
        }
        if (active !== undefined) updateData.active = !!active;

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json({ error: 'Nada para atualizar.' }, { status: 400 });
        }

        const { data, error } = await adminSupabase
            .from('suppliers')
            .update(updateData)
            .eq('id', id)
            .eq('restaurant_id', restaurant_id)
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                return NextResponse.json(
                    { error: 'Já existe um fornecedor com esse nome.' },
                    { status: 409 },
                );
            }
            console.error('[PATCH /api/suppliers/:id] Erro:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data as Supplier);
    } catch (error: unknown) {
        console.error('[PATCH /api/suppliers/:id] Erro inesperado:', error);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}

/**
 * DELETE /api/suppliers/:id?restaurant_id=...
 *
 * Arquiva o fornecedor (soft-delete, active=false). Não deleta porque
 * execuções históricas em `checklists` podem referenciar via supplier_id.
 * Reativação: PATCH com { active: true }.
 */
export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params;
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        }
        const token = authHeader.replace('Bearer ', '');

        const { searchParams } = new URL(request.url);
        const restaurant_id = searchParams.get('restaurant_id');
        if (!restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório.' }, { status: 400 });
        }

        const { user, role, adminSupabase } = await resolveUserRole(token, restaurant_id);
        if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        if (!role || role === 'staff') {
            return NextResponse.json({ error: 'Permissão negada.' }, { status: 403 });
        }

        const { error } = await adminSupabase
            .from('suppliers')
            .update({ active: false })
            .eq('id', id)
            .eq('restaurant_id', restaurant_id);

        if (error) {
            console.error('[DELETE /api/suppliers/:id] Erro:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        console.error('[DELETE /api/suppliers/:id] Erro inesperado:', error);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}
