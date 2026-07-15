import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { execSync } from "child_process";

/**
 * O CONTRATO DE SAÚDE é uma interface pública consumida por ferramentas externas.
 * Quebrá-lo silenciosamente significa descobrir em produção que o monitoramento parou
 * de monitorar. Estes testes o travam.
 *
 * Duas garantias:
 *   1. O veredito viaja no STATUS HTTP (200/503) — não só no corpo.
 *   2. A aplicação NÃO CONHECE a ferramenta de monitoramento.
 */

describe("contrato de saúde — o veredito viaja no status HTTP", () => {
    // A regra que torna o monitor uma peça trocável: qualquer ferramenta (Gatus, Kuma,
    // Prometheus, ou um `curl -f` num script) decide sozinha, SEM parsear o corpo e sem
    // conhecer o formato. Se o veredito estivesse só no JSON, cada monitor precisaria
    // saber ler o nosso schema — e trocar de ferramenta viraria uma mudança na aplicação.
    const ready = readFileSync("app/api/health/ready/route.ts", "utf8");

    it("readiness responde 503 quando degradado, e não apenas um campo no corpo", () => {
        expect(ready).toMatch(/status:\s*cached\.ready\s*\?\s*200\s*:\s*503/);
    });

    it("readiness realmente CHECA as dependências (banco e Storage)", () => {
        expect(ready).toContain("listBuckets");
        expect(ready).toMatch(/from\("restaurants"\)/);
    });

    it("readiness tem cache — endpoint público não pode virar amplificador de DoS", () => {
        expect(ready).toMatch(/CACHE_MS/);
    });
});

describe("system — disco e memória, mesmo contrato de status HTTP", () => {
    const system = readFileSync("app/api/health/system/route.ts", "utf8");

    it("responde 503 quando degradado, veredito no status", () => {
        expect(system).toMatch(/status:\s*degraded\s*\?\s*503\s*:\s*200/);
    });

    it("null (não medível em dev) NÃO conta como degradado", () => {
        // macOS não tem /proc/meminfo. Um endpoint que virasse 503 em dev seria inútil.
        expect(system).toMatch(/disk !== null/);
        expect(system).toMatch(/mem !== null/);
    });
});

describe("liveness NÃO checa dependências (senão vira crashloop)", () => {
    const liveness = readFileSync("app/api/health/route.ts", "utf8");

    it("/api/health não toca no banco nem no Storage", () => {
        // Se o liveness falhasse durante uma queda do Supabase, o healthcheck do Docker
        // reiniciaria o container EM LOOP — agravando um incidente que a reinicialização
        // não resolve. Liveness responde sobre o PROCESSO; readiness, sobre as DEPENDÊNCIAS.
        expect(liveness).not.toContain("supabase");
        expect(liveness).not.toContain("createClient");
    });

    it("/api/health reporta a versão servida (pega deploy que serviu imagem antiga)", () => {
        expect(liveness).toContain("APP_VERSION");
    });
});

describe("desacoplamento: a aplicação não conhece a ferramenta de monitoramento", () => {
    it("nenhum nome de ferramenta de monitoramento aparece em app/ ou lib/", () => {
        // O monitor é um CONSUMIDOR dos endpoints, nunca uma DEPENDÊNCIA da aplicação.
        // Trocar a ferramenta amanhã deve tocar apenas `infra/` — zero linhas de código
        // daqui. Este teste transforma esse princípio num fato verificável.
        //
        // Inclui COMENTÁRIOS de propósito: um comentário que cita a ferramenta passa a
        // mentir no dia em que ela for trocada. (Este teste já me pegou uma vez.)
        //
        // O próprio arquivo de teste é excluído — ele precisa nomear o que proíbe.
        // Só as ferramentas de MONITORAMENTO plugáveis. Não vale grepar "datadog" —
        // um comentário dizendo "não usamos Datadog" é legítimo, e daria falso positivo
        // (aprendido na prática: `lib/stripe/log.ts` diz exatamente isso).
        const hits = execSync(
            `grep -rilE "gatus|uptime.?kuma" app/ lib/ | grep -v "health-contract.test" || true`,
            { encoding: "utf8" },
        ).trim();

        expect(hits, `A aplicação passou a conhecer a ferramenta de monitoramento:\n${hits}`).toBe("");
    });
});
