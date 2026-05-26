import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const getAdminSupabase = () =>
    createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

/**
 * PATCH /api/receiving-expectations/:id
 *
 * Ações disponíveis (body.action):
 *   - 'confirm': move pending -> confirmed (libera para aparecer no Meu Turno).
 *                NÃO cria checklist_assumption — execução continua iniciada pelo
 *                colaborador via fluxo existente de assume.
 *   - 'cancel' : move pending|confirmed|overdue -> cancelled. Aceita
 *                cancelled_reason opcional.
 *
 * Restrito a owner/manager. Usa CAS via WHERE no status atual para evitar
 * sobrescrever uma confirmação concorrente (e.g. dois gestores clicando ao
 * mesmo tempo, ou um colaborador já tendo iniciado a execução).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const body = await request.json().catch(() => ({}));
        const { restaurant_id, action, cancelled_reason } = body as {
            restaurant_id?: string;
            action?: 'confirm' | 'cancel';
            cancelled_reason?: string;
        };

        if (!restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório' }, { status: 400 });
        }
        if (action !== 'confirm' && action !== 'cancel') {
            return NextResponse.json({ error: "action deve ser 'confirm' ou 'cancel'" }, { status: 400 });
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
        if (!membership || (membership.role !== 'owner' && membership.role !== 'manager')) {
            return NextResponse.json({ error: 'Permissões insuficientes' }, { status: 403 });
        }

        if (action === 'confirm') {
            const { data, error } = await adminSupabase
                .from('receiving_expectations')
                .update({
                    status: 'confirmed',
                    confirmed_by: user.id,
                    confirmed_at: new Date().toISOString(),
                })
                .eq('id', id)
                .eq('restaurant_id', restaurant_id)
                .in('status', ['pending', 'overdue'])
                .select()
                .maybeSingle();
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            if (!data) {
                return NextResponse.json(
                    { error: 'Expectativa não encontrada ou já finalizada', code: 'NOT_PENDING' },
                    { status: 409 },
                );
            }
            return NextResponse.json({ expectation: data });
        }

        // cancel
        const { data, error } = await adminSupabase
            .from('receiving_expectations')
            .update({
                status: 'cancelled',
                cancelled_reason: cancelled_reason?.trim() || null,
            })
            .eq('id', id)
            .eq('restaurant_id', restaurant_id)
            .in('status', ['pending', 'confirmed', 'overdue'])
            .is('assumption_id', null) // não cancela se já tem execução em curso
            .select()
            .maybeSingle();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        if (!data) {
            return NextResponse.json(
                { error: 'Expectativa não pode ser cancelada (já executada ou inexistente)', code: 'CANNOT_CANCEL' },
                { status: 409 },
            );
        }
        return NextResponse.json({ expectation: data });
    } catch (err) {
        console.error('[PATCH /api/receiving-expectations/[id]] erro:', err);
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    }
}
