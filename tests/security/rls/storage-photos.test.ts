import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSharedFixtures, teardownSharedFixtures } from "../helpers/shared-fixtures";
import { clientFor } from "../helpers/fixtures";
import type { SecurityFixtures } from "../helpers/fixtures";
import { createServiceClient } from "../helpers/supabase";

const BUCKET = "photos";

/** PNG fake — storage não valida conteúdo, só precisa de bytes. */
function fakePng(): Blob {
    return new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], {
        type: "image/png",
    });
}

/**
 * Isolamento multi-tenant do bucket privado 'photos'.
 *
 * Convenção de path (lib/supabase/storage.ts): {restaurantId}/{executionId}/{ts}.{ext}
 * — a primeira pasta identifica o tenant. As policies devem restringir
 * leitura/escrita a membros ativos do restaurante dono da pasta.
 */
describe("RLS · storage photos (tenant isolation)", () => {
    let fx: SecurityFixtures;
    const uploaded: string[] = [];
    let photoA: string;

    beforeAll(async () => {
        fx = await getSharedFixtures();
        // Provisiona (via service role) uma foto pertencente ao restaurante A
        photoA = `${fx.restaurantA.id}/rlstest-exec/${Date.now()}-seed.png`;
        const admin = createServiceClient();
        const up = await admin.storage.from(BUCKET).upload(photoA, fakePng(), {
            contentType: "image/png",
        });
        if (up.error) throw new Error(`seed upload falhou: ${up.error.message}`);
        uploaded.push(photoA);
    });

    afterAll(async () => {
        if (uploaded.length > 0) {
            await createServiceClient().storage.from(BUCKET).remove(uploaded);
        }
        await teardownSharedFixtures();
    });

    it("staffA baixa foto do próprio restaurante", async () => {
        const sb = clientFor(fx.staffA);
        const r = await sb.storage.from(BUCKET).download(photoA);
        expect(r.error, `staffA deveria ler a própria foto: ${r.error?.message}`).toBeNull();
        expect(r.data).not.toBeNull();
    });

    it("staffA gera signed URL para foto do próprio restaurante", async () => {
        const sb = clientFor(fx.staffA);
        const r = await sb.storage.from(BUCKET).createSignedUrl(photoA, 60);
        expect(r.error, `signed URL própria deveria funcionar: ${r.error?.message}`).toBeNull();
        expect(r.data?.signedUrl).toBeTruthy();
    });

    it("ownerC (outra account) NÃO baixa foto do restaurante A", async () => {
        const sb = clientFor(fx.ownerC);
        const r = await sb.storage.from(BUCKET).download(photoA);
        expect(r.error, "download cross-account deveria ser bloqueado").not.toBeNull();
        expect(r.data ?? null).toBeNull();
    });

    it("ownerC (outra account) NÃO gera signed URL para foto do restaurante A", async () => {
        const sb = clientFor(fx.ownerC);
        const r = await sb.storage.from(BUCKET).createSignedUrl(photoA, 60);
        expect(r.error, "signed URL cross-account deveria ser bloqueada").not.toBeNull();
        expect(r.data?.signedUrl ?? null).toBeNull();
    });

    it("ownerB (outro restaurante, mesma account) NÃO baixa foto do restaurante A", async () => {
        const sb = clientFor(fx.ownerB);
        const r = await sb.storage.from(BUCKET).download(photoA);
        expect(r.error, "download cross-restaurante deveria ser bloqueado").not.toBeNull();
        expect(r.data ?? null).toBeNull();
    });

    it("ownerC NÃO faz upload na pasta do restaurante A", async () => {
        const sb = clientFor(fx.ownerC);
        const path = `${fx.restaurantA.id}/rlstest-exec/${Date.now()}-intruso.png`;
        const r = await sb.storage.from(BUCKET).upload(path, fakePng(), {
            contentType: "image/png",
        });
        if (!r.error) uploaded.push(path); // garante cleanup se a policy falhar
        expect(r.error, "upload cross-tenant deveria ser bloqueado").not.toBeNull();
    });

    it("staffA faz upload na pasta do próprio restaurante", async () => {
        const sb = clientFor(fx.staffA);
        const path = `${fx.restaurantA.id}/rlstest-exec/${Date.now()}-own.png`;
        const r = await sb.storage.from(BUCKET).upload(path, fakePng(), {
            contentType: "image/png",
        });
        if (r.data?.path) uploaded.push(r.data.path);
        expect(r.error, `upload no próprio restaurante deveria funcionar: ${r.error?.message}`).toBeNull();
    });
});
