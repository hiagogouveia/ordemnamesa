/**
 * Stub de `server-only` para os testes.
 *
 * O pacote `server-only` existe para QUEBRAR o build se um módulo de servidor for
 * importado num Client Component — garantia que queremos manter no app. Mas fora do
 * bundler do Next (ou seja, no Vitest, em Node puro) ele lança sempre.
 *
 * Aliasar para este módulo vazio no vitest.security.config.ts nos deixa testar o
 * emissor/materializador contra o banco real, sem enfraquecer a garantia em produção.
 */
export {};
