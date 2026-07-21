import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAccountIdForRestaurant } from '@/lib/supabase/accounts';
import { getAccountBilling, canManageChecklists } from '@/lib/billing/subscription-access';
import { buildAccessDeniedResponse } from '@/lib/billing/errors';
import { trackAdminEvent } from '@/lib/analytics/track-event';
import { endTransfer, TRANSFER_COLUMNS, type TemporaryTransferRow } from '@/lib/api/temporary-transfer';

const getAdminSupabase = () => {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
};

/**
 * DELETE /api/checklists/temporary-transfer/[id]
 *
 * ENCERRAMENTO ANTECIPADO: a rotina volta IMEDIATAMENTE ao responsável original.
 *
 * Apesar do verbo, nada é apagado — a linha vira `status='ended'` com
 * `ended_reason='cancelled'` e `ended_by`. O ledger é a trilha de auditoria; apagá-lo
 * destruiria exatamente a informação que a feature precisa preservar. DELETE é o verbo
 * porque, do ponto de vista do cliente, o recurso "transferência vigente" deixa de existir.
 */
export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Não autorizado. Token ausente.' }, { status: 401 });
        }
        const token = authHeader.replace('Bearer ', '');

        const adminSupabase = getAdminSupabase();
        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);

        if (userError || !user) {
            console.error('[DELETE /api/checklists/temporary-transfer] Auth error:', userError);
            return NextResponse.json({ error: 'Não autorizado ou token inválido.' }, { status: 401 });
        }

        const { data: transfer } = await adminSupabase
            .from('checklist_temporary_transfers')
            .select(TRANSFER_COLUMNS)
            .eq('id', id)
            .maybeSingle();

        if (!transfer) {
            return NextResponse.json({ error: 'Transferência não encontrada.' }, { status: 404 });
        }

        const row = transfer as unknown as TemporaryTransferRow;

        // Permissão (manager/owner) na unidade DA TRANSFERÊNCIA — não numa passada
        // pelo cliente, que permitiria encerrar transferência de outro tenant.
        const { data: userRole } = await adminSupabase
            .from('restaurant_users')
            .select('role')
            .eq('restaurant_id', row.restaurant_id)
            .eq('user_id', user.id)
            .eq('active', true)
            .maybeSingle();

        if (!userRole || userRole.role === 'staff') {
            return NextResponse.json({ error: 'Permissões insuficientes.' }, { status: 403 });
        }

        const accountId = await getAccountIdForRestaurant(adminSupabase, row.restaurant_id);
        if (!accountId) {
            return NextResponse.json({ error: 'Unidade não pertence a nenhuma account.' }, { status: 404 });
        }
        const billing = await getAccountBilling(adminSupabase, accountId);
        const access = canManageChecklists(billing);
        if (!access.allowed) return buildAccessDeniedResponse(access);

        if (row.status === 'ended') {
            return NextResponse.json(
                { error: 'Esta transferência já foi encerrada.', code: 'ALREADY_ENDED' },
                { status: 409 }
            );
        }

        const ended = await endTransfer(adminSupabase, row, 'cancelled', { endedBy: user.id });
        if (!ended) {
            // O reconciliador encerrou entre a leitura e o UPDATE (expirou na virada).
            return NextResponse.json(
                { error: 'Esta transferência já foi encerrada.', code: 'ALREADY_ENDED' },
                { status: 409 }
            );
        }

        await trackAdminEvent('temporary_transfer_ended', {
            accountId,
            restaurantId: row.restaurant_id,
            userId: user.id,
            metadata: {
                transfer_id: row.id,
                checklist_id: row.checklist_id,
                from_user_id: row.temporary_user_id,
                to_user_id: row.original_user_id,
                ended_reason: 'cancelled',
                starts_on: row.starts_on,
                ends_on: row.ends_on,
                reason_code: row.reason_code,
            },
        });

        return NextResponse.json({
            id: row.id,
            checklist_id: row.checklist_id,
            ended_reason: 'cancelled',
            restored_to_user_id: row.original_user_id,
        });
    } catch (error: unknown) {
        console.error('[DELETE /api/checklists/temporary-transfer] Unexpected error:', error);
        return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
    }
}
