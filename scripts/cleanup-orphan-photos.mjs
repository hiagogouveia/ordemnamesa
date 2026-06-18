#!/usr/bin/env node
// Remove fotos ÓRFÃS do bucket 'photos' (arquivos sem nenhuma referência no banco).
//
// SEGURO POR PADRÃO: roda em dry-run. Só apaga com --apply.
//
// Uso:
//   node scripts/cleanup-orphan-photos.mjs                 # dry-run: lista órfãos
//   node scripts/cleanup-orphan-photos.mjs --backup ./bkp  # baixa órfãos antes
//   node scripts/cleanup-orphan-photos.mjs --apply         # REMOVE (irreversível)
//   node scripts/cleanup-orphan-photos.mjs --env .env.prod # apontar para PROD
//
// Recomendado: --backup ./bkp --apply  (baixa e depois remove).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Buffer } from 'node:buffer';
import { loadEnv, getFlag, requireSupabaseAdmin } from './_lib/env.mjs';
import { makeAdmin, listAllObjects, fetchReferencedPaths, BUCKET, fmtMB } from './_lib/photos.mjs';

const envFile = typeof getFlag('env') === 'string' ? getFlag('env') : '.env.local';
loadEnv(envFile);
const apply = getFlag('apply') === true;
const backupDir = typeof getFlag('backup') === 'string' ? getFlag('backup') : null;

const { url, key } = requireSupabaseAdmin();
const admin = makeAdmin(url, key);

console.log(`\n== cleanup-orphan-photos (${apply ? 'APPLY' : 'DRY-RUN'}) — env ${envFile} ==\n`);

const [objects, referenced] = await Promise.all([
    listAllObjects(admin),
    fetchReferencedPaths(admin),
]);

const orphans = objects.filter((o) => !referenced.has(o.path));
const totalBytes = orphans.reduce((s, o) => s + o.size, 0);

console.log(`Objetos no Storage : ${objects.length}`);
console.log(`Referenciados (DB) : ${referenced.size}`);
console.log(`ÓRFÃOS             : ${orphans.length}  (${fmtMB(totalBytes)})\n`);

if (orphans.length === 0) {
    console.log('Nada a remover. ✅');
    process.exit(0);
}

for (const o of orphans) console.log(`  - ${o.path}  (${fmtMB(o.size)})`);

if (backupDir) {
    console.log(`\nBaixando órfãos para ${backupDir} ...`);
    for (const o of orphans) {
        const { data, error } = await admin.storage.from(BUCKET).download(o.path);
        if (error) {
            console.error(`  ✗ backup falhou: ${o.path}: ${error.message}`);
            process.exit(1);
        }
        const dest = join(backupDir, o.path);
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, Buffer.from(await data.arrayBuffer()));
        console.log(`  ✓ ${o.path}`);
    }
}

if (!apply) {
    console.log('\nDRY-RUN: nada foi removido. Reexecute com --apply para remover.');
    process.exit(0);
}

console.log('\nRemovendo do Storage ...');
const paths = orphans.map((o) => o.path);
const { error } = await admin.storage.from(BUCKET).remove(paths);
if (error) {
    console.error(`Falha ao remover: ${error.message}`);
    process.exit(1);
}
console.log(`✅ Removidos ${paths.length} arquivos órfãos (${fmtMB(totalBytes)} liberados).`);
