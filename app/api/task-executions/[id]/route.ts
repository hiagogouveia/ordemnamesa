import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAccountIdForRestaurant } from '@/lib/supabase/accounts';
import { getAccountBilling, canExecuteTasks } from '@/lib/billing/subscription-access';
import { buildAccessDeniedResponse } from '@/lib/billing/errors';
import { trackChecklistEvent } from '@/lib/analytics/track-event';

const getAdminSupabase = () => {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
};

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        const token = authHeader.replace('Bearer ', '');
        const adminSupabase = getAdminSupabase();

        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);
        if (userError || !user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const { id } = await context.params;
        const body = await request.json();
        const {
            restaurant_id, status, notes, photo_url,
            photos, observation,
            value_boolean, value_date, value_number, value_rating,
        } = body;

        if (!restaurant_id || !status) {
            return NextResponse.json({ error: 'Faltam campos obrigatórios' }, { status: 400 });
        }

        // Enforcement billing
        const accountId = await getAccountIdForRestaurant(adminSupabase, restaurant_id);
        if (!accountId) {
            return NextResponse.json({ error: 'Unidade não pertence a nenhuma account.' }, { status: 404 });
        }
        const billing = await getAccountBilling(adminSupabase, accountId);
        const accessCheck = canExecuteTasks(billing);
        if (!accessCheck.allowed) return buildAccessDeniedResponse(accessCheck);

        const updateData: Record<string, unknown> = { status };
        if (notes !== undefined) updateData.notes = notes;
        if (photo_url !== undefined) updateData.photo_url = photo_url;
        if (status === 'done') updateData.executed_at = new Date().toISOString();

        // Sprint 35 — campos novos
        if (Array.isArray(photos)) updateData.photos = photos;
        if (observation !== undefined) updateData.observation = observation;
        if (value_boolean !== undefined) updateData.value_boolean = value_boolean;
        if (value_date !== undefined) updateData.value_date = value_date;
        if (value_number !== undefined) updateData.value_number = value_number;
        if (value_rating !== undefined) updateData.value_rating = value_rating;

        // Recomputa has_alert server-side a partir do snapshot já gravado + valor recebido
        if (status === 'done') {
            const { data: existing } = await adminSupabase
                .from('task_executions')
                .select('type_snapshot, task_config_snapshot, requires_photo_snapshot, requires_observation_snapshot')
                .eq('id', id)
                .eq('restaurant_id', restaurant_id)
                .single();

            // Validação: foto obrigatória — leitura considera photos[] OU photo_url
            if (existing?.requires_photo_snapshot) {
                const finalPhotos = Array.isArray(photos) ? photos : null;
                const hasPhoto = (finalPhotos && finalPhotos.length > 0) || !!photo_url;
                if (!hasPhoto) {
                    return NextResponse.json({ error: 'Esta tarefa exige ao menos uma foto.' }, { status: 400 });
                }
            }
            if (existing?.requires_observation_snapshot) {
                const finalObs = observation;
                if (!finalObs || typeof finalObs !== 'string' || finalObs.trim() === '') {
                    return NextResponse.json({ error: 'Esta tarefa exige observação.' }, { status: 400 });
                }
            }

            const t = existing?.type_snapshot ?? 'boolean';
            const cfg = (existing?.task_config_snapshot ?? null) as { min_value?: number; max_value?: number } | null;
            let hasAlert = false;
            if (t === 'date' && typeof value_date === 'string') {
                const todayKey = new Intl.DateTimeFormat('en-CA', {
                    timeZone: 'America/Sao_Paulo',
                    year: 'numeric', month: '2-digit', day: '2-digit',
                }).format(new Date());
                hasAlert = value_date < todayKey;
            } else if (t === 'number' && typeof value_number === 'number' && cfg) {
                if (typeof cfg.min_value === 'number' && value_number < cfg.min_value) hasAlert = true;
                if (typeof cfg.max_value === 'number' && value_number > cfg.max_value) hasAlert = true;
            } else if (t === 'rating' && typeof value_rating === 'number') {
                hasAlert = value_rating <= 3;
            }
            updateData.has_alert = hasAlert;
        }

        const { data: updated, error: execError } = await adminSupabase
            .from('task_executions')
            .update(updateData)
            .eq('id', id)
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id) // Only allow updating own executions
            .select()
            .single();

        if (execError) {
            console.error('Erro ao editar:', execError);
            return NextResponse.json({ error: execError.message }, { status: 500 });
        }

        if (status === 'done') {
            await trackChecklistEvent('task_completed', {
                accountId,
                restaurantId: restaurant_id,
                userId: user.id,
                metadata: {
                    task_execution_id: updated.id,
                    task_id: updated.task_id,
                    checklist_id: updated.checklist_id,
                    has_alert: !!updated.has_alert,
                    type: updated.type_snapshot ?? null,
                },
            });
            const photoCount = Array.isArray(updated.photos) ? updated.photos.length : 0;
            if (photoCount > 0 || updated.photo_url) {
                await trackChecklistEvent('photo_uploaded', {
                    accountId,
                    restaurantId: restaurant_id,
                    userId: user.id,
                    metadata: {
                        task_execution_id: updated.id,
                        photos_count: photoCount,
                        has_legacy_photo_url: !!updated.photo_url,
                    },
                });
            }
        }

        return NextResponse.json(updated);
    } catch (err: unknown) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}
