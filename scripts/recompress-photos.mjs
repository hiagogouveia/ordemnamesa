#!/usr/bin/env node
// Recomprime as fotos JÁ existentes no bucket 'photos' (resize 1280px, JPEG q75).
// Re-upload no MESMO path (upsert) → referências no banco continuam válidas.
//
// SEGURO POR PADRÃO: roda em dry-run (baixa e mede o ganho, NÃO grava).
// IRREVERSÍVEL no modo --apply. Faça --backup antes.
//
// Uso:
//   node scripts/recompress-photos.mjs                       # dry-run: ganho estimado
//   node scripts/recompress-photos.mjs --backup ./bkp        # baixa originais
//   node scripts/recompress-photos.mjs --backup ./bkp --apply # recomprime de fato
//   node scripts/recompress-photos.mjs --env .env.prod
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Buffer } from 'node:buffer';
import sharp from 'sharp';
import { loadEnv, getFlag, requireSupabaseAdmin } from './_lib/env.mjs';
import { makeAdmin, listAllObjects, BUCKET, fmtMB } from './_lib/photos.mjs';

const MAX_DIM = 1280;
const QUALITY = 75;
const SKIP_BELOW_BYTES = 400 * 1024; // já pequenas: não mexe
const BATCH = 10;

const envFile = typeof getFlag('env') === 'string' ? getFlag('env') : '.env.local';
loadEnv(envFile);
const apply = getFlag('apply') === true;
const backupDir = typeof getFlag('backup') === 'string' ? getFlag('backup') : null;

if (apply && !backupDir) {
    console.error('Recuse-se a aplicar sem backup. Use --backup <dir> junto com --apply.');
    process.exit(1);
}

const { url, key } = requireSupabaseAdmin();
const admin = makeAdmin(url, key);

console.log(`\n== recompress-photos (${apply ? 'APPLY' : 'DRY-RUN'}) — env ${envFile} ==\n`);

const objects = await listAllObjects(admin);
console.log(`Objetos no Storage: ${objects.length}\n`);

let beforeTotal = 0;
let afterTotal = 0;
let processed = 0;
let skipped = 0;
let errors = 0;

async function handle(o) {
    beforeTotal += o.size;
    if (o.size < SKIP_BELOW_BYTES) {
        afterTotal += o.size;
        skipped++;
        return;
    }
    const { data, error } = await admin.storage.from(BUCKET).download(o.path);
    if (error) {
        console.error(`  ✗ download ${o.path}: ${error.message}`);
        afterTotal += o.size;
        errors++;
        return;
    }
    const input = Buffer.from(await data.arrayBuffer());

    if (backupDir) {
        const dest = join(backupDir, o.path);
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, input);
    }

    let output;
    try {
        output = await sharp(input)
            .rotate() // aplica orientação EXIF antes de descartar metadados
            .resize({ width: MAX_DIM, height: MAX_DIM, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: QUALITY })
            .toBuffer();
    } catch (e) {
        console.error(`  ✗ sharp ${o.path}: ${e.message}`);
        afterTotal += o.size;
        errors++;
        return;
    }

    // Se não houver ganho, mantém o original.
    if (output.length >= o.size) {
        afterTotal += o.size;
        skipped++;
        return;
    }

    afterTotal += output.length;
    processed++;
    console.log(`  ${apply ? '✓' : '·'} ${o.path}: ${fmtMB(o.size)} → ${fmtMB(output.length)}`);

    if (apply) {
        const { error: upErr } = await admin.storage
            .from(BUCKET)
            .upload(o.path, output, { contentType: 'image/jpeg', cacheControl: '3600', upsert: true });
        if (upErr) {
            console.error(`  ✗ upload ${o.path}: ${upErr.message}`);
            errors++;
        }
    }
}

for (let i = 0; i < objects.length; i += BATCH) {
    const batch = objects.slice(i, i + BATCH);
    await Promise.all(batch.map(handle));
    console.log(`  ...lote ${Math.floor(i / BATCH) + 1}/${Math.ceil(objects.length / BATCH)}`);
}

console.log(`\nResumo:`);
console.log(`  Processadas      : ${processed}`);
console.log(`  Puladas (peq./sem ganho): ${skipped}`);
console.log(`  Erros            : ${errors}`);
console.log(`  Antes            : ${fmtMB(beforeTotal)}`);
console.log(`  Depois (estimado): ${fmtMB(afterTotal)}`);
console.log(`  Ganho            : ${fmtMB(beforeTotal - afterTotal)}\n`);

if (!apply) {
    console.log('DRY-RUN: nada foi gravado. Reexecute com --backup <dir> --apply para aplicar.');
}
