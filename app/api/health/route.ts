import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const STARTED_AT = Date.now();

/**
 * LIVENESS — "o processo está vivo e consegue responder?"
 *
 * Deliberadamente NÃO checa banco nem Storage.
 *
 * Esta rota é consumida pelo healthcheck do Docker e pelo Traefik. Se ela falhasse
 * durante uma indisponibilidade do Supabase, o Docker reiniciaria o container em LOOP —
 * agravando um incidente que a reinicialização não resolve.
 *
 * Liveness responde sobre o PROCESSO. Readiness responde sobre as DEPENDÊNCIAS, e vive
 * em `/api/health/ready`. Confundir os dois é como se constrói um crashloop.
 *
 * Sempre 200 enquanto o processo consegue executar este handler. Isso não é um defeito:
 * é a definição correta de liveness.
 *
 * `version` (SHA do commit) pega um bug que hoje ninguém veria: um deploy "verde" que na
 * verdade continua servindo a imagem antiga.
 */
export async function GET() {
    return NextResponse.json(
        {
            status: "ok",
            version: process.env.APP_VERSION ?? "unknown",
            uptime_s: Math.floor((Date.now() - STARTED_AT) / 1000),
        },
        { status: 200 },
    );
}
