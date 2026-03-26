import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const getAdminSupabase = () =>
    createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const restaurant_id = searchParams.get('restaurant_id');

        if (!restaurant_id) return NextResponse.json({ pending: 0 });

        const authHeader = request.headers.get('Authorization');
        if (!authHeader) return NextResponse.json({ pending: 0 });

        const token = authHeader.replace('Bearer ', '');
        const adminSupabase = getAdminSupabase();

        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);
        if (userError || !user) return NextResponse.json({ pending: 0 });

        const { data: membership } = await adminSupabase
            .from('restaurant_users')
            .select('role')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .eq('active', true)
            .single();

        if (!membership) return NextResponse.json({ pending: 0 });

        // Buscar funções atribuídas ao usuário
        const { data: userRoleRows } = await adminSupabase
            .from('user_roles')
            .select('role_id')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id);

        const userRoleIds = (userRoleRows ?? []).map((r) => r.role_id);
        if (userRoleIds.length === 0) return NextResponse.json({ pending: 0 });

        // Checklists ativos nas funções do usuário
        const { data: checklists } = await adminSupabase
            .from('checklists')
            .select('id, end_time, task_count:checklist_tasks(count)')
            .eq('restaurant_id', restaurant_id)
            .eq('active', true)
            .eq('status', 'active')
            .not('role_id', 'is', null)
            .in('role_id', userRoleIds);

        if (!checklists || checklists.length === 0) return NextResponse.json({ pending: 0 });

        const checklistIds = checklists.map((c) => c.id);

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const { data: executions } = await adminSupabase
            .from('task_executions')
            .select('checklist_id, task_id')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .eq('status', 'done')
            .in('checklist_id', checklistIds)
            .gte('executed_at', startOfDay.toISOString());

        const doneCountMap = new Map<string, Set<string>>();
        for (const exec of executions ?? []) {
            if (!doneCountMap.has(exec.checklist_id)) {
                doneCountMap.set(exec.checklist_id, new Set());
            }
            doneCountMap.get(exec.checklist_id)!.add(exec.task_id);
        }

        let pending = 0;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const checklist of checklists as any[]) {
            const rawCount = checklist.task_count;
            const taskCount = Array.isArray(rawCount)
                ? (rawCount[0]?.count ?? 0)
                : (rawCount ?? 0);
            const doneCount = doneCountMap.get(checklist.id)?.size ?? 0;
            if (doneCount < taskCount) pending++;
        }

        return NextResponse.json({ pending }, {
            headers: { 'Cache-Control': 'no-store' },
        });
    } catch (error: unknown) {
        console.error('[GET /api/my-activities/badge] Erro inesperado:', error);
        return NextResponse.json({ pending: 0 });
    }
}
