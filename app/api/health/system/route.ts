import { NextResponse } from "next/server";
import { statfs } from "fs/promises";
import { readFile } from "fs/promises";

export const dynamic = "force-dynamic";

/**
 * SAÚDE DO SISTEMA — disco e memória do host.
 *
 * Mesmo contrato dos outros health endpoints: o veredito viaja no STATUS HTTP
 * (200 saudável / 503 degradado), então qualquer monitor decide com um `curl -f`,
 * sem parsear o corpo.
 *
 * ── Por que os limiares importam aqui ────────────────────────────────────────
 * Disco cheio já foi um problema REAL neste projeto (acúmulo de imagens Docker), e
 * não havia como detectá-lo antes de derrubar o serviço. Agora um monitor externo vê
 * `disk_used_pct` subir e alerta ANTES de encher.
 *
 * ── Uma ressalva honesta sobre a leitura ─────────────────────────────────────
 * Lido de DENTRO do container:
 *   - `statfs('/')` no overlay2 reflete o disco do HOST — correto.
 *   - `/proc/meminfo` reflete a memória do HOST **enquanto não houver limite de cgroup**
 *     no container. Hoje não há (o compose não define `mem_limit`), então a leitura é
 *     do host. Se um dia impusermos limite de memória, esta leitura passa a mentir e
 *     precisará ler `/sys/fs/cgroup/memory.max`. Registrado para não esquecer.
 *
 * Público e sem segredo: expõe só percentuais e uptime, nada operacional.
 */

const DISK_DEGRADED_PCT = 85;
const MEM_DEGRADED_PCT = 90;

async function diskUsedPct(): Promise<number | null> {
    try {
        const s = await statfs("/");
        const total = s.blocks * s.bsize;
        const free = s.bfree * s.bsize;
        if (total <= 0) return null;
        return Math.round(((total - free) / total) * 100);
    } catch {
        return null;
    }
}

async function memUsedPct(): Promise<number | null> {
    try {
        const meminfo = await readFile("/proc/meminfo", "utf8");
        const kb = (key: string) => {
            const m = meminfo.match(new RegExp(`^${key}:\\s+(\\d+)`, "m"));
            return m ? Number(m[1]) : null;
        };
        const total = kb("MemTotal");
        const available = kb("MemAvailable");
        if (!total || available === null) return null;
        return Math.round(((total - available) / total) * 100);
    } catch {
        // Fora de Linux (ex.: macOS em dev) não há /proc/meminfo. Não é degradação.
        return null;
    }
}

export async function GET() {
    const [disk, mem] = await Promise.all([diskUsedPct(), memUsedPct()]);

    // `null` = não medível neste ambiente (dev) → não conta como degradado.
    const degraded =
        (disk !== null && disk >= DISK_DEGRADED_PCT) ||
        (mem !== null && mem >= MEM_DEGRADED_PCT);

    return NextResponse.json(
        {
            status: degraded ? "degraded" : "ok",
            disk_used_pct: disk,
            mem_used_pct: mem,
            uptime_s: Math.floor(process.uptime()),
            version: process.env.APP_VERSION ?? "unknown",
        },
        { status: degraded ? 503 : 200 },
    );
}
