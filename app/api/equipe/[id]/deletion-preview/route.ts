import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
    isDeleteMemberRpcResult,
    DELETE_MEMBER_ERROR_STATUS,
    type DeleteMemberErrorCode,
    type DeleteMemberPreview,
} from '@/lib/types/equipe-deletion';

const getAdminSupabase = () =>
    createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

/**
 * GET /api/equipe/[id]/deletion-preview?restaurant_id=<uuid>  (sprint 95)
 *
 * Roda public.delete_restaurant_member com p_dry_run = true: mesma função da exclusão,
 * sem escrever nada. O modal precisa saber ANTES de confirmar se a operação é possível e
 * qual será a consequência exata — o cadastro morre e libera o e-mail, ou apenas o vínculo
 * sai porque a pessoa atua em outras unidades.
 *
 * É estritamente consultivo: o DELETE re-checa tudo dentro da transação. Nunca autorize
 * uma destruição com base nesta resposta.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
    const fail = (code: DeleteMemberErrorCode) =>
        NextResponse.json({ error: code }, { status: DELETE_MEMBER_ERROR_STATUS[code] });

    try {
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
            p_dry_run: true,
        });

        if (error) {
            console.error('[GET /api/equipe/[id]/deletion-preview] rpc error:', error);
            return fail('INTERNAL_ERROR');
        }

        if (!isDeleteMemberRpcResult(data)) {
            console.error('[GET /api/equipe/[id]/deletion-preview] retorno inesperado:', data);
            return fail('INTERNAL_ERROR');
        }

        // MEMBER_HAS_HISTORY não é erro aqui: é a resposta que o modal quer exibir, com a
        // lista de motivos. Os demais códigos são falhas de permissão de verdade.
        if (!data.ok && data.code !== 'MEMBER_HAS_HISTORY') {
            return fail(data.code as DeleteMemberErrorCode);
        }

        const preview: DeleteMemberPreview = {
            can_delete: data.ok,
            blockers: data.blockers ?? [],
            identity_deleted: data.identity_deleted ?? false,
            identity_kept_reason: data.identity_kept_reason ?? null,
            remaining_units: data.remaining_units ?? 0,
            unlinked: data.unlinked ?? { checklists: 0, receiving_templates: 0 },
            target: data.target ?? null,
        };
        return NextResponse.json(preview);
    } catch (error: unknown) {
        console.error('[GET /api/equipe/[id]/deletion-preview] Erro inesperado:', error);
        return fail('INTERNAL_ERROR');
    }
}
