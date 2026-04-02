import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Flag para controle de invalidação de sessão após troca de senha.
// true  → invalida todas as sessões ativas do colaborador (comportamento atual seguro).
// false → mantém sessões ativas (útil se o colaborador estiver operando no caixa, por ex.).
// Futuramente pode se tornar lógica dinâmica (ex: apenas se usuário inativo/desligado).
const SHOULD_FORCE_LOGOUT = true;

const getAdminSupabase = () => {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
};

export async function POST(request: Request) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'SESSION_EXPIRED' }, { status: 401 });
        }

        const token = authHeader.replace('Bearer ', '');
        const adminSupabase = getAdminSupabase();

        // Verificar identidade do caller
        const { data: { user: caller }, error: callerError } = await adminSupabase.auth.getUser(token);
        if (callerError || !caller) {
            return NextResponse.json({ error: 'SESSION_EXPIRED' }, { status: 401 });
        }

        const body = await request.json();
        const { target_user_id, new_password, restaurant_id } = body;

        if (!target_user_id || !new_password || !restaurant_id) {
            return NextResponse.json({ error: 'VALIDATION_ERROR' }, { status: 400 });
        }

        if (new_password.length < 6) {
            return NextResponse.json({ error: 'VALIDATION_ERROR' }, { status: 400 });
        }

        // Verificar que o caller é owner do restaurante
        const { data: callerMembership } = await adminSupabase
            .from('restaurant_users')
            .select('role')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', caller.id)
            .eq('active', true)
            .single();

        if (!callerMembership || callerMembership.role !== 'owner') {
            return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
        }

        // Verificar que o target_user pertence ao mesmo restaurante (multi-tenant) e está ativo
        const { data: targetMembership } = await adminSupabase
            .from('restaurant_users')
            .select('id')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', target_user_id)
            .eq('active', true)
            .single();

        if (!targetMembership) {
            return NextResponse.json({ error: 'USER_INACTIVE' }, { status: 403 });
        }

        // Alterar a senha via Admin API (service role)
        const { error: updateError } = await adminSupabase.auth.admin.updateUserById(
            target_user_id,
            { password: new_password }
        );

        if (updateError) {
            throw updateError;
        }

        // Invalidar todas as sessões ativas do usuário (best-effort, não bloqueia sucesso)
        if (SHOULD_FORCE_LOGOUT) {
            try {
                await adminSupabase.auth.admin.signOut(target_user_id, 'global');
            } catch (signOutErr) {
                console.warn('[change-password] signOut failed (non-critical):', signOutErr);
            }
        }

        // Registrar auditoria
        await adminSupabase
            .from('admin_audit_log')
            .insert({
                restaurant_id,
                actor_id: caller.id,
                target_user_id,
                action: 'password_changed',
                metadata: { changed_at: new Date().toISOString() },
            });

        // Notificar o colaborador (best-effort, não bloqueia sucesso)
        try {
            await adminSupabase
                .from('notifications')
                .insert({
                    restaurant_id,
                    user_id: target_user_id,
                    type: 'PASSWORD_CHANGED_BY_ADMIN',
                    title: 'Senha redefinida',
                    description: 'Sua senha foi redefinida por um gestor.',
                    metadata: { changed_by: caller.id, changed_at: new Date().toISOString() },
                });
        } catch (notifyErr) {
            console.warn('[change-password] notification insert failed (non-critical):', notifyErr);
        }

        return NextResponse.json({ success: true });

    } catch (err: unknown) {
        console.error('[POST /api/equipe/change-password]', err);
        return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
    }
}
