// Carregador mínimo de env para scripts de manutenção. Lê um arquivo .env
// (default .env.local) sem dependências externas, sem sobrescrever o que já
// estiver no process.env. Use --env <arquivo> para apontar para PROD, etc.
import { readFileSync, existsSync } from 'node:fs';

export function loadEnv(file = '.env.local') {
    if (!existsSync(file)) return;
    const text = readFileSync(file, 'utf8');
    for (const rawLine of text.split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq === -1) continue;
        const key = line.slice(0, eq).trim();
        let value = line.slice(eq + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        if (!(key in process.env)) process.env[key] = value;
    }
}

/** Lê uma flag estilo `--nome valor` ou `--nome` (boolean) de argv. */
export function getFlag(name) {
    const i = process.argv.indexOf(`--${name}`);
    if (i === -1) return undefined;
    const next = process.argv[i + 1];
    if (next === undefined || next.startsWith('--')) return true;
    return next;
}

export function requireSupabaseAdmin() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        console.error(
            'Faltam NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no env.\n' +
            'Defina via .env.local (default) ou --env <arquivo>.'
        );
        process.exit(1);
    }
    return { url, key };
}
