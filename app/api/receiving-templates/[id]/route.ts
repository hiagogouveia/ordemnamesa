import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { ReceivingTemplate } from '@/lib/types';
import { deriveShiftEnum } from '@/lib/api/derive-shift-enum';
import { validateShiftAssignment } from '@/lib/api/validate-shift-assignment';
import { normalizeShiftIds, shiftIdShadow, replaceTemplateShifts, fetchShiftIdsByTemplate } from '@/lib/api/shift-links';

const getAdminSupabase = () =>
    createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

async function resolveAuth(token: string, restaurantId: string) {
    const adminSupabase = getAdminSupabase();
    const { data: { user }, error } = await adminSupabase.auth.getUser(token);
    if (error || !user) return { user: null, role: null, adminSupabase };
    const { data: membership } = await adminSupabase
        .from('restaurant_users')
        .select('role')
        .eq('restaurant_id', restaurantId)
        .eq('user_id', user.id)
        .eq('active', true)
        .single();
    return { user, role: membership?.role ?? null, adminSupabase };
}

interface IncomingTask {
    title?: string;
    description?: string | null;
    order?: number;
    requires_photo?: boolean;
    is_critical?: boolean;
    requires_observation?: boolean;
    type?: 'boolean' | 'date' | 'number' | 'rating' | null;
    max_photos?: number | null;
    task_config?: Record<string, unknown> | null;
}

function normalizeTasks(raw: unknown): IncomingTask[] | { error: string } {
    if (!Array.isArray(raw) || raw.length === 0) {
        return { error: 'Pelo menos uma tarefa é obrigatória.' };
    }
    const tasks: IncomingTask[] = [];
    for (let i = 0; i < raw.length; i++) {
        const t = raw[i] as IncomingTask;
        const title = (t?.title ?? '').trim();
        if (!title) return { error: `Tarefa ${i + 1}: título obrigatório.` };
        tasks.push({
            title,
            description: t.description?.trim() || null,
            order: Number.isInteger(t.order) ? (t.order as number) : i,
            requires_photo: !!t.requires_photo,
            is_critical: !!t.is_critical,
            requires_observation: !!t.requires_observation,
            type: t.type ?? null,
            max_photos: t.max_photos ?? null,
            task_config: t.task_config ?? null,
        });
    }
    return tasks;
}

/**
 * GET /api/receiving-templates/:id?restaurant_id=...
 * Detalhe com tasks. Membro do restaurante pode ver.
 */
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params;
        const { searchParams } = new URL(request.url);
        const restaurant_id = searchParams.get('restaurant_id');
        if (!restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório.' }, { status: 400 });
        }

        const authHeader = request.headers.get('Authorization');
        if (!authHeader) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        const token = authHeader.replace('Bearer ', '');

        const { user, role, adminSupabase } = await resolveAuth(token, restaurant_id);
        if (!user || !role) return NextResponse.json({ error: 'Permissão negada.' }, { status: 403 });

        const { data, error } = await adminSupabase
            .from('receiving_templates')
            .select('*, area:areas(id, name, color), role:roles(id, name, color), tasks:receiving_template_tasks(*), receiving_template_shifts ( shift_id, shifts ( id, name ) )')
            .eq('id', id)
            .eq('restaurant_id', restaurant_id)
            .maybeSingle();

        if (error) {
            console.error('[GET /api/receiving-templates/:id]', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        if (!data) return NextResponse.json({ error: 'Não encontrado.' }, { status: 404 });

        // Sprint 67: turnos N:N → shift_ids + shifts (id,name).
        const links = ((data as { receiving_template_shifts?: Array<{ shift_id: string; shifts: { id: string; name: string } | null }> }).receiving_template_shifts) ?? [];
        const out = {
            ...data,
            receiving_template_shifts: undefined,
            shift_ids: links.map((l) => l.shift_id),
            shifts: links.map((l) => l.shifts).filter((s): s is { id: string; name: string } => Boolean(s)),
        };
        return NextResponse.json(out as ReceivingTemplate);
    } catch (error: unknown) {
        console.error('[GET /api/receiving-templates/:id] inesperado:', error);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}

/**
 * PATCH /api/receiving-templates/:id
 * Atualiza campos do template. Se `tasks` enviado, faz replace via RPC.
 * Permissão: owner/manager.
 */
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params;
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        const token = authHeader.replace('Bearer ', '');

        const body = await request.json().catch(() => ({}));
        const { restaurant_id } = body as { restaurant_id?: string };
        if (!restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório.' }, { status: 400 });
        }

        const { user, role, adminSupabase } = await resolveAuth(token, restaurant_id);
        if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        if (!role || role === 'staff') {
            return NextResponse.json({ error: 'Permissão negada.' }, { status: 403 });
        }

        const VALID_RECURRENCES = ['daily','weekly','monthly','yearly','weekdays','custom','shift_days'];
        const upd: Record<string, unknown> = {};
        const b = body as Record<string, unknown>;
        if (typeof b.name === 'string') {
            const v = b.name.trim();
            if (!v) return NextResponse.json({ error: 'name não pode ser vazio.' }, { status: 400 });
            upd.name = v;
        }
        if (b.description !== undefined) {
            upd.description = typeof b.description === 'string' ? (b.description.trim() || null) : null;
        }
        if (b.area_id !== undefined) {
            if (typeof b.area_id !== 'string' || !b.area_id) {
                return NextResponse.json({ error: 'area_id inválido.' }, { status: 400 });
            }
            upd.area_id = b.area_id;
        }
        if (b.role_id !== undefined) upd.role_id = typeof b.role_id === 'string' && b.role_id ? b.role_id : null;
        if (b.assigned_to_user_id !== undefined) upd.assigned_to_user_id = typeof b.assigned_to_user_id === 'string' && b.assigned_to_user_id ? b.assigned_to_user_id : null;
        if (b.shift !== undefined) {
            const VALID_SHIFTS = ['morning','afternoon','evening'];
            if (b.shift === null || b.shift === '' || b.shift === 'any') {
                upd.shift = null;
            } else if (typeof b.shift === 'string' && VALID_SHIFTS.includes(b.shift)) {
                upd.shift = b.shift;
            } else {
                return NextResponse.json({ error: 'shift inválido.' }, { status: 400 });
            }
        }
        // Sprint 67: turnos N:N. shift_ids (ou shift_id legado) define os turnos.
        // incomingShiftIds = null → não alterar turnos. Atualiza shadows; a junção
        // é substituída após o update.
        const incomingShiftIds: string[] | null = ('shift_ids' in b)
            ? normalizeShiftIds(b.shift_ids)
            : ('shift_id' in b ? (typeof b.shift_id === 'string' && b.shift_id ? [b.shift_id] : []) : null);
        if (incomingShiftIds !== null) {
            const sidShadow = shiftIdShadow(incomingShiftIds);
            upd.shift_id = sidShadow;
            const derived = await deriveShiftEnum(adminSupabase, restaurant_id, sidShadow);
            upd.shift = derived === 'any' ? null : derived;
        }
        if (b.recurrence !== undefined) {
            if (typeof b.recurrence !== 'string' || !VALID_RECURRENCES.includes(b.recurrence)) {
                return NextResponse.json({ error: 'recurrence inválida.' }, { status: 400 });
            }
            upd.recurrence = b.recurrence;
        }
        if (b.recurrence_config !== undefined) upd.recurrence_config = b.recurrence_config ?? null;
        if (b.enforce_sequential_order !== undefined) upd.enforce_sequential_order = !!b.enforce_sequential_order;
        if (b.active !== undefined) upd.active = !!b.active;

        const hasTasks = b.tasks !== undefined;
        if (Object.keys(upd).length === 0 && !hasTasks) {
            return NextResponse.json({ error: 'Nada para atualizar.' }, { status: 400 });
        }

        // Sprint 66: atribuição direta exige interseção com os turnos do modelo.
        // Valores efetivos: do body quando enviados; senão os atuais do registro.
        if (('assigned_to_user_id' in b) || incomingShiftIds !== null) {
            const { data: currentTpl } = await adminSupabase
                .from('receiving_templates')
                .select('assigned_to_user_id')
                .eq('id', id)
                .eq('restaurant_id', restaurant_id)
                .maybeSingle<{ assigned_to_user_id: string | null }>();
            const effAssigned = ('assigned_to_user_id' in b) ? (upd.assigned_to_user_id as string | null) : (currentTpl?.assigned_to_user_id ?? null);
            const effShiftIds = incomingShiftIds !== null
                ? incomingShiftIds
                : ((await fetchShiftIdsByTemplate(adminSupabase, [id])).get(id) ?? []);
            const tplPutShiftErr = await validateShiftAssignment(adminSupabase, restaurant_id, effAssigned, effShiftIds);
            if (tplPutShiftErr) {
                return NextResponse.json({ error: tplPutShiftErr, code: 'SHIFT_ASSIGNMENT_INVALID' }, { status: 422 });
            }
        }

        if (Object.keys(upd).length > 0) {
            const { error } = await adminSupabase
                .from('receiving_templates')
                .update(upd)
                .eq('id', id)
                .eq('restaurant_id', restaurant_id);
            if (error) {
                console.error('[PATCH /api/receiving-templates/:id]', error);
                return NextResponse.json({ error: error.message }, { status: 500 });
            }
        }

        // Sprint 67: substitui os turnos N:N quando o payload os trouxe.
        if (incomingShiftIds !== null) {
            await replaceTemplateShifts(adminSupabase, restaurant_id, id, incomingShiftIds);
        }

        if (hasTasks) {
            const normalized = normalizeTasks(b.tasks);
            if (!Array.isArray(normalized)) {
                return NextResponse.json({ error: normalized.error }, { status: 400 });
            }
            const { error: rpcErr } = await adminSupabase.rpc('replace_receiving_template_tasks', {
                p_template_id: id,
                p_restaurant_id: restaurant_id,
                p_tasks: normalized,
            });
            if (rpcErr) {
                console.error('[PATCH /api/receiving-templates/:id] rpc:', rpcErr);
                return NextResponse.json({ error: rpcErr.message }, { status: 500 });
            }
        }

        const { data: full } = await adminSupabase
            .from('receiving_templates')
            .select('*, area:areas(id, name, color), role:roles(id, name, color), tasks:receiving_template_tasks(*)')
            .eq('id', id)
            .eq('restaurant_id', restaurant_id)
            .single();

        return NextResponse.json(full as ReceivingTemplate);
    } catch (error: unknown) {
        console.error('[PATCH /api/receiving-templates/:id] inesperado:', error);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}

/**
 * DELETE /api/receiving-templates/:id?restaurant_id=...
 * Soft-delete (active=false). Execuções já criadas não são afetadas.
 */
export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params;
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        const token = authHeader.replace('Bearer ', '');

        const { searchParams } = new URL(request.url);
        const restaurant_id = searchParams.get('restaurant_id');
        if (!restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório.' }, { status: 400 });
        }

        const { user, role, adminSupabase } = await resolveAuth(token, restaurant_id);
        if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        if (!role || role === 'staff') {
            return NextResponse.json({ error: 'Permissão negada.' }, { status: 403 });
        }

        const { error } = await adminSupabase
            .from('receiving_templates')
            .update({ active: false })
            .eq('id', id)
            .eq('restaurant_id', restaurant_id);
        if (error) {
            console.error('[DELETE /api/receiving-templates/:id]', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        console.error('[DELETE /api/receiving-templates/:id] inesperado:', error);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}
