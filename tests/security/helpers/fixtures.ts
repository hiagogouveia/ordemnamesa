import { createAuthenticatedClient, createServiceClient } from "./supabase";

const RUN_ID = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const NS = `rlstest-${RUN_ID}`;
const PASSWORD = "Rls-Test!Pwd-2026";

export interface TestUser {
    id: string;
    email: string;
    accessToken: string;
}

export interface SecurityFixtures {
    runId: string;
    accountAlpha: { id: string };
    accountBravo: { id: string };
    /** Restaurante A (account Alpha) */
    restaurantA: { id: string; areaId: string; checklistId: string };
    /** Restaurante B (account Alpha — mesma account de A) */
    restaurantB: { id: string; areaId: string; checklistId: string };
    /** Restaurante C (account Bravo — account distinta) */
    restaurantC: { id: string; areaId: string; checklistId: string };
    ownerA: TestUser;
    managerA: TestUser;
    staffA: TestUser;
    inactiveA: TestUser;
    ownerB: TestUser;
    ownerC: TestUser;
    cleanup: () => Promise<void>;
}

async function createUser(email: string): Promise<{ id: string; accessToken: string; email: string }> {
    const admin = createServiceClient();
    const created = await admin.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true,
    });
    if (created.error || !created.data.user) {
        throw new Error(`createUser ${email} falhou: ${created.error?.message}`);
    }
    const id = created.data.user.id;

    // Garantir linha em public.users (caso o trigger handle_new_user falhe ou não exista no projeto)
    await admin.from("users").upsert({ id, email, name: email }, { onConflict: "id" });

    // Sign-in para obter access token real
    const auth = createServiceClient();
    const signed = await auth.auth.signInWithPassword({ email, password: PASSWORD });
    if (signed.error || !signed.data.session) {
        throw new Error(`signIn ${email} falhou: ${signed.error?.message}`);
    }
    return { id, accessToken: signed.data.session.access_token, email };
}

async function deleteUserSafe(id: string): Promise<void> {
    const admin = createServiceClient();
    try {
        await admin.auth.admin.deleteUser(id);
    } catch {
        // ignora — cleanup best-effort
    }
}

export async function provisionFixtures(): Promise<SecurityFixtures> {
    const admin = createServiceClient();

    // 1) Cria 2 accounts
    const acctAlpha = await admin
        .from("accounts")
        .insert({ name: `${NS}-alpha` })
        .select("id")
        .single();
    if (acctAlpha.error || !acctAlpha.data) {
        throw new Error(`accounts(alpha): ${acctAlpha.error?.message}`);
    }
    const acctBravo = await admin
        .from("accounts")
        .insert({ name: `${NS}-bravo` })
        .select("id")
        .single();
    if (acctBravo.error || !acctBravo.data) {
        throw new Error(`accounts(bravo): ${acctBravo.error?.message}`);
    }

    // 2) Cria 6 usuários
    const [ownerA, managerA, staffA, inactiveA, ownerB, ownerC] = await Promise.all([
        createUser(`${NS}-ownerA@example.test`),
        createUser(`${NS}-managerA@example.test`),
        createUser(`${NS}-staffA@example.test`),
        createUser(`${NS}-inactiveA@example.test`),
        createUser(`${NS}-ownerB@example.test`),
        createUser(`${NS}-ownerC@example.test`),
    ]);

    // 3) Cria 3 restaurantes (A, B em alpha; C em bravo)
    async function createRestaurant(
        accountId: string,
        ownerId: string,
        suffix: string,
    ): Promise<{ id: string; areaId: string; checklistId: string }> {
        const r = await admin
            .from("restaurants")
            .insert({
                name: `${NS}-${suffix}`,
                slug: `${NS}-${suffix}`,
                owner_id: ownerId,
                account_id: accountId,
            })
            .select("id")
            .single();
        if (r.error || !r.data) throw new Error(`restaurants(${suffix}): ${r.error?.message}`);

        const a = await admin
            .from("areas")
            .insert({ restaurant_id: r.data.id, name: "Cozinha" })
            .select("id")
            .single();
        if (a.error || !a.data) throw new Error(`areas(${suffix}): ${a.error?.message}`);

        const c = await admin
            .from("checklists")
            .insert({
                restaurant_id: r.data.id,
                name: `${NS}-checklist-${suffix}`,
                shift: "morning",
                area_id: a.data.id,
                created_by: ownerId,
                active: true,
            })
            .select("id")
            .single();
        if (c.error || !c.data) throw new Error(`checklists(${suffix}): ${c.error?.message}`);

        return { id: r.data.id, areaId: a.data.id, checklistId: c.data.id };
    }

    const restaurantA = await createRestaurant(acctAlpha.data.id, ownerA.id, "rA");
    const restaurantB = await createRestaurant(acctAlpha.data.id, ownerB.id, "rB");
    const restaurantC = await createRestaurant(acctBravo.data.id, ownerC.id, "rC");

    // 4) Memberships restaurant_users
    const memberships = [
        { restaurant_id: restaurantA.id, user_id: ownerA.id, role: "owner", active: true },
        { restaurant_id: restaurantA.id, user_id: managerA.id, role: "manager", active: true },
        { restaurant_id: restaurantA.id, user_id: staffA.id, role: "staff", active: true },
        { restaurant_id: restaurantA.id, user_id: inactiveA.id, role: "staff", active: false },
        { restaurant_id: restaurantB.id, user_id: ownerB.id, role: "owner", active: true },
        { restaurant_id: restaurantC.id, user_id: ownerC.id, role: "owner", active: true },
    ];
    const ru = await admin.from("restaurant_users").insert(memberships);
    if (ru.error) throw new Error(`restaurant_users: ${ru.error.message}`);

    // 5) account_users (ownerA é owner da account alpha; ownerC é owner da bravo)
    const au = await admin.from("account_users").insert([
        { account_id: acctAlpha.data.id, user_id: ownerA.id, role: "owner", active: true, can_view_global: true },
        { account_id: acctBravo.data.id, user_id: ownerC.id, role: "owner", active: true, can_view_global: true },
    ]);
    if (au.error) throw new Error(`account_users: ${au.error.message}`);

    const cleanup = async (): Promise<void> => {
        const a = createServiceClient();
        // Cascata via FKs cobrirá restaurant_users / areas / checklists
        await a.from("restaurants").delete().in("id", [restaurantA.id, restaurantB.id, restaurantC.id]);
        await a.from("account_users").delete().in("account_id", [acctAlpha.data!.id, acctBravo.data!.id]);
        await a.from("accounts").delete().in("id", [acctAlpha.data!.id, acctBravo.data!.id]);
        await Promise.all(
            [ownerA, managerA, staffA, inactiveA, ownerB, ownerC].map((u) => deleteUserSafe(u.id)),
        );
    };

    return {
        runId: RUN_ID,
        accountAlpha: { id: acctAlpha.data.id },
        accountBravo: { id: acctBravo.data.id },
        restaurantA,
        restaurantB,
        restaurantC,
        ownerA,
        managerA,
        staffA,
        inactiveA,
        ownerB,
        ownerC,
        cleanup,
    };
}

export function clientFor(user: TestUser) {
    return createAuthenticatedClient(user.accessToken);
}
