import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const getAdminSupabase = () =>
    createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

interface SupplierNew {
    name?: string;
    cnpj?: string | null;
}

/**
 * POST /api/receiving/instantiate
 *
 * Cria uma execução one-shot a partir de um receiving_template + supplier.
 * É a única fonte de verdade para iniciar um recebimento no novo fluxo.
 *
 * Body:
 *   {
 *     restaurant_id: string,
 *     template_id: string,
 *     supplier_id?: string,         // exclusivo com supplier_new
 *     supplier_new?: {              // cria fornecedor inline
 *       name: string,
 *       cnpj?: string
 *     },
 *     idempotency_key: string       // UUID gerado pelo cliente
 *   }
 *
 * Comportamento:
 * - Valida auth, membership, escopo (área/role/user).
 * - Se supplier_new: cria supplier (commit independente; persiste mesmo
 *   se a instanciação falhar — fornecedor cadastrado é estado válido).
 * - Chama RPC `instantiate_receiving_execution` (transação real).
 * - Retorna 200 com was_duplicate=true se idempotency_key já existir.
 * - Retorna 409 se template for inativo.
 */
export async function POST(request: Request) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        const token = authHeader.replace('Bearer ', '');
        const adminSupabase = getAdminSupabase();

        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);
        if (userError || !user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });

        const body = await request.json().catch(() => ({}));
        const {
            restaurant_id,
            template_id,
            supplier_id: incomingSupplierId,
            supplier_new,
            idempotency_key,
        } = body as {
            restaurant_id?: string;
            template_id?: string;
            supplier_id?: string;
            supplier_new?: SupplierNew;
            idempotency_key?: string;
        };

        if (!restaurant_id) return NextResponse.json({ error: 'restaurant_id é obrigatório.' }, { status: 400 });
        if (!template_id) return NextResponse.json({ error: 'template_id é obrigatório.' }, { status: 400 });
        if (!idempotency_key) return NextResponse.json({ error: 'idempotency_key é obrigatório.' }, { status: 400 });

        const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRe.test(idempotency_key)) {
            return NextResponse.json({ error: 'idempotency_key deve ser UUID.' }, { status: 400 });
        }
        if (incomingSupplierId && supplier_new) {
            return NextResponse.json({ error: 'Enviar supplier_id OU supplier_new, não ambos.' }, { status: 400 });
        }

        // Membership
        const { data: membership } = await adminSupabase
            .from('restaurant_users')
            .select('role')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .eq('active', true)
            .single();
        if (!membership) return NextResponse.json({ error: 'Sem acesso a este restaurante.' }, { status: 403 });

        // Escopo: user precisa ter ao menos 1 área no restaurante (proteção defensa em profundidade)
        const { data: userAreas } = await adminSupabase
            .from('user_areas').select('area_id')
            .eq('restaurant_id', restaurant_id).eq('user_id', user.id);
        if (!userAreas || userAreas.length === 0) {
            return NextResponse.json({ error: 'Sem áreas atribuídas neste restaurante.' }, { status: 403 });
        }

        // Resolve supplier
        let supplierId: string | null = incomingSupplierId ?? null;
        if (supplier_new) {
            const newName = supplier_new.name?.trim();
            if (!newName) {
                return NextResponse.json({ error: 'supplier_new.name é obrigatório.' }, { status: 400 });
            }
            const cnpjDigits = supplier_new.cnpj ? supplier_new.cnpj.replace(/\D/g, '') : null;
            if (cnpjDigits && cnpjDigits.length !== 14) {
                return NextResponse.json({ error: 'CNPJ deve ter 14 dígitos.' }, { status: 400 });
            }
            // Tenta criar; se conflito de nome, busca o existente
            const { data: created, error: supErr } = await adminSupabase
                .from('suppliers')
                .insert({ restaurant_id, name: newName, cnpj: cnpjDigits, created_by: user.id })
                .select('id').single();
            if (supErr && supErr.code !== '23505') {
                console.error('[POST /api/receiving/instantiate] supplier insert:', supErr);
                return NextResponse.json({ error: supErr.message }, { status: 500 });
            }
            if (created) {
                supplierId = created.id;
            } else {
                const { data: existing } = await adminSupabase
                    .from('suppliers').select('id')
                    .eq('restaurant_id', restaurant_id).eq('name', newName).single();
                supplierId = existing?.id ?? null;
            }
        }

        // Pré-resolução de user_name (RPC exige; assumption.user_name NOT NULL)
        const userName =
            (user.user_metadata as { name?: string } | null)?.name ||
            user.email ||
            'Colaborador';

        // Chama RPC transacional
        const { data: result, error: rpcErr } = await adminSupabase.rpc('instantiate_receiving_execution', {
            p_restaurant_id: restaurant_id,
            p_template_id: template_id,
            p_supplier_id: supplierId,
            p_user_id: user.id,
            p_user_name: userName,
            p_idempotency_key: idempotency_key,
        });

        if (rpcErr) {
            if (rpcErr.message?.includes('TEMPLATE_NOT_AVAILABLE')) {
                return NextResponse.json(
                    { error: 'Modelo de recebimento não disponível.', code: 'TEMPLATE_NOT_AVAILABLE' },
                    { status: 409 },
                );
            }
            console.error('[POST /api/receiving/instantiate] rpc:', rpcErr);
            return NextResponse.json({ error: rpcErr.message }, { status: 500 });
        }

        const row = Array.isArray(result) ? result[0] : result;
        if (!row) {
            return NextResponse.json({ error: 'RPC sem retorno.' }, { status: 500 });
        }

        return NextResponse.json(
            {
                checklist_id: row.checklist_id,
                assumption_id: row.assumption_id,
                was_duplicate: row.was_duplicate,
            },
            { status: row.was_duplicate ? 200 : 201 },
        );
    } catch (error: unknown) {
        console.error('[POST /api/receiving/instantiate] inesperado:', error);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}
