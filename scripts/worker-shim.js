// Shim injetado no bundle CJS do worker.
//
// O `worker.ts` usa `import.meta.url` (ESM) para achar o próprio caminho e forkar filhos.
// No bundle CJS não existe `import.meta`, então o build-worker.mjs substitui
// `import.meta.url` por `__worker_self_url`, definido aqui a partir do `__filename` do
// CommonJS (que aponta para o próprio dist/worker.cjs).
export const __worker_self_url = require("url").pathToFileURL(__filename).href;
