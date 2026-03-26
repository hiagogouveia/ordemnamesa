import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const getAdminSupabase = () => {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
};

const PAGE_SIZE = 10;

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const restaurant_id = searchParams.get('restaurant_id');

        if (!restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id é obrigatório' }, { status: 400 });
        }

        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Não autorizado. Referencie Headers.' }, { status: 401 });
        }
        const token = authHeader.replace('Bearer ', '');
        const adminSupabase = getAdminSupabase();

        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);
        if (userError || !user) {
            return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
        }

        // Parâmetros de paginação e filtro
        const page   = Math.max(0, parseInt(searchParams.get('page')  ?? '0', 10));
        const limit  = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? String(PAGE_SIZE), 10)));
        const filter = searchParams.get('filter') ?? 'all';   // 'all' | 'done' | 'skipped' | 'flagged'
        const date   = searchParams.get('date')   ?? '';       // 'YYYY-MM-DD' ou ''

        const from = page * limit;
        const to   = from + limit - 1;

        // Datas para métricas de variação
        const todayStart     = new Date(); todayStart.setHours(0, 0, 0, 0);
        const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate() - 1);
        const todayISO     = todayStart.toISOString();
        const yesterdayISO = yesterdayStart.toISOString();

        // Query base (dados paginados) — colunas explícitas, sem select('*')
        let dataQuery = adminSupabase
            .from('task_executions')
            .select(`
                id,
                task_id,
                checklist_id,
                status,
                executed_at,
                photo_url,
                notes,
                checklist_tasks ( title, is_critical ),
                checklists ( name, category )
            `, { count: 'exact' })
            .eq('restaurant_id', restaurant_id)
            .eq('user_id', user.id)
            .order('executed_at', { ascending: false })
            .range(from, to);

        if (filter !== 'all') {
            dataQuery = dataQuery.eq('status', filter);
        }
        if (date) {
            const dateStart = `${date}T00:00:00.000Z`;
            const dateEnd   = `${date}T23:59:59.999Z`;
            dataQuery = dataQuery.gte('executed_at', dateStart).lte('executed_at', dateEnd);
        }

        // Base para queries de contagem (compartilha os mesmos filtros de escopo)
        const baseCount = () =>
            adminSupabase
                .from('task_executions')
                .select('*', { count: 'exact', head: true })
                .eq('restaurant_id', restaurant_id)
                .eq('user_id', user.id);

        // 6 queries disparadas em paralelo:
        // [0] dados paginados + total filtrado
        // [1-3] contagens por status (para os cards de métricas — sem filtro de página)
        // [4-5] contagens de hoje/ontem para variação percentual
        const [
            dataResult,
            doneResult,
            skippedResult,
            flaggedResult,
            todayDoneResult,
            yesterdayDoneResult,
        ] = await Promise.all([
            dataQuery,
            baseCount().eq('status', 'done'),
            baseCount().eq('status', 'skipped'),
            baseCount().eq('status', 'flagged'),
            baseCount().eq('status', 'done').gte('executed_at', todayISO),
            baseCount().eq('status', 'done').gte('executed_at', yesterdayISO).lt('executed_at', todayISO),
        ]);

        if (dataResult.error) {
            console.error('[GET /api/execucoes/historico] Error:', dataResult.error);
            return NextResponse.json({ error: dataResult.error.message }, { status: 500 });
        }

        const doneCount      = doneResult.count      ?? 0;
        const skippedCount   = skippedResult.count   ?? 0;
        const flaggedCount   = flaggedResult.count   ?? 0;
        const todayDone      = todayDoneResult.count     ?? 0;
        const yesterdayDone  = yesterdayDoneResult.count ?? 0;

        const variacaoTotal =
            yesterdayDone === 0
                ? null
                : Math.round(((todayDone - yesterdayDone) / yesterdayDone) * 100);

        return NextResponse.json({
            entries: dataResult.data ?? [],
            total:   dataResult.count ?? 0,
            metrics: {
                total:         doneCount,
                aprovadas:     doneCount,
                pendentes:     skippedCount,
                incidentes:    flaggedCount,
                variacaoTotal,
            },
        });
    } catch (error: unknown) {
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
