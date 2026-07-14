import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * READINESS — "a aplicação consegue efetivamente SERVIR?"
 *
 * Ao contrário do liveness (`/api/health`), esta rota CHECA AS DEPENDÊNCIAS: banco e
 * Storage. É o que faltava — sem ela, nada no sistema sabia dizer se o Supabase estava
 * de pé.
 *
 * ── O CONTRATO (leia antes de mudar) ─────────────────────────────────────────
 *
 * O veredito viaja no STATUS HTTP: **200 = pronto, 503 = degradado**.
 *
 * Isso é o que torna o monitoramento uma peça TROCÁVEL: QUALQUER monitor — inclusive um
 * `curl -f` num script — decide sozinho, sem parsear o corpo e sem conhecer este formato.
 *
 * A aplicação NÃO SABE quem a monitora, e isso é deliberado: trocar de ferramenta de
 * monitoramento não deve tocar em uma linha de código daqui. (Há um teste que falha se
 * o nome de alguma ferramenta aparecer em `app/` ou `lib/` — inclusive em comentário.)
 *
 * O corpo JSON é detalhe adicional para quem quiser; nunca a fonte do veredito.
 *
 * ── Segurança ────────────────────────────────────────────────────────────────
 *
 * Público e sem segredo, DE PROPÓSITO: um monitor que precisa de credencial é um monitor
 * que alguém esquece de configurar. Em troca, a resposta expõe apenas STATUS e latência —
 * nunca mensagem de erro nem detalhe interno (isso vive no Control Hub, autenticado).
 *
 * Cache de 10s para que um endpoint público não vire amplificador de DoS contra o banco.
 */

const CACHE_MS = 10_000;

type Check = { ok: boolean; latency_ms: number };
type Snapshot = { at: number; ready: boolean; database: Check; storage: Check };

let cached: Snapshot | null = null;

function admin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
    );
}

async function timed(fn: () => Promise<unknown>): Promise<Check> {
    const t0 = Date.now();
    try {
        await fn();
        return { ok: true, latency_ms: Date.now() - t0 };
    } catch {
        return { ok: false, latency_ms: Date.now() - t0 };
    }
}

async function probe(): Promise<Snapshot> {
    const sb = admin();

    const [database, storage] = await Promise.all([
        // Round-trip barato: uma linha, sem varredura.
        timed(async () => {
            const { error } = await sb.from("restaurants").select("id").limit(1);
            if (error) throw new Error(error.message);
        }),
        // Storage responde? Listar buckets é a chamada mais leve possível.
        timed(async () => {
            const { error } = await sb.storage.listBuckets();
            if (error) throw new Error(error.message);
        }),
    ]);

    return { at: Date.now(), ready: database.ok && storage.ok, database, storage };
}

export async function GET() {
    if (!cached || Date.now() - cached.at > CACHE_MS) {
        cached = await probe();
    }

    return NextResponse.json(
        {
            status: cached.ready ? "ok" : "degraded",
            checks: { database: cached.database, storage: cached.storage },
            checked_at: new Date(cached.at).toISOString(),
        },
        // O veredito. É isto que qualquer monitor consome.
        { status: cached.ready ? 200 : 503 },
    );
}
