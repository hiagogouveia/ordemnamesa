import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const getAdminSupabase = () => {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
};

function parseTimeToMinutes(timeStr: string): number {
    const [h, m] = timeStr.split(":").map(Number);
    return h * 60 + m;
}

interface ChecklistRow {
    id: string;
    start_time: string | null;
    end_time: string | null;
    execution_status: string | null;
}

function getAutoPriorityBucket(c: ChecklistRow, currentMinutes: number): number {
    const start = c.start_time ? parseTimeToMinutes(c.start_time) : null;
    const end = c.end_time ? parseTimeToMinutes(c.end_time) : null;
    const status = c.execution_status ?? "not_started";

    if (end !== null && currentMinutes > end && status !== "done") return 1;
    if (status === "in_progress" && end !== null) return 2;
    if ((status === "not_started" || status === "blocked") && end !== null && (start === null || currentMinutes >= start)) return 3;
    if (start !== null && currentMinutes < start) return 5;
    return 4;
}

function getAutoPrioritySortKey(c: ChecklistRow, currentMinutes: number): number {
    const end = c.end_time ? parseTimeToMinutes(c.end_time) : Infinity;
    const start = c.start_time ? parseTimeToMinutes(c.start_time) : Infinity;
    const bucket = getAutoPriorityBucket(c, currentMinutes);

    switch (bucket) {
        case 1: case 2: case 3: return end;
        case 5: return start;
        default: return 0;
    }
}

/**
 * POST /api/checklists/auto-prioritize
 * Recalculates order_index based on auto-priority logic and sets area priority_mode = 'auto'
 */
export async function POST(request: Request) {
    try {
        const authHeader = request.headers.get("Authorization");
        if (!authHeader) {
            return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
        }
        const token = authHeader.replace("Bearer ", "");

        const adminSupabase = getAdminSupabase();
        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);

        if (userError || !user) {
            return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
        }

        const body = await request.json();
        const { restaurant_id, area_id } = body as {
            restaurant_id: string;
            area_id: string;
        };

        if (!restaurant_id || !area_id) {
            return NextResponse.json({ error: "restaurant_id e area_id são obrigatórios." }, { status: 400 });
        }

        // Permission check
        const { data: userRole } = await adminSupabase
            .from("restaurant_users")
            .select("role")
            .eq("restaurant_id", restaurant_id)
            .eq("user_id", user.id)
            .eq("active", true)
            .single();

        if (!userRole || userRole.role === "staff") {
            return NextResponse.json({ error: "Permissões insuficientes." }, { status: 403 });
        }

        // Fetch active checklists for this area
        const { data: checklists, error: fetchError } = await adminSupabase
            .from("checklists")
            .select("id, start_time, end_time, active")
            .eq("restaurant_id", restaurant_id)
            .eq("area_id", area_id)
            .eq("active", true);

        if (fetchError) {
            return NextResponse.json({ error: fetchError.message }, { status: 500 });
        }

        if (!checklists || checklists.length === 0) {
            // Just set mode to auto even with no checklists
            await adminSupabase
                .from("areas")
                .update({ priority_mode: "auto" })
                .eq("id", area_id)
                .eq("restaurant_id", restaurant_id);

            return NextResponse.json({ success: true, updated: 0 });
        }

        // Fetch today's execution statuses
        const today = new Date().toISOString().slice(0, 10);
        const checklistIds = checklists.map((c) => c.id);

        const { data: assumptions } = await adminSupabase
            .from("checklist_assumptions")
            .select("checklist_id, execution_status")
            .eq("restaurant_id", restaurant_id)
            .eq("date_key", today)
            .in("checklist_id", checklistIds);

        const statusMap = new Map<string, string>();
        if (assumptions) {
            for (const a of assumptions) {
                statusMap.set(a.checklist_id, a.execution_status);
            }
        }

        // Build enriched list
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();

        const enriched: ChecklistRow[] = checklists.map((c) => ({
            id: c.id,
            start_time: c.start_time,
            end_time: c.end_time,
            execution_status: statusMap.get(c.id) ?? "not_started",
        }));

        // Sort by auto-priority
        enriched.sort((a, b) => {
            const bucketA = getAutoPriorityBucket(a, currentMinutes);
            const bucketB = getAutoPriorityBucket(b, currentMinutes);
            if (bucketA !== bucketB) return bucketA - bucketB;
            return getAutoPrioritySortKey(a, currentMinutes) - getAutoPrioritySortKey(b, currentMinutes);
        });

        // Update order_index for each checklist
        const results = await Promise.allSettled(
            enriched.map((c, index) =>
                adminSupabase
                    .from("checklists")
                    .update({ order_index: index })
                    .eq("id", c.id)
                    .eq("restaurant_id", restaurant_id)
            )
        );

        for (const result of results) {
            if (result.status === "rejected") {
                return NextResponse.json({ error: String(result.reason) }, { status: 500 });
            }
            if (result.status === "fulfilled" && result.value.error) {
                return NextResponse.json({ error: result.value.error.message }, { status: 500 });
            }
        }

        // Set area to auto mode
        const { error: areaError } = await adminSupabase
            .from("areas")
            .update({ priority_mode: "auto" })
            .eq("id", area_id)
            .eq("restaurant_id", restaurant_id);

        if (areaError) {
            return NextResponse.json({ error: areaError.message }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            updated: enriched.length,
            new_order: enriched.map((c, i) => ({ id: c.id, order_index: i })),
        });
    } catch (error: unknown) {
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
