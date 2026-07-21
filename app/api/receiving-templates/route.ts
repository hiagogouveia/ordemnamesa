import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { RECEIVING_TEMPLATE_SELECT, shapeTemplateRow, shapeTemplateRows } from '@/lib/services/receiving-template-view';
import { deriveShiftEnum } from '@/lib/api/derive-shift-enum';
import { validateShiftAssignments } from '@/lib/api/validate-shift-assignment';
import { normalizeShiftIds, shiftIdShadow, replaceTemplateShifts } from '@/lib/api/shift-links';
import {
    readAreaIdsFromBody,
    readResponsibleIdsFromBody,
    replaceTemplateAreas,
    replaceTemplateResponsibles,
    validateResponsiblesBelongToAreas,
} from '@/lib/api/area-links';

const getAdminSupabase = () =>
    createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

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
 * GET /api/receiving-templates?restaurant_id=...&include_inactive=false
 * Lista templates (owner/manager). Sem tasks. Para tasks use /[id].
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const restaurant_id = searchParams.get('restaurant_id');
        const includeInactive = searchParams.get('include_inactive') === 'true';

        if (!restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório.' }, { status: 400 });
        }

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

        const { data: membership } = await adminSupabase
            .from('restaurant_users')
            .select('role')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .eq('active', true)
            .single();
        if (!membership || membership.role === 'staff') {
            return NextResponse.json({ error: 'Permissão negada.' }, { status: 403 });
        }

        let query = adminSupabase
            .from('receiving_templates')
            .select(RECEIVING_TEMPLATE_SELECT)
            .eq('restaurant_id', restaurant_id)
            .order('name', { ascending: true });
        if (!includeInactive) query = query.eq('active', true);

        const { data, error } = await query;
        if (error) {
            console.error('[GET /api/receiving-templates] Erro:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        return NextResponse.json(shapeTemplateRows(data ?? []));
    } catch (error: unknown) {
        console.error('[GET /api/receiving-templates] Erro inesperado:', error);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}

/**
 * POST /api/receiving-templates
 * Cria template + tasks atomicamente (via RPC replace).
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
            restaurant_id, name, description, role_id, assignment_type,
            recurrence, recurrence_config, enforce_sequential_order, tasks, shift, shift_id, shift_ids,
        } = body as Record<string, unknown>;

        if (!restaurant_id || typeof restaurant_id !== 'string') {
            return NextResponse.json({ error: 'restaurant_id é obrigatório.' }, { status: 400 });
        }

        // Sprint 92: áreas N:N (aceita `area_id` único de clientes antigos).
        const areaIds = readAreaIdsFromBody(body as Record<string, unknown>) ?? [];
        if (areaIds.length === 0) {
            return NextResponse.json({ error: 'Selecione ao menos uma área para o modelo.' }, { status: 400 });
        }

        const responsibleIds = readResponsibleIdsFromBody(body as Record<string, unknown>) ?? [];
        const isIndividual = assignment_type === 'user' || responsibleIds.length > 0;
        if (isIndividual && responsibleIds.length === 0) {
            return NextResponse.json(
                { error: 'Selecione ao menos um responsável ou mude a atribuição para toda a equipe.' },
                { status: 400 }
            );
        }
        const cleanName = typeof name === 'string' ? name.trim() : '';
        if (!cleanName) return NextResponse.json({ error: 'name é obrigatório.' }, { status: 400 });

        const VALID_RECURRENCES = ['daily','weekly','monthly','yearly','weekdays','custom','shift_days'];
        const cleanRecurrence = typeof recurrence === 'string' && VALID_RECURRENCES.includes(recurrence) ? recurrence : 'daily';

        const VALID_SHIFTS = ['morning','afternoon','evening'];
        const cleanShift = typeof shift === 'string' && VALID_SHIFTS.includes(shift) ? shift : null;

        const normalized = normalizeTasks(tasks);
        if (!Array.isArray(normalized)) {
            return NextResponse.json({ error: normalized.error }, { status: 400 });
        }

        const { data: membership } = await adminSupabase
            .from('restaurant_users')
            .select('role')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .eq('active', true)
            .single();
        if (!membership || membership.role === 'staff') {
            return NextResponse.json({ error: 'Permissão negada.' }, { status: 403 });
        }

        // Sprint 67: turnos N:N. shift_ids é a fonte da verdade (vazio = "Todos os
        // turnos"). Shadows: shift_id (primário, só com 1 turno) + enum `shift`
        // ('any' → null, pois o CHECK do template não aceita 'any').
        const incomingShiftIds = ('shift_ids' in body)
            ? normalizeShiftIds(shift_ids)
            : (typeof shift_id === 'string' && shift_id ? [shift_id] : []);
        const finalShiftId = shiftIdShadow(incomingShiftIds);
        const derivedEnum = await deriveShiftEnum(adminSupabase, restaurant_id, finalShiftId);
        const finalShift = ('shift_ids' in body) || ('shift_id' in body)
            ? (derivedEnum === 'any' ? null : derivedEnum)
            : cleanShift;

        // Sprint 66/92: cada responsável exige interseção com os turnos do modelo.
        const tplShiftAssignErr = await validateShiftAssignments(adminSupabase, restaurant_id, responsibleIds, incomingShiftIds);
        if (tplShiftAssignErr) {
            return NextResponse.json({ error: tplShiftAssignErr, code: 'SHIFT_ASSIGNMENT_INVALID' }, { status: 422 });
        }

        // Sprint 92: todo responsável deve pertencer a alguma das áreas do modelo.
        const tplResponsibleAreaErr = await validateResponsiblesBelongToAreas(
            adminSupabase, restaurant_id, responsibleIds, areaIds,
        );
        if (tplResponsibleAreaErr) {
            return NextResponse.json({ error: tplResponsibleAreaErr }, { status: 422 });
        }

        // Insert template
        const { data: template, error: insertErr } = await adminSupabase
            .from('receiving_templates')
            .insert({
                restaurant_id,
                name: cleanName,
                description: typeof description === 'string' ? description.trim() || null : null,
                // Sombras s92: recalculadas por trigger a partir das junções.
                area_id: areaIds[0],
                role_id: typeof role_id === 'string' && role_id ? role_id : null,
                assigned_to_user_id: responsibleIds.length === 1 ? responsibleIds[0] : null,
                assignment_type: isIndividual ? 'user' : 'area',
                shift: finalShift,
                shift_id: finalShiftId,
                recurrence: cleanRecurrence,
                recurrence_config: recurrence_config ?? null,
                enforce_sequential_order: !!enforce_sequential_order,
                created_by: user.id,
            })
            .select()
            .single();
        if (insertErr || !template) {
            console.error('[POST /api/receiving-templates] insert error:', insertErr);
            return NextResponse.json({ error: insertErr?.message || 'Falha ao criar template.' }, { status: 500 });
        }

        // Sprint 67: grava os turnos N:N do modelo (vazio = "Todos os turnos").
        await replaceTemplateShifts(adminSupabase, restaurant_id, template.id, incomingShiftIds);

        // Sprint 92: áreas e responsáveis N:N.
        await replaceTemplateAreas(adminSupabase, restaurant_id, template.id, areaIds);
        await replaceTemplateResponsibles(adminSupabase, restaurant_id, template.id, responsibleIds);

        // Insert tasks via RPC (atomic)
        const { error: tasksErr } = await adminSupabase.rpc('replace_receiving_template_tasks', {
            p_template_id: template.id,
            p_restaurant_id: restaurant_id,
            p_tasks: normalized,
        });
        if (tasksErr) {
            // compensação: apaga template criado
            await adminSupabase.from('receiving_templates').delete().eq('id', template.id);
            console.error('[POST /api/receiving-templates] tasks rpc error:', tasksErr);
            return NextResponse.json({ error: tasksErr.message }, { status: 500 });
        }

        const { data: full } = await adminSupabase
            .from('receiving_templates')
            .select(`${RECEIVING_TEMPLATE_SELECT}, tasks:receiving_template_tasks(*)`)
            .eq('id', template.id)
            .single();

        return NextResponse.json(full ? shapeTemplateRow(full) : null, { status: 201 });
    } catch (error: unknown) {
        console.error('[POST /api/receiving-templates] Erro inesperado:', error);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}
