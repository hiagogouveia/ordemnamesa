import { build } from "esbuild";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { writeFileSync, mkdirSync } from "fs";

/**
 * Bundle do worker de jobs → dist/worker.js.
 *
 * Por que um bundler próprio: o `output: "standalone"` do Next só traça o grafo
 * alcançável a partir das rotas/páginas. Um `worker.ts` na raiz ficaria de fora. O
 * esbuild resolve isso empacotando a partir do próprio worker.
 *
 * Duas armadilhas tratadas aqui (ambas já conhecidas):
 *   1. `@/` — o alias de path do projeto. O esbuild não lê o tsconfig sozinho num script
 *      standalone, então mapeamos explicitamente.
 *   2. `server-only` — os módulos de job o importam, e ele LANÇA fora do bundler do Next.
 *      Aliasado para um stub vazio (mesma solução do Vitest de segurança).
 */

const root = dirname(fileURLToPath(import.meta.url)).replace(/\/scripts$/, "");

// Stub de server-only: um módulo vazio. `server-only` existe só para quebrar o build de
// um Client Component no Next; fora do Next ele lança. No worker (Node puro) é inócuo.
const stubDir = resolve(root, "node_modules/.worker-stubs");
mkdirSync(stubDir, { recursive: true });
writeFileSync(resolve(stubDir, "server-only.js"), "export {};\n");

await build({
    entryPoints: [resolve(root, "worker.ts")],
    outfile: resolve(root, "dist/worker.cjs"),
    bundle: true,
    platform: "node",
    // CJS, não ESM: a cadeia de dependências (rrule etc.) mistura CJS com named exports,
    // que quebram sob `format: esm` (`const { RRule } = pkg`). CJS interopera com ambos.
    format: "cjs",
    target: "node20",
    // Empacota TUDO no bundle (supabase-js, resend, rrule…). Não usar `packages:
    // external`: o standalone do Next faz file-tracing e inclui só os .js que a APP
    // importa — sem o package.json dos pacotes, um `require('@supabase/...')` do worker
    // não resolveria. Com o bundle autossuficiente, o worker roda com um único .cjs e
    // NENHUMA dependência de node_modules em runtime.
    // (bundle: true já empacota; a ausência de `packages: external` é o que puxa as deps.)
    // `import.meta.url` não existe em CJS. O worker.ts o usa para achar o próprio caminho
    // (para forkar). Em CJS, `__filename` é o equivalente — o esbuild o injeta.
    define: { "import.meta.url": "__worker_self_url" },
    inject: [resolve(root, "scripts/worker-shim.js")],
    alias: {
        "server-only": resolve(stubDir, "server-only.js"),
    },
    resolveExtensions: [".ts", ".tsx", ".mjs", ".js", ".json"],
    plugins: [
        {
            name: "path-alias",
            setup(b) {
                // `@/x` → `<root>/x`, deixando o esbuild aplicar as extensões (.ts etc.)
                // via b.resolve — retornar o path cru não infere extensão.
                b.onResolve({ filter: /^@\// }, async (a) => {
                    const result = await b.resolve("./" + a.path.slice(2), {
                        importer: a.importer,
                        kind: a.kind,
                        resolveDir: root,
                    });
                    return result.errors.length ? result : { path: result.path };
                });
            },
        },
    ],
    logLevel: "info",
});

console.log("✓ dist/worker.cjs");
