import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getBrazilNow } from '@/lib/utils/brazil-date';
import { filterChecklistsByRecurrence } from '@/lib/utils/should-checklist-appear-today';
import type { ReceivingTemplate } from '@/lib/types';

const getAdminSupabase = () =>
    createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

/**
 * GET /api/receiving-templates/available?restaurant_id=...&area_id=...
 *
 * Lista templates disponíveis HOJE para o usuário corrente.
 * Filtros aplicados, em ordem:
 *   1. restaurant_id + active=true
 *   2. recorrência bate com hoje (via filterChecklistsByRecurrence)
 *   3. escopo do user:
 *      - assigned_to_user_id preenchido → match user.id
 *      - role_id preenchido → user precisa ter esse role
 *      - senão → user precisa pertencer à area_id (via user_areas)
 *   4. area_id opcional do query string para limitar a uma área
 *
 * Resposta: ReceivingTemplate[] + tasks_count.
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const restaurant_id = searchParams.get('restaurant_id');
        const filterAreaId = searchParams.get('area_id');
        const withMeta = searchParams.get('with_meta') === '1';

        if (!restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório.' }, { status: 400 });
        }

        const authHeader = request.headers.get('Authorization');
        if (!authHeader) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        const token = authHeader.replace('Bearer ', '');
        const adminSupabase = getAdminSupabase();

        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);
        if (userError || !user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });

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

        // Escopo do user: áreas e roles dele
        const [{ data: userAreas }, { data: userRoles }] = await Promise.all([
            adminSupabase.from('user_areas').select('area_id').eq('restaurant_id', restaurant_id).eq('user_id', user.id),
            adminSupabase.from('user_roles').select('role_id').eq('restaurant_id', restaurant_id).eq('user_id', user.id),
        ]);
        const userAreaIds = (userAreas ?? []).map((r) => r.area_id);
        const userRoleIds = (userRoles ?? []).map((r) => r.role_id);

        if (userAreaIds.length === 0) {
            return NextResponse.json(withMeta ? { available: [], total_in_scope: 0 } : []);
        }

        // Filtro OR no escopo (assignment_type implícito)
        const scopeParts: string[] = [];
        scopeParts.push(`and(assigned_to_user_id.is.null,role_id.is.null,area_id.in.(${userAreaIds.join(',')}))`);
        if (userRoleIds.length > 0) {
            scopeParts.push(`and(role_id.in.(${userRoleIds.join(',')}),area_id.in.(${userAreaIds.join(',')}))`);
        }
        scopeParts.push(`assigned_to_user_id.eq.${user.id}`);

        let query = adminSupabase
            .from('receiving_templates')
            .select('*, area:areas(id, name, color), role:roles(id, name, color), tasks_count:receiving_template_tasks(count)')
            .eq('restaurant_id', restaurant_id)
            .eq('active', true)
            .or(scopeParts.join(','));

        if (filterAreaId) query = query.eq('area_id', filterAreaId);

        const [templatesRes, shiftsRes] = await Promise.all([
            query,
            adminSupabase.from('shifts').select('shift_type, days_of_week').eq('restaurant_id', restaurant_id).eq('active', true),
        ]);

        if (templatesRes.error) {
            console.error('[GET /api/receiving-templates/available]', templatesRes.error);
            return NextResponse.json({ error: templatesRes.error.message }, { status: 500 });
        }

        const brazil = getBrazilNow();
        const templates = (templatesRes.data ?? []) as Array<ReceivingTemplate & {
            tasks_count?: Array<{ count: number }> | number;
        }>;

        const visible = filterChecklistsByRecurrence(
            templates,
            brazil.dayOfWeek,
            brazil.dateKey,
            shiftsRes.data ?? [],
        );

        // Normaliza tasks_count para number
        const normalized = visible.map((t) => {
            const rawCount = (t as { tasks_count?: Array<{ count: number }> | number }).tasks_count;
            const count = Array.isArray(rawCount) ? (rawCount[0]?.count ?? 0) : (rawCount ?? 0);
            return { ...t, tasks_count: count };
        });

        if (withMeta) {
            // total_in_scope = templates ativos no escopo do user (área/role/usuário),
            // independente da recorrência do dia. Permite distinguir:
            //   A) zero templates cadastrados na área → "Nenhum modelo cadastrado"
            //   B) templates existem mas nenhum previsto hoje → "Nada previsto hoje"
            //   C) templates disponíveis → fluxo normal
            return NextResponse.json({
                available: normalized,
                total_in_scope: templates.length,
            });
        }
        return NextResponse.json(normalized);
    } catch (error: unknown) {
        console.error('[GET /api/receiving-templates/available] inesperado:', error);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}
