import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const getAdminSupabase = () =>
    createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const authHeader = request.headers.get('Authorization');
        if (!authHeader) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        const token = authHeader.replace('Bearer ', '');
        const admin = getAdminSupabase();

        const { data: { user } } = await admin.auth.getUser(token);
        if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

        const { data: issue } = await admin
            .from('task_issues')
            .select('id, restaurant_id, reported_by')
            .eq('id', id)
            .maybeSingle();

        if (!issue) return NextResponse.json({ error: 'Ocorrência não encontrada' }, { status: 404 });

        const { data: membership } = await admin
            .from('restaurant_users')
            .select('role')
            .eq('restaurant_id', issue.restaurant_id)
            .eq('user_id', user.id)
            .eq('active', true)
            .maybeSingle();

        const isGestor = membership?.role === 'owner' || membership?.role === 'manager';
        const isOwnIssue = issue.reported_by === user.id;

        if (!isGestor && !isOwnIssue) {
            return NextResponse.json({ error: 'Sem acesso a esta ocorrência' }, { status: 403 });
        }

        const { data: events, error } = await admin
            .from('task_issue_events')
            .select('*')
            .eq('task_issue_id', id)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('[GET /api/task-issues/[id]/events] error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        return NextResponse.json({ events: events ?? [] });
    } catch (error) {
        console.error('[GET /api/task-issues/[id]/events] error:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
