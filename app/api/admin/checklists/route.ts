import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }
        
        const token = authHeader.replace('Bearer ', '');
        const adminSupabase = getAdminSupabase();

        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);

        if (userError || !user) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }

        // 1. Get all active checklists
        const { data: checklists } = await adminSupabase
            .from("checklists")
            .select("*, roles(id, name, color)")
            .eq("restaurant_id", restaurant_id)
            .eq("active", true);

        // 2. Get today's assumptions
        const todayKey = new Date().toISOString().split("T")[0];
        const { data: assumptions } = await adminSupabase
            .from("checklist_assumptions")
            .select("*")
            .eq("restaurant_id", restaurant_id)
            .eq("date_key", todayKey);

        // 3. Get tasks counts (for itemsCount)
        const { data: tasks } = await adminSupabase
            .from("checklist_tasks")
            .select("id, checklist_id")
            .eq("restaurant_id", restaurant_id);

        return NextResponse.json({
            checklists: checklists || [],
            assumptions: assumptions || [],
            tasks: tasks || []
        });
        
    } catch (error: any) {
        console.error('[GET /api/admin/checklists] Erro:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
