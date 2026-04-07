import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

interface PublicUser {
    name?: string | null;
    email?: string | null;
    avatar_url?: string | null;
}

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

        if (!restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório' }, { status: 400 });
        }

        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        }

        const token = authHeader.replace('Bearer ', '');
        const adminSupabase = getAdminSupabase();
        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);

        if (userError || !user) {
            return NextResponse.json({ error: 'Sem autorização' }, { status: 401 });
        }

        // Validação Role
        const { data: userRole } = await adminSupabase
            .from('restaurant_users')
            .select('role')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .eq('active', true)
            .single();

        if (!userRole || userRole.role === 'staff') {
            return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
        }

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        // 1. Tabela de Colaboradores
        // Puxa todos os restaurant_users vinculados e info da tabela users
        const { data: members, error: membersErr } = await adminSupabase
            .from('restaurant_users')
            .select(`
                id,
                user_id,
                role,
                active,
                joined_at,
                user:users(id, name, email, avatar_url)
            `)
            .eq('restaurant_id', restaurant_id);

        if (membersErr) throw membersErr;

        // 2. Áreas de cada colaborador (fonte única: user_areas + areas)
        const [
            { data: userAreaRows, error: userAreasErr },
            { data: allAreasData, error: areasErr },
        ] = await Promise.all([
            adminSupabase
                .from('user_areas')
                .select('user_id, area_id')
                .eq('restaurant_id', restaurant_id),
            adminSupabase
                .from('areas')
                .select('id, name, color')
                .eq('restaurant_id', restaurant_id),
        ]);

        if (userAreasErr) console.error('[GET /api/equipe] user_areas error:', userAreasErr);
        if (areasErr) console.error('[GET /api/equipe] areas error:', areasErr);

        const areasById: Record<string, { id: string; name: string; color: string }> = {};
        if (allAreasData) {
            for (const a of allAreasData) {
                areasById[a.id] = { id: a.id, name: a.name, color: a.color };
            }
        }

        const areasMap: Record<string, { id: string; name: string; color: string }[]> = {};
        if (userAreaRows) {
            for (const ua of userAreaRows) {
                const area = areasById[ua.area_id];
                if (!area) continue;
                if (!areasMap[ua.user_id]) areasMap[ua.user_id] = [];
                areasMap[ua.user_id].push(area);
            }
        }

        // 3. Desempenho dos Colaboradores (Tarefas concluídas últimos 7 dias)
        const { data: execucoes } = await adminSupabase
            .from('task_executions')
            .select('user_id, status')
            .eq('restaurant_id', restaurant_id)
            .gte('executed_at', sevenDaysAgo.toISOString());

        // Precisamos saber o total esperado global por staff?
        // O mais simples de performance rate inter-staffs é pegar as tasks que eles concluiram como done e dividir por total que mexeram, ou só número absoluto.
        // O layout pede "% de desempenho", que poderia ser (tarefas done / todas as execs que ele consta)? Ou total tasks do restaurante.
        // Vamos usar tasks_done / total de execucoes no qual estão associados nas últimas 1 semanas.
        const performanceMap: Record<string, { done: number, total: number }> = {};
        let totalDoneGlobal = 0;
        let totalExecsGlobal = 0;

        if (execucoes) {
            execucoes.forEach(ex => {
                totalExecsGlobal++;
                const isDone = ex.status === 'done' || ex.status === 'completed';
                if (isDone) totalDoneGlobal++;

                if (ex.user_id) {
                    if (!performanceMap[ex.user_id]) {
                        performanceMap[ex.user_id] = { done: 0, total: 0 };
                    }
                    performanceMap[ex.user_id].total++;
                    if (isDone) performanceMap[ex.user_id].done++;
                }
            });
        }

        const globalPerformance = totalExecsGlobal > 0 ? Math.round((totalDoneGlobal / totalExecsGlobal) * 100) : 0;

        // Estruturar retorno para a página
        const activeMembers = members?.filter(m => m.active) || [];
        const turnosAtivos = Math.floor(activeMembers.length * 0.4); // Mock: approx at working shifts

        const equipeFormated = members?.map(m => {
            const u = m.user as unknown as PublicUser | null;
            const pmId = m.user_id || m.id; // se por algum motivo for nulo o user_id, usa uuid de vinculo
            const pStats = performanceMap[pmId] || { done: 0, total: 0 };

            // % rating
            let rating = 0;
            if (pStats.total > 0) {
                rating = Math.round((pStats.done / pStats.total) * 100);
            } else {
                rating = 100; // se ele nao fez nada, nao penaliza. Se precisarmos ver vazio, retornamos null
            }

            return {
                id: m.id,
                user_id: m.user_id,
                name: u ? (u.name || 'Usuário Pendente') : 'Desconhecido',
                email: u?.email || 'N/A',
                avatar: u?.avatar_url || null,
                role: m.role,
                active: m.active,
                performance: pStats.total === 0 ? null : rating,
                areas: areasMap[m.user_id] || []
            };
        });

        // Retornar também métricas do Header da Equipe
        return NextResponse.json({
            metrics: {
                total_colaboradores: members?.length || 0,
                turnos_ativos: turnosAtivos,
                media_desempenho: globalPerformance
            },
            equipe: equipeFormated || []
        });

    } catch (error: unknown) {
        console.error('API Equipe Error:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        }

        const token = authHeader.replace('Bearer ', '');
        const adminSupabase = getAdminSupabase();

        const { data: { user: caller }, error: callerError } = await adminSupabase.auth.getUser(token);
        if (callerError || !caller) {
            return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        }

        const body = await request.json();
        const { name, email: rawEmail, password, role, restaurant_id } = body;

        // password é opcional: só obrigatório para usuários novos
        if (!name || !rawEmail || !role || !restaurant_id) {
            return NextResponse.json({ error: 'Campos obrigatórios faltando' }, { status: 400 });
        }

        // Normalizar email para evitar duplicatas por capitalização ou espaços
        const email = rawEmail.trim().toLowerCase();

        // Verificar que o chamador é owner ou manager
        const { data: membership } = await adminSupabase
            .from('restaurant_users')
            .select('role')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', caller.id)
            .eq('active', true)
            .single();

        if (!membership || !['owner', 'manager'].includes(membership.role)) {
            return NextResponse.json({ error: 'Permissão negada.' }, { status: 403 });
        }

        // Validar role
        if (!['owner', 'manager', 'staff'].includes(role)) {
            return NextResponse.json({ error: 'Cargo inválido.' }, { status: 400 });
        }

        // Manager só pode convidar colaboradores (staff)
        if (membership.role === 'manager' && role !== 'staff') {
            return NextResponse.json({ error: 'Gerência só pode convidar colaboradores.' }, { status: 403 });
        }

        // --- ETAPA 1: Resolver user_id ---
        // Verificar se o usuário já existe em public.users pelo email
        let { data: existingUser } = await adminSupabase
            .from('users')
            .select('id')
            .eq('email', email)
            .maybeSingle();

        if (!existingUser) {
            // Usuário novo: criar no Auth (o trigger sincroniza para public.users)
            if (!password || password.length < 6) {
                return NextResponse.json(
                    { error: 'Senha é obrigatória para novos colaboradores (mínimo 6 caracteres)' },
                    { status: 400 }
                );
            }

            const { data: authUser, error: authError } = await adminSupabase.auth.admin.createUser({
                email,
                password,
                email_confirm: true,
                user_metadata: { name },
            });

            if (authError) {
                // Corrida: outra requisição criou o usuário entre o select e o createUser
                if (authError.message.toLowerCase().includes('already')) {
                    const { data: fallbackUser } = await adminSupabase
                        .from('users')
                        .select('id')
                        .eq('email', email)
                        .maybeSingle();

                    if (!fallbackUser) {
                        // Auth tem o usuário mas public.users não — trigger falhou
                        console.error('USER_SYNC_INCONSISTENCY', { email });
                        return NextResponse.json(
                            { error: 'Inconsistência de dados. Contate o suporte.' },
                            { status: 500 }
                        );
                    }

                    existingUser = fallbackUser;
                } else {
                    throw authError;
                }
            } else {
                // Confiar na trigger on_auth_user_created para sincronizar public.users.
                // Lê o id do authUser diretamente — sem upsert manual para não mascarar falha da trigger.
                existingUser = { id: authUser.user.id };
            }
        }
        // Se usuário já existia: reutiliza o id sem criar novo no Auth
        // (senha enviada é ignorada — não sobrescrever credenciais existentes)

        const userId = existingUser.id;

        // --- ETAPA 2: Resolver vínculo com restaurante (idempotente) ---
        const { data: existingLink } = await adminSupabase
            .from('restaurant_users')
            .select('id, active')
            .eq('user_id', userId)
            .eq('restaurant_id', restaurant_id)
            .maybeSingle();

        if (existingLink) {
            if (existingLink.active) {
                // Já está ativo neste restaurante — idempotência
                return NextResponse.json({ success: true, user_id: userId });
            }

            // Vínculo inativo: reativar (recontratação)
            const { error: reactivateError } = await adminSupabase
                .from('restaurant_users')
                .update({ active: true, role, left_at: null })
                .eq('id', existingLink.id);

            if (reactivateError) throw reactivateError;

            return NextResponse.json({ success: true, user_id: userId });
        }

        // Vínculo não existe: criar
        const { error: ruError } = await adminSupabase
            .from('restaurant_users')
            .insert({ restaurant_id, user_id: userId, role, active: true });

        if (ruError) throw ruError;

        return NextResponse.json({ success: true, user_id: userId });

    } catch (err: unknown) {
        console.error('[POST /api/equipe]', err);
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}

export async function PUT(request: Request) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        }

        const token = authHeader.replace('Bearer ', '');
        const adminSupabase = getAdminSupabase();

        const { data: { user: caller }, error: callerError } = await adminSupabase.auth.getUser(token);
        if (callerError || !caller) {
            return NextResponse.json({ error: 'Sem autorização.' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const restaurant_id = searchParams.get('restaurant_id');

        const { id, active, role } = await request.json();

        if (!restaurant_id || (!id)) {
            return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 });
        }

        // Verificar que o caller é owner ou manager
        const { data: membership } = await adminSupabase
            .from('restaurant_users')
            .select('role')
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', caller.id)
            .eq('active', true)
            .single();

        if (!membership || !['owner', 'manager'].includes(membership.role)) {
            return NextResponse.json({ error: 'Permissão negada.' }, { status: 403 });
        }

        // Buscar registro alvo para validações
        const { data: target } = await adminSupabase
            .from('restaurant_users')
            .select('role, user_id')
            .eq('id', id)
            .eq('restaurant_id', restaurant_id)
            .single();

        if (!target) {
            return NextResponse.json({ error: 'Membro não encontrado.' }, { status: 404 });
        }

        // Manager não pode alterar cargos
        if (membership.role === 'manager' && role !== undefined) {
            return NextResponse.json({ error: 'Gerência não pode alterar cargos.' }, { status: 403 });
        }

        // Manager só pode gerenciar colaboradores (staff)
        if (membership.role === 'manager' && target.role !== 'staff') {
            return NextResponse.json({ error: 'Gerência só pode gerenciar colaboradores.' }, { status: 403 });
        }

        // Proteger último owner: não desativar nem rebaixar
        if (target.role === 'owner') {
            const isBeingDeactivated = active === false;
            const isBeingDemoted = role !== undefined && role !== 'owner';

            if (isBeingDeactivated || isBeingDemoted) {
                const { count } = await adminSupabase
                    .from('restaurant_users')
                    .select('*', { count: 'exact', head: true })
                    .eq('restaurant_id', restaurant_id)
                    .eq('role', 'owner')
                    .eq('active', true);

                if ((count ?? 0) <= 1) {
                    return NextResponse.json(
                        { error: 'Não é possível remover o único administrador.' },
                        { status: 403 }
                    );
                }
            }
        }

        const updates: Record<string, boolean | string> = {};
        if (active !== undefined) updates.active = active;
        if (role !== undefined) updates.role = role;

        const { data, error } = await adminSupabase
            .from('restaurant_users')
            .update(updates)
            .eq('id', id)
            .eq('restaurant_id', restaurant_id)
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ success: true, data });

    } catch (err: unknown) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}
