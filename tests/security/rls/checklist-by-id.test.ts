import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSharedFixtures, teardownSharedFixtures } from "../helpers/shared-fixtures";
import type { SecurityFixtures, TestUser } from "../helpers/fixtures";
import { fetchChecklistViews } from "@/lib/services/checklist-view";
import { createServiceClient } from "../helpers/supabase";

/**
 * `GET /api/checklists/[id]` é a peça que torna o deep-link determinístico — e, por
 * isso, é a superfície nova mais sensível: ela carrega uma rotina POR ID, fora de
 * qualquer lista, a partir de um `restaurant_id` que veio DA URL.
 *
 * A regra: A URL É UM PEDIDO, NUNCA UMA AUTORIDADE. A pertinência é decidida no
 * servidor, contra a sessão. Estes testes provam que um `restaurant_id` forjado não
 * abre nada — nem vaza a existência da rotina.
 *
 * A rota valida membership em `restaurant_users` e só então chama `fetchChecklistViews`
 * escopado por `restaurantIds`. Aqui testamos a camada de dados diretamente (a rota é
 * uma casca fina sobre ela) e a validação de membership.
 */
describe("s90 · GET /api/checklists/[id] — isolamento multi-tenant", () => {
    let fx: SecurityFixtures;
    const admin = createServiceClient();

    beforeAll(async () => {
        fx = await getSharedFixtures();
    });

    afterAll(async () => {
        await teardownSharedFixtures();
    });

    async function membershipRole(user: TestUser, restaurantId: string) {
        const { data } = await admin
            .from("restaurant_users")
            .select("role")
            .eq("restaurant_id", restaurantId)
            .eq("user_id", user.id)
            .eq("active", true)
            .maybeSingle();
        return data?.role;
    }

    it("o dono do restaurante carrega a própria rotina por ID", async () => {
        expect(await membershipRole(fx.ownerA, fx.restaurantA.id)).toBeTruthy();

        const rows = await fetchChecklistViews(admin, {
            restaurantIds: [fx.restaurantA.id],
            checklistIds: [fx.restaurantA.checklistId],
            includeOneShot: true,
        });

        expect(rows).toHaveLength(1);
        expect(rows[0].id).toBe(fx.restaurantA.checklistId);
    });

    it("membership de outro tenant é NEGADA (a rota devolve 403 antes de consultar)", async () => {
        // ownerC é de outra ACCOUNT. Mesmo forjando restaurant_id=A na URL, ele não
        // passa da checagem de membership.
        expect(await membershipRole(fx.ownerC, fx.restaurantA.id)).toBeUndefined();
        expect(await membershipRole(fx.ownerB, fx.restaurantA.id)).toBeUndefined();
    });

    it("id de rotina de OUTRO restaurante não vaza (nem sua existência)", async () => {
        // Cenário: o usuário TEM acesso ao restaurante B, e forja o id de uma rotina
        // do restaurante A. O escopo por restaurantIds faz a consulta voltar vazia →
        // a rota devolve 404 CHECKLIST_NOT_FOUND, indistinguível de "não existe".
        const rows = await fetchChecklistViews(admin, {
            restaurantIds: [fx.restaurantB.id],
            checklistIds: [fx.restaurantA.checklistId], // rotina de OUTRO restaurante
            includeOneShot: true,
        });

        expect(rows).toHaveLength(0);
    });

    it("usuário inativo não tem membership (não abre deep-link)", async () => {
        expect(await membershipRole(fx.inactiveA, fx.restaurantA.id)).toBeUndefined();
    });

    it("rotina inexistente devolve vazio (→ 404 'Esta rotina não existe mais')", async () => {
        const rows = await fetchChecklistViews(admin, {
            restaurantIds: [fx.restaurantA.id],
            checklistIds: ["00000000-0000-0000-0000-000000000000"],
            includeOneShot: true,
        });
        expect(rows).toHaveLength(0);
    });
});
