import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAccountIdForRestaurant } from '@/lib/supabase/accounts';
import { canAddManager, canAddStaff } from '@/lib/billing/plan-limits';
import { buildAccessDeniedResponse } from '@/lib/billing/errors';
import { rejectIfGlobal } from '@/lib/api/global-scope';
import {
    isDeleteMemberRpcResult,
    DELETE_MEMBER_ERROR_STATUS,
    type DeleteMemberErrorCode,
    type DeleteMemberResponse,
} from '@/lib/types/equipe-deletion';

const getAdminSupabase = () =>
    createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const { id: userId } = await context.params;

        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        }

        const token = authHeader.replace('Bearer ', '');
        const adminSupabase = getAdminSupabase();

        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);
        if (userError || !user) {
            return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        }

        const body = await request.json();
        const { name, role, active, restaurant_id } = body;

        if (!restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório' }, { status: 400 });
        }

        // Verificar que o chamador é owner ou manager
        const { data: membership } = await adminSupabase
            .from('restaurant_users')
            .select('role')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .eq('active', true)
            .single();

        if (!membership || !['owner', 'manager'].includes(membership.role)) {
            return NextResponse.json({ error: 'Permissão negada.' }, { status: 403 });
        }

        // Impedir que owner/manager rebaixe a si mesmo
        if (userId === user.id && role !== undefined && role !== membership.role) {
            return NextResponse.json({ error: 'Você não pode alterar seu próprio cargo.' }, { status: 403 });
        }

        // Buscar role/active atuais do target para validações de privilégio
        const { data: targetMember } = await adminSupabase
            .from('restaurant_users')
            .select('role, active')
            .eq('user_id', userId)
            .eq('restaurant_id', restaurant_id)
            .single();

        if (!targetMember) {
            return NextResponse.json({ error: 'Membro não encontrado.' }, { status: 404 });
        }

        // Manager não pode alterar cargos
        if (membership.role === 'manager' && role !== undefined) {
            return NextResponse.json({ error: 'Gerência não pode alterar cargos.' }, { status: 403 });
        }

        // Manager só pode gerenciar colaboradores (staff)
        if (membership.role === 'manager' && targetMember.role !== 'staff') {
            return NextResponse.json({ error: 'Gerência só pode gerenciar colaboradores.' }, { status: 403 });
        }

        // Proteger último owner: não desativar nem rebaixar
        if (targetMember.role === 'owner') {
            const isBeingDeactivated = active === false;
            const isBeingDemoted = role !== undefined && role !== 'owner';

            if (isBeingDeactivated || isBeingDemoted) {
                const { count } = await adminSupabase
                    .from('restaurant_users')
                    .select('*', { count: 'exact', head: true })
                    .eq('restaurant_id', restaurant_id)
                    .eq('role', 'owner')
                    .eq('active', true);

                if ((count ?? 0) <= 1) {
                    return NextResponse.json(
                        { error: 'Não é possível remover o único administrador.' },
                        { status: 403 }
                    );
                }
            }
        }

        // --- VALIDAÇÃO DE LIMITE EM PROMOÇÃO / REATIVAÇÃO ---
        // Promoção (troca de cargo) ou reativação (inativo→ativo) consome cota do
        // plano. owner é tratado como assento de admin (≥ manager) para não permitir
        // burlar o limite de managers promovendo a owner. Reativar membro desligado
        // sem rechecar cota também era um bypass.
        const isPromotion = role !== undefined && role !== targetMember.role;
        const isReactivation = active === true && targetMember.active === false;
        if (isPromotion || isReactivation) {
            const effectiveRole = role ?? targetMember.role;
            const accountId = await getAccountIdForRestaurant(adminSupabase, restaurant_id);
            if (!accountId) {
                return NextResponse.json({ error: 'Unidade não pertence a nenhuma account.' }, { status: 404 });
            }
            if (effectiveRole === 'manager' || effectiveRole === 'owner') {
                const check = await canAddManager(adminSupabase, accountId, {
                    userIdBeingAdded: userId,
                });
                if (!check.allowed) return buildAccessDeniedResponse(check);
            } else if (effectiveRole === 'staff') {
                const check = await canAddStaff(adminSupabase, restaurant_id);
                if (!check.allowed) return buildAccessDeniedResponse(check);
            }
        }

        // Atualizar nome em public.users se fornecido
        if (name !== undefined) {
            const { error: nameError } = await adminSupabase
                .from('users')
                .update({ name: name.trim() })
                .eq('id', userId);

            if (nameError) {
                console.error('[PUT /api/equipe/[id]] name error:', nameError);
                return NextResponse.json({ error: nameError.message }, { status: 500 });
            }
        }

        // Atualizar role/active em restaurant_users se fornecido
        if (role !== undefined || active !== undefined) {
            const ruUpdates: Record<string, unknown> = {};
            if (role !== undefined) ruUpdates.role = role;
            if (active !== undefined) ruUpdates.active = active;

            const { error: ruError } = await adminSupabase
                .from('restaurant_users')
                .update(ruUpdates)
                .eq('user_id', userId)
                .eq('restaurant_id', restaurant_id);

            if (ruError) {
                console.error('[PUT /api/equipe/[id]] ru error:', ruError);
                return NextResponse.json({ error: ruError.message }, { status: 500 });
            }
        }

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        console.error('[PUT /api/equipe/[id]] Erro inesperado:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE — exclusão permanente do colaborador (sprint 95)
//
// :id = user_id (convenção desta pasta; a rota base /api/equipe usa restaurant_users.id).
//
// Toda a checagem de bloqueadores E toda a escrita acontecem dentro de
// public.delete_restaurant_member, numa única transação. A rota não decide nada sobre
// permissão nem sobre histórico — apenas autentica, repassa e traduz o resultado.
//
// auth.users é removido DEPOIS da RPC. A ordem é obrigatória: a FK
// public.users.id -> auth.users é CASCADE no NONPROD e NO ACTION no PROD; apagando
// public.users primeiro, ambos funcionam. O inverso, em NONPROD, cascatearia por cima
// de toda a checagem de bloqueadores.
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
    const fail = (code: DeleteMemberErrorCode, blockers?: unknown) =>
        NextResponse.json(
            blockers === undefined ? { error: code } : { error: code, blockers },
            { status: DELETE_MEMBER_ERROR_STATUS[code] }
        );

    try {
        // Visão Global colapsa N vínculos num row por usuário — não há unidade única a excluir.
        const blocked = rejectIfGlobal(request);
        if (blocked) return fail('GLOBAL_MODE');

        const { id: targetUserId } = await context.params;
        const restaurantId = new URL(request.url).searchParams.get('restaurant_id');

        if (!restaurantId) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório' }, { status: 400 });
        }

        const authHeader = request.headers.get('Authorization');
        if (!authHeader) return fail('SESSION_EXPIRED');

        const adminSupabase = getAdminSupabase();
        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(
            authHeader.replace('Bearer ', '')
        );
        if (userError || !user) return fail('SESSION_EXPIRED');

        const { data, error } = await adminSupabase.rpc('delete_restaurant_member', {
            p_restaurant_id: restaurantId,
            p_target_user_id: targetUserId,
            p_actor_user_id: user.id,
            p_dry_run: false,
        });

        if (error) {
            // 23503 (FK) e P0001 (triggers de imutabilidade do histórico) significam que o
            // colaborador ganhou rastro entre a checagem e o commit — a transação já voltou atrás.
            if (error.code === '23503' || error.code === 'P0001') {
                console.warn('[DELETE /api/equipe/[id]] corrida de histórico:', error);
                return fail('MEMBER_HAS_HISTORY', []);
            }
            console.error('[DELETE /api/equipe/[id]] rpc error:', error);
            return fail('INTERNAL_ERROR');
        }

        if (!isDeleteMemberRpcResult(data)) {
            console.error('[DELETE /api/equipe/[id]] retorno inesperado da RPC:', data);
            return fail('INTERNAL_ERROR');
        }

        if (!data.ok) {
            return fail(data.code as DeleteMemberErrorCode, data.blockers);
        }

        // A identidade só sai de auth.users quando public.users já foi apagado pela RPC.
        let authCleanupPending = false;
        if (data.identity_deleted) {
            let authError = (await adminSupabase.auth.admin.deleteUser(targetUserId)).error;
            if (authError) {
                authError = (await adminSupabase.auth.admin.deleteUser(targetUserId)).error;
            }
            if (authError) {
                // O vínculo já não existe, então não há acesso indevido: toda rota revalida
                // restaurant_users. Só o e-mail segue ocupado até limpeza manual — rastreável
                // pelo admin_audit_log com identity_deleted:true.
                authCleanupPending = true;
                console.error(
                    '[DELETE /api/equipe/[id]] auth.users órfão para', targetUserId, authError
                );
            }
        }

        const response: DeleteMemberResponse = {
            success: true,
            identity_deleted: data.identity_deleted ?? false,
            identity_kept_reason: data.identity_kept_reason ?? null,
            auth_cleanup_pending: authCleanupPending,
            unlinked: data.unlinked ?? { checklists: 0, receiving_templates: 0 },
            target: { user_id: targetUserId, name: data.target?.name ?? null },
        };
        return NextResponse.json(response);
    } catch (error: unknown) {
        console.error('[DELETE /api/equipe/[id]] Erro inesperado:', error);
        return fail('INTERNAL_ERROR');
    }
}
