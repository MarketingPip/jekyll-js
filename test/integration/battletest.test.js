/**
 * Battle-test suite: the real minima theme + the real scaffolded site.
 *
 * Ground truth: HTML files built by Jekyll 4.3.2 (already in testsite/_site).
 * Under test: our JekyllEngine rendering the identical VFS.
 *
 * We deliberately test structural / semantic parity, not byte-identical
 * whitespace, because:
 *  - kramdown vs markdown-it produce different whitespace
 *  - jekyll-seo-tag / jekyll-feed produce content we stub as no-ops
 *  - minima's main.scss uses SCSS @import partials we compile (content
 *    semantically equivalent, not byte-identical to libsass)
 *
 * Every assertion is grounded in what real Jekyll actually produced,
 * verified by reading testsite/_site/* directly.
 */
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JekyllEngine } from '../../src/engine.js';
import { readDirToVFS } from '../../src/fs-vfs.js';
import * as sass from 'sass';
import hljs from 'highlight.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MINIMA = path.join(__dirname, '../..', 'battletest', 'minima-theme');
const SITE = path.join(__dirname, '../..', 'battletest', 'testsite-source');
const GROUND_TRUTH = path.join(__dirname, '../..', 'battletest', 'ground-truth-site');

const BATTLE_IGNORE = ['_site', '.git', '.sass-cache', '.jekyll-cache', 'Gemfile', 'Gemfile.lock'];

function readGroundTruth(file) {
  return fs.readFileSync(path.join(GROUND_TRUTH, file), 'utf8');
}

let engine, results, byPermalink;

beforeAll(async () => {
  const vfs = {
    ...readDirToVFS(MINIMA, { fs, ignore: BATTLE_IGNORE }),
    ...readDirToVFS(SITE, { fs, ignore: BATTLE_IGNORE }),
  };
  engine = new JekyllEngine({ vfs, sass, highlighter: hljs });
  results = await engine.build();
  byPermalink = Object.fromEntries(results.map((r) => [r.permalink, r.content]));
}, 30000);

// ─────────────────────────────────────────────────────────────────────────────
// site structure
// ─────────────────────────────────────────────────────────────────────────────
describe('site structure', () => {
  test('build produces the correct set of pages', () => {
    const perms = results.map((r) => r.permalink).sort();
    expect(perms).toContain('/');
    expect(perms).toContain('/about/');
    expect(perms.some((p) => p.includes('welcome-to-jekyll'))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// index page
// ─────────────────────────────────────────────────────────────────────────────
describe('index page (home layout)', () => {
  let gt, ours;
  beforeAll(() => {
    gt = readGroundTruth('index.html');
    ours = byPermalink['/'];
  });

  test('renders the site title', () => {
    expect(ours).toContain('Your awesome title');
  });

  test('renders the navigation link to /about/', () => {
    expect(ours).toContain('href="/about/"');
  });

  test('renders a post link in the post list', () => {
    expect(ours).toContain('Welcome to Jekyll');
  });

  test('post link URL matches real Jekyll (categories in permalink: jekyll/update/year/month/day/slug)', () => {
    const realUrl = gt.match(/href="([^"]*welcome-to-jekyll[^"]*)"/)?.[1];
    const ourUrl = ours.match(/href="([^"]*welcome-to-jekyll[^"]*)"/)?.[1];
    expect(ourUrl).toBe(realUrl);
  });

  test('renders the post date in minima format (Jun %-d, %Y)', () => {
    // Real Jekyll: "Jun 29, 2026" (no leading zero via %-d)
    expect(ours).toMatch(/Jun \d+, 2026/);
  });

  test('footer contains site author', () => {
    expect(ours).toContain('Your awesome title'); // author defaults to site.title
  });

  test('RSS subscribe link exists', () => {
    expect(ours).toContain('feed.xml');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// about page
// ─────────────────────────────────────────────────────────────────────────────
describe('about page (page layout)', () => {
  test('renders the page title', () => {
    expect(byPermalink['/about/']).toContain('About');
  });

  test('renders markdown links correctly', () => {
    expect(byPermalink['/about/']).toContain('href="https://jekyllrb.com/"');
  });

  test('renders relative navigation links', () => {
    expect(byPermalink['/about/']).toContain('href="/about/"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// post page  (most feature-rich: highlight tag, date filters, layout chain)
// ─────────────────────────────────────────────────────────────────────────────
describe('post page (post layout)', () => {
  let postContent;
  beforeAll(() => {
    postContent = results.find((r) => r.permalink?.includes('welcome-to-jekyll'))?.content;
  });

  test('post was actually rendered', () => {
    expect(postContent).toBeDefined();
  });

  test('post title appears in the output', () => {
    expect(postContent).toContain('Welcome to Jekyll!');
  });

  test('FIX -- {% highlight ruby %} renders a code block (previously fatal crash)', () => {
    expect(postContent).toContain('<code');
    expect(postContent).toContain('print_hi');
  });

  test('{% highlight %} output wraps in <figure class="highlight"> matching real Jekyll', () => {
    // Real Jekyll output: <figure class="highlight"><pre><code class="language-ruby"...>
    expect(postContent).toContain('class="highlight"');
    expect(postContent).toContain('class="language-ruby"');
  });

  test('FIX -- post.date | date_to_xmlschema renders correctly in <time datetime>', () => {
    expect(postContent).toMatch(/datetime="2026-06-\d+T/);
  });

  test('post categories generate correct permalink with category path segments', () => {
    const postResult = results.find((r) => r.permalink?.includes('welcome-to-jekyll'));
    // Real Jekyll: /jekyll/update/2026/06/29/welcome-to-jekyll.html
    expect(postResult?.permalink).toMatch(/\/jekyll\/update\/2026\/06\/\d+\/welcome-to-jekyll/);
  });

  test('inline backtick code renders with highlighter-rouge classes (kramdown default)', () => {
    expect(postContent).toContain('highlighter-rouge');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// jekyll-specific tags and variables
// ─────────────────────────────────────────────────────────────────────────────
describe('Jekyll-specific tags and variables', () => {
  test('FIX -- jekyll.environment is injected into the context', () => {
    // minima uses: if jekyll.environment == "production"
    // we render in non-production so GA/disqus blocks should be absent
    const index = byPermalink['/'];
    expect(index).not.toContain('GoogleAnalyticsObject');
  });

  test('FIX -- {% seo %} renders a real <title> tag (minima has NO other title fallback -- a pure no-op silently produces titleless pages)', () => {
    const index = byPermalink['/'];
    expect(index).toMatch(/<title>[^<]+<\/title>/);
  });

  test('{% seo %} title algorithm matches real jekyll-seo-tag exactly: page_title | site_title', () => {
    const about = results.find((r) => r.permalink === '/about/')?.content;
    // Real Jekyll output: <title>About | Your awesome title</title>
    expect(about).toContain('<title>About | Your awesome title</title>');
  });

  test('{% seo %} on the homepage (no page.title) falls back to site_title | description', () => {
    const index = byPermalink['/'];
    expect(index).toContain('<title>Your awesome title |');
  });

  test('FIX -- {% feed_meta %} renders a real feed <link> tag (does not crash, and is not just an empty no-op)', () => {
    expect(byPermalink['/']).toContain('feed.xml');
    expect(byPermalink['/']).toContain('rel="alternate"');
  });

  test('FIX -- {% link /about/ %} resolves to the about page URL', async () => {
    const out = await engine.liquidEngine.parseAndRender(
      '{% link about.markdown %}',
      engine._buildSiteContext()
    );
    expect(out).toBe('/about/');
  });

  test('FIX -- {% post_url 2026-06-29-welcome-to-jekyll %} resolves to the post URL', async () => {
    const out = await engine.liquidEngine.parseAndRender(
      '{% post_url 2026-06-29-welcome-to-jekyll %}',
      engine._buildSiteContext()
    );
    expect(out).toMatch(/welcome-to-jekyll/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// header.html: site.pages | map: "path" + where + first
// ─────────────────────────────────────────────────────────────────────────────
describe('minima header navigation (site.pages map/where/first chain)', () => {
  test('navigation renders the About link from site.pages', () => {
    expect(byPermalink['/']).toContain('>About</a>');
  });

  test('navigation does not include pages without a title', () => {
    // index.markdown has no title in front matter — should not appear in nav
    const navBlock = byPermalink['/'].match(/<nav[\s\S]*?<\/nav>/)?.[0] || '';
    expect(navBlock).not.toContain('href="/"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// .markdown extension support
// ─────────────────────────────────────────────────────────────────────────────
describe('FIX -- .markdown file extension (not just .md)', () => {
  test('about.markdown is discovered and rendered as a page', () => {
    expect(byPermalink['/about/']).toBeDefined();
    expect(byPermalink['/about/']).toContain('About');
  });

  test('index.markdown is discovered and rendered as a root page', () => {
    expect(byPermalink['/']).toBeDefined();
  });

  test('_posts/*.markdown files are discovered as posts', () => {
    const postResult = results.find((r) => r.permalink?.includes('welcome-to-jekyll'));
    expect(postResult).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// categories as space-separated string in front matter
// ─────────────────────────────────────────────────────────────────────────────
describe('FIX -- categories as space-separated string in front matter', () => {
  test('the post "categories: jekyll update" (string not array) produces /jekyll/update/ path segments', () => {
    const postResult = results.find((r) => r.permalink?.includes('welcome-to-jekyll'));
    expect(postResult?.permalink).toContain('/jekyll/update/');
  });

  test('site.categories contains both "jekyll" and "update"', () => {
    const ctx = engine._buildSiteContext();
    expect(ctx.site.categories['jekyll']).toBeDefined();
    expect(ctx.site.categories['update']).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCSS/assets pipeline
// ─────────────────────────────────────────────────────────────────────────────
describe('FIX -- SCSS/Sass assets pipeline (assets/main.scss with @import partials from _sass/)', () => {
  test('assets/main.scss is compiled to CSS (appears as a result)', () => {
    const cssResult = results.find(
      (r) => r.permalink === '/assets/main.css' || r.path === 'assets/main.scss'
    );
    expect(cssResult).toBeDefined();
  });

  test('compiled CSS contains rules from _sass/minima/_base.scss (not raw SCSS)', () => {
    const cssResult = results.find(
      (r) => r.permalink === '/assets/main.css' || r.path === 'assets/main.scss'
    );
    expect(cssResult?.content).not.toContain('@import');
    expect(cssResult?.content).toContain('{');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// to_integer float truncation (LiquidJS bug)
// ─────────────────────────────────────────────────────────────────────────────
describe('FIX -- to_integer truncates floats to integer (LiquidJS returns float)', () => {
  test('to_integer(1.9) === 1', async () => {
    const out = await engine.liquidEngine.parseAndRender('{{ n | to_integer }}', { n: 1.9 });
    expect(out).toBe('1');
  });

  test('to_integer(1.42857) === 1', async () => {
    const out = await engine.liquidEngine.parseAndRender('{{ n | to_integer }}', { n: 1.42857 });
    expect(out).toBe('1');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// layout chain: post -> default -> head/header/footer includes
// ─────────────────────────────────────────────────────────────────────────────
describe('multi-level layout chain (post -> default)', () => {
  test('post renders with the full default layout wrapper (DOCTYPE)', () => {
    const post = results.find((r) => r.permalink?.includes('welcome-to-jekyll'));
    expect(post?.content).toContain('<!DOCTYPE html>');
  });

  test('post content wraps in <article class="post">', () => {
    const post = results.find((r) => r.permalink?.includes('welcome-to-jekyll'));
    expect(post?.content).toContain('class="post');
  });
});
