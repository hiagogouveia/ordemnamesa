import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAccountIdForRestaurant } from '@/lib/supabase/accounts';
import { getAccountBilling, canExecuteTasks } from '@/lib/billing/subscription-access';
import { buildAccessDeniedResponse } from '@/lib/billing/errors';
import { verifyMembership } from '@/lib/api/auth';
import { resolveAssumptionId } from '@/lib/api/assumption-link';

const getAdminSupabase = () => {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
};

export async function POST(request: Request) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        const token = authHeader.replace('Bearer ', '');
        const adminSupabase = getAdminSupabase();

        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);
        if (userError || !user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const body = await request.json();
        const { restaurant_id, task_id, checklist_id } = body;

        if (!restaurant_id || !task_id || !checklist_id) {
            return NextResponse.json({ error: 'Faltam campos obrigatórios' }, { status: 400 });
        }

        // Isolamento multi-tenant: só membro ativo do restaurante (service-role bypassa RLS)
        const membership = await verifyMembership(adminSupabase, user.id, restaurant_id);
        if (membership instanceof NextResponse) return membership;

        // Enforcement billing
        const accountId = await getAccountIdForRestaurant(adminSupabase, restaurant_id);
        if (!accountId) {
            return NextResponse.json({ error: 'Unidade não pertence a nenhuma account.' }, { status: 404 });
        }
        const billing = await getAccountBilling(adminSupabase, accountId);
        const accessCheck = canExecuteTasks(billing);
        if (!accessCheck.allowed) return buildAccessDeniedResponse(accessCheck);

        // Sprint 35 — buscar snapshot da task antes de criar a execução
        const { data: taskRow } = await adminSupabase
            .from('checklist_tasks')
            .select('type, requires_photo, requires_observation, max_photos, task_config')
            .eq('id', task_id)
            .eq('restaurant_id', restaurant_id)
            .single();

        // Vincula a execução à sessão (assumption) do dia — fonte canônica da Auditoria.
        const assumptionId = await resolveAssumptionId(adminSupabase, {
            checklistId: checklist_id,
            restaurantId: restaurant_id,
        });

        const { data: newExecution, error: execError } = await adminSupabase
            .from('task_executions')
            .insert({
                restaurant_id,
                task_id,
                checklist_id,
                checklist_assumption_id: assumptionId,
                user_id: user.id,
                status: 'doing',
                executed_at: new Date().toISOString(),
                // Snapshots (compat: se task não encontrada, defaults seguros)
                type_snapshot: taskRow?.type ?? 'boolean',
                requires_photo_snapshot: taskRow?.requires_photo ?? false,
                requires_observation_snapshot: taskRow?.requires_observation ?? false,
                max_photos_snapshot: taskRow?.max_photos ?? null,
                task_config_snapshot: taskRow?.task_config ?? null,
            })
            .select()
            .single();

        if (execError) {
            console.error('Erro ao assumir:', execError);
            return NextResponse.json({ error: execError.message }, { status: 500 });
        }

        return NextResponse.json(newExecution, { status: 201 });
    } catch (err: unknown) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}
