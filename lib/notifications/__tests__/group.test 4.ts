import { describe, expect, it } from "vitest";
import type { AnyNotification, NotificationPriority } from "../contract";
import {
    MIN_GROUP_SIZE,
    applyRealtimeInsert,
    applyRealtimeUpdate,
    countUnread,
    groupNotifications,
    mergeNotifications,
    sortNotifications,
} from "../group";

let seq = 0;
function notif(over: Partial<AnyNotification> = {}): AnyNotification {
    seq += 1;
    return {
        id: `n${seq}`,
        restaurant_id: "r1",
        user_id: "u1",
        type: "__unknown__",
        rawType: "X",
        payload: {},
        title: `t${seq}`,
        description: null,
        priority: "normal" as NotificationPriority,
        group_key: null,
        read: false,
        read_at: null,
        created_at: `2026-07-14T10:00:0${seq % 10}Z`,
        event_id: null,
        ...over,
    } as AnyNotification;
}

describe("ordenação — prioridade antes do horário", () => {
    it("não-lidas vêm antes das lidas", () => {
        const lida = notif({ id: "a", read: true, priority: "critical" });
        const naoLida = notif({ id: "b", read: false, priority: "low" });
        const [first] = sortNotifications([lida, naoLida]);
        // Uma crítica JÁ LIDA não deve estourar na frente de uma nova não-lida.
        expect(first.id).toBe("b");
    });

    it("entre não-lidas, prioridade decide antes do horário", () => {
        const antigaCritica = notif({
            id: "crit",
            priority: "critical",
            created_at: "2026-07-14T08:00:00Z",
        });
        const recenteNormal = notif({
            id: "norm",
            priority: "normal",
            created_at: "2026-07-14T12:00:00Z",
        });
        const [first] = sortNotifications([recenteNormal, antigaCritica]);
        expect(first.id).toBe("crit");
    });

    it("mesma prioridade → mais recente primeiro", () => {
        const velha = notif({ id: "v", created_at: "2026-07-14T08:00:00Z" });
        const nova = notif({ id: "n", created_at: "2026-07-14T12:00:00Z" });
        expect(sortNotifications([velha, nova])[0].id).toBe("n");
    });
});

describe("agrupamento", () => {
    it(`agrupa a partir de ${MIN_GROUP_SIZE} itens com a mesma chave`, () => {
        const items = Array.from({ length: 5 }, () =>
            notif({ group_key: "issue:chk1:2026-07-14" }),
        );
        const entries = groupNotifications(items);
        expect(entries).toHaveLength(1);
        expect(entries[0].kind).toBe("group");
        if (entries[0].kind === "group") {
            expect(entries[0].count).toBe(5); // "5 novas ocorrências"
            expect(entries[0].unreadCount).toBe(5);
        }
    });

    it("abaixo do mínimo, permanecem individuais (agrupar 2 só atrapalha)", () => {
        const items = [
            notif({ group_key: "k" }),
            notif({ group_key: "k" }),
        ];
        const entries = groupNotifications(items);
        expect(entries).toHaveLength(2);
        expect(entries.every((e) => e.kind === "single")).toBe(true);
    });

    it("group_key null nunca agrupa, mesmo em volume", () => {
        const items = Array.from({ length: 10 }, () => notif({ group_key: null }));
        const entries = groupNotifications(items);
        expect(entries).toHaveLength(10);
        expect(entries.every((e) => e.kind === "single")).toBe(true);
    });

    it("chaves diferentes não se misturam", () => {
        const a = Array.from({ length: 3 }, () => notif({ group_key: "a" }));
        const b = Array.from({ length: 3 }, () => notif({ group_key: "b" }));
        const entries = groupNotifications([...a, ...b]);
        expect(entries).toHaveLength(2);
        expect(entries.every((e) => e.kind === "group" && e.count === 3)).toBe(true);
    });

    it("o grupo assume a posição do seu melhor membro", () => {
        // Um grupo com um impedimento crítico não pode afundar por causa dos irmãos normais.
        const soltaNormal = notif({ id: "solta", priority: "normal", group_key: null });
        const grupo = [
            notif({ group_key: "g", priority: "low" }),
            notif({ group_key: "g", priority: "low" }),
            notif({ id: "critica", group_key: "g", priority: "critical" }),
        ];
        const entries = groupNotifications([soltaNormal, ...grupo]);
        expect(entries[0].kind).toBe("group");
    });
});

describe("cache do realtime — sem pulo, sem perda", () => {
    it("insert é idempotente (o mesmo evento chegando duas vezes não duplica)", () => {
        const existing = [notif({ id: "a" })];
        const incoming = notif({ id: "a" });
        expect(applyRealtimeInsert(existing, incoming, 30)).toHaveLength(1);
    });

    it("insert respeita o tamanho da página", () => {
        const items = Array.from({ length: 30 }, () => notif());
        const result = applyRealtimeInsert(items, notif({ id: "novo" }), 30);
        expect(result).toHaveLength(30);
    });

    it("update aplica patch na linha sem remontar a lista", () => {
        const a = notif({ id: "a", read: false });
        const b = notif({ id: "b", read: false });
        const updated = applyRealtimeUpdate([a, b], { ...a, read: true, read_at: "2026-07-14T11:00:00Z" });
        expect(updated.find((n) => n.id === "a")!.read).toBe(true);
        expect(countUnread(updated)).toBe(1);
    });

    it("update de linha ausente é no-op (não injeta lixo no cache)", () => {
        const items = [notif({ id: "a" })];
        expect(applyRealtimeUpdate(items, notif({ id: "zzz" }))).toBe(items);
    });

    it("merge não perde a linha do socket quando um refetch antigo chega depois", () => {
        // A race sutil: o refetch começou ANTES do INSERT commitar e resolveu DEPOIS.
        // Seu snapshot não tem a linha nova. Se substituísse o cache, a linha sumiria.
        const doSocket = notif({ id: "nova", priority: "critical" });
        const cacheComSocket = [doSocket, notif({ id: "velha" })];
        const snapshotAntigoDoServidor = [notif({ id: "velha" })];

        const merged = mergeNotifications(cacheComSocket, snapshotAntigoDoServidor, 30);
        expect(merged.map((n) => n.id)).toContain("nova");
    });

    it("no merge, o servidor tem precedência sobre o cache (read/read_at)", () => {
        const local = notif({ id: "a", read: false });
        const doServidor = { ...local, read: true };
        const merged = mergeNotifications([local], [doServidor], 30);
        expect(merged.find((n) => n.id === "a")!.read).toBe(true);
    });

    it("a nova entra no TOPO quando é a mais prioritária (sem remontar a lista)", () => {
        const antigas = [notif({ id: "v1" }), notif({ id: "v2" })];
        const critica = notif({ id: "nova", priority: "critical" });
        const result = applyRealtimeInsert(antigas, critica, 30);
        expect(result[0].id).toBe("nova");
        // As antigas continuam presentes e com a MESMA identidade de objeto — é isso que
        // permite ao React reconciliar por key e preservar o scroll.
        expect(result).toContain(antigas[0]);
        expect(result).toContain(antigas[1]);
    });
});

describe("contagem de não-lidas — o badge não pode truncar", () => {
    it("countUnread conta só a página (por isso o unread_count vem do servidor)", () => {
        // Cenário real: 50 não-lidas no banco, página de 30. Se o badge fosse recalculado
        // a partir da página, o gestor veria 30 e acharia que tinha menos trabalho.
        const pagina = Array.from({ length: 30 }, () => notif({ read: false }));
        expect(countUnread(pagina)).toBe(30);
        // Daí o hook ajustar o unread_count do servidor por DELTA, nunca recalculá-lo.
    });

    it("countUnread ignora as lidas", () => {
        const items = [
            notif({ read: true }),
            notif({ read: false }),
            notif({ read: false }),
        ];
        expect(countUnread(items)).toBe(2);
    });
});
