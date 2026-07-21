import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveGlobalScope, rejectIfGlobal, isGlobalScopeResult } from '@/lib/api/global-scope';
import { getAccountIdForRestaurant } from '@/lib/supabase/accounts';
import { getAccountBilling, canManageChecklists } from '@/lib/billing/subscription-access';
import { buildAccessDeniedResponse } from '@/lib/billing/errors';
import { processRecurrencePayload } from '@/lib/api/recurrence-payload';
import { deriveShiftEnum } from '@/lib/api/derive-shift-enum';
import { validateShiftAssignments } from '@/lib/api/validate-shift-assignment';
import { normalizeShiftIds, shiftIdShadow, replaceChecklistShifts } from '@/lib/api/shift-links';
import {
    readAreaIdsFromBody,
    readResponsibleIdsFromBody,
    replaceChecklistAreas,
    replaceChecklistResponsibles,
    validateResponsiblesBelongToAreas,
} from '@/lib/api/area-links';
import { trackChecklistEvent } from '@/lib/analytics/track-event';
import { fetchChecklistViews } from '@/lib/services/checklist-view';

const getAdminSupabase = () => {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
};

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const restaurant_id = searchParams.get('restaurant_id');
        const account_id = searchParams.get('account_id');
        const mode = searchParams.get('mode');
        const isGlobal = mode === 'global';
        // Sprint 53: por padrão escondemos instâncias one-shot (recebimentos
        // rápidos) das listagens administrativas. Cliente pode opt-in via
        // ?include_one_shot=true para visões de histórico futuras.
        const includeOneShot = searchParams.get('include_one_shot') === 'true';

        if (!isGlobal && !restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório' }, { status: 400 });
        }
        if (isGlobal && !account_id) {
            return NextResponse.json({ error: 'account_id é obrigatório em modo global' }, { status: 400 });
        }

        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Não autorizado. Referencie Headers.' }, { status: 401 });
        }
        const token = authHeader.replace('Bearer ', '');
        const adminSupabase = getAdminSupabase();

        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);

        if (userError || !user) {
            console.error('[GET /api/checklists] User check failed:', userError);
            return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        }

        let restaurantIds: string[] = [];
        const unitsById: Record<string, { id: string; name: string }> = {};

        if (isGlobal) {
            const scopeResult = await resolveGlobalScope(adminSupabase, account_id!, user.id);
            if (!isGlobalScopeResult(scopeResult)) return scopeResult; // 403
            restaurantIds = scopeResult.restaurantIds;
            Object.assign(unitsById, scopeResult.unitsById);
        } else {
            const { data: userRole } = await adminSupabase
                .from('restaurant_users')
                .select('role')
                .eq('restaurant_id', restaurant_id!)
                .eq('user_id', user.id)
                .eq('active', true)
                .single();

            if (!userRole) {
                return NextResponse.json({ error: 'Permissões do restaurante não encontradas' }, { status: 403 });
            }
            const { data: rest } = await adminSupabase
                .from('restaurants')
                .select('id, name')
                .eq('id', restaurant_id!)
                .maybeSingle<{ id: string; name: string }>();
            if (rest) unitsById[rest.id] = { id: rest.id, name: rest.name };
            restaurantIds = [restaurant_id!];
        }

        if (restaurantIds.length === 0) {
            return NextResponse.json([]);
        }

        // O shape devolvido aqui é o MESMO que o PUT devolve (fetchChecklistViews) — é isso que
        // permite ao cliente escrever a resposta do save direto no cache da lista sem mutilar a
        // linha (o PUT antes omitia `area`/`shifts`/`responsible`, e a listagem piscava "Sem área").
        const formattedChecklists = await fetchChecklistViews(adminSupabase, {
            restaurantIds,
            includeOneShot,
            unitsById,
        });

        return NextResponse.json(formattedChecklists);
    } catch (error: unknown) {
        console.error('[GET /api/checklists] Erro inesperado:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const blocked = rejectIfGlobal(request);
        if (blocked) return blocked;

        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Não autorizado. Token ausente.' }, { status: 401 });
        }
        const token = authHeader.replace('Bearer ', '');
        const adminSupabase = getAdminSupabase();

        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);

        if (userError || !user) {
            console.error('[POST /api/checklists] Auth error:', userError);
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }

        const body = await request.json();
        const { restaurant_id, name, description, shift, shift_id, shift_ids, status, tasks, category, role_id, is_required, checklist_type, recurrence, start_time, end_time, recurrence_config, enforce_sequential_order, allow_early_start, target_role, assignment_type, origin_template_id, origin_template_version } = body;

        if (!restaurant_id || !name) {
            return NextResponse.json({ error: 'Campos obrigatórios faltando' }, { status: 400 });
        }

        // Sprint 92: áreas N:N. `area_ids` é a fonte da verdade; `area_id` único
        // continua aceito (clientes antigos) e vira uma lista de um elemento.
        const areaIds = readAreaIdsFromBody(body) ?? [];
        if (areaIds.length === 0) {
            return NextResponse.json({ error: 'Selecione ao menos uma área para a rotina.' }, { status: 400 });
        }

        // Responsáveis específicos (N:N). `assignment_type` é o discriminador do modo.
        const responsibleIds = readResponsibleIdsFromBody(body) ?? [];
        const isIndividual = assignment_type === 'user' || responsibleIds.length > 0;
        if (isIndividual && responsibleIds.length === 0) {
            return NextResponse.json(
                { error: 'Selecione ao menos um responsável ou mude a atribuição para toda a equipe.' },
                { status: 400 }
            );
        }

        if (status === 'active' && (!Array.isArray(tasks) || tasks.length === 0)) {
            return NextResponse.json(
                { error: 'Adicione ao menos uma tarefa para publicar a rotina.', code: 'NO_TASKS' },
                { status: 400 }
            );
        }

        // PR 2: roteamento estrito v2 vs v1 — payloads sem version=2 mantêm caminho legado
        const recurrenceProcess = processRecurrencePayload(recurrence_config);
        if (recurrenceProcess.mode === 'v2' && !recurrenceProcess.ok) {
            return NextResponse.json(
                { error: recurrenceProcess.error, code: 'INVALID_RECURRENCE_V2' },
                { status: 400 }
            );
        }

        // Validação legada de 'custom' — só roda quando NÃO é v2 (preserva v1 intacto)
        if (recurrenceProcess.mode === 'v1' && recurrence === 'custom') {
            const days = recurrence_config?.days_of_week;
            if (!Array.isArray(days) || days.length === 0) {
                return NextResponse.json(
                    { error: 'Recorrência personalizada exige ao menos um dia da semana selecionado.' },
                    { status: 400 }
                );
            }
        }

        const { data: userRole } = await adminSupabase
            .from('restaurant_users')
            .select('role')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .eq('active', true)
            .single();

        if (!userRole || userRole.role === 'staff') {
            return NextResponse.json({ error: 'Permissão negada' }, { status: 403 });
        }

        // Enforcement billing: só trial/active podem criar recursos
        const accountId = await getAccountIdForRestaurant(adminSupabase, restaurant_id);
        if (!accountId) {
            return NextResponse.json({ error: 'Unidade não pertence a nenhuma account.' }, { status: 404 });
        }
        const billing = await getAccountBilling(adminSupabase, accountId);
        const accessCheck = canManageChecklists(billing);
        if (!accessCheck.allowed) return buildAccessDeniedResponse(accessCheck);

        // Validação de domínio: todo responsável deve pertencer a ALGUMA das áreas.
        const responsibleAreaErr = await validateResponsiblesBelongToAreas(
            adminSupabase, restaurant_id, responsibleIds, areaIds,
        );
        if (responsibleAreaErr) {
            return NextResponse.json({ error: responsibleAreaErr }, { status: 422 });
        }

        // PR 2: Em v2, a fonte de verdade é o JSONB validado — sincroniza coluna text
        // com `validated.type`. Em v1, usa o caminho legado intacto.
        const finalRecurrence =
            recurrenceProcess.mode === 'v2' && recurrenceProcess.ok
                ? recurrenceProcess.validated.type
                : (recurrence && recurrence !== 'none' ? recurrence : 'daily');
        const finalRecurrenceConfig =
            recurrenceProcess.mode === 'v2' && recurrenceProcess.ok
                ? recurrenceProcess.validated
                : (recurrence_config || null);

        // Sprint 66: turnos N:N. shift_ids é a fonte da verdade (vazio = "Todos os
        // turnos"). Mantém shadows: shift_id (primário, só com 1 turno) + enum `shift`.
        const incomingShiftIds = ('shift_ids' in body)
            ? normalizeShiftIds(shift_ids)
            : (('shift_id' in body) ? (shift_id ? [shift_id as string] : []) : []);
        const finalShiftId = shiftIdShadow(incomingShiftIds);
        const finalShift = ('shift_ids' in body) || ('shift_id' in body)
            ? await deriveShiftEnum(adminSupabase, restaurant_id, finalShiftId)
            : (shift || 'any');

        // Sprint 66/92: cada responsável exige interseção com os turnos da rotina.
        const shiftAssignErr = await validateShiftAssignments(adminSupabase, restaurant_id, responsibleIds, incomingShiftIds);
        if (shiftAssignErr) {
            return NextResponse.json({ error: shiftAssignErr, code: 'SHIFT_ASSIGNMENT_INVALID' }, { status: 422 });
        }

        // 1. Criar o Checklist
        const { data: newChecklist, error: checklistError } = await adminSupabase
            .from('checklists')
            .insert({
                restaurant_id,
                name,
                description,
                shift: finalShift,
                shift_id: finalShiftId,
                category,
                status,
                role_id,
                is_required: is_required !== undefined ? is_required : true,
                checklist_type: checklist_type || 'regular',
                // Sombras s92: o valor real é gravado pelo trigger a partir das junções.
                assigned_to_user_id: responsibleIds.length === 1 ? responsibleIds[0] : null,
                recurrence: finalRecurrence,
                start_time: start_time || null,
                end_time: end_time || null,
                recurrence_config: finalRecurrenceConfig,
                enforce_sequential_order: enforce_sequential_order !== undefined ? enforce_sequential_order : false,
                allow_early_start: allow_early_start !== undefined ? allow_early_start : false,
                area_id: areaIds[0],
                target_role: target_role || 'all',
                assignment_type: isIndividual ? 'user' : 'area',
                // Sprint 70 — rastreabilidade da origem (importação de modelo do catálogo)
                origin_template_id: origin_template_id || null,
                origin_template_version: origin_template_version ?? null,
                active: true,
                created_by: user.id
            })
            .select()
            .single();

        if (checklistError) {
            console.error('[POST /api/checklists] Erro ao criar checklist mestre:', checklistError);
            return NextResponse.json({ error: checklistError.message }, { status: 500 });
        }

        // Sprint 66: grava os turnos N:N da rotina (vazio = "Todos os turnos").
        await replaceChecklistShifts(adminSupabase, restaurant_id, newChecklist.id, incomingShiftIds);

        // Sprint 92: áreas e responsáveis N:N. As colunas-sombra acima são
        // recalculadas por trigger a partir daqui.
        await replaceChecklistAreas(adminSupabase, restaurant_id, newChecklist.id, areaIds);
        await replaceChecklistResponsibles(adminSupabase, restaurant_id, newChecklist.id, responsibleIds);

        await trackChecklistEvent('checklist_created', {
            restaurantId: restaurant_id,
            userId: user.id,
            metadata: {
                checklist_id: newChecklist.id,
                shift: finalShift,
                checklist_type: checklist_type || 'regular',
                tasks_count: Array.isArray(tasks) ? tasks.length : 0,
            },
        });

        // 2. Inserir Tasks com Rollback
        let insertedTasks = [];
        if (tasks && tasks.length > 0) {
            // Validar campos novos (Sprint 35)
            const VALID_TYPES = new Set(['boolean', 'date', 'number', 'rating']);
            for (const t of tasks) {
                if (t.type !== undefined && t.type !== null && !VALID_TYPES.has(t.type)) {
                    return NextResponse.json({ error: `Tipo de tarefa inválido: ${t.type}` }, { status: 400 });
                }
                if (t.requires_photo && t.max_photos !== null && t.max_photos !== undefined && t.max_photos < 1) {
                    return NextResponse.json({ error: 'Máximo de fotos deve ser pelo menos 1.' }, { status: 400 });
                }
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const tasksToInsert = tasks.map((task: any, index: number) => ({
                checklist_id: newChecklist.id,
                restaurant_id,
                title: task.title,
                description: task.description,
                requires_photo: task.requires_photo || false,
                is_critical: task.is_critical || false,
                order: index,
                assigned_to_user_id: task.assigned_to_user_id || null,
                // Sprint 35
                type: task.type ?? 'boolean',
                requires_observation: task.requires_observation || false,
                max_photos: task.max_photos ?? null,
                task_config: task.task_config ?? null,
            }));

            const { data: newTasks, error: tasksError } = await adminSupabase
                .from('checklist_tasks')
                .insert(tasksToInsert)
                .select();

            if (tasksError) {
                console.error('[POST /api/checklists] Erro nas tasks, realizando rollback:', tasksError);
                await adminSupabase.from('checklists').delete().eq('id', newChecklist.id);
                return NextResponse.json({ error: tasksError.message }, { status: 500 });
            }
            insertedTasks = newTasks.sort((a, b) => a.order - b.order);
        }

        return NextResponse.json({ ...newChecklist, tasks: insertedTasks }, { status: 201 });
    } catch (error: unknown) {
        console.error('[POST /api/checklists] Erro Interno Desconhecido:', error);
        return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
    }
}
