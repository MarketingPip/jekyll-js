/**
 * Oracle Harness: Compare jekyll-js output against real Jekyll.
 *
 * Usage:
 *   node test/oracle/harness.js --source <site-dir> [--jekyll <jekyll-bin>]
 *
 * 1. Builds <site-dir> with jekyll-js → ./oracle-out/js/
 * 2. Builds <site-dir> with real Jekyll → ./oracle-out/jekyll/
 * 3. Normalizes nondeterministic output (timestamps, etc.)
 * 4. Diffs file-by-file, reports mismatches
 *
 * Requires: Ruby + Jekyll installed (for the oracle side).
 * If --jekyll is omitted, only the jekyll-js side runs (useful for
 * capturing expected output to compare manually).
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
function arg(name, def) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
}

const source = arg('--source');
const jekyllBin = arg('--jekyll', 'jekyll');
const outDir = path.join(__dirname, 'out');

if (!source) {
  console.error('Usage: node harness.js --source <site-dir> [--jekyll <bin>]');
  process.exit(1);
}

// Dynamic import (engine is ESM)
const { JekyllEngine } = await import('../../src/engine.js');
const { readDirToVFS } = await import('../../src/fs-vfs.js');

async function buildWithJs() {
  console.log('Building with jekyll-js...');
  const vfs = readDirToVFS(source, { fs });

  // Auto-load Sass if the site has .scss/.sass files (themes usually do)
  let sass = undefined;
  const hasSass = Object.keys(vfs).some((f) => f.endsWith('.scss') || f.endsWith('.sass'));
  if (hasSass) {
    try {
      sass = await import('sass');
      console.log('  (Sass compiler loaded)');
    } catch {
      console.log('  (Warning: site has Sass files but `sass` package not installed)');
    }
  }

  const engine = new JekyllEngine({ vfs, sass, logger: () => {} });
  const pages = await engine.build();

  const jsOut = path.join(outDir, 'js');
  fs.rmSync(jsOut, { recursive: true, force: true });
  fs.mkdirSync(jsOut, { recursive: true });

  for (const page of pages) {
    const outPath = page.permalink.endsWith('/')
      ? path.join(jsOut, page.permalink, 'index.html')
      : path.join(jsOut, page.permalink);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, page.content);
  }
  console.log(`  → ${pages.length} pages in ${jsOut}`);
}

function buildWithJekyll() {
  console.log('Building with real Jekyll...');
  const jekyllOut = path.join(outDir, 'jekyll');
  fs.rmSync(jekyllOut, { recursive: true, force: true });
  try {
    execSync(`${jekyllBin} build --source "${source}" --destination "${jekyllOut}" --quiet`, {
      stdio: 'pipe',
    });
    console.log(`  → built in ${jekyllOut}`);
    return true;
  } catch (e) {
    console.error('  Jekyll build failed:', e.message.slice(0, 200));
    console.error('  (Is Ruby + Jekyll installed? Run with --jekyll <path> to specify.)');
    return false;
  }
}

// Normalize nondeterministic output for comparison
function normalize(content) {
  return (
    content
      // Timestamps in various formats
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:?\d{2}/g, '<TIMESTAMP>')
      .replace(/\d{2}:\d{2}(:\d{2})?/g, '<TIME>')
      // Jekyll version strings
      .replace(/Jekyll\/\d+\.\d+\.\d+/g, 'Jekyll/<VERSION>')
      // Absolute build paths that leak into output
      .replace(/\/tmp\/[^\s"']+/g, '<TMP>')
  );
}

function diff() {
  console.log('\nDiffing...');
  const jsOut = path.join(outDir, 'js');
  const jekyllOut = path.join(outDir, 'jekyll');

  if (!fs.existsSync(jekyllOut)) {
    console.log('  (Skipping diff — no Jekyll output. Run with Ruby+Jekyll for full oracle.)');
    return;
  }

  const jsFiles = new Set();
  function walk(dir, base) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      const rel = path.join(base, e.name);
      if (e.isDirectory()) walk(full, rel);
      else jsFiles.add(rel);
    }
  }
  walk(jsOut, '');

  const jekyllFiles = new Set();
  function walk2(dir, base) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      const rel = path.join(base, e.name);
      if (e.isDirectory()) walk2(full, rel);
      else jekyllFiles.add(rel);
    }
  }
  walk2(jekyllOut, '');

  const onlyJs = [...jsFiles].filter((f) => !jekyllFiles.has(f));
  const onlyJekyll = [...jekyllFiles].filter((f) => !jsFiles.has(f));
  const both = [...jsFiles].filter((f) => jekyllFiles.has(f));

  let mismatches = 0;
  for (const f of both) {
    const jsContent = normalize(fs.readFileSync(path.join(jsOut, f), 'utf8'));
    const jekyllContent = normalize(fs.readFileSync(path.join(jekyllOut, f), 'utf8'));
    if (jsContent !== jekyllContent) {
      mismatches++;
      console.log(`  ✗ MISMATCH: ${f}`);
    }
  }

  console.log(`\n  Files: ${both.length} common, ${mismatches} mismatched`);
  if (onlyJs.length) console.log(`  Only in jekyll-js: ${onlyJs.slice(0, 5).join(', ')}${onlyJs.length > 5 ? '...' : ''}`);
  if (onlyJekyll.length) console.log(`  Only in Jekyll: ${onlyJekyll.slice(0, 5).join(', ')}${onlyJekyll.length > 5 ? '...' : ''}`);
  if (mismatches === 0 && onlyJs.length === 0 && onlyJekyll.length === 0) {
    console.log('  ✅ EXACT MATCH');
  }
}

await buildWithJs();
const jekyllOk = buildWithJekyll();
if (jekyllOk) diff();
else console.log('\n  (jekyll-js output in test/oracle/out/js/ — compare manually)');
