#!/usr/bin/env node
/**
 * site/build.mjs — jekyll-js docs site build orchestrator.
 *
 * Run from the repo root:
 *     node site/build.mjs
 *
 * Pipeline:
 *   1. Clean            rm -rf site/dist, recreate dirs
 *   2. JSDoc            npx jsdoc -c site/jsdoc.json        (skipped if config missing)
 *   3. Guides           site/guides/*.md -> site/dist/v0.2/guides/<name>/index.html
 *   4. Guides index     site/guides/index.md -> site/dist/v0.2/guides/index.html
 *   5. Landing          site/landing.html -> site/dist/v0.2/index.html (placeholder if missing)
 *   6. Playground       playground/ -> site/dist/playground/ (UNVERSIONED)
 *   7. Engine bundles   dist/*.js -> site/dist/playground/dist/ (warns if dist/ missing)
 *   8. Root redirect    site/dist/index.html -> v0.2/
 *   9. versions.json
 *  10. sitemap.xml     (base URL: $SITE_URL or https://marketingpip.github.io/jekyll-js/)
 *  11. robots.txt      (site/dist/robots.txt + site/dist/v0.2/robots.txt)
 *
 * Missing optional inputs are skipped with a warning; the script always exits 0.
 */

import { execSync } from 'node:child_process';
import {
  cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SITE = path.join(ROOT, 'site');
const DIST = path.join(SITE, 'dist');

const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const VERSION =
  process.env.DOCS_VERSION ||
  'v' + String(pkg.version).split('.').slice(0, 2).join('.');
const VDIR = path.join(DIST, VERSION);
// SITE_URL verified against the GitHub Pages deploy target: the repo deploys
// via actions/deploy-pages (see .github/workflows/gh-pages.yml) for the
// MarketingPip/jekyll-js project repo, and README.md + docs/announcement.md
// link the live site as https://marketingpip.github.io/jekyll-js/ .
const SITE_URL = (process.env.SITE_URL || 'https://marketingpip.github.io/jekyll-js/').replace(/\/*$/, '/');
const GITHUB = 'https://github.com/MarketingPip/jekyll-js';
const BUILD_DATE = new Date().toISOString().slice(0, 10);

// locs are paths relative to site/dist/ of every HTML page produced.
const pages = [];
const warnings = [];
const warn = (m) => { warnings.push(m); console.warn(`[build] WARN: ${m}`); };
const log = (m) => console.log(`[build] ${m}`);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

function splitFrontMatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return { data: {}, body: md };
  const data = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([\w-]+):\s*(.+)$/);
    if (kv) data[kv[1]] = kv[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return { data, body: md.slice(m[0].length) };
}

function pageTitle(body, data, fallback) {
  if (data.title) return data.title;
  const h1 = body.match(/^#\s+(.+)$/m);
  return h1 ? h1[1].trim() : fallback;
}

function pageDescription(body) {
  const para = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .find((p) => p && !p.startsWith('#') && !p.startsWith('|') && !p.startsWith('```') && !p.startsWith('>'));
  if (!para) return 'jekyll-js documentation';
  return para
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // images -> alt text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links -> link text
    .replace(/[#*`_[\]()<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

/**
 * Rewrite relative `*.md` links in rendered HTML to pretty-URL form.
 * base: prefix for the target directory ('../' from guides/<name>/, './' from guides/).
 */
function rewriteMdLinks(html, base) {
  return html.replace(/href="([^"]*)"/g, (match, url) => {
    if (/^(https?:|mailto:|tel:|#|\/)/i.test(url)) return match;
    const hashIdx = url.indexOf('#');
    const frag = hashIdx >= 0 ? url.slice(hashIdx) : '';
    let target = (hashIdx >= 0 ? url.slice(0, hashIdx) : url).replace(/^\.\//, '');
    if (!/\.md$/i.test(target)) return match;
    const name = target.replace(/\.md$/i, '');
    const pretty = name === 'index' ? base : `${base}${name}/`;
    return `href="${pretty}${frag}"`;
  });
}

function walkHtml(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walkHtml(full, out);
    else if (entry.endsWith('.html')) out.push(full);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Shared layout template
// ---------------------------------------------------------------------------

/**
 * @param {{title:string, description:string, body:string, depth:number, loc:string}} opts
 * depth: how many "../" segments reach site/dist/v0.2/ from the page's directory.
 *        guides/<name>/ -> 2, guides/ -> 1, v0.2 root -> 1 (v0.2/ is one below dist/)
 * loc: page path relative to site/dist/ (used for the canonical + og:url).
 */
function layout({ title, description, body, depth, loc }) {
  const p = '../'.repeat(depth);
  const canonical = SITE_URL + loc.replace(/(^|\/)index\.html$/, '$1');
  const t = esc(title);
  const d = esc(description);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${t} — jekyll-js docs</title>
<meta name="description" content="${d}" />
<link rel="canonical" href="${canonical}" />
<meta property="og:title" content="${t} — jekyll-js docs" />
<meta property="og:description" content="${d}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${canonical}" />
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="${t} — jekyll-js docs" />
<meta name="twitter:description" content="${d}" />
<script src="https://cdn.tailwindcss.com?plugins=typography"></script>
<style>
  pre { background: #0f172a; color: #e2e8f0; padding: 1rem 1.25rem; border-radius: 0.5rem; overflow-x: auto; }
  pre code { background: transparent; color: inherit; padding: 0; }
  :not(pre) > code { background: #f1f5f9; color: #0f172a; padding: 0.125rem 0.375rem; border-radius: 0.25rem; font-size: 0.875em; }
  .prose a { color: #1d4ed8; }
  .prose img { border-radius: 0.5rem; }
</style>
</head>
<body class="bg-white text-slate-900 antialiased">
<header class="bg-slate-900 text-white">
  <nav class="max-w-4xl mx-auto px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-medium">
    <a href="${p}" class="text-lg font-bold tracking-tight">jekyll-js <span class="text-slate-400 font-normal">docs</span></a>
    <a href="${p}" class="hover:text-sky-300">Home</a>
    <a href="${p}guides/" class="hover:text-sky-300">Guides</a>
    <a href="${p}api/" class="hover:text-sky-300">API</a>
    <a href="${p}playground/" class="hover:text-sky-300">Playground</a>
    <a href="${GITHUB}" class="hover:text-sky-300 ml-auto" target="_blank" rel="noopener">GitHub</a>
  </nav>
</header>
<main class="max-w-4xl mx-auto px-4 py-8">
  <article class="prose prose-slate max-w-none">${body}</article>
</main>
<footer class="border-t border-slate-200 mt-12">
  <div class="max-w-4xl mx-auto px-4 py-6 text-sm text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
    <span>jekyll-js ${VERSION} — MIT — MarketingPipeline</span>
    <a href="${p}../versions.json" class="hover:underline">versions</a>
    <a href="${GITHUB}" class="hover:underline" target="_blank" rel="noopener">GitHub</a>
  </div>
</footer>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// 1. Clean
// ---------------------------------------------------------------------------

log(`cleaning ${path.relative(ROOT, DIST)} …`);
rmSync(DIST, { recursive: true, force: true });
mkdirSync(VDIR, { recursive: true });

// ---------------------------------------------------------------------------
// 2. JSDoc
// ---------------------------------------------------------------------------

const jsdocCfg = path.join(SITE, 'jsdoc.json');
if (existsSync(jsdocCfg)) {
  log('running JSDoc …');
  execSync('npx jsdoc -c site/jsdoc.json', { cwd: ROOT, stdio: 'inherit' });
  try {
    const cfg = JSON.parse(readFileSync(jsdocCfg, 'utf8'));
    const dest = path.resolve(ROOT, cfg.opts?.destination || `site/dist/${VERSION}/api`);
    if (existsSync(dest)) {
      for (const f of walkHtml(dest)) pages.push(path.relative(DIST, f));
      log(`JSDoc produced ${pages.length} API page(s)`);
    } else {
      warn(`JSDoc ran but destination ${path.relative(ROOT, dest)} was not created`);
    }
  } catch (e) {
    warn(`could not scan JSDoc output: ${e.message}`);
  }
} else {
  warn('site/jsdoc.json not found — skipping API docs');
}

// ---------------------------------------------------------------------------
// 3. Guides
// ---------------------------------------------------------------------------

const guidesDir = path.join(ROOT, 'docs', 'guides');
let guideFiles = [];
if (existsSync(guidesDir)) {
  guideFiles = readdirSync(guidesDir)
    .filter((f) => f.endsWith('.md') && f !== 'index.md')
    .sort();
}
const guideMeta = [];

for (const file of guideFiles) {
  const name = file.replace(/\.md$/i, '');
  const md = readFileSync(path.join(guidesDir, file), 'utf8');
  const { data, body } = splitFrontMatter(md);
  const title = pageTitle(body, data, name);
  const description = data.description || pageDescription(body);
  const htmlBody = rewriteMdLinks(marked.parse(body), '../');
  const outDir = path.join(VDIR, 'guides', name);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    path.join(outDir, 'index.html'),
    layout({ title, description, body: htmlBody, depth: 2, loc: `${VERSION}/guides/${name}/` }),
  );
  pages.push(`${VERSION}/guides/${name}/index.html`);
  guideMeta.push({ name, title, description });
  log(`guide: ${file} -> ${VERSION}/guides/${name}/`);
}
if (!guideFiles.length) warn('no guide markdown files found — skipping guides');

// ---------------------------------------------------------------------------
// 4. Guides index
// ---------------------------------------------------------------------------

{
  const indexMd = path.join(guidesDir, 'index.md');
  let body = '';
  if (existsSync(indexMd)) {
    const md = readFileSync(indexMd, 'utf8');
    const { data, body: mdBody } = splitFrontMatter(md);
    body = rewriteMdLinks(marked.parse(mdBody), './');
    void data;
  } else {
    warn('site/guides/index.md not found — generating guide listing from scratch');
  }

  const missing = guideMeta.filter(
    (g) => !new RegExp(`href="[^"]*${g.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/"`).test(body),
  );
  if (missing.length) {
    const items = missing
      .map((g) => `      <li><a href="./${g.name}/"><strong>${esc(g.title)}</strong></a> — ${esc(g.description)}</li>`)
      .join('\n');
    body += `\n<h2>All guides</h2>\n<ul>\n${items}\n</ul>\n`;
  }

  const outDir = path.join(VDIR, 'guides');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    path.join(outDir, 'index.html'),
    layout({
      title: 'Guides',
      description: 'Step-by-step guides for jekyll-js — the JavaScript implementation of Jekyll.',
      body: body || '<h1>Guides</h1><p>No guides yet.</p>',
      depth: 1,
      loc: `${VERSION}/guides/`,
    }),
  );
  pages.push(`${VERSION}/guides/index.html`);
  log(`guides index: ${guideMeta.length} guide(s) listed`);
}

// ---------------------------------------------------------------------------
// 5. Landing
// ---------------------------------------------------------------------------

{
  const landingSrc = path.join(SITE, 'landing.html');
  const landingDst = path.join(VDIR, 'index.html');
  if (existsSync(landingSrc)) {
    cpSync(landingSrc, landingDst);
    log('landing: copied site/landing.html');
  } else {
    warn('site/landing.html not found — generating placeholder landing page');
    const body = `
<h1>jekyll-js</h1>
<p>Render Jekyll sites entirely in JavaScript — in the browser, in Node, anywhere. No Ruby required.</p>
<ul>
  <li><a href="./guides/">Guides</a> — step-by-step walkthroughs</li>
  <li><a href="./api/">API reference</a> — generated from source</li>
  <li><a href="./playground/">Playground</a> — try it live in your browser</li>
  <li><a href="${GITHUB}">GitHub</a> — source code</li>
</ul>`;
    writeFileSync(
      landingDst,
      layout({
        title: 'jekyll-js',
        description: 'Render Jekyll sites entirely in JavaScript — in the browser, in Node, anywhere. No Ruby required.',
        body,
        depth: 1,
        loc: `${VERSION}/`,
      }),
    );
  }
  pages.push(`${VERSION}/index.html`);
}

// ---------------------------------------------------------------------------
// 6. Playground
// ---------------------------------------------------------------------------

{
  // Playground is UNVERSIONED (live demo, always latest) -> site/dist/playground/
  const src = path.join(ROOT, 'playground');
  const dst = path.join(DIST, 'playground');
  if (existsSync(src)) {
    cpSync(src, dst, {
      recursive: true,
      filter: (p) => !/(^|\/)node_modules(\/|$)/.test(p) && !/(^|\/)\.git(\/|$)/.test(p),
    });
    pages.push(`playground/`);
    log('playground: copied (unversioned)');
  } else {
    warn('playground/ not found — skipping');
  }
}

// ---------------------------------------------------------------------------
// 7. Engine bundles
// ---------------------------------------------------------------------------

{
  const src = path.join(ROOT, 'dist');
  const dst = path.join(DIST, 'playground', 'dist');
  if (existsSync(src)) {
    const bundles = readdirSync(src).filter((f) => f.endsWith('.js'));
    if (bundles.length) {
      mkdirSync(dst, { recursive: true });
      for (const f of bundles) cpSync(path.join(src, f), path.join(dst, f));
      log(`engine bundles: copied ${bundles.length} file(s) to playground/dist/`);
    } else {
      warn('dist/ exists but contains no .js bundles');
    }
  } else {
    warn('dist/ not found — run `npm run build` first; playground bundles skipped');
  }
}

// ---------------------------------------------------------------------------
// 8. Root redirect
// ---------------------------------------------------------------------------

writeFileSync(
  path.join(DIST, 'index.html'),
  `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta http-equiv="refresh" content="0; url=${VERSION}/" />
<link rel="canonical" href="${SITE_URL}${VERSION}/" />
<title>jekyll-js docs</title>
<script>location.replace(${JSON.stringify(VERSION + '/')});</script>
</head>
<body>
<p>Redirecting to <a href="${VERSION}/">jekyll-js docs ${VERSION}</a>…</p>
</body>
</html>
`,
);
log('root redirect written');

// ---------------------------------------------------------------------------
// 9. versions.json
// ---------------------------------------------------------------------------

writeFileSync(
  path.join(DIST, 'versions.json'),
  JSON.stringify({ latest: VERSION, versions: [VERSION] }, null, 2) + '\n',
);
log('versions.json written');

// ---------------------------------------------------------------------------
// 10. sitemap.xml
// ---------------------------------------------------------------------------

{
  const seen = new Set();
  const urls = [];
  for (const rel of pages) {
    const clean = rel.replace(/(^|\/)index\.html$/, '$1');
    const loc = SITE_URL + clean;
    if (seen.has(loc)) continue;
    seen.add(loc);
    urls.push(`  <url>\n    <loc>${esc(loc)}</loc>\n    <lastmod>${BUILD_DATE}</lastmod>\n  </url>`);
  }
  writeFileSync(
    path.join(DIST, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`,
  );
  log(`sitemap.xml written (${urls.length} URL(s))`);
}

// ---------------------------------------------------------------------------
// 11. robots.txt
// ---------------------------------------------------------------------------

{
  const robots = `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}sitemap.xml\n`;
  writeFileSync(path.join(VDIR, 'robots.txt'), robots);
  writeFileSync(path.join(DIST, 'robots.txt'), robots);
  log('robots.txt written (dist root + versioned)');
}

// ---------------------------------------------------------------------------

log(`done — ${pages.length} HTML page(s), ${warnings.length} warning(s)`);
if (warnings.length) log('warnings:\n  - ' + warnings.join('\n  - '));
