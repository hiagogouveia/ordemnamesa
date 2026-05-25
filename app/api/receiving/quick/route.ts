import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getBrazilDateKey } from '@/lib/utils/brazil-date';

const getAdminSupabase = () =>
    createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

/**
 * POST /api/receiving/quick
 *
 * Cria um "recebimento rápido" — uma instância one-shot de checklist do tipo
 * receiving criada ad-hoc pelo colaborador no Meu Turno quando o fornecedor
 * não tem template cadastrado.
 *
 * Não é um caminho paralelo: o resultado é um checklist real (com tasks,
 * assumption, executions, audit, fotos). O que muda é a flag is_one_shot,
 * que faz o checklist ficar fora das listagens de templates/rotinas.
 *
 * Body:
 *   {
 *     restaurant_id: string,
 *     area_id: string,
 *     supplier_name?: string,
 *     tasks: Array<{ title: string }>   // 1..5 tasks; pelo menos uma
 *   }
 *
 * Validações:
 * - User precisa pertencer ao restaurante e à área (user_areas).
 * - Área precisa ter allow_manual_receiving=true.
 * - 1 <= tasks.length <= 5; todos os titles não vazios.
 *
 * Rollback: Supabase REST não tem transação cross-request. Implementamos
 * compensação manual: se qualquer passo falhar, desfaz os anteriores. Logs
 * estruturados para detectar inconsistências em produção.
 */
export async function POST(request: Request) {
    const adminSupabase = getAdminSupabase();
    const startedAt = Date.now();

    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        const token = authHeader.replace('Bearer ', '');

        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);
        if (userError || !user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const body = await request.json().catch(() => ({}));
        const { restaurant_id, area_id, supplier_name, tasks } = body as {
            restaurant_id?: string;
            area_id?: string;
            supplier_name?: string;
            tasks?: Array<{ title?: string }>;
        };

        if (!restaurant_id) return NextResponse.json({ error: 'restaurant_id é obrigatório' }, { status: 400 });
        if (!area_id) return NextResponse.json({ error: 'area_id é obrigatório' }, { status: 400 });

        // Validação de tasks (1..5, title não-vazio)
        if (!Array.isArray(tasks) || tasks.length === 0) {
            return NextResponse.json({ error: 'Pelo menos uma tarefa é obrigatória' }, { status: 400 });
        }
        if (tasks.length > 5) {
            return NextResponse.json({ error: 'Máximo de 5 tarefas por recebimento rápido' }, { status: 400 });
        }
        const cleanTasks = tasks.map((t) => ({ title: (t?.title ?? '').trim() }));
        if (cleanTasks.some((t) => !t.title)) {
            return NextResponse.json({ error: 'Toda tarefa precisa de um título' }, { status: 400 });
        }

        // Membership
        const { data: membership } = await adminSupabase
            .from('restaurant_users')
            .select('role')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .eq('active', true)
            .maybeSingle();
        if (!membership) {
            return NextResponse.json({ error: 'Sem acesso a este restaurante' }, { status: 403 });
        }

        // Área precisa estar entre as áreas do user E ter allow_manual_receiving=true.
        // Owner/manager seguem a mesma regra operacional (decisão de produto:
        // contexto operacional não tem bypass — gestor precisa estar vinculado).
        const { data: userArea } = await adminSupabase
            .from('user_areas')
            .select('area_id')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .eq('area_id', area_id)
            .maybeSingle();
        if (!userArea) {
            return NextResponse.json({ error: 'Você não pertence a esta área' }, { status: 403 });
        }

        const { data: area } = await adminSupabase
            .from('areas')
            .select('id, name, allow_manual_receiving')
            .eq('id', area_id)
            .eq('restaurant_id', restaurant_id)
            .maybeSingle();
        if (!area || area.allow_manual_receiving !== true) {
            return NextResponse.json({ error: 'Esta área não permite recebimento manual' }, { status: 403 });
        }

        const userName = user.user_metadata?.name || user.email || 'Funcionário';
        const dateKey = getBrazilDateKey();
        const supplier = (supplier_name ?? '').trim() || null;

        // Nome legível e estável. Inclui hora pra distinguir múltiplos no mesmo dia.
        const nowLabel = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
        const checklistName = supplier
            ? `Recebimento rápido — ${supplier} (${nowLabel})`
            : `Recebimento rápido — ${userName} (${nowLabel})`;

        // ─── Etapa 1: criar checklist ─────────────────────────────────────────
        const { data: checklist, error: checklistError } = await adminSupabase
            .from('checklists')
            .insert({
                restaurant_id,
                name: checklistName,
                shift: 'any',
                status: 'active',
                active: true,
                created_by: user.id,
                checklist_type: 'receiving',
                receiving_mode: 'on_demand',
                receiving_generation: 'automatic',
                supplier_name: supplier,
                area_id,
                assigned_to_user_id: user.id,
                assignment_type: 'user',
                is_required: false,
                is_one_shot: true,
                enforce_sequential_order: false,
                recurrence: 'daily',
            })
            .select('id, name')
            .single();

        if (checklistError || !checklist) {
            console.error('[POST /api/receiving/quick] falha ao criar checklist:', checklistError);
            return NextResponse.json({ error: checklistError?.message ?? 'Erro ao criar recebimento' }, { status: 500 });
        }

        // ─── Etapa 2: criar tasks ─────────────────────────────────────────────
        const taskRows = cleanTasks.map((t, index) => ({
            checklist_id: checklist.id,
            restaurant_id,
            title: t.title,
            order: index,
            type: 'boolean',
            requires_photo: false,
            requires_observation: false,
            is_critical: false,
        }));

        const { error: tasksError } = await adminSupabase
            .from('checklist_tasks')
            .insert(taskRows);

        if (tasksError) {
            console.error('[POST /api/receiving/quick] falha em tasks — compensando checklist:', tasksError, {
                checklist_id: checklist.id,
                elapsed_ms: Date.now() - startedAt,
            });
            await adminSupabase.from('checklists').delete().eq('id', checklist.id);
            return NextResponse.json({ error: tasksError.message }, { status: 500 });
        }

        // ─── Etapa 3: criar assumption já assumida ────────────────────────────
        const { data: assumption, error: assumptionError } = await adminSupabase
            .from('checklist_assumptions')
            .insert({
                restaurant_id,
                checklist_id: checklist.id,
                user_id: user.id,
                user_name: userName,
                date_key: dateKey,
            })
            .select('id')
            .single();

        if (assumptionError || !assumption) {
            console.error('[POST /api/receiving/quick] falha em assumption — compensando tasks+checklist:', assumptionError, {
                checklist_id: checklist.id,
                elapsed_ms: Date.now() - startedAt,
            });
            // Tasks vão junto via ON DELETE CASCADE, mas garantimos explícito.
            await adminSupabase.from('checklist_tasks').delete().eq('checklist_id', checklist.id);
            await adminSupabase.from('checklists').delete().eq('id', checklist.id);
            return NextResponse.json({ error: assumptionError?.message ?? 'Erro ao iniciar recebimento' }, { status: 500 });
        }

        return NextResponse.json({
            checklist_id: checklist.id,
            assumption_id: assumption.id,
            name: checklist.name,
        });
    } catch (err) {
        console.error('[POST /api/receiving/quick] erro inesperado:', err);
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    }
}
