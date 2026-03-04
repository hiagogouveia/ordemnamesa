import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const getAdminSupabase = () => {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
};

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await context.params;
        const { searchParams } = new URL(request.url);
        const restaurant_id = searchParams.get('restaurant_id');

        if (!restaurant_id) {
            return NextResponse.json({ error: 'restaurant_id faltando' }, { status: 400 });
        }

        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return NextResponse.json({ error: 'Não autorizado. Token Ausente.' }, { status: 401 });
        }
        const token = authHeader.replace('Bearer ', '');

        const adminSupabase = getAdminSupabase();
        const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);

        if (userError || !user) {
            console.error('[DELETE /api/execucoes/[id]] Auth error:', userError);
            return NextResponse.json({ error: 'Não autorizado ou Token inválido.' }, { status: 401 });
        }

        // 1. Validar se a execução pertence de fato ao usuário que tenta estornar e está vinculada ao restaurante.
        const { data: execucao, error: fetchError } = await adminSupabase
            .from('task_executions')
            .select('user_id, executed_at')
            .eq('id', id)
            .eq('restaurant_id', restaurant_id)
            .single();

        if (fetchError || !execucao) {
            return NextResponse.json({ error: 'Execução não encontrada' }, { status: 404 });
        }

        if (execucao.user_id !== user.id) {
            return NextResponse.json({ error: 'Apenas quem executou a tarefa pode estorná-la' }, { status: 403 });
        }

        // 2. Regra de Negócio: Estorno permitido apenas nos primeiros 5 minutos
        const executedTime = new Date(execucao.executed_at).getTime();
        const now = new Date().getTime();
        const diffMinutes = (now - executedTime) / (1000 * 60);

        if (diffMinutes > 5) {
            return NextResponse.json({ error: 'O prazo de 5 minutos para desfazer o registro expirou.' }, { status: 400 });
        }

        // 3. Deletar (Físico) conforme especificado no MASTER.md (o único cenário permitido). 
        const { error: deleteError } = await adminSupabase
            .from('task_executions')
            .delete()
            .eq('id', id);

        if (deleteError) {
            console.error('[DELETE /api/execucoes/[id]] Erro ao estornar execucao:', deleteError);
            return NextResponse.json({ error: deleteError.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        console.error('[DELETE /api/execucoes/[id]] Erro Inesperado:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
