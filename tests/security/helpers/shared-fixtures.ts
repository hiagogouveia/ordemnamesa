import { provisionFixtures, type SecurityFixtures } from "./fixtures";

let cached: Promise<SecurityFixtures> | null = null;

/** Provisão única compartilhada por todos os arquivos de teste. */
export function getSharedFixtures(): Promise<SecurityFixtures> {
    if (!cached) cached = provisionFixtures();
    return cached;
}

export async function teardownSharedFixtures(): Promise<void> {
    if (!cached) return;
    const fx = await cached;
    await fx.cleanup();
    cached = null;
}
