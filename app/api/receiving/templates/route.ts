import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { canExecuteChecklist } from '@/lib/utils/checklist-visibility';

const getAdminSupabase = () =>
    createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

/**
 * GET /api/receiving/templates?restaurant_id=...
 *
 * Lista rotinas de Recebimento que o usuário pode iniciar manualmente via
 * "Novo recebimento" no Meu Turno. Aplica mesmo filtro de área de my-activities.
 *
 * Inclui receiving_mode='on_demand' (caso principal) e também 'recurring'
 * — colaborador pode registrar um recebimento ad-hoc fora da janela esperada.
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const restaurant_id = searchParams.get('restaurant_id');
        if (!restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório' }, { status: 400 });
        }

        const authHeader = request.headers.get('Authorization');
        if (!authHeader) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        const token = authHeader.replace('Bearer ', '');
        const adminSupabase = getAdminSupabase();

        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);
        if (userError || !user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const { data: membership } = await adminSupabase
            .from('restaurant_users')
            .select('role')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .eq('active', true)
            .single();
        if (!membership) {
            return NextResponse.json({ error: 'Sem acesso a este restaurante' }, { status: 403 });
        }

        // Contexto operacional: sem bypass para owner/manager. Mesma regra de visibilidade
        // do kanban/expectations — área + cargo + atribuição individual.
        const [areasRes, rolesRes] = await Promise.all([
            adminSupabase
                .from('user_areas')
                .select('area_id')
                .eq('restaurant_id', restaurant_id)
                .eq('user_id', user.id),
            adminSupabase
                .from('user_roles')
                .select('role_id')
                .eq('restaurant_id', restaurant_id)
                .eq('user_id', user.id),
        ]);
        const areaIds = (areasRes.data ?? []).map((r) => r.area_id);
        const roleIds = (rolesRes.data ?? []).map((r) => r.role_id);

        if (areaIds.length === 0) {
            return NextResponse.json([]);
        }

        const { data, error } = await adminSupabase
            .from('checklists')
            .select('id, name, supplier_name, area_id, assigned_to_user_id, role_id, receiving_mode, area:areas(id, name, color)')
            .eq('restaurant_id', restaurant_id)
            .eq('checklist_type', 'receiving')
            .eq('active', true)
            .eq('status', 'active')
            .in('area_id', areaIds)
            .order('name', { ascending: true });

        if (error) {
            console.error('[GET /api/receiving/templates] erro:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Filtro fino post-query (assigned_to_user_id + role_id).
        const filtered = (data ?? []).filter((c) =>
            canExecuteChecklist(c, { userId: user.id, areaIds, roleIds }),
        );

        return NextResponse.json(filtered);
    } catch (err) {
        console.error('[GET /api/receiving/templates] erro:', err);
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    }
}
