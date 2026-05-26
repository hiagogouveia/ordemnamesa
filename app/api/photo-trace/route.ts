/**
 * POST /api/photo-trace — endpoint de ingest da instrumentação photo-trace.
 *
 * Recebe breadcrumbs via sendBeacon do client (lib/photo-trace.ts) e
 * loga cada breadcrumb numa linha separada em stdout. Não persiste em
 * banco — server logs do host (Vercel/etc) são a "tabela".
 *
 * Sem callers neste commit. Sem auth, sem rate limit, sem Zod. A
 * sanitização é responsabilidade do client; aqui apenas validamos
 * forma mínima e limites de tamanho.
 *
 * Linhas logadas no formato (uma por breadcrumb, para evitar
 * truncamento de log em 4KB do host):
 *
 *   [pt] meta s=<sid> ua="<ua>" reason=<r> verdict=<v> count=<n>
 *   [pt] s=<sid> n=<seq> t=<perf> w=<wall> e=<event> m=<json>
 */

import { NextResponse } from 'next/server';

const MAX_BYTES = 64 * 1024;

type Breadcrumb = {
    s?: unknown;
    n?: unknown;
    t?: unknown;
    w?: unknown;
    e?: unknown;
    m?: unknown;
};

function safeStr(v: unknown, max = 200): string {
    if (typeof v === 'string') return v.slice(0, max);
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    return '';
}

export async function POST(req: Request): Promise<Response> {
    // 1. Fast-path 413 via Content-Length quando disponível.
    const cl = req.headers.get('content-length');
    if (cl && Number(cl) > MAX_BYTES) {
        return new NextResponse(null, { status: 413 });
    }

    // 2. Lê body como texto e re-checa tamanho (defesa em profundidade).
    let raw: string;
    try {
        raw = await req.text();
    } catch {
        return new NextResponse(null, { status: 400 });
    }
    if (raw.length > MAX_BYTES) {
        return new NextResponse(null, { status: 413 });
    }

    // 3. Parse JSON.
    let body: { s?: unknown; ua?: unknown; reason?: unknown; verdict?: unknown; bcs?: unknown };
    try {
        body = JSON.parse(raw);
    } catch {
        return new NextResponse(null, { status: 400 });
    }

    // 4. Validação mínima: precisa de `s` string e `bcs` array.
    if (!body || typeof body !== 'object') {
        return new NextResponse(null, { status: 400 });
    }
    const s = safeStr(body.s, 32);
    const bcs = body.bcs;
    if (!s || !Array.isArray(bcs)) {
        return new NextResponse(null, { status: 400 });
    }

    // 5. Log do meta-line + uma linha por breadcrumb.
    const ua = safeStr(body.ua, 200).replace(/"/g, "'");
    const reason = safeStr(body.reason, 32) || '-';
    const verdict = safeStr(body.verdict, 48) || '-';
    console.log(`[pt] meta s=${s} ua="${ua}" reason=${reason} verdict=${verdict} count=${bcs.length}`);

    for (const b of bcs as Breadcrumb[]) {
        const bs = safeStr(b?.s, 32);
        const n = typeof b?.n === 'number' ? b.n : -1;
        const t = typeof b?.t === 'number' ? b.t : -1;
        const w = typeof b?.w === 'number' ? b.w : -1;
        const e = safeStr(b?.e, 48);
        let mStr = '';
        if (b?.m && typeof b.m === 'object') {
            try { mStr = JSON.stringify(b.m).slice(0, 500); }
            catch { mStr = '{}'; }
        }
        console.log(`[pt] s=${bs} n=${n} t=${t} w=${w} e=${e} m=${mStr || '{}'}`);
    }

    return new NextResponse(null, { status: 204 });
}
