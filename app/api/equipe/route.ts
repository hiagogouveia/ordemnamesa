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

        // 2. Desempenho dos Colaboradores (Tarefas concluídas últimos 7 dias)
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
                performance: pStats.total === 0 ? null : rating
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
        const { name, email, password, role, restaurant_id } = body;

        if (!name || !email || !password || !role || !restaurant_id) {
            return NextResponse.json({ error: 'Campos obrigatórios faltando' }, { status: 400 });
        }

        if (password.length < 6) {
            return NextResponse.json({ error: 'Senha deve ter no mínimo 6 caracteres' }, { status: 400 });
        }

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

        // 1. Criar usuário no Auth sem confirmação de e-mail
        const { data: authUser, error: authError } = await adminSupabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { name },
        });

        if (authError) {
            if (authError.message.toLowerCase().includes('already')) {
                return NextResponse.json({ error: 'E-mail já cadastrado' }, { status: 409 });
            }
            throw authError;
        }

        const newUserId = authUser.user.id;

        // 2. Garantir entrada em public.users (trigger já faz isso, mas upsert por segurança)
        await adminSupabase
            .from('users')
            .upsert({ id: newUserId, email, name }, { onConflict: 'id' });

        // 3. Inserir em restaurant_users
        const { error: ruError } = await adminSupabase
            .from('restaurant_users')
            .insert({ restaurant_id, user_id: newUserId, role, active: true });

        if (ruError) throw ruError;

        return NextResponse.json({ success: true, user_id: newUserId });

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
