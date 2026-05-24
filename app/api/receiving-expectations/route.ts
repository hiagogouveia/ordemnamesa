import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getBrazilDateKey } from '@/lib/utils/brazil-date';
import { materializeReceivingForToday } from '@/lib/receiving/materialize';

const getAdminSupabase = () =>
    createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

/**
 * GET /api/receiving-expectations
 *
 * Lista expectativas de recebimento visíveis ao usuário atual, respeitando
 * a mesma lógica de área do Meu Turno. Materializa o dia atual de forma
 * lazy antes de listar, garantindo que rotinas recurring apareçam sem
 * depender de cron.
 *
 * Query params:
 *   restaurant_id (obrigatório)
 *   date          (opcional, default = hoje em fuso de São Paulo)
 *   status        (opcional, csv: pending|confirmed|overdue|cancelled, default = confirmed,overdue)
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const restaurant_id = searchParams.get('restaurant_id');
        if (!restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório' }, { status: 400 });
        }

        const date = searchParams.get('date') || getBrazilDateKey();
        const statusFilter = (searchParams.get('status') || 'confirmed,overdue')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);

        const authHeader = request.headers.get('Authorization');
        if (!authHeader) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const token = authHeader.replace('Bearer ', '');
        const adminSupabase = getAdminSupabase();

        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);
        if (userError || !user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        // Membership check (mesmo padrão de my-activities/assume)
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

        // Materialização lazy do dia (idempotente). Só faz sentido para 'hoje'.
        // Para datas passadas/futuras, apenas lista o que já existe.
        const todayKey = getBrazilDateKey();
        if (date === todayKey) {
            try {
                await materializeReceivingForToday(adminSupabase, restaurant_id);
            } catch (err) {
                // Materialização falhou? Não bloqueia a leitura — degrada graciosamente.
                console.error('[GET /api/receiving-expectations] materialize falhou:', err);
            }
        }

        // Áreas do usuário (mesmo filtro do Meu Turno)
        const { data: userAreaRows } = await adminSupabase
            .from('user_areas')
            .select('area_id')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id);
        const areaIds = (userAreaRows ?? []).map((r) => r.area_id);

        // Owner/manager veem tudo do restaurante; staff só de áreas atribuídas.
        const isOwnerOrManager = membership.role === 'owner' || membership.role === 'manager';
        if (!isOwnerOrManager && areaIds.length === 0) {
            return NextResponse.json([]);
        }

        const query = adminSupabase
            .from('receiving_expectations')
            .select(`
                id,
                restaurant_id,
                checklist_id,
                expected_date,
                expected_window_start,
                expected_window_end,
                status,
                assumption_id,
                confirmed_at,
                created_at,
                checklist:checklists(id, name, supplier_name, area_id, area:areas(id, name, color))
            `)
            .eq('restaurant_id', restaurant_id)
            .eq('expected_date', date)
            .in('status', statusFilter)
            .order('expected_window_start', { ascending: true, nullsFirst: false });

        const { data, error } = await query;
        if (error) {
            console.error('[GET /api/receiving-expectations] query error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Filtro de área para staff (post-query — Supabase REST não filtra por relação aninhada facilmente)
        const filtered = isOwnerOrManager
            ? (data ?? [])
            : (data ?? []).filter((row) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const cl = (row as any).checklist as { area_id?: string | null } | null;
                  const aid = cl?.area_id ?? null;
                  return aid !== null && areaIds.includes(aid);
              });

        return NextResponse.json(filtered);
    } catch (err) {
        console.error('[GET /api/receiving-expectations] erro:', err);
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    }
}
