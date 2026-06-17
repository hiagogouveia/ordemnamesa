import fs from "node:fs";
import path from "node:path";

/**
 * Carrega .env.nonprod (ou TEST_ENV_FILE) sem dependências externas.
 * Os testes de segurança SEMPRE rodam contra NONPROD — nunca PROD.
 */
function loadEnvFile(filePath: string): void {
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, "utf-8");
    for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        if (process.env[key] === undefined) {
            process.env[key] = value;
        }
    }
}

const root = path.resolve(__dirname, "../../..");
const envFile = process.env.TEST_ENV_FILE ?? ".env.nonprod";
loadEnvFile(path.join(root, envFile));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (
    url.includes("buucddacymkybkrszcqy") ||
    /\bprod\b/i.test(envFile)
) {
    throw new Error(
        `[security-tests] PROD detectado em NEXT_PUBLIC_SUPABASE_URL ou TEST_ENV_FILE — abortando para evitar criação de dados de teste em produção. URL=${url}`
    );
}
