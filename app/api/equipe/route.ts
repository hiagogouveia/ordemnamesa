import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveGlobalScope, rejectIfGlobal, isGlobalScopeResult } from '@/lib/api/global-scope';

interface PublicUser {
    name?: string | null;
    email?: string | null;
    avatar_url?: string | null;
}

interface UnitBadge {
    id: string;
    name: string;
    role: 'owner' | 'manager' | 'staff';
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
        const account_id = searchParams.get('account_id');
        const mode = searchParams.get('mode');
        const isGlobal = mode === 'global';

        if (!isGlobal && !restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório' }, { status: 400 });
        }
        if (isGlobal && !account_id) {
            return NextResponse.json({ error: 'account_id é obrigatório em modo global' }, { status: 400 });
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

        // Resolver lista de restaurant_ids que a query vai agregar.
        // Em global: server-side via canUseGlobal (nunca confia no frontend).
        // Em single: apenas o restaurant_id passado, com validação de role.
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

            if (!userRole || userRole.role === 'staff') {
                return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
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
            return NextResponse.json({
                metrics: { total_colaboradores: 0, turnos_ativos: 0, media_desempenho: 0 },
                equipe: [],
            });
        }

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const { data: members, error: membersErr } = await adminSupabase
            .from('restaurant_users')
            .select(`
                id,
                restaurant_id,
                user_id,
                role,
                active,
                joined_at,
                user:users(id, name, email, avatar_url)
            `)
            .in('restaurant_id', restaurantIds);

        if (membersErr) throw membersErr;

        const [
            { data: userAreaRows, error: userAreasErr },
            { data: allAreasData, error: areasErr },
        ] = await Promise.all([
            adminSupabase
                .from('user_areas')
                .select('user_id, area_id, restaurant_id')
                .in('restaurant_id', restaurantIds),
            adminSupabase
                .from('areas')
                .select('id, name, color, restaurant_id')
                .in('restaurant_id', restaurantIds),
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
                if (!areasMap[ua.user_id].some((a) => a.id === area.id)) {
                    areasMap[ua.user_id].push(area);
                }
            }
        }

        const { data: execucoes } = await adminSupabase
            .from('task_executions')
            .select('user_id, status')
            .in('restaurant_id', restaurantIds)
            .gte('executed_at', sevenDaysAgo.toISOString());

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

        // Em single mode: 1 linha por vínculo (preserva contrato existente).
        // Em global mode: 1 linha por user, com units[] listando vínculos.
        if (isGlobal) {
            const byUser = new Map<string, {
                id: string;
                user_id: string;
                name: string;
                email: string;
                avatar: string | null;
                role: 'owner' | 'manager' | 'staff';
                active: boolean;
                units: UnitBadge[];
            }>();

            for (const m of members || []) {
                const u = m.user as unknown as PublicUser | null;
                const unit = unitsById[m.restaurant_id];
                if (!unit) continue;
                const existing = byUser.get(m.user_id);
                const link: UnitBadge = { id: unit.id, name: unit.name, role: m.role };
                if (existing) {
                    if (!existing.units.some((x) => x.id === link.id)) existing.units.push(link);
                    // Papel global: maior nível vence (owner > manager > staff).
                    const rank = { owner: 3, manager: 2, staff: 1 };
                    if (rank[link.role] > rank[existing.role]) existing.role = link.role;
                    if (m.active) existing.active = true;
                } else {
                    byUser.set(m.user_id, {
                        id: m.id,
                        user_id: m.user_id,
                        name: u ? (u.name || 'Usuário Pendente') : 'Desconhecido',
                        email: u?.email || 'N/A',
                        avatar: u?.avatar_url || null,
                        role: m.role,
                        active: m.active,
                        units: [link],
                    });
                }
            }

            const equipeFormated = Array.from(byUser.values()).map((row) => {
                const pStats = performanceMap[row.user_id] || { done: 0, total: 0 };
                const rating = pStats.total > 0 ? Math.round((pStats.done / pStats.total) * 100) : 100;
                return {
                    ...row,
                    performance: pStats.total === 0 ? null : rating,
                    areas: areasMap[row.user_id] || [],
                };
            });

            const activeCount = equipeFormated.filter((e) => e.active).length;
            return NextResponse.json({
                metrics: {
                    total_colaboradores: equipeFormated.length,
                    turnos_ativos: Math.floor(activeCount * 0.4),
                    media_desempenho: globalPerformance,
                },
                equipe: equipeFormated,
            });
        }

        const activeMembers = members?.filter(m => m.active) || [];
        const turnosAtivos = Math.floor(activeMembers.length * 0.4);

        const equipeFormated = members?.map(m => {
            const u = m.user as unknown as PublicUser | null;
            const pmId = m.user_id || m.id;
            const pStats = performanceMap[pmId] || { done: 0, total: 0 };
            const rating = pStats.total > 0 ? Math.round((pStats.done / pStats.total) * 100) : 100;
            const unit = unitsById[m.restaurant_id];

            return {
                id: m.id,
                user_id: m.user_id,
                name: u ? (u.name || 'Usuário Pendente') : 'Desconhecido',
                email: u?.email || 'N/A',
                avatar: u?.avatar_url || null,
                role: m.role,
                active: m.active,
                performance: pStats.total === 0 ? null : rating,
                areas: areasMap[m.user_id] || [],
                units: unit ? [{ id: unit.id, name: unit.name, role: m.role }] : [],
            };
        });

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
        const blocked = rejectIfGlobal(request);
        if (blocked) return blocked;

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
        const blocked = rejectIfGlobal(request);
        if (blocked) return blocked;

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
