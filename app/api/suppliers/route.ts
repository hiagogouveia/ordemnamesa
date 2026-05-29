import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Supplier } from '@/lib/types';

const getAdminSupabase = () =>
    createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

/**
 * GET /api/suppliers?restaurant_id=...&include_inactive=true
 *
 * Lista fornecedores do restaurante. Visível para qualquer membro
 * (staff usa no picker de "Novo recebimento" para escolher fornecedor).
 *
 * Por padrão retorna só active=true. include_inactive=true retorna todos
 * (exige owner/manager — usado na tela de gestão).
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const restaurant_id = searchParams.get('restaurant_id');
        const includeInactive = searchParams.get('include_inactive') === 'true';

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

        if (includeInactive && membership.role === 'staff') {
            return NextResponse.json({ error: 'Permissão negada.' }, { status: 403 });
        }

        let query = adminSupabase
            .from('suppliers')
            .select('*')
            .eq('restaurant_id', restaurant_id)
            .order('name', { ascending: true });

        if (!includeInactive) {
            query = query.eq('active', true);
        }

        const { data, error } = await query;

        if (error) {
            console.error('[GET /api/suppliers] Erro:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json((data ?? []) as Supplier[]);
    } catch (error: unknown) {
        console.error('[GET /api/suppliers] Erro inesperado:', error);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}

/**
 * POST /api/suppliers
 *
 * Cria um fornecedor. Qualquer membro do restaurante pode criar (staff usa
 * no fluxo "cadastrar fornecedor inline" durante novo recebimento).
 *
 * Body: { restaurant_id, name, cnpj? }
 */
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

        const body = await request.json().catch(() => ({}));
        const { restaurant_id, name, cnpj } = body as { restaurant_id?: string; name?: string; cnpj?: string | null };

        if (!restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório.' }, { status: 400 });
        }
        const cleanName = (name ?? '').trim();
        if (!cleanName) {
            return NextResponse.json({ error: 'name é obrigatório.' }, { status: 400 });
        }

        const cleanCnpj = cnpj ? cnpj.trim().replace(/[^\d]/g, '') : null;
        if (cleanCnpj && cleanCnpj.length !== 14) {
            return NextResponse.json({ error: 'CNPJ deve ter 14 dígitos.' }, { status: 400 });
        }

        const { data: membership } = await adminSupabase
            .from('restaurant_users')
            .select('role')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .eq('active', true)
            .single();

        if (!membership) {
            return NextResponse.json({ error: 'Sem acesso a este restaurante.' }, { status: 403 });
        }

        const { data: supplier, error } = await adminSupabase
            .from('suppliers')
            .insert({
                restaurant_id,
                name: cleanName,
                cnpj: cleanCnpj,
                created_by: user.id,
            })
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                return NextResponse.json(
                    { error: 'Já existe um fornecedor com esse nome neste restaurante.' },
                    { status: 409 },
                );
            }
            console.error('[POST /api/suppliers] Erro:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(supplier as Supplier, { status: 201 });
    } catch (error: unknown) {
        console.error('[POST /api/suppliers] Erro inesperado:', error);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}
