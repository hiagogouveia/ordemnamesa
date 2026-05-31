import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { ReceivingTemplate } from '@/lib/types';
import { deriveShiftEnum } from '@/lib/api/derive-shift-enum';

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
            .select('*, area:areas(id, name, color), role:roles(id, name, color)')
            .eq('restaurant_id', restaurant_id)
            .order('name', { ascending: true });
        if (!includeInactive) query = query.eq('active', true);

        const { data, error } = await query;
        if (error) {
            console.error('[GET /api/receiving-templates] Erro:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        return NextResponse.json((data ?? []) as ReceivingTemplate[]);
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
            restaurant_id, name, description, area_id, role_id, assigned_to_user_id,
            recurrence, recurrence_config, enforce_sequential_order, tasks, shift, shift_id,
        } = body as Record<string, unknown>;

        if (!restaurant_id || typeof restaurant_id !== 'string') {
            return NextResponse.json({ error: 'restaurant_id é obrigatório.' }, { status: 400 });
        }
        if (!area_id || typeof area_id !== 'string') {
            return NextResponse.json({ error: 'area_id é obrigatório.' }, { status: 400 });
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

        // Sprint 63: shift_id é a fonte da verdade. Quando enviado, deriva o enum
        // `shift` do turno (mapeando 'any' → null, pois o CHECK do template não
        // aceita 'any'). Sem shift_id no body → mantém o enum legado recebido.
        const hasShiftId = 'shift_id' in body;
        const finalShiftId = hasShiftId && typeof shift_id === 'string' && shift_id ? shift_id : null;
        const derivedEnum = hasShiftId ? await deriveShiftEnum(adminSupabase, restaurant_id, finalShiftId) : null;
        const finalShift = hasShiftId ? (derivedEnum === 'any' ? null : derivedEnum) : cleanShift;

        // Insert template
        const { data: template, error: insertErr } = await adminSupabase
            .from('receiving_templates')
            .insert({
                restaurant_id,
                name: cleanName,
                description: typeof description === 'string' ? description.trim() || null : null,
                area_id,
                role_id: typeof role_id === 'string' && role_id ? role_id : null,
                assigned_to_user_id: typeof assigned_to_user_id === 'string' && assigned_to_user_id ? assigned_to_user_id : null,
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
            .select('*, area:areas(id, name, color), role:roles(id, name, color), tasks:receiving_template_tasks(*)')
            .eq('id', template.id)
            .single();

        return NextResponse.json(full as ReceivingTemplate, { status: 201 });
    } catch (error: unknown) {
        console.error('[POST /api/receiving-templates] Erro inesperado:', error);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}
