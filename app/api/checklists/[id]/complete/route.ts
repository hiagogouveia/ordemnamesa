import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getBrazilDateKey } from '@/lib/utils/brazil-date';

const getAdminSupabase = () =>
    createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id: checklistId } = await params;
        const body = await request.json();
        const { restaurant_id, observation } = body;

        if (!restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório' }, { status: 400 });
        }

        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }
        const token = authHeader.replace('Bearer ', '');
        const adminSupabase = getAdminSupabase();

        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);
        if (userError || !user) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }

        const userName = user.user_metadata?.name || user.email || 'Funcionário';
        const dateKey = getBrazilDateKey();
        const now = new Date().toISOString();

        // Upsert assumption with completion data
        const { data: existing } = await adminSupabase
            .from('checklist_assumptions')
            .select('id')
            .eq('checklist_id', checklistId)
            .eq('date_key', dateKey)
            .maybeSingle();

        let assumption;
        if (existing) {
            const { data, error } = await adminSupabase
                .from('checklist_assumptions')
                .update({
                    completed_at: now,
                    execution_status: 'done',
                    completed_by_user_id: user.id,
                    completed_by_user_name: userName,
                    ...(observation !== undefined && { observation }),
                })
                .eq('id', existing.id)
                .select()
                .single();
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            assumption = data;
        } else {
            const { data, error } = await adminSupabase
                .from('checklist_assumptions')
                .insert({
                    restaurant_id,
                    checklist_id: checklistId,
                    user_id: user.id,
                    user_name: userName,
                    date_key: dateKey,
                    completed_at: now,
                    execution_status: 'done',
                    completed_by_user_id: user.id,
                    completed_by_user_name: userName,
                    ...(observation !== undefined && { observation }),
                })
                .select()
                .single();
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            assumption = data;
        }

        // Gerar notificações para managers/owners se houver observação
        if (observation && observation.trim()) {
            try {
                // Buscar nome do checklist
                const { data: checklist } = await adminSupabase
                    .from('checklists')
                    .select('name')
                    .eq('id', checklistId)
                    .single();

                const checklistName = checklist?.name || 'Atividade';

                // Buscar managers e owners do restaurante
                const { data: managers } = await adminSupabase
                    .from('restaurant_users')
                    .select('user_id')
                    .eq('restaurant_id', restaurant_id)
                    .eq('active', true)
                    .in('role', ['owner', 'manager']);

                if (managers && managers.length > 0) {
                    const notifications = managers
                        .filter((m) => m.user_id !== user.id) // Não notificar a si mesmo
                        .map((m) => ({
                            restaurant_id,
                            user_id: m.user_id,
                            type: 'TASK_COMPLETED_WITH_NOTE' as const,
                            title: `${userName} deixou uma observação`,
                            description: `"${observation.trim().slice(0, 100)}${observation.trim().length > 100 ? '...' : ''}" — ${checklistName}`,
                            metadata: {
                                checklist_id: checklistId,
                                checklist_name: checklistName,
                                completed_by_name: userName,
                                completed_by_user_id: user.id,
                            },
                            related_id: checklistId,
                        }));

                    if (notifications.length > 0) {
                        await adminSupabase.from('notifications').insert(notifications);
                    }
                }
            } catch (notifError) {
                // Não falhar a finalização por erro na notificação
                console.error('[POST /api/checklists/[id]/complete] Erro ao criar notificações:', notifError);
            }
        }

        return NextResponse.json({ assumption });
    } catch (error: unknown) {
        console.error('[POST /api/checklists/[id]/complete] Erro:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
