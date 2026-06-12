import { defineConfig } from "vitest/config";
import path from "path";

// Config dedicada à suíte de segurança (tests/security/**), que provisiona
// fixtures reais no Supabase NONPROD — separada do `npm test` comum de propósito.
export default defineConfig({
    test: {
        include: ["tests/security/**/*.test.ts"],
        setupFiles: ["tests/security/helpers/load-env.ts"],
        // Sequencial de propósito: cada arquivo provisiona 6 users + sign-ins;
        // em paralelo o burst estoura o rate limit do Supabase Auth.
        fileParallelism: false,
        // provisionamento de fixtures (6 users + 3 restaurantes) é lento
        testTimeout: 60_000,
        hookTimeout: 120_000,
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "."),
        },
    },
});
