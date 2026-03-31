import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
            return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        }

        const token = authHeader.replace('Bearer ', '');
        const adminSupabase = getAdminSupabase();

        // Verificar identidade do caller
        const { data: { user: caller }, error: callerError } = await adminSupabase.auth.getUser(token);
        if (callerError || !caller) {
            return NextResponse.json({ error: 'Sem autorização.' }, { status: 401 });
        }

        const body = await request.json();
        const { target_user_id, new_password, confirm_password, restaurant_id } = body;

        if (!target_user_id || !new_password || !confirm_password || !restaurant_id) {
            return NextResponse.json({ error: 'Campos obrigatórios faltando.' }, { status: 400 });
        }

        if (new_password !== confirm_password) {
            return NextResponse.json({ error: 'As senhas não coincidem.' }, { status: 400 });
        }

        if (new_password.length < 6) {
            return NextResponse.json({ error: 'A senha deve ter no mínimo 6 caracteres.' }, { status: 400 });
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
            return NextResponse.json({ error: 'Apenas proprietários podem alterar senhas de colaboradores.' }, { status: 403 });
        }

        // Verificar que o target_user pertence ao mesmo restaurante (multi-tenant)
        const { data: targetMembership } = await adminSupabase
            .from('restaurant_users')
            .select('id')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', target_user_id)
            .single();

        if (!targetMembership) {
            return NextResponse.json({ error: 'Colaborador não encontrado neste restaurante.' }, { status: 404 });
        }

        // Alterar a senha via Admin API (service role)
        const { error: updateError } = await adminSupabase.auth.admin.updateUserById(
            target_user_id,
            { password: new_password }
        );

        if (updateError) {
            throw updateError;
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

        return NextResponse.json({ success: true });

    } catch (err: unknown) {
        console.error('[POST /api/equipe/change-password]', err);
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}
