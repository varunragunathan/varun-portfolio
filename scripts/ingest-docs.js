#!/usr/bin/env node
// ── RAG ingestion script ───────────────────────────────────────────
// Reads docs/ and worker/ source files, chunks them, generates
// embeddings via Workers AI, and upserts into Vectorize.
//
// Usage:
//   node scripts/ingest-docs.js              # dry run (no upsert)
//   node scripts/ingest-docs.js --upsert     # embed + upsert to Vectorize
//
// Requires:
//   CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in env
//   (copy from .dev.vars or set in shell)
//
// Access tiers:
//   Chunks default to 'protected' (any signed-in user).
//   Files/sections marked <!-- access: restricted --> are skipped
//   from indexing until the admin approval flow is built.
//   Files/sections marked <!-- access: public --> will be queryable
//   by unauthenticated users in future.

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, extname } from 'path';
import { createHash } from 'crypto';

const ROOT        = new URL('..', import.meta.url).pathname;
const ACCOUNT_ID  = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN   = process.env.CLOUDFLARE_API_TOKEN;
const INDEX_NAME  = 'varun-portfolio-rag';
const EMBED_MODEL = '@cf/baai/bge-base-en-v1.5';
const CHUNK_SIZE  = 400;   // tokens ≈ chars / 4
const CHUNK_OVERLAP = 80;
const DRY_RUN     = !process.argv.includes('--upsert');

// ── File sources ───────────────────────────────────────────────────
const SOURCES = [
  { dir: 'docs',             ext: ['.md'],        access: 'protected' },
  { dir: 'worker',           ext: ['.js'],         access: 'protected' },
  { dir: 'src',              ext: ['.jsx', '.js'], access: 'protected' },
  { dir: 'private/portfolio', ext: ['.md', '.txt'], access: 'protected' },
];

// Files/dirs to skip entirely
const SKIP = [
  'node_modules', 'dist', '.git', 'scripts', 'export',
  'logo-preview.html', '_TEMPLATE_PROJECT.md',
];

// ── Collect files ──────────────────────────────────────────────────
function collectFiles(dir, exts) {
  const results = [];
  function walk(current) {
    for (const entry of readdirSync(current)) {
      if (SKIP.includes(entry)) continue;
      const full = join(current, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) { walk(full); continue; }
      if (exts.includes(extname(entry))) results.push(full);
    }
  }
  walk(join(ROOT, dir));
  return results;
}

// ── Access tag parsing ─────────────────────────────────────────────
// Strips <!-- access: restricted -->...<!-- /access --> blocks.
// Strips lines preceded by //<!--skip-next-line--vector-->.
// Returns { text, access } where access is the effective level.
function parseAccess(content, defaultAccess) {
  // File-level frontmatter: --- access: restricted ---
  const frontmatter = content.match(/^---\s*\naccess:\s*(\w+)\s*\n---/);
  const fileAccess  = frontmatter ? frontmatter[1] : defaultAccess;

  // Remove restricted sections entirely — don't index them at all
  let stripped = content.replace(
    /<!--\s*access:\s*restricted\s*-->[\s\S]*?<!--\s*\/access\s*-->/gi,
    '',
  );

  // Remove lines marked with //<!--skip-next-line--vector--> (and the marker itself)
  stripped = stripped
    .split('\n')
    .filter((line, i, lines) => {
      // Drop marker lines
      if (/\/\/<!--skip-next-line--vector-->/.test(line)) return false;
      // Drop the line immediately after a marker
      if (i > 0 && /\/\/<!--skip-next-line--vector-->/.test(lines[i - 1])) return false;
      return true;
    })
    .join('\n');

  return { text: stripped, access: fileAccess };
}

// ── Chunking ───────────────────────────────────────────────────────
// Splits by markdown headings first, then by character count with overlap.
function chunkMarkdown(text, filePath) {
  const chunks = [];
  // Split on h1/h2/h3 boundaries
  const sections = text.split(/(?=^#{1,3} )/m).filter(s => s.trim());

  for (const section of sections) {
    const heading = section.match(/^#{1,3} (.+)/m)?.[1] ?? '';
    const body    = section.trim();

    if (body.length <= CHUNK_SIZE * 4) {
      chunks.push({ text: body, heading, filePath });
      continue;
    }

    // Long section — split by character count with overlap
    let start = 0;
    while (start < body.length) {
      const end  = Math.min(start + CHUNK_SIZE * 4, body.length);
      chunks.push({ text: body.slice(start, end), heading, filePath });
      start += (CHUNK_SIZE - CHUNK_OVERLAP) * 4;
    }
  }
  return chunks;
}

function chunkCode(text, filePath) {
  const chunks = [];
  // Split on blank lines between top-level declarations
  const blocks = text.split(/\n{2,}/);
  let current  = '';

  for (const block of blocks) {
    if ((current + block).length > CHUNK_SIZE * 4) {
      if (current.trim()) chunks.push({ text: current.trim(), heading: '', filePath });
      current = block;
    } else {
      current += '\n\n' + block;
    }
  }
  if (current.trim()) chunks.push({ text: current.trim(), heading: '', filePath });
  return chunks;
}

// ── Retry helper ──────────────────────────────────────────────────
async function withRetry(fn, retries = 3, delayMs = 2000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      console.log(`  ↺ retry ${attempt}/${retries - 1} after error: ${err.message}`);
      await new Promise(r => setTimeout(r, delayMs * attempt));
    }
  }
}

// ── Cloudflare API helpers ─────────────────────────────────────────
async function embed(texts) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${EMBED_MODEL}`,
    {
      method:  'POST',
      headers: { Authorization: `Bearer ${API_TOKEN}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ text: texts }),
    },
  );
  const data = await res.json();
  if (!data.success) throw new Error(`Embed failed: ${JSON.stringify(data.errors)}`);
  return data.result.data; // float[][] — one vector per input text
}

async function upsertVectors(vectors) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/vectorize/v2/indexes/${INDEX_NAME}/upsert`,
    {
      method:  'POST',
      headers: { Authorization: `Bearer ${API_TOKEN}`, 'Content-Type': 'application/x-ndjson' },
      body:    vectors.map(v => JSON.stringify(v)).join('\n'),
    },
  );
  const data = await res.json();
  if (!data.success) throw new Error(`Upsert failed: ${JSON.stringify(data.errors)}`);
  return data.result;
}

// ── Main ───────────────────────────────────────────────────────────
async function main() {
  if (!DRY_RUN && (!ACCOUNT_ID || !API_TOKEN)) {
    console.error('Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN');
    process.exit(1);
  }

  const allChunks = [];

  for (const { dir, ext, access: defaultAccess } of SOURCES) {
    const files = collectFiles(dir, ext);
    for (const filePath of files) {
      const raw     = readFileSync(filePath, 'utf-8');
      const relPath = relative(ROOT, filePath);
      const { text, access } = parseAccess(raw, defaultAccess);

      if (access === 'restricted') {
        console.log(`  skip (restricted): ${relPath}`);
        continue;
      }

      const isMarkdown = ext.includes('.md') || filePath.endsWith('.md');
      const chunks     = isMarkdown
        ? chunkMarkdown(text, relPath)
        : chunkCode(text, relPath);

      for (const chunk of chunks) {
        allChunks.push({ ...chunk, access });
      }
    }
  }

  console.log(`\nTotal chunks: ${allChunks.length}`);
  if (DRY_RUN) {
    console.log('Dry run — pass --upsert to embed and index.\n');
    for (const c of allChunks.slice(0, 5)) {
      console.log(`  [${c.access}] ${c.filePath} › ${c.heading || '(no heading)'}`);
      console.log(`    ${c.text.slice(0, 80).replace(/\n/g, ' ')}…\n`);
    }
    return;
  }

  // Embed and upsert in batches of 25 (Workers AI limit)
  const BATCH = 25;
  let upserted = 0;

  for (let i = 0; i < allChunks.length; i += BATCH) {
    const batch  = allChunks.slice(i, i + BATCH);
    const texts  = batch.map(c => c.text);

    const batchNum = Math.floor(i / BATCH) + 1;
    const totalBatches = Math.ceil(allChunks.length / BATCH);
    process.stdout.write(`Embedding batch ${batchNum}/${totalBatches}…`);

    const embeddings = await withRetry(() => embed(texts));

    const vectors = batch.map((chunk, j) => ({
      id:       createHash('sha1').update(`${chunk.filePath}:${i + j}`).digest('hex').slice(0, 40),
      values:   embeddings[j],
      metadata: {
        text:     chunk.text.slice(0, 1000), // Vectorize metadata cap
        filePath: chunk.filePath,
        heading:  chunk.heading,
        access:   chunk.access,
      },
    }));

    await withRetry(() => upsertVectors(vectors));
    upserted += vectors.length;
    console.log(` ✓ ${upserted}/${allChunks.length}`);

    // Small pause to avoid hitting rate limits on large ingestions
    if (batchNum < totalBatches) await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\nDone. ${upserted} vectors upserted to ${INDEX_NAME}.`);
}

main().catch(err => { console.error(err); process.exit(1); });
