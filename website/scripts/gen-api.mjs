#!/usr/bin/env node
/**
 * gen-api.mjs — generate Docusaurus API reference pages from JSDoc comments.
 *
 * Usage: npm run gen:api   (run from website/)
 *
 * Reads JSDoc from src/*.js, renders markdown via jsdoc-to-markdown, and
 * writes first-class Docusaurus pages into docs/api/ so they get the site
 * theme, sidebar and local search (no standalone HTML dumps).
 *
 * Generated filenames use a `-reference` suffix to avoid colliding with
 * hand-written guides in docs/api/ (e.g. engine.md) owned by Worker 2.
 * Only source files that actually contain JSDoc comments produce pages;
 * undocumented files are skipped (no invented documentation).
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const jsdoc2md = require('jsdoc-to-markdown');

const here = dirname(fileURLToPath(import.meta.url));
const websiteDir = dirname(here);
const repoRoot = dirname(websiteDir);

// source file → page slug (dest: docs/api/<slug>-reference.md)
const SOURCES = [
  ['src/engine.js', 'engine'],
  ['src/jekyllTags.js', 'jekyll-tags'],
  ['src/jekyllFeed.js', 'jekyll-feed'],
  ['src/jekyllSitemap.js', 'jekyll-sitemap'],
  ['src/jekyllRedirectFrom.js', 'jekyll-redirect-from'],
  ['src/assetsPipeline.js', 'assets-pipeline'],
  ['src/fs-vfs.js', 'fs-vfs'],
];

const TITLES = {
  engine: 'Engine API',
  'jekyll-tags': 'Jekyll Tags API',
  'jekyll-feed': 'Jekyll Feed API',
  'jekyll-sitemap': 'Jekyll Sitemap API',
  'jekyll-redirect-from': 'Jekyll Redirect-From API',
  'assets-pipeline': 'Assets Pipeline API',
  'fs-vfs': 'FS / VFS API',
};

const apiDir = join(websiteDir, 'docs', 'api');
mkdirSync(apiDir, { recursive: true });

// Section category metadata for the Docusaurus sidebar.
writeFileSync(
  join(apiDir, '_category_.json'),
  JSON.stringify({ label: 'API Reference', position: 20, link: { type: 'generated-index' } }, null, 2) + '\n'
);

const hasJsDoc = (srcPath) => readFileSync(srcPath, 'utf8').includes('/**');
const pages = [];

for (const [rel, slug] of SOURCES) {
  const srcPath = join(repoRoot, rel);
  if (!existsSync(srcPath)) {
    console.log(`skip: ${rel} — source file not found`);
    continue;
  }
  if (!hasJsDoc(srcPath)) {
    console.log(`skip: ${rel} — no JSDoc comments (undocumented, skipped)`);
    continue;
  }
  let md;
  try {
    md = await jsdoc2md.render({ files: srcPath });
  } catch (err) {
    console.error(`error rendering ${rel}: ${err.message}`);
    process.exitCode = 1;
    continue;
  }
  if (!md.trim()) {
    console.log(`skip: ${rel} — jsdoc2md produced empty output`);
    continue;
  }
  const dest = join(apiDir, `${slug}-reference.md`);
  const frontmatter = `---\ntitle: ${TITLES[slug] ?? slug}\n---\n\n`;
  writeFileSync(dest, frontmatter + md.trim() + '\n');
  console.log(`wrote docs/api/${slug}-reference.md ← ${rel}`);
  pages.push({ slug, title: TITLES[slug] ?? slug, rel });
}

// Landing page: links every generated reference page.
const indexMd = `---
title: API Reference
---

# API Reference

Auto-generated reference documentation from the JSDoc comments in the
source code. Regenerate with \`npm run gen:api\` from \`website/\`.

${pages.map((p) => `- [${p.title}](./${p.slug}-reference.md) — from \`${p.rel}\``).join('\n')}
`;
writeFileSync(join(apiDir, 'index.md'), indexMd);
console.log('wrote docs/api/index.md');
console.log(`done: ${pages.length} reference page(s)`);
