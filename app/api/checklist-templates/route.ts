import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { ChecklistTemplate, ChecklistTemplateItem } from '@/lib/types';

// Sprint 70 — Modelos de Rotinas Prontas.
// Catálogo GLOBAL (sem restaurant_id), read-only. Retorna os modelos ativos
// com seus itens aninhados, ordenados por (category, sort_order) e (order).
// Auth: exige usuário autenticado (qualquer membro), pois o catálogo é comum.

const getAdminSupabase = () => {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
};

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

        const { data: templates, error: templatesError } = await adminSupabase
            .from('checklist_templates')
            .select('id, slug, name, description, category, icon, suggested_type, suggested_area_label, suggested_recurrence, suggested_recurrence_config, is_premium, is_active, version, sort_order')
            .eq('is_active', true)
            .order('category', { ascending: true })
            .order('sort_order', { ascending: true });

        if (templatesError) {
            console.error('[GET /api/checklist-templates] Erro ao buscar templates:', templatesError);
            return NextResponse.json({ error: 'Erro ao buscar modelos.' }, { status: 500 });
        }

        const templateIds = (templates || []).map((t) => t.id);
        let itemsByTemplate: Record<string, ChecklistTemplateItem[]> = {};

        if (templateIds.length > 0) {
            const { data: items, error: itemsError } = await adminSupabase
                .from('checklist_template_items')
                .select('id, template_id, item_slug, title, description, order, requires_photo, is_critical, requires_observation, type, max_photos, task_config')
                .in('template_id', templateIds);

            if (itemsError) {
                console.error('[GET /api/checklist-templates] Erro ao buscar itens:', itemsError);
                return NextResponse.json({ error: 'Erro ao buscar itens dos modelos.' }, { status: 500 });
            }

            // Ordena por `order` em JS (evita ambiguidade da palavra reservada no PostgREST)
            itemsByTemplate = (items || [])
                .slice()
                .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                .reduce((acc, item) => {
                    (acc[item.template_id] ||= []).push(item as ChecklistTemplateItem);
                    return acc;
                }, {} as Record<string, ChecklistTemplateItem[]>);
        }

        const result: ChecklistTemplate[] = (templates || []).map((t) => ({
            ...(t as ChecklistTemplate),
            items: itemsByTemplate[t.id] || [],
        }));

        return NextResponse.json(result);
    } catch (error: unknown) {
        console.error('[GET /api/checklist-templates] Erro inesperado:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
