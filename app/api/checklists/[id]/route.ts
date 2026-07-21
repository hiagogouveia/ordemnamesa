import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { ShiftType } from '@/lib/types';
import { processRecurrencePayload } from '@/lib/api/recurrence-payload';
import { deriveShiftEnum } from '@/lib/api/derive-shift-enum';
import { validateShiftAssignments } from '@/lib/api/validate-shift-assignment';
import { normalizeShiftIds, shiftIdShadow, replaceChecklistShifts, fetchShiftIdsByChecklist } from '@/lib/api/shift-links';
import {
    readAreaIdsFromBody,
    readResponsibleIdsFromBody,
    fetchAreaIdsByChecklist,
    fetchResponsibleIdsByChecklist,
    replaceChecklistAreas,
    replaceChecklistResponsibles,
    validateResponsiblesBelongToAreas,
} from '@/lib/api/area-links';
import { getAccountIdForRestaurant } from '@/lib/supabase/accounts';
import { getAccountBilling, canManageChecklists, canDeleteChecklists } from '@/lib/billing/subscription-access';
import { buildAccessDeniedResponse } from '@/lib/billing/errors';
import { collectExecutionPhotoPaths, collectIssuePhotoPaths, removePhotosBestEffort } from '@/lib/supabase/storage-cleanup';
import { fetchChecklistViews } from '@/lib/services/checklist-view';

const getAdminSupabase = () => {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
};

/**
 * GET /api/checklists/[id]?restaurant_id=<uuid>
 *
 * ── s90 — a peça que torna o deep-link DETERMINÍSTICO ────────────────────────
 *
 * Antes, a única forma de abrir uma rotina era achá-la na lista já carregada em
 * memória (`checklists.find(c => c.id === openId)`). Se ela não estivesse lá — porque
 * um filtro a escondeu, porque está inativa, porque a lista ainda não carregou, ou
 * porque o tenant é outro — o deep-link falhava EM SILÊNCIO: nenhum painel, nenhum
 * aviso, e o param ainda era apagado da URL.
 *
 * Carregar POR ID resolve isso na raiz: a rotina abre independentemente de qualquer
 * filtro ativo. É o que sustenta o requisito "jamais 'não encontrou rotina' quando
 * ela existe".
 *
 * Devolve códigos LEGÍVEIS POR MÁQUINA para que o destino possa distinguir os casos
 * e mostrar a mensagem certa em vez de uma tela branca:
 *   404 { code: 'CHECKLIST_NOT_FOUND' } → "Esta rotina não existe mais."
 *   403 { code: 'NO_ACCESS' }           → "Você não tem acesso a esta unidade."
 *
 * `includeOneShot: true` de propósito: uma notificação pode apontar para uma rotina
 * one-shot, que é excluída das LISTAGENS mas continua sendo um alvo válido.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await context.params;
        const { searchParams } = new URL(request.url);
        const restaurantId = searchParams.get('restaurant_id');

        if (!restaurantId) {
            return NextResponse.json(
                { error: 'restaurant_id é obrigatório', code: 'BAD_REQUEST' },
                { status: 400 }
            );
        }

        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Não autorizado', code: 'NO_ACCESS' }, { status: 401 });
        }

        const admin = getAdminSupabase();
        const { data: { user }, error: userError } = await admin.auth.getUser(
            authHeader.replace('Bearer ', '')
        );
        if (userError || !user) {
            return NextResponse.json({ error: 'Não autorizado', code: 'NO_ACCESS' }, { status: 401 });
        }

        // A URL é um PEDIDO, nunca uma autoridade: a pertinência é decidida aqui, no
        // servidor, contra a sessão. Um restaurant_id forjado na URL bate em 403.
        const { data: membership } = await admin
            .from('restaurant_users')
            .select('role')
            .eq('restaurant_id', restaurantId)
            .eq('user_id', user.id)
            .eq('active', true)
            .maybeSingle();

        if (!membership) {
            return NextResponse.json(
                { error: 'Sem acesso a este restaurante', code: 'NO_ACCESS' },
                { status: 403 }
            );
        }

        const rows = await fetchChecklistViews(admin, {
            restaurantIds: [restaurantId],
            checklistIds: [id],
            includeOneShot: true,
        });

        if (rows.length === 0) {
            // A rotina foi excluída, ou pertence a outro restaurante (o filtro por
            // restaurantIds já garante o isolamento — não vaza nem a existência).
            return NextResponse.json(
                { error: 'Rotina não encontrada', code: 'CHECKLIST_NOT_FOUND' },
                { status: 404 }
            );
        }

        return NextResponse.json(rows[0]);
    } catch (error: unknown) {
        console.error('[GET /api/checklists/[id]] Erro:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await context.params;

        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Não autorizado. Token Ausente.' }, { status: 401 });
        }
        const token = authHeader.replace('Bearer ', '');

        const adminSupabase = getAdminSupabase();
        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);

        if (userError || !user) {
            console.error('[PUT /api/checklists/[id]] Auth error:', userError);
            return NextResponse.json({ error: 'Não autorizado ou Token inválido.' }, { status: 401 });
        }

        const body = await request.json();
        const { restaurant_id, name, description, shift, shift_id, shift_ids, status, tasks, category, role_id, is_required, checklist_type, recurrence, start_time, end_time, recurrence_config, enforce_sequential_order, allow_early_start, target_role, assignment_type } = body;

        if (!restaurant_id || !name) {
            return NextResponse.json({ error: 'restaurant_id e name são obrigatórios.' }, { status: 400 });
        }

        // Permissão
        const { data: userRole } = await adminSupabase
            .from('restaurant_users')
            .select('role')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .eq('active', true)
            .single();

        if (!userRole || userRole.role === 'staff') {
            return NextResponse.json({ error: 'Permissões insuficientes.' }, { status: 403 });
        }

        // Enforcement billing: edição é uma operação de escrita
        const putAccountId = await getAccountIdForRestaurant(adminSupabase, restaurant_id);
        if (!putAccountId) {
            return NextResponse.json({ error: 'Unidade não pertence a nenhuma account.' }, { status: 404 });
        }
        const putBilling = await getAccountBilling(adminSupabase, putAccountId);
        const putAccess = canManageChecklists(putBilling);
        if (!putAccess.allowed) return buildAccessDeniedResponse(putAccess);

        // Sprint 92 — mesma proteção do antigo `safeAreaId`, agora sobre o conjunto N:N:
        // se o payload não trouxe áreas/responsáveis, preserva o que já está gravado
        // (PUT parcial não pode zerar a distribuição da rotina).
        const incomingAreaIds = readAreaIdsFromBody(body);
        const effectiveAreaIds = incomingAreaIds
            ?? ((await fetchAreaIdsByChecklist(adminSupabase, [id])).get(id) ?? []);

        if (effectiveAreaIds.length === 0) {
            return NextResponse.json({ error: 'Selecione ao menos uma área para a rotina.' }, { status: 400 });
        }

        const incomingResponsibleIds = readResponsibleIdsFromBody(body);
        const effectiveResponsibleIds = incomingResponsibleIds
            ?? ((await fetchResponsibleIdsByChecklist(adminSupabase, [id])).get(id) ?? []);

        const isIndividual = assignment_type !== undefined
            ? assignment_type === 'user'
            : effectiveResponsibleIds.length > 0;

        if (isIndividual && effectiveResponsibleIds.length === 0) {
            return NextResponse.json(
                { error: 'Selecione ao menos um responsável ou mude a atribuição para toda a equipe.' },
                { status: 400 }
            );
        }

        if (status === 'active') {
            let effectiveTasksCount = 0;
            if (Array.isArray(tasks)) {
                effectiveTasksCount = tasks.length;
            } else {
                const { count } = await adminSupabase
                    .from('checklist_tasks')
                    .select('id', { count: 'exact', head: true })
                    .eq('checklist_id', id);
                effectiveTasksCount = count ?? 0;
            }
            if (effectiveTasksCount === 0) {
                return NextResponse.json(
                    { error: 'Adicione ao menos uma tarefa para publicar a rotina.', code: 'NO_TASKS' },
                    { status: 400 }
                );
            }
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

        // Validação de domínio: todo responsável deve pertencer a ALGUMA das áreas.
        const putResponsibleAreaErr = await validateResponsiblesBelongToAreas(
            adminSupabase, restaurant_id, effectiveResponsibleIds, effectiveAreaIds,
        );
        if (putResponsibleAreaErr) {
            return NextResponse.json({ error: putResponsibleAreaErr }, { status: 422 });
        }

        // Sprint 66: turnos N:N. incomingShiftIds = null → não alterar turnos.
        const incomingShiftIds: string[] | null = ('shift_ids' in body)
            ? normalizeShiftIds(shift_ids)
            : (('shift_id' in body) ? (shift_id ? [shift_id as string] : []) : null);

        // Atribuição direta exige interseção com os turnos da rotina (efetivos:
        // enviados no body, senão os atuais do registro via junção N:N).
        const effectiveShiftIds = incomingShiftIds !== null
            ? incomingShiftIds
            : ((await fetchShiftIdsByChecklist(adminSupabase, [id])).get(id) ?? []);
        const putShiftAssignErr = await validateShiftAssignments(adminSupabase, restaurant_id, effectiveResponsibleIds, effectiveShiftIds);
        if (putShiftAssignErr) {
            return NextResponse.json({ error: putShiftAssignErr, code: 'SHIFT_ASSIGNMENT_INVALID' }, { status: 422 });
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

        // Sprint 66: quando o payload traz turnos (shift_ids/shift_id), atualiza os
        // shadows (shift_id primário + enum derivado); a junção N:N é substituída
        // após o update. Quando ausente, preserva as colunas atuais.
        const shiftFields: { shift?: ShiftType; shift_id?: string | null } = {};
        if (incomingShiftIds !== null) {
            const sidShadow = shiftIdShadow(incomingShiftIds);
            shiftFields.shift_id = sidShadow;
            shiftFields.shift = await deriveShiftEnum(adminSupabase, restaurant_id, sidShadow);
        } else if (shift !== undefined) {
            shiftFields.shift = shift;
        }

        // 1. Atualizar Checklist
        const { error: updateError } = await adminSupabase
            .from('checklists')
            .update({
                name, description, ...shiftFields, status, category,
                role_id, is_required: is_required !== undefined ? is_required : true, checklist_type: checklist_type || 'regular',
                // Sombras s92: recalculadas por trigger a partir das junções abaixo.
                assigned_to_user_id: effectiveResponsibleIds.length === 1 ? effectiveResponsibleIds[0] : null,
                recurrence: finalRecurrence,
                start_time: start_time || null,
                end_time: end_time || null,
                recurrence_config: finalRecurrenceConfig,
                enforce_sequential_order: enforce_sequential_order !== undefined ? enforce_sequential_order : false,
                allow_early_start: allow_early_start !== undefined ? allow_early_start : false,
                area_id: effectiveAreaIds[0],
                target_role: target_role || 'all',
                assignment_type: isIndividual ? 'user' : 'area',
            })
            .eq('id', id)
            .eq('restaurant_id', restaurant_id);

        if (updateError) {
            console.error('[PUT /api/checklists/[id]] Erro no update do checklist:', updateError);
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        // Sprint 66: substitui os turnos N:N quando o payload os trouxe.
        if (incomingShiftIds !== null) {
            await replaceChecklistShifts(adminSupabase, restaurant_id, id, incomingShiftIds);
        }

        // Sprint 92: idem para áreas e responsáveis — só quando vieram no payload.
        if (incomingAreaIds !== null) {
            await replaceChecklistAreas(adminSupabase, restaurant_id, id, effectiveAreaIds);
        }
        if (incomingResponsibleIds !== null || !isIndividual) {
            await replaceChecklistResponsibles(
                adminSupabase, restaurant_id, id, isIndividual ? effectiveResponsibleIds : [],
            );
        }

        // 2. Reconciliar Tasks (só quando o payload traz o campo `tasks`)
        //
        // Um PUT parcial — que atualiza apenas nome/turno/área da rotina — NÃO pode tocar nas
        // tarefas. Antes, o bloco de remoção rodava fora desta guarda: um PUT sem `tasks` apagava
        // todas as tarefas da rotina.
        let createdCount = 0;
        let updatedCount = 0;
        let deletedCount = 0;

        if (Array.isArray(tasks)) {
            const { data: existingTasks, error: existingErr } = await adminSupabase
                .from('checklist_tasks')
                .select('id')
                .eq('checklist_id', id);

            if (existingErr) {
                console.error('[PUT /api/checklists/[id]] Erro ao ler tasks atuais:', existingErr);
                return NextResponse.json({ error: existingErr.message }, { status: 500 });
            }

            // Começa com todas as tarefas do banco; cada tarefa enviada no payload é "reclamada"
            // (removida do set). O que sobrar no fim foi removido pelo usuário.
            const existingTaskIds = new Set(existingTasks?.map(t => t.id) || []);
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
            const tasksToUpdate: any[] = [];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const tasksToInsert: any[] = [];

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            tasks.forEach((task: any, index: number) => {
                const taskPayload = {
                    checklist_id: id,
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
                };

                if (task.id && existingTaskIds.has(task.id)) {
                    tasksToUpdate.push({ ...taskPayload, id: task.id });
                    existingTaskIds.delete(task.id); // Marked as preserved
                } else {
                    tasksToInsert.push(taskPayload);
                }
            });

            // Update das preservadas. Uma falha aqui é uma falha do save: precisa chegar ao
            // frontend, senão o usuário vê "salvo com sucesso" sobre uma alteração que não existiu.
            for (const task of tasksToUpdate) {
                const { error: updateTaskError } = await adminSupabase
                    .from('checklist_tasks')
                    .update(task)
                    .eq('id', task.id);
                if (updateTaskError) {
                    console.error('[PUT /api/checklists/[id]] Erro update task:', updateTaskError);
                    return NextResponse.json({ error: updateTaskError.message }, { status: 500 });
                }
            }
            updatedCount = tasksToUpdate.length;

            if (tasksToInsert.length > 0) {
                const { error: insertError } = await adminSupabase
                    .from('checklist_tasks')
                    .insert(tasksToInsert);
                if (insertError) {
                    console.error('[PUT /api/checklists/[id]] Erro insert task:', insertError);
                    return NextResponse.json({ error: insertError.message }, { status: 500 });
                }
                createdCount = tasksToInsert.length;
            }

            // Remoção: hard delete, sem exceção.
            //
            // Até a s89 havia um guard que pulava as tarefas com histórico de execução — era a
            // causa do bug "removi a tarefa, salvei, ela voltou": a tarefa continuava com
            // `checklist_id` apontando para a rotina e reaparecia no próximo GET.
            //
            // O guard existia para proteger a auditoria, que montava a lista de tarefas de um dia
            // passado a partir da definição ATUAL. Isso mudou: a sessão carrega a composição
            // congelada no assume (`tasks_snapshot`, s88) e cada execução carrega os snapshots de
            // identidade da tarefa (s84). O passado é auto-suficiente. A s89 removeu as FKs
            // histórico → definição, então este delete não cascateia em `task_executions` /
            // `task_issues` e não dispara os triggers de imutabilidade.
            const idsToRemove = Array.from(existingTaskIds);
            if (idsToRemove.length > 0) {
                const { error: deleteError } = await adminSupabase
                    .from('checklist_tasks')
                    .delete()
                    .in('id', idsToRemove);
                if (deleteError) {
                    console.error('[PUT /api/checklists/[id]] Erro ao remover tasks:', deleteError);
                    return NextResponse.json({ error: deleteError.message }, { status: 500 });
                }
                deletedCount = idsToRemove.length;
            }

            console.log('[PUT /api/checklists/[id]] Tasks reconciliadas:', {
                checklist_id: id,
                created: createdCount,
                updated: updatedCount,
                deleted: deletedCount,
            });
        }

        // 3. Devolver a rotina no MESMO shape do GET da listagem.
        //
        // Antes, a resposta era `*, roles, tasks` — sem o objeto `area`, sem `responsible`, sem
        // `shifts`. O cliente escreve esta resposta direto no cache da lista (useUpdateChecklist),
        // então a linha renderizava "Sem área" até o refetch chegar; no autosave (que não invalida)
        // o item ficava mutilado no cache. `fetchChecklistViews` é a fonte única desse shape.
        const [fullChecklist] = await fetchChecklistViews(adminSupabase, {
            restaurantIds: [restaurant_id],
            checklistIds: [id],
            includeOneShot: true, // um-shot também precisa da resposta ao ser editado
        });

        if (!fullChecklist) {
            console.error('[PUT /api/checklists/[id]] Checklist não encontrado após update:', id);
            return NextResponse.json({ error: 'Rotina não encontrada após a atualização.' }, { status: 500 });
        }

        return NextResponse.json(fullChecklist);
    } catch (error: unknown) {
        console.error('[PUT /api/checklists/[id]] Erro Inesperado:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await context.params;

        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Não autorizado. Token Ausente.' }, { status: 401 });
        }
        const token = authHeader.replace('Bearer ', '');

        const adminSupabase = getAdminSupabase();
        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);

        if (userError || !user) {
            console.error('[PATCH /api/checklists/[id]] Auth error:', userError);
            return NextResponse.json({ error: 'Não autorizado ou Token inválido.' }, { status: 401 });
        }

        const body = await request.json();
        const { restaurant_id, active } = body;

        if (!restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório.' }, { status: 400 });
        }

        const { data: userRole } = await adminSupabase
            .from('restaurant_users')
            .select('role')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .eq('active', true)
            .single();

        if (!userRole || userRole.role === 'staff') {
            return NextResponse.json({ error: 'Permissões insuficientes.' }, { status: 403 });
        }

        // Enforcement billing: PATCH (toggle active/archived) é escrita
        const patchAccountId = await getAccountIdForRestaurant(adminSupabase, restaurant_id);
        if (!patchAccountId) {
            return NextResponse.json({ error: 'Unidade não pertence a nenhuma account.' }, { status: 404 });
        }
        const patchBilling = await getAccountBilling(adminSupabase, patchAccountId);
        const patchAccess = canManageChecklists(patchBilling);
        if (!patchAccess.allowed) return buildAccessDeniedResponse(patchAccess);

        const updateData: Record<string, unknown> = {};
        if (active !== undefined) updateData.active = active;

        const { error: updateError } = await adminSupabase
            .from('checklists')
            .update(updateData)
            .eq('id', id)
            .eq('restaurant_id', restaurant_id);

        if (updateError) {
            console.error('[PATCH /api/checklists/[id]] Erro no update:', updateError);
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        console.error('[PATCH /api/checklists/[id]] Erro Inesperado:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await context.params;
        const { searchParams } = new URL(request.url);
        const restaurant_id = searchParams.get('restaurant_id');

        if (!restaurant_id) return NextResponse.json({ error: 'restaurant_id faltando' }, { status: 400 });

        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Não autorizado. Token Ausente.' }, { status: 401 });
        }
        const token = authHeader.replace('Bearer ', '');

        const adminSupabase = getAdminSupabase();
        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);

        if (userError || !user) {
            console.error('[DELETE /api/checklists/[id]] Auth error:', userError);
            return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        }

        // Permissão
        const { data: userRole } = await adminSupabase
            .from('restaurant_users')
            .select('role')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .eq('active', true)
            .single();

        if (!userRole || userRole.role === 'staff') {
            return NextResponse.json({ error: 'Permissões insuficientes' }, { status: 403 });
        }

        // Enforcement billing: trial expirado e past_due PODEM deletar (regra de negócio).
        // Apenas accounts efetivamente mortas (canceled) ficam bloqueadas.
        const delAccountId = await getAccountIdForRestaurant(adminSupabase, restaurant_id);
        if (!delAccountId) {
            return NextResponse.json({ error: 'Unidade não pertence a nenhuma account.' }, { status: 404 });
        }
        const delBilling = await getAccountBilling(adminSupabase, delAccountId);
        const delAccess = canDeleteChecklists(delBilling);
        if (!delAccess.allowed) return buildAccessDeniedResponse(delAccess);

        // Imutabilidade do histórico (s85): se o checklist já tem QUALQUER histórico auditável
        // (execuções ou sessões/assumptions), ele NÃO pode sofrer hard-delete — o CASCADE apagaria
        // o histórico. Nesse caso, arquivamos (active=false): some das listas operacionais e não
        // pode mais ser executado, mas a Auditoria/PDF continuam exibindo o histórico.
        const [execCount, assumptionCount] = await Promise.all([
            adminSupabase
                .from('task_executions')
                .select('id', { count: 'exact', head: true })
                .eq('checklist_id', id)
                .eq('restaurant_id', restaurant_id),
            adminSupabase
                .from('checklist_assumptions')
                .select('id', { count: 'exact', head: true })
                .eq('checklist_id', id)
                .eq('restaurant_id', restaurant_id),
        ]);
        const hasHistory = (execCount.count ?? 0) > 0 || (assumptionCount.count ?? 0) > 0;

        if (hasHistory) {
            const { error: archiveError } = await adminSupabase
                .from('checklists')
                .update({ active: false })
                .eq('id', id)
                .eq('restaurant_id', restaurant_id);
            if (archiveError) {
                console.error('[DELETE /api/checklists/[id]] Erro ao arquivar checklist:', archiveError);
                return NextResponse.json({ error: archiveError.message }, { status: 500 });
            }
            // Histórico (incl. fotos) é preservado — não removemos evidências aqui.
            return NextResponse.json({ success: true, archived: true });
        }

        // Sem histórico: hard-delete permitido (rascunho/nunca executado).
        // Coletar paths das fotos ANTES do delete (a cascata s75 apaga as linhas,
        // mas não os arquivos no Storage — sem isto eles virariam órfãos).
        const [execRows, issueRows] = await Promise.all([
            adminSupabase
                .from('task_executions')
                .select('photo_url, photos')
                .eq('checklist_id', id)
                .eq('restaurant_id', restaurant_id),
            adminSupabase
                .from('task_issues')
                .select('photos')
                .eq('checklist_id', id)
                .eq('restaurant_id', restaurant_id),
        ]);
        const photoPaths = [
            ...collectExecutionPhotoPaths(execRows.data ?? []),
            ...collectIssuePhotoPaths(issueRows.data ?? []),
        ];

        // Hard delete. A cascata no banco (s75) remove todos os dados derivados:
        // checklist_tasks, checklist_assumptions, checklist_orders, checklist_shifts,
        // task_executions e task_issues/task_issue_events. Não é mais necessário
        // apagar filhos manualmente.
        const { error } = await adminSupabase
            .from('checklists')
            .delete()
            .eq('id', id)
            .eq('restaurant_id', restaurant_id);

        if (error) {
            console.error('[DELETE /api/checklists/[id]] Erro ao deletar checklist:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Remove as evidências do Storage (best-effort, nunca derruba a request).
        await removePhotosBestEffort(adminSupabase, photoPaths);

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        console.error('[DELETE /api/checklists/[id]] Erro Inesperado:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
