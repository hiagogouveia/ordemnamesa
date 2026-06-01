import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { ChecklistKit, ChecklistKitItem } from '@/lib/types';

// Sprint 72 — Kits de Rotinas.
// Catálogo GLOBAL read-only: kits ativos com sua composição (modelos + nível).
// Auth: exige usuário autenticado.

const getAdminSupabase = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(request: Request) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Não autorizado. Token ausente.' }, { status: 401 });
        }
        const token = authHeader.replace('Bearer ', '');
        const adminSupabase = getAdminSupabase();

        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);
        if (userError || !user) {
            return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
        }

        const { data: kits, error: kitsError } = await adminSupabase
            .from('template_kits')
            .select('id, slug, name, description, segment, icon, is_active, version, sort_order')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });

        if (kitsError) {
            console.error('[GET /api/checklist-kits] Erro ao buscar kits:', kitsError);
            return NextResponse.json({ error: 'Erro ao buscar kits.' }, { status: 500 });
        }

        const kitIds = (kits || []).map((k) => k.id);
        if (kitIds.length === 0) return NextResponse.json([]);

        // Composição com dados do modelo embutidos
        const { data: items, error: itemsError } = await adminSupabase
            .from('template_kit_items')
            .select('kit_id, template_id, requirement_level, sort_order, template:checklist_templates(slug, name, category, icon, suggested_area_label, is_active)')
            .in('kit_id', kitIds);

        if (itemsError) {
            console.error('[GET /api/checklist-kits] Erro ao buscar itens:', itemsError);
            return NextResponse.json({ error: 'Erro ao buscar composição dos kits.' }, { status: 500 });
        }

        // Contagem de itens por modelo (para exibir "N tarefas")
        const { data: tplItems, error: tplItemsError } = await adminSupabase
            .from('checklist_template_items')
            .select('template_id');
        if (tplItemsError) {
            console.error('[GET /api/checklist-kits] Erro ao contar itens de modelo:', tplItemsError);
            return NextResponse.json({ error: 'Erro ao contar itens.' }, { status: 500 });
        }
        const countByTemplate = (tplItems || []).reduce((acc, r) => {
            acc[r.template_id] = (acc[r.template_id] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        // Agrupa itens por kit (ignorando modelos inativos)
        const itemsByKit: Record<string, ChecklistKitItem[]> = {};
        for (const row of items || []) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const tpl = (row as any).template;
            if (!tpl || tpl.is_active === false) continue;
            (itemsByKit[row.kit_id] ||= []).push({
                template_id: row.template_id,
                requirement_level: row.requirement_level,
                sort_order: row.sort_order,
                template_slug: tpl.slug,
                template_name: tpl.name,
                template_category: tpl.category,
                template_icon: tpl.icon ?? null,
                template_suggested_area: tpl.suggested_area_label ?? null,
                template_item_count: countByTemplate[row.template_id] || 0,
            });
        }

        const result: ChecklistKit[] = (kits || []).map((k) => ({
            ...(k as ChecklistKit),
            items: (itemsByKit[k.id] || []).sort((a, b) => a.sort_order - b.sort_order),
        }));

        return NextResponse.json(result);
    } catch (error: unknown) {
        console.error('[GET /api/checklist-kits] Erro inesperado:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
