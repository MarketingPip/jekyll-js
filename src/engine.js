// -------------------------------------------------------------
// Jekyll-compatible static site engine (LiquidJS + Jekyll options)
//
// This is a fixed version of the reviewed engine. Every change is marked
// with a `// FIX:` comment referencing the issue it addresses, so it's
// easy to diff against the original. See FIXES.md for the full writeup.
//
// Import note: the original used esm.sh CDN URLs (browser-only). These
// are swapped for plain npm package imports so the engine is testable in
// Node with Jest. If you need the browser/esm.sh version back, only
// these four import lines change -- nothing else in the file depends on
// how the packages were loaded.
// -------------------------------------------------------------
import { Liquid } from 'liquidjs';
import { Marked, Renderer } from 'marked';
import * as yaml from 'js-yaml';
import fm from 'front-matter';
import { registerJekyllExtensions } from './jekyllTags.js';
import { preprocessConditionals } from './liquidPreprocess.js';
import { isSassAsset, compileSassAsset } from './assetsPipeline.js';
import { isFeedEnabled, generateFeeds } from './jekyllFeed.js';
import { isSitemapEnabled, generateSitemap } from './jekyllSitemap.js';
import { redirectFromPlugin } from './jekyllRedirectFrom.js';

// Check if jekyll-redirect-from is enabled via plugins config
function isRedirectFromEnabled(config) {
  const plugins = config?.plugins || config?.gems || [];
  const list = Array.isArray(plugins) ? plugins : [plugins];
  return list.some((p) => p === 'jekyll-redirect-from' || p === 'jekyll_redirect_from');
}

const noop = () => {};

// Jekyll 4.3.2 defaults (lib/jekyll/configuration.rb). User `exclude:`/`include:`
// in _config.yml are MERGED with these, not replacements.
const DEFAULT_EXCLUDES = [
  '.sass-cache/', '.jekyll-cache/', 'gemfiles/',
  'Gemfile', 'Gemfile.lock', 'node_modules/',
  'vendor/bundle/', 'vendor/cache/', 'vendor/gems/', 'vendor/ruby/',
];
const DEFAULT_INCLUDES = ['.htaccess'];

/** Deep-merge two plain objects (override wins); mirrors Jekyll's Utils.deep_merge_hashes. */
function deepMerge(base, override) {
  const out = { ...(base || {}) };
  for (const [k, v] of Object.entries(override || {})) {
    const bv = out[k];
    if (
      v && typeof v === 'object' && !Array.isArray(v) &&
      bv && typeof bv === 'object' && !Array.isArray(bv)
    ) {
      out[k] = deepMerge(bv, v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

// -------------------------------------------------------------
// Internal slug helper, used for permalink generation.
//
// FIX (parity with Jekyll::Utils.slugify's default mode): the original
// used `\w` (ASCII word chars, which KEEPS underscores) and had no
// Unicode awareness. Jekyll's default mode keeps any Unicode letter,
// mark, or decimal digit and hyphenates everything else (including
// underscores). "My_Title" must become "my-title", not "my_title".
// -------------------------------------------------------------
function slugify(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^\p{M}\p{L}\p{Nd}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

// Jekyll parity (Utils.titleize_slug): "my-example-post" -> "My Example Post".
// Used as the fallback title when front matter has no `title:`.
function titleizeSlug(slug) {
  return String(slug)
    .split(/[-_\s]+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

// -------------------------------------------------------------
// URL helpers for the relative_url / absolute_url filters.
//
// FIX: neither filter exists in LiquidJS's built-ins, and the original
// `relative_url` override was a naive `baseurl + url` concatenation with
// no leading-slash normalization, no baseurl trailing-slash handling,
// and (most importantly) no passthrough for already-absolute URLs --
// it would mangle `http://...` input. There was no `absolute_url` filter
// at all. These mirror the oracle-verified algorithm from Jekyll's own
// `url_filters.rb` (see jekyll-filters-js earlier in this thread).
// -------------------------------------------------------------
const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
function isAbsoluteUrl(str) {
  return SCHEME_RE.test(str);
}
function ensureLeadingSlash(str) {
  if (str === null || str === undefined || str === '') return str === undefined ? '' : str;
  return str.startsWith('/') ? str : `/${str}`;
}
function sanitizedBaseurl(baseurl) {
  if (baseurl === null || baseurl === undefined) return '';
  return String(baseurl).replace(/\/$/, '');
}
function computeRelativeUrl(input, config) {
  if (input === null || input === undefined) return input;
  const str = String(input);
  if (isAbsoluteUrl(str)) return input;
  return ensureLeadingSlash(sanitizedBaseurl(config.baseurl)) + ensureLeadingSlash(str);
}
function computeAbsoluteUrl(input, config) {
  if (input === null || input === undefined) return input;
  const str = String(input);
  if (isAbsoluteUrl(str)) return input;
  const siteUrl = config.url;
  if (siteUrl === null || siteUrl === undefined || siteUrl === '') {
    return computeRelativeUrl(input, config);
  }
  const combined = String(siteUrl) + computeRelativeUrl(input, config);
  try {
    return new URL(combined).href;
  } catch (e) {
    return combined;
  }
}
// FIX: strip_index filter didn't exist either; trivial but part of the
// "7 Jekyll filters LiquidJS doesn't have" gap identified earlier.
function stripIndex(input) {
  if (input === null || input === undefined || String(input) === '') return input ?? null;
  return String(input).replace(/\/index\.html?$/, '/');
}

// FIX (Bug 2 -- permalink edge cases): mirrors Jekyll's Page#destination /
// Document#destination (lib/jekyll/page.rb): a URL ending in "/" is
// written to `index.html` inside that directory
// (`File.join(path, "index")` + output_ext). The URL itself is unchanged --
// only the output file path expands, e.g. `/about/` -> `about/index.html`
// while the page URL stays `/about/`.
function permalinkToOutputPath(permalink) {
  const rel = String(permalink).replace(/^\/+/, '');
  return rel === '' || rel.endsWith('/') ? `${rel}index.html` : rel;
}

// FIX (Bug 3 -- page permalink placeholders emitted verbatim): Jekyll's
// Page#url (lib/jekyll/page.rb) passes a front-matter `permalink:`
// through the URL class with the page's url_placeholders -- :path (the
// page's dir, e.g. `/docs`), :basename and :output_ext are substituted;
// any other token is left as-is (URL#generate_url_from_hash only
// replaces the known placeholder keys).
function substitutePagePermalinkPlaceholders(permalink, vfsPath) {
  const ext = vfsPath.match(/\.[^/.]+$/)?.[0] || '.html';
  const outputExt = ['.md', '.markdown'].includes(ext) ? '.html' : ext;
  const lastSlash = vfsPath.lastIndexOf('/');
  const dir = lastSlash === -1 ? '/' : `/${vfsPath.slice(0, lastSlash)}`;
  const basename = (lastSlash === -1 ? vfsPath : vfsPath.slice(lastSlash + 1)).replace(/\.[^/.]+$/, '');
  return String(permalink)
    .replace(/:path/g, dir)
    .replace(/:basename/g, basename)
    .replace(/:output_ext/g, outputExt);
}

// High fidelity browser-native Markdown Parser using "marked"
// (Approximate parity with kramdown -- see PARITY notes in FIXES.md)
//
// FIX: kramdown (Jekyll's default Markdown converter) wraps inline
// backtick code in `<code class="language-plaintext highlighter-rouge">`
// by default. `marked`'s default codespan renderer just produces a bare
// `<code>`. Verified against real Jekyll's actual built output. Fenced
// code blocks (```lang) are also given the same `language-{lang}
// highlighter-rouge` + `<figure class="highlight">` wrapper kramdown/Rouge
// use, mirroring the {% highlight %} tag's own output shape for visual
// consistency (see jekyllTags.js).
// FIX (global marked mutation): the custom renderer used to be installed
// with marked.setOptions(), mutating the shared global instance -- any
// other code in the host process using `marked` would silently inherit
// Jekyll's renderer. The engine now owns a scoped Marked instance and the
// global is left untouched.
const markedRenderer = new Renderer();
markedRenderer.codespan = (token) => {
  const text = typeof token === 'object' ? token.text : token;
  // FIX (codespan HTML escaping): kramdown escapes HTML inside inline code.
  // The old renderer emitted it raw, so `<b>` inside backticks rendered as
  // a real element -- an XSS vector when rendering untrusted Markdown.
  return `<code class="language-plaintext highlighter-rouge">${escapeHtmlForMarkdown(text)}</code>`;
};
markedRenderer.code = (token) => {
  const { text, lang } = typeof token === 'object' ? token : { text: token, lang: undefined };
  const langClass = lang ? `language-${lang}` : 'language-plaintext';
  return `<figure class="highlight"><pre><code class="${langClass} highlighter-rouge">${escapeHtmlForMarkdown(
    text
  )}</code></pre></figure>`;
};
// FIX (header IDs): kramdown adds id="..." to headers (e.g. <h1 id="hello-world">).
// Marked.js doesn't by default. This matches kramdown's slug generation.
markedRenderer.heading = (token) => {
  const { text, depth } = typeof token === 'object' ? token : { text: token, depth: 1 };
  // Strip HTML tags, lowercase, replace non-alphanum with hyphens
  const id = text
    .replace(/<[^>]*>/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `<h${depth} id="${id}">${text}</h${depth}>\n`;
};
const mdParser = new Marked({ renderer: markedRenderer });

function escapeHtmlForMarkdown(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function parseMarkdown(md) {
  return mdParser.parse(String(md));
}

// FIX (oracle-found): real Jekyll interprets post dates as local midnight,
// not UTC. `new Date("2026-01-02")` parses as UTC; we need local time.
// This helper parses YYYY-MM-DD (and YYYY-MM-DD HH:MM:SS) as local.
function parseLocalDate(dateStr) {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return dateStr;
  const s = String(dateStr).trim();
  // Match YYYY-MM-DD or YYYY-MM-DD HH:MM:SS
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (m) {
    const [, y, mo, d, h = '0', mi = '0', sec = '0'] = m;
    return new Date(
      parseInt(y, 10),
      parseInt(mo, 10) - 1,
      parseInt(d, 10),
      parseInt(h, 10),
      parseInt(mi, 10),
      parseInt(sec, 10)
    );
  }
  // Fallback: let Date parse it
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// FIX (YAML merge keys): js-yaml 5.x dropped the `!!merge` tag from its
// default schema, so `<<: *anchor` stopped resolving (the merge key was
// left as a literal `"<<"` property). Ruby's Psych resolves merge keys,
// so re-enable them for data loads (js-yaml README documents exactly
// this: CORE_SCHEMA.withTags(mergeTag)).
const YAML_MERGE_SCHEMA = yaml.CORE_SCHEMA.withTags(yaml.mergeTag);

// Set a parsed data value at a nested key path, creating intermediate
// objects (Jekyll nests _data subdirectories: _data/a/b.yml becomes
// site.data.a.b).
function setNestedDataKey(obj, keys, value) {
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof cur[keys[i]] !== 'object' || cur[keys[i]] === null) {
      cur[keys[i]] = {};
    }
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}

// Resolves and normalizes categories following Jekyll standards
function getPostCategories(frontMatter, filepath) {
  const categories = [];

  const parts = filepath.split('/');
  const postsIndex = parts.indexOf('_posts');
  if (postsIndex > 0) {
    categories.push(...parts.slice(0, postsIndex));
  }

  if (frontMatter.category) {
    categories.push(frontMatter.category);
  }

  if (frontMatter.categories) {
    if (Array.isArray(frontMatter.categories)) {
      categories.push(...frontMatter.categories);
    } else if (typeof frontMatter.categories === 'string') {
      categories.push(...frontMatter.categories.trim().split(/\s+/));
    }
  }

  return [...new Set(categories.map((c) => String(c).trim()).filter(Boolean))];
}

// Resolves and normalizes tags following Jekyll standards
function getPostTags(frontMatter) {
  const tags = [];

  if (frontMatter.tag) {
    tags.push(frontMatter.tag);
  }

  if (frontMatter.tags) {
    if (Array.isArray(frontMatter.tags)) {
      tags.push(...frontMatter.tags);
    } else if (typeof frontMatter.tags === 'string') {
      tags.push(...frontMatter.tags.trim().split(/\s+/));
    }
  }

  return [...new Set(tags.map((t) => String(t).trim()).filter(Boolean))];
}

function parsePostFilename(filename) {
  // FIX (.markdown extension): Jekyll accepts both .md and .markdown
  // FIX (abbreviated dates): Jekyll's DATE_FILENAME_MATCHER is
  // (\d{2,4}-\d{1,2}-\d{1,2}) — month/day can be 1-2 digits (e.g. 2017-2-5).
  const match = filename.match(/^(\d{2,4})-(\d{1,2})-(\d{1,2})-(.+)\.(md|markdown)$/);
  if (!match) return null;
  const [, year, month, day, slug] = match;
  // Zero-pad month/day for ISO date format
  const mm = month.padStart(2, '0');
  const dd = day.padStart(2, '0');
  return { date: `${year}-${mm}-${dd}`, slug: slug.replace(/-/g, ' ') };
}

function generatePermalink(frontMatter, slug, date, config = {}, relPath = '') {
  // Jekyll supports both `permalink:` and (deprecated) `permalink_style:`
  // in _config.yml. Front-matter `permalink_style:` also works per-document.
  //
  // FIX (front-matter permalink placeholders emitted verbatim): Jekyll's
  // URL class (lib/jekyll/url.rb #generated_permalink) runs the SAME
  // placeholder substitution over a front-matter `permalink:` as over a
  // template -- it is NOT returned verbatim. So the front-matter value is
  // used as the pattern directly (it is a literal URL template, never a
  // style-preset name like "pretty", which must NOT be preset-expanded).
  const fmPermalink = frontMatter.permalink;
  let pattern;
  if (fmPermalink) {
    pattern = String(fmPermalink);
  } else {
    pattern = frontMatter.permalink_style || config.permalink || config.permalink_style || 'date';
  }

  const presets = {
    date: '/:categories/:year/:month/:day/:title.html',
    pretty: '/:categories/:year/:month/:day/:title/',
    none: '/:categories/:title.html',
    ordinal: '/:categories/:year/:y_day/:title.html',
  };

  if (!fmPermalink && presets[pattern]) {
    pattern = presets[pattern];
  }

  // FIX (timezone-dependent permalinks): `new Date("2026-06-20")` is UTC
  // midnight, but getFullYear()/getMonth()/getDate() read in the HOST's
  // local timezone -- on any machine behind UTC the permalink came out a
  // day early ("/2026/06/19/" instead of "/2026/06/20/"). UTC getters
  // preserve the calendar date the author wrote, on every host, matching
  // the timezoneOffset: 0 date-filter rendering above.
  const parsedDate = isNaN(Date.parse(date)) ? new Date() : new Date(date);
  const year = parsedDate.getUTCFullYear();
  const month = String(parsedDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(parsedDate.getUTCDate()).padStart(2, '0');
  // Day of year for :y_day (ordinal permalink style). Jan 1 = 001.
  const startOfYear = Date.UTC(year, 0, 1);
  const yDay = String(Math.floor((parsedDate.getTime() - startOfYear) / 86400000) + 1).padStart(3, '0');
  // FIX (front-matter permalink placeholders): Jekyll's UrlDrop
  // (lib/jekyll/drops/url_drop.rb) exposes the full date-component set.
  // :i_month/:i_day are the unpadded variants (%-m / %-d), :short_year is
  // the 2-digit year (%y). UTC getters, same as :year/:month/:day above.
  const shortYear = String(year).padStart(4, '0').slice(-2);
  const iMonth = String(parsedDate.getUTCMonth() + 1);
  const iDay = String(parsedDate.getUTCDate());
  const hour = String(parsedDate.getUTCHours()).padStart(2, '0');
  const minute = String(parsedDate.getUTCMinutes()).padStart(2, '0');
  const second = String(parsedDate.getUTCSeconds()).padStart(2, '0');

  // FIX (#4 in review -- :title permalink placeholder precedence):
  // Jekyll's docs define `:title` as "the slugified title from the
  // document's FILENAME", not the front-matter `title:` field. A post
  // `2026-06-20-getting-started.md` with `title: "Getting Started with
  // the Compiler"` must permalink to `/blog/getting-started/`, not
  // `/blog/getting-started-with-the-compiler/`. `frontMatter.slug` (an
  // explicit override) still wins over everything.
  const title = frontMatter.slug || slug || frontMatter.title || '';
  const s = slugify(title);

  let categoriesStr = '';
  if (frontMatter.categories) {
    const cats = Array.isArray(frontMatter.categories)
      ? frontMatter.categories
      : String(frontMatter.categories).split(/\s+/);
    // FIX (:categories slugified in permalinks): Jekyll's UrlDrop#categories
    // (jekyll/drops/url_drop.rb) downcases each category name and joins
    // them RAW with "/", never slugifying -- real Jekyll emits
    // /post formats/..., not /post-formats/...
    categoriesStr = [
      ...new Set(cats.map((c) => String(c).toLowerCase()).filter(Boolean)),
    ].join('/');
  }

  // FIX (:path permalink placeholder): Jekyll's Document#cleaned_relative_path
  // is the path relative to the collection directory, without extension
  // (e.g. `_posts/2026-01-02-hello-world.md` -> `2026-01-02-hello-world`).
  // :name is the slugified basename (UrlDrop#name).
  const relStr = String(relPath || '');
  const cleanedPath = relStr ? relStr.replace(/^_[^/]+\//, '').replace(/\.[^/.]+$/, '') : '';
  const baseName = relStr
    ? relStr.slice(relStr.lastIndexOf('/') + 1).replace(/\.[^/.]+$/, '')
    : '';

  let path = pattern
    .replace(/:categories/g, categoriesStr)
    .replace(/:year/g, year)
    .replace(/:short_year/g, shortYear)
    .replace(/:month/g, month)
    .replace(/:i_month/g, iMonth)
    .replace(/:day/g, day)
    .replace(/:i_day/g, iDay)
    .replace(/:y_day/g, yDay)
    .replace(/:hour/g, hour)
    .replace(/:minute/g, minute)
    .replace(/:second/g, second)
    .replace(/:title/g, s)
    // FIX (Bug 3 -- :slug precedence): Jekyll's UrlDrop#slug is
    // slugified front-matter `slug:` else the basename.
    .replace(/:slug/g, slugify(frontMatter.slug || slug || ''))
    .replace(/:name/g, slugify(baseName || slug || ''))
    .replace(/:path/g, cleanedPath)
    .replace(/:output_ext/g, '.html');

  path = path.replace(/\/+/g, '/');
  if (!path.startsWith('/')) {
    path = '/' + path;
  }

  return path;
}

// FIX (generic collections were entirely unimplemented -- only the
// special `posts` collection ever worked): normalizes _config.yml's
// `collections:` key, which Jekyll allows as either a bare list of names
// or a hash mapping name -> options (e.g. { permalink, output }).
function normalizeCollectionsConfig(collections) {
  if (!collections) return {};
  if (Array.isArray(collections)) {
    return Object.fromEntries(collections.map((name) => [name, {}]));
  }
  if (typeof collections === 'object') {
    return Object.fromEntries(Object.entries(collections).map(([name, opts]) => [name, opts || {}]));
  }
  return {};
}

// Default Jekyll collection permalink is `/:collection/:path/` (no date
// components, unlike posts). `:path` preserves any subdirectory
// structure within the collection (e.g. `_projects/web/widget.md` ->
// `web/widget`), each segment slugified.
function generateCollectionPermalink(frontMatter, collectionName, relPath, collectionConfig = {}, date = null) {
  // FIX (front-matter permalink placeholders emitted verbatim): same as
  // posts -- Jekyll's URL class (lib/jekyll/url.rb #generated_permalink)
  // substitutes the document's placeholders into a front-matter
  // `permalink:`, using the collection doc's UrlDrop
  // (lib/jekyll/drops/url_drop.rb). Never returned verbatim.
  const fmPermalink = frontMatter.permalink;
  const pattern =
    (fmPermalink && String(fmPermalink)) ||
    frontMatter.permalink_style ||
    collectionConfig.permalink ||
    '/:collection/:path/';

  const lastSlash = relPath.lastIndexOf('/');
  const dir = lastSlash === -1 ? '' : relPath.slice(0, lastSlash);
  const base = (lastSlash === -1 ? relPath : relPath.slice(lastSlash + 1)).replace(/\.[^/.]+$/, '');
  const pathSlug = [dir, slugify(base)].filter(Boolean).join('/');

  // Date placeholders (UrlDrop#year etc.). Jekyll's Document#date falls
  // back to site.time; here the caller passes the resolved doc date and
  // we fall back to now, with UTC getters like generatePermalink.
  const parsedDate = date ? new Date(date) : new Date();
  const validDate = isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
  const year = validDate.getUTCFullYear();
  const month = String(validDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(validDate.getUTCDate()).padStart(2, '0');

  let categoriesStr = '';
  if (frontMatter.categories) {
    const cats = Array.isArray(frontMatter.categories)
      ? frontMatter.categories
      : String(frontMatter.categories).split(/\s+/);
    categoriesStr = [...new Set(cats.map((c) => String(c).toLowerCase()).filter(Boolean))].join('/');
  }

  const srcExt = relPath.match(/\.[^/.]+$/)?.[0] || '';
  const outputExt = ['.md', '.markdown'].includes(srcExt) ? '.html' : srcExt || '.html';

  let path = pattern
    .replace(/:collection/g, collectionName)
    .replace(/:categories/g, categoriesStr)
    .replace(/:path/g, pathSlug)
    .replace(/:name/g, slugify(base))
    .replace(/:slug/g, slugify(frontMatter.slug || base))
    // FIX (:title used the filename, not the slug): real Jekyll's
    // UrlDrop#title is slugified front-matter `slug:` else the basename.
    .replace(/:title/g, slugify(frontMatter.slug || base))
    .replace(/:year/g, year)
    .replace(/:short_year/g, String(year).padStart(4, '0').slice(-2))
    .replace(/:month/g, month)
    .replace(/:i_month/g, String(validDate.getUTCMonth() + 1))
    .replace(/:day/g, day)
    .replace(/:i_day/g, String(validDate.getUTCDate()))
    .replace(/:hour/g, String(validDate.getUTCHours()).padStart(2, '0'))
    .replace(/:minute/g, String(validDate.getUTCMinutes()).padStart(2, '0'))
    .replace(/:second/g, String(validDate.getUTCSeconds()).padStart(2, '0'))
    .replace(/:output_ext/g, outputExt);

  path = path.replace(/\/+/g, '/');
  if (!path.startsWith('/')) path = '/' + path;
  return path;
}

// FIX (site.related_posts was entirely unimplemented): mirrors
// Jekyll::RelatedPosts#most_recent_posts exactly --
//   (site.posts.docs.last(11).reverse! - [post]).first(10)
// Since our `allPosts` (site.posts) is already newest-first (unlike
// Jekyll's internal `Collection#docs`, which is oldest-first), taking
// the first 11 here is equivalent to Jekyll's "last 11, then reverse".
// NOTE: this really is just "the most recent other posts", not anything
// content-based -- that's genuinely how real Jekyll's default behaves
// (LSI/content-similarity only kicks in if the `classifier-reborn` gem
// is installed and `lsi: true` is configured, which has no JS
// equivalent and is out of scope here).
function defaultRelatedPosts(post, allPosts) {
  return allPosts.slice(0, 11).filter((p) => p.path !== post.path).slice(0, 10);
}

// FIX (excerpt_separator was hardcoded to "\n\n" with no way to
// configure it): mirrors Jekyll's Excerpt#extract_excerpt, which is
// Ruby's `String#partition` -- take everything before the FIRST
// occurrence of the separator, or the entire content if the separator
// never appears at all.
//
// Not replicated (documented limitation, see FIXES.md): Jekyll's
// "sanctify_liquid_tags" (auto-closing a Liquid block tag that got cut
// off mid-excerpt) and preserving trailing Markdown link-reference
// definitions after the cut point. Both are niche edge cases.
function extractExcerpt(content, separator) {
  if (!separator) return content;
  const idx = content.indexOf(separator);
  if (idx === -1) return content;
  return content.slice(0, idx);
}

// FIX (pagination was entirely unimplemented): mirrors the classic
// jekyll-paginate gem's `Pager` class field-for-field (page, per_page,
// posts, total_posts, total_pages, previous_page(_path), next_page(_path)).
// Default `paginate_path` ("/page:num") matches Jekyll's own
// Configuration::DEFAULTS exactly.
//
// Adaptation (documented limitation): real jekyll-paginate requires the
// template page to be literally named `index.html` and matches it to
// `paginate_path` by walking the directory hierarchy on disk. Since this
// engine's pages are VFS-based `.md` files with computed permalinks
// (not real on-disk index.html files), the template page is simply
// "the root page whose resolved permalink is '/'" -- page 1 keeps that
// page's own URL; pages 2+ always go to `paginate_path` with `:num`
// substituted, independent of where page 1 lives (this part exactly
// matches real Jekyll: `Pager.paginate_path` for page > 1 never
// considers the template page's own location either).
function buildPaginators(allPosts, perPage, paginatePathPattern, templateUrl) {
  const totalPages = Math.ceil(allPosts.length / perPage);

  const pagePath = (num) => {
    if (num === null || num === undefined || num <= 1) return templateUrl;
    let p = paginatePathPattern.replace(':num', String(num));
    if (!p.startsWith('/')) p = '/' + p;
    return p;
  };

  const pagers = [];
  for (let page = 1; page <= totalPages; page++) {
    const init = (page - 1) * perPage;
    const posts = allPosts.slice(init, init + perPage);
    const previousPage = page !== 1 ? page - 1 : null;
    const nextPage = page !== totalPages ? page + 1 : null;
    pagers.push({
      page,
      per_page: perPage,
      posts,
      total_posts: allPosts.length,
      total_pages: totalPages,
      previous_page: previousPage,
      previous_page_path: previousPage !== null ? pagePath(previousPage) : null,
      next_page: nextPage,
      next_page_path: nextPage !== null ? pagePath(nextPage) : null,
      page_path: pagePath(page),
    });
  }
  return pagers;
}

export class JekyllEngine {
  /**
   * @param {Object} options
   * @param {Object} options.vfs - virtual filesystem: { "path": "content" }
   * @param {Function} [options.logger] - (msg, level) log sink
   * @param {Function} [options.stdout] - stdout sink
   * @param {Object} [options.sass] - optional Sass compiler (dart-sass).
   *   Required only when the site contains .scss/.sass files. In Node:
   *   `import * as sass from 'sass'`; in the browser: load
   *   `dist/sass-plugin.js` and pass `window.JekyllSass`.
   * @param {Object} [options.highlighter] - optional syntax highlighter
   *   (highlight.js). Required only when the site uses {% highlight %}.
   *   In Node: `import hljs from 'highlight.js'`; in the browser: load
   *   `dist/highlight-plugin.js` and pass `window.JekyllHighlight`.
   */
  constructor(options = {}) {
    this.options = {
      logger: options.logger || noop,
      stdout: options.stdout || null,
      cache: options.cache !== false,
      ...options,
    };

    // Plugin: markdown renderer (defaults to built-in marked adapter)
    // Accepts a MarkdownRenderer adapter: { name, render(src, opts) }
    this._markdown = options.markdown || null; // lazy-loaded below

    this._config = {};
    this._layouts = {};
    this._includes = {};
    this._data = {};
    this._collections = {};
    this._rootPages = [];
    // JS Plugin API state
    this._hooks = {};       // "owner:event" -> [fn]
    this._generators = [];  // [fn(site)]
    this._collectionsConfig = {};  // normalized collection config
    this._eventListeners = {};      // lifecycle events
    this._staticFiles = [];
    this._sassAssets = [];
    this.vfsTemplates = {};
    // A fresh scan invalidates the build-time rendered-content cache
    // (see _precomputeDocumentContent) -- entries are rebuilt below.
    this._contentPrecomputed = false;

    this.liquidEngine = new Liquid({
      root: '/',
      cache: this.options.cache,
      // FIX (#1 in review -- the most impactful bug): without this,
      // LiquidJS's `dynamicPartials` defaults to `true`, which parses
      // unquoted/`{{ }}`-interpolated include filenames as VARIABLE
      // lookups instead of literal Jekyll-style filenames. Every
      // `{% include foo.html %}` and `{% include {{ var }} %}` call in
      // the VFS templates was broken without this option.
      dynamicPartials: false,
      jekyllInclude: true,
      jekyllWhere: true,
      // FIX (timezone-dependent dates): LiquidJS's date filters
      // (date, date_to_string, date_to_xmlschema, date_to_rfc822,
      // date_to_long_string) format in the HOST's local timezone by
      // default. A date-only value like "2026-06-20" parses to UTC
      // midnight, so on any machine behind UTC (e.g. EDT) every date
      // rendered a day early -- permalinks, <time datetime>, and
      // "20 Jun 2026" strings all shifted. Real Jekyll treats date-only
      // values as timezone-naive (Ruby Date has no time component), and
      // the battle-test ground truth was built in UTC. Pinning
      // timezoneOffset to 0 makes every date filter render in UTC, so
      // the calendar date the author wrote is preserved on every host.
      // Deliberate, documented divergence: a datetime WITH an explicit
      // offset renders in UTC rather than Ruby's system-local time --
      // deterministic beats host-dependent.
      timezoneOffset: 0,
      relativeReference: false, // not needed for this flat VFS; avoids a console warning
      fs: {
        resolve: (root, file, ext) => {
          return file;
        },
        readFile: async (file) => {
          const cleanFile = this._resolveVfsPath(file);
          if (this.vfsTemplates[cleanFile] !== undefined) {
            // P0 (parenthesized {% if %}): LiquidJS parses partials fetched
            // through the FS, so preprocess here — this is the choke point
            // for every {% include %} in pages AND layouts.
            return preprocessConditionals(this.vfsTemplates[cleanFile]);
          }
          throw new Error(`Template not resolved: ${file}`);
        },
        readFileSync: (file) => {
          const cleanFile = this._resolveVfsPath(file);
          if (this.vfsTemplates[cleanFile] !== undefined) {
            return preprocessConditionals(this.vfsTemplates[cleanFile]);
          }
          throw new Error(`Template not resolved: ${file}`);
        },
        exists: async (file) => {
          const cleanFile = this._resolveVfsPath(file);
          return this.vfsTemplates[cleanFile] !== undefined;
        },
        existsSync: (file) => {
          const cleanFile = this._resolveVfsPath(file);
          return this.vfsTemplates[cleanFile] !== undefined;
        },
      },
    });

    this._setupDefaultFilters();
    // FIX: register all Jekyll-specific tags (highlight, link, post_url,
    // seo/feed_meta stubs) and filter fixes (to_integer float truncation)
    // that LiquidJS either lacks or gets subtly wrong.
    registerJekyllExtensions(this.liquidEngine, {
      highlighter: options.highlighter,
      // P0 (parenthesized {% if %}): include_cached parses include content
      // itself, bypassing the FS choke point — hand it the preprocessor.
      preprocess: preprocessConditionals,
      getInclude: (filename) => {
        const cleanFile = this._resolveVfsPath(`_includes/${filename}`);
        // Also try without _includes/ prefix
        const altFile = this._resolveVfsPath(filename);
        return this.vfsTemplates[cleanFile] ?? this.vfsTemplates[altFile] ?? null;
      },
    });
    if (options.vfs) this.useVFS(options.vfs);
  }

  /**
   * Get the markdown renderer adapter.
   * Defaults to the built-in marked adapter if none provided.
   * @returns {Object} MarkdownRenderer adapter
   */
  _getMarkdownRenderer() {
    if (!this._markdown) {
      // Default: use the module-level parseMarkdown (marked-based)
      // Wrapped as an adapter for interface consistency
      this._markdown = {
        name: 'marked-builtin',
        render: (src, opts) => parseMarkdown(src),
      };
    }
    return this._markdown;
  }

  /**
   * Render markdown to HTML using the configured adapter.
   * @param {string} src - Markdown source
   * @returns {string} HTML output
   */
  _renderMarkdown(src) {
    const renderer = this._markdown || this._getMarkdownRenderer();
    const result = renderer.render(String(src), this._config?.kramdown || {});
    // Support async renderers: if Promise, throw helpful error
    // (use async build methods for async renderers)
    if (result && typeof result.then === 'function') {
      throw new Error(
        '[jekyll-js] Async markdown renderer detected. ' +
        'Use async build methods or provide a sync renderer.'
      );
    }
    return result;
  }

  _resolveVfsPath(file) {
    // FIX (include/layout precedence): Jekyll's {% include %} searches ONLY
    // _includes/, so _includes/ must win over _layouts/ here. The old order
    // let a layout file shadow an include of the same name.
    let cleaned = file.replace(/^\//, '');
    if (this.vfsTemplates[cleaned] !== undefined) {
      return cleaned;
    }

    const includePath = `_includes/${cleaned}`;
    if (this.vfsTemplates[includePath] !== undefined) {
      return includePath;
    }

    const layoutPath = `_layouts/${cleaned}`;
    if (this.vfsTemplates[layoutPath] !== undefined) {
      return layoutPath;
    }

    return cleaned;
  }

  // FIX (#3 in review -- filter overrides reducing parity):
  // The original registered hand-rolled `slugify`, `date_to_string`,
  // `date_to_xmlschema`, `truncate`, `upcase`, `downcase`, `strip_html`,
  // and `date`/`dates` filters that SHADOWED LiquidJS's own built-ins --
  // which are themselves already ported from (or spec-compatible with)
  // Jekyll/Liquid and more correct than the overrides were:
  //   - slugify: ignored Jekyll's mode arg, used ASCII \w (kept "_")
  //   - date_to_string: produced US "Jun 20, 2026" not Jekyll's UK
  //     "20 Jun 2026"
  //   - date_to_xmlschema: used toISOString() (UTC, ms, "Z") not
  //     Jekyll's local-offset, no-ms "+00:00" format
  //   - truncate: didn't count the ellipsis inside the length budget,
  //     per standard Liquid spec
  // All of those are deleted here -- LiquidJS's built-ins handle them.
  // Only filters LiquidJS genuinely lacks are registered below.
  _setupDefaultFilters() {
    const filters = {
      // FIX (#7 -- relative_url/absolute_url/strip_index missing or broken):
      relative_url: (input) => computeRelativeUrl(input, this._config),
      absolute_url: (input) => computeAbsoluteUrl(input, this._config),
      strip_index: (input) => stripIndex(input),
      // FIX (#6 -- no inline `markdownify` filter existed, only the
      // page-level .md -> HTML conversion step):
      markdownify: (input) => this._renderMarkdown(input),
      // FIX (oracle-found): LiquidJS's date_to_xmlschema outputs UTC
      // (+00:00) for Date objects accessed via property (e.g., post.date).
      // Real Jekyll outputs local offset (-05:00). Override to ensure
      // local timezone is preserved.
      date_to_xmlschema: (input) => {
        let d;
        if (input instanceof Date) {
          d = input;
        } else if (typeof input === 'string' || typeof input === 'number') {
          d = parseLocalDate(input) || new Date(input);
        } else {
          // Fall back to LiquidJS built-in for other types
          return this.liquidEngine.filters.date_to_xmlschema(input);
        }
        if (!d || isNaN(d.getTime())) return '';
        // Format as YYYY-MM-DDTHH:MM:SS±HH:MM (local timezone)
        const pad = (n) => String(n).padStart(2, '0');
        const year = d.getFullYear();
        const month = pad(d.getMonth() + 1);
        const day = pad(d.getDate());
        const hour = pad(d.getHours());
        const min = pad(d.getMinutes());
        const sec = pad(d.getSeconds());
        const offset = -d.getTimezoneOffset();
        const sign = offset >= 0 ? '+' : '-';
        const offHour = pad(Math.floor(Math.abs(offset) / 60));
        const offMin = pad(Math.abs(offset) % 60);
        return `${year}-${month}-${day}T${hour}:${min}:${sec}${sign}${offHour}:${offMin}`;
      },
    };

    for (const [name, fn] of Object.entries(filters)) {
      this.liquidEngine.registerFilter(name, fn);
    }
  }

  // ============================================================
  // JS Plugin API
  // Mirrors Jekyll's Ruby plugin surface (Hooks, Generators, Tags,
  // Filters) so agents/humans can write plugins in JS as naturally
  // as the Ruby originals.
  // ============================================================

  /**
   * Register a plugin function. Called with the engine instance.
   * @param {Function} pluginFn - (engine) => void
   */
  use(pluginFn) {
    pluginFn(this);
    return this;
  }

  /**
   * Register a hook (mirrors Jekyll::Hooks.register).
   * @param {string} owner - 'site', 'pages', 'posts', etc.
   * @param {string} event - 'post_read', 'post_init', 'pre_render', etc.
   * @param {Function} fn - hook function
   */
  registerHook(owner, event, fn) {
    const key = `${owner}:${event}`;
    (this._hooks[key] ||= []).push(fn);
    return this;
  }

  /**
   * Trigger hooks (mirrors Jekyll::Hooks.trigger).
   */
  triggerHook(owner, event, ...args) {
    const key = `${owner}:${event}`;
    for (const fn of this._hooks[key] || []) {
      fn(...args);
    }
  }

  /**
   * Register a Liquid tag (mirrors Jekyll's Liquid::Tag subclass).
   */
  registerTag(name, fn) {
    // LiquidJS custom tags: simple function-based tags
    const liquidEngine = this.liquidEngine;
    liquidEngine.registerTag(name, {
      parse(tagToken) {
        this.text = tagToken.args;
      },
      async render(ctx) {
        const text = await liquidEngine.evalValue(this.text, ctx);
        return fn(String(text ?? ''));
      },
    });
    return this;
  }

  /**
   * Register a Liquid filter.
   */
  registerFilter(name, fn) {
    this.liquidEngine.registerFilter(name, fn);
    return this;
  }

  /**
   * Register a generator (mirrors Jekyll::Generator).
   * @param {Function} fn - (site) => void
   */
  registerGenerator(fn) {
    this._generators.push(fn);
    return this;
  }

  /**
   * Create a new Page (mirrors Jekyll::Page subclass).
   * @param {Object} opts - { dir, name, layout, content }
   */
  createPage({ dir = '', name, layout = null, content = '' }) {
    const path = dir ? `${dir}/${name}` : name;
    const page = {
      path,
      dir,
      name,
      content,
      data: {},
    };
    if (layout) page.data.layout = layout;
    return page;
  }

  /**
   * Check if a file exists in the VFS (mirrors File.exist?).
   */
  fileExists(path) {
    return path in this.vfsTemplates;
  }

  /**
   * Logger (mirrors Jekyll.logger).
   */
  get logger() {
    const log = this.options.logger;
    return {
      warn: (msg) => log(msg, 'warn'),
      info: (msg) => log(msg, 'info'),
      error: (msg) => log(msg, 'error'),
    };
  }

  /**
   * Utilities (mirrors Jekyll::Utils).
   */
  get utils() {
    return { slugify };
  }

  // ============================================================
  // Fluent Builder API (programmatic site construction)
  // Chainable; for API-only or hybrid (VFS + overrides) usage.
  // Call after useVFS() if mixing — useVFS resets builder state.
  // ============================================================

  /**
   * Merge config (object or YAML string).
   */
  setConfig(config) {
    const parsed = typeof config === 'string' ? yaml.load(config) : config;
    this._config = { ...this._config, ...parsed };
    if (parsed.collections) {
      this._collectionsConfig = normalizeCollectionsConfig(this._config.collections);
    }
    return this;
  }

  /**
   * Add a layout. Name like 'default.html'.
   */
  addLayout(name, content) {
    this._layouts[name] = content;
    return this;
  }

  /**
   * Add an include. Name like 'header.html'.
   */
  addInclude(name, content) {
    this._includes[name] = content;
    return this;
  }

  /**
   * Add a data file. Data as object or YAML string.
   */
  addData(name, data) {
    this._data[name] = typeof data === 'string' ? yaml.load(data) : data;
    return this;
  }

  /**
   * Add a collection. Pages: [{ path, content }, ...].
   */
  addCollection(name, pages) {
    this._collections[name] ||= [];
    for (const p of pages) {
      const { attributes, body } = this._parseFrontMatter(p.path, p.content);
      this._collections[name].push({
        path: p.path,
        content: p.content,
        ...attributes,
        _body: body,
      });
    }
    return this;
  }

  /**
   * Add a root page.
   */
  addPage(path, content) {
    this._rootPages.push({ path, content });
    return this;
  }

  // ============================================================
  // Lifecycle Events (output transformation, observability)
  // Complements the Jekyll-style hooks: these fire around the
  // build/render pipeline itself.
  // ============================================================

  /**
   * Subscribe to a lifecycle event.
   * Events: 'pre:build', 'post:build', 'pre:render', 'post:render'.
   */
  on(event, cb) {
    (this._eventListeners ||= {})[event] ||= [];
    this._eventListeners[event].push(cb);
    return this;
  }

  async _emit(event, ...args) {
    for (const fn of (this._eventListeners || {})[event] || []) {
      await fn(...args);
    }
  }

  /**
   * One-shot render from a VFS object.
   * @param {Object} vfs - Jekyll-style virtual file system
   * @param {Object} [options] - engine options
   * @returns {Promise<Array>} rendered pages
   */
  static async render(vfs, options = {}) {
    return new JekyllEngine({ ...options, vfs }).build();
  }

  /**
   * Build the mutable `site` object passed to hooks and generators.
   * Mirrors Jekyll's SiteDrop with Ruby-like .data and .date accessors.
   */
  _buildPluginSite() {
    const collections = {};
    for (const [name, docs] of Object.entries(this._collections)) {
      collections[name] = {
        docs: docs.map((doc) => {
          const wrapped = { ...doc };
          wrapped.data = wrapped; // doc.data.categories === doc.categories
          wrapped.date = doc._date
            ? new Date(doc._date)
            : doc.date
              ? new Date(doc.date)
              : null;
          return wrapped;
        }),
      };
    }
    const site = {
      config: this._config,
      collections,
      pages: [...this._rootPages], // mutable; plugins push new pages here
      data: this._data,
      source: '/',
    };
    // Jekyll parity: site.posts is a shortcut for collections['posts'].docs
    Object.defineProperty(site, 'posts', {
      get() { return this.collections.posts?.docs || []; },
      enumerable: true,
    });
    return site;
  }

  useVFS(vfs) {
    this._config = {};
    this._layouts = {};
    this._includes = {};
    this._data = {};
    this._collections = {};
    this._rootPages = [];
    this._staticFiles = [];
    this._sassAssets = [];
    this.vfsTemplates = {};
    // A fresh scan invalidates the build-time rendered-content cache
    // (see _precomputeDocumentContent) -- entries are rebuilt below.
    this._contentPrecomputed = false;

    // FIX (generic collections support): parse _config.yml in a
    // dedicated pre-pass, regardless of where it falls in the VFS
    // object's key order. Without this, if a collection's files happened
    // to be listed (in insertion order) before _config.yml, we wouldn't
    // yet know that directory was a declared collection when we reached
    // it in the main loop below.
    for (const [path, content] of Object.entries(vfs)) {
      if (path === '_config.yml' || path === '_config.yaml') {
        try {
          this._config = yaml.load(content) || {};
        } catch (e) {
          // Jekyll parity (configuration.rb: read_config_file raises on
          // malformed YAML): a broken config is fatal, not warn-and-continue.
          throw new Error(`_config.yml: YAML parse error (${e.message})`);
        }
        break;
      }
    }
    this._collectionsConfig = normalizeCollectionsConfig(this._config.collections);

    // FIX (exclude/include config): Jekyll's `exclude:` (with defaults from
    // configuration.rb) skips files/dirs; `include:` forces inclusion,
    // overriding excludes. Merged (defaults + user), not replaced.
    const userExclude = this._config.exclude;
    const userInclude = this._config.include;
    const toList = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
    this._excludeList = [...DEFAULT_EXCLUDES, ...toList(userExclude)];
    this._includeList = [...DEFAULT_INCLUDES, ...toList(userInclude)];

    for (const [path, content] of Object.entries(vfs)) {
      // Infrastructure is never excluded (Jekyll reads these directly,
      // not via the filtered entry reader).
      const isInfrastructure =
        path === '_config.yml' || path === '_config.yaml' ||
        path.startsWith('_layouts/') || path.startsWith('_includes/') ||
        path.startsWith('_data/') || path.startsWith('_sass/');
      if (!isInfrastructure && this._isExcluded(path)) {
        continue;
      }

      this.vfsTemplates[path] = content;

      // FIX (drafts): real Jekyll only reads _drafts/ when `show_drafts`
      // is set; without it drafts are excluded from the build entirely --
      // not posts, not pages, not static files. (The post branch below
      // already skipped them as posts, but they fell through and were
      // ingested as nested pages.)
      const isDraft = path.includes('_drafts/');
      if (isDraft && !this._config.show_drafts) continue;

      if (path === '_config.yml' || path === '_config.yaml') {
        continue; // already parsed above
      }
      // FIX (theme layouts never injected): gem-style themes keep their files
      // under a subdirectory (e.g. `chirpy/_layouts/default.html`). Real
      // Jekyll (lib/jekyll/theme.rb + lib/jekyll/readers/layout_reader.rb)
      // merges the theme dir's layouts with the site's own `_layouts/`,
      // the site winning on name conflicts. The old `startsWith('_layouts/')`
      // check only matched the VFS root, so theme layouts were never
      // registered -- `_resolveLayout` returned undefined, `_applyLayouts`
      // broke out of its loop immediately, and every page rendered as a
      // bare fragment with no layout wrapping at all.
      const themeLayoutsIdx = path.indexOf('/_layouts/');
      if (path.startsWith('_layouts/') || themeLayoutsIdx !== -1) {
        const name =
          themeLayoutsIdx === -1
            ? path.slice('_layouts/'.length)
            : path.slice(themeLayoutsIdx + '/_layouts/'.length);
        // Site-root layouts win over theme-dir layouts (Jekyll parity),
        // regardless of VFS merge order.
        if (themeLayoutsIdx === -1 || this._layouts[name] === undefined) {
          this._layouts[name] = content;
        }
        continue;
      }
      if (path.startsWith('_includes/')) {
        this._includes[path.replace('_includes/', '')] = content;
        continue;
      }
      if (path.startsWith('_data/')) {
        try {
          // FIX (_data subdirs flattened): Jekyll nests subdirectories --
          // _data/subdir/file.yml is site.data.subdir.file, not a flat
          // "subdir/file" key (verified against the native Jekyll oracle).
          // FIX (YAML merge keys unresolved): parse with the merge tag
          // enabled so `<<: *anchor` resolves like Ruby's Psych.
          const rel = path.replace('_data/', '').replace(/\.[^/.]+$/, '');
          const parsed = yaml.load(content, { schema: YAML_MERGE_SCHEMA });
          setNestedDataKey(this._data, rel.split('/'), parsed);
        } catch (e) {
          // Jekyll parity (data_reader.rb: read_data_file has no rescue):
          // a broken _data file is fatal.
          throw new Error(`_data/${path.slice('_data/'.length)}: YAML parse error (${e.message})`);
        }
        continue;
      }

      // FIX (.markdown posts): Jekyll accepts both `.md` and `.markdown`
      // as post file extensions. The original `parsePostFilename` only
      // matched `.md`.
      // (Draft gating moved up: _drafts/ is skipped entirely without
      // `show_drafts`; reaching here means drafts are enabled.)
      if (path.includes('_posts/') || (isDraft && this._config.show_drafts)) {
        const dirTag = isDraft ? '_drafts/' : '_posts/';
        const filename = path.slice(path.indexOf(dirTag) + dirTag.length);
        const parsed = parsePostFilename(filename);
        try {
          const { attributes, body } = this._parseFrontMatter(path, content, isDraft ? 'drafts' : 'posts');

          // FIX (published:false / future posts): real Jekyll's
          // PostReader#read_publishable drops both at READ time
          // (Publisher#publish?), unless `unpublished` / `future: true`.
          if (attributes.published === false && !this._config.unpublished) continue;
          const postDate = attributes.date || parsed?.date;
          if (!this._config.future && postDate && new Date(postDate) > new Date()) {
            this.options.logger(`Skipping ${path}: future date`, 'info');
            continue;
          }

          const postCategories = getPostCategories(attributes, path);
          const postTags = getPostTags(attributes);

          attributes.categories = postCategories;
          attributes.tags = postTags;

          // FIX (excerpt_separator was hardcoded): front matter wins
          // over site config, which wins over Jekyll's own default of
          // "\n\n" -- mirrors Document#excerpt_separator exactly.
          const excerptSeparator =
            attributes.excerpt_separator || this._config.excerpt_separator || '\n\n';
          // FIX (front-matter date ignored in permalinks): real Jekyll lets
          // `date:` in front matter override the filename date everywhere,
          // including the :year/:month/:day placeholders. Passing only the
          // filename date made site.posts[].date (front-matter wins)
          // disagree with site.posts[].url (filename always won).
          const permalink = generatePermalink(
            attributes,
            parsed?.slug,
            attributes.date || parsed?.date,
            this._config,
            // FIX (Bug 3 -- :path placeholder): Jekyll's :path is the
            // collection-relative path without extension
            // (Document#cleaned_relative_path).
            path
          );
          this._collections.posts ||= [];
          this._collections.posts.push({
            path,
            content,
            ...attributes,
            // FIX (title fallback): Jekyll uses the titleized filename slug
            // when front matter has no `title:`. Minima's posts rely on this.
            title: attributes.title || titleizeSlug(parsed?.slug || ''),
            categories: postCategories,
            tags: postTags,
            _body: body,
            _permalink: permalink,
            _date: attributes.date || parsed?.date,
            _slug: parsed?.slug,
            _excerptSeparator: excerptSeparator,
            // FIX (page.excerpt empty on post pages): compute the excerpt
            // once at scan time so both site.posts entries AND the post's
            // own page context share it (a front-matter `excerpt:` still
            // wins -- see _buildSiteContext/_renderPage).
            _excerpt: this._renderMarkdown(extractExcerpt(body, excerptSeparator)),
          });
        } catch (e) {
          // YAML errors are handled by _parseFrontMatter (warn-and-keep);
          // this guards unexpected non-YAML failures during post assembly.
          this.options.logger(`Skipping ${path}: ${e.message}`, 'warn');
        }
        continue;
      }

      // FIX (generic collections, previously entirely unimplemented):
      // any directory declared under _config.yml's `collections:` key
      // (besides the implicit "posts" collection, handled above) is now
      // scanned the same way Jekyll itself does -- front matter parsed,
      // a default `/:collection/:path/` permalink computed (or a custom
      // one from `collections.<name>.permalink`), front matter `permalink:`
      // still taking precedence as usual.
      const collectionName = Object.keys(this._collectionsConfig).find((name) =>
        path.includes(`_${name}/`)
      );
      if (collectionName) {
        const prefix = `_${collectionName}/`;
        const relPath = path.slice(path.indexOf(prefix) + prefix.length);
        try {
          const { attributes, body } = this._parseFrontMatter(path, content, collectionName);
          // FIX (published:false): real Jekyll's Collection#read_document
          // keeps the doc only `if site.unpublished || doc.published?`.
          if (attributes.published === false && !this._config.unpublished) continue;
          // FIX (collection doc dates): real Jekyll's Document#date falls
          // back from front matter to the filename (DATE_FILENAME_MATCHER)
          // to site.time. parsePostFilename covers the dated-filename case.
          const fileBase = relPath.slice(relPath.lastIndexOf('/') + 1);
          const docDate = attributes.date || parsePostFilename(fileBase)?.date || new Date();
          const permalink = generateCollectionPermalink(
            attributes,
            collectionName,
            relPath,
            this._collectionsConfig[collectionName],
            // FIX (Bug 3 -- date placeholders in collection permalinks):
            // Jekyll's UrlDrop exposes :year/:month/:day/... for every
            // document, from the resolved doc date.
            docDate
          );
          this._collections[collectionName] ||= [];
          this._collections[collectionName].push({
            path,
            content,
            ...attributes,
            _body: body,
            _permalink: permalink,
            _relPath: relPath,
            _date: docDate,
          });
        } catch (e) {
          // As above: YAML is handled by _parseFrontMatter; this is the
          // safety net for unexpected failures during doc assembly.
          this.options.logger(`Skipping ${path}: ${e.message}`, 'warn');
        }
        continue;
      }

      // FIX (nested pages): Jekyll renders any .md/.markdown/.html/.liquid
      // file as a page, regardless of directory nesting. Previously only
      // top-level files were treated as pages.
      //
      // FIX (front matter required): Real Jekyll (reader.rb) only treats
      // files WITH a YAML front matter block as convertible documents.
      // A .md file without front matter (e.g., CHANGELOG.md, README.md)
      // is a static file, not a page. We check for the `---` marker.
      //
      // FIX (xml/json pages were never rendered): themes ship
      // convertible feeds and data files with front matter -- hyde's
      // atom.xml, beautiful-jekyll's feed.xml / searchcorpus.json,
      // chirpy's feed.xml / search.json / site.webmanifest. Real Jekyll
      // (document.rb, convertible.rb) treats any file with front matter
      // as convertible, so .xml/.json join the page set here. Files
      // without front matter still fall through to the static-file
      // branch below. Markdown conversion stays gated on .md/.markdown
      // in _renderPage, so these are Liquid-rendered only.
      if (/\.(md|markdown|html|liquid|xml|json)$/i.test(path)) {
        const hasFrontMatter = content.startsWith('---\n') || content.startsWith('---\r\n');
        if (hasFrontMatter) {
          this._rootPages.push({ path, content });
        } else {
          // Treat as static file (will be copied as-is)
          // Static files are handled in the "anything else" branch below,
          // so we fall through by not continuing here.
        }
        if (hasFrontMatter) continue;
      }

      // FIX (site.static_files was entirely unimplemented): anything
      // else -- images, CSS, JS, or any other asset dropped into the
      // VFS -- is tracked as a static file, exposing the same field set
      // real Jekyll's StaticFileDrop does: name, extname, basename,
      // path, modified_time.
      //
      // Adaptation (documented limitation): nested page-like files
      // (e.g. "docs/intro.md") are deliberately excluded from this --
      // they're a separate, pre-existing gap (nested pages aren't
      // discovered as pages at all yet) and miscategorizing them as
      // "static files" would be worse than leaving that gap visible.
      // There's also no real filesystem here, so `modified_time` is the
      // time the VFS was scanned, not a tracked per-file mtime.
      // FIX (SCSS assets pipeline): any file in assets/ with a .scss or
      // .sass extension and front matter is handled by the Sass compiler,
      // not treated as a static file. Track it for compilation in build().
      if (isSassAsset(path, content)) {
        this._sassAssets.push({ path, content });
        continue;
      }

      // FIX (robots.txt not emitted): real Jekyll's reader (reader.rb
      // read_directories) turns ANY file carrying a YAML front matter block
      // into a convertible Page, regardless of extension. Previously only
      // .md/.markdown/.html/.liquid were checked, so theme files like
      // chirpy's assets/robots.txt (front matter + `permalink: /robots.txt`)
      // fell through to _staticFiles -- and build() never emitted them.
      // .scss/.sass stay claimed by the Sass pipeline above. _sass/ is
      // never page-able either (Sass partials land, like real Jekyll) --
      // it keeps its pre-existing static-file classification.
      const hasFrontMatter = content.startsWith('---\n') || content.startsWith('---\r\n');
      const inSassDir = path === '_sass' || path.startsWith('_sass/') || path.includes('/_sass/');
      if (hasFrontMatter && !inSassDir) {
        this._rootPages.push({ path, content });
        continue;
      }

      if (!/\.(md|markdown|html|htm|liquid)$/i.test(path)) {
        // FIX (static-file emission, _sass parity): _sass/ is Jekyll
        // infrastructure (entry_filter.rb) -- never copied to the
        // destination. isSassAsset() already claimed the compilable
        // entry points above; anything reaching here (partials,
        // underscore-prefixed files) must not be tracked as a static
        // file at all, matching real Jekyll's site.static_files.
        if (path.startsWith('_sass/')) continue;
        const slashIdx = path.lastIndexOf('/');
        const name = slashIdx === -1 ? path : path.slice(slashIdx + 1);
        const extname = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
        const basename = extname ? name.slice(0, -extname.length) : name;
        this._staticFiles.push({
          name,
          extname,
          basename,
          path: `/${path}`,
          modified_time: new Date(),
        });
        continue;
      }
    }

    if (this._collections.posts) {
      this._collections.posts.sort((a, b) => new Date(b._date) - new Date(a._date));
    }

    // FIX (collection docs were unsorted): real Jekyll's Collection#read
    // ends with sort_docs! -> Document#<=> (date ascending, path
    // tie-break). Undated docs compare equal (Jekyll falls back to
    // site.time for all of them), so the path tie-break decides there.
    const now = Date.now();
    for (const [name, pages] of Object.entries(this._collections)) {
      if (name === 'posts') continue;
      const t = (p) => (p._date ? new Date(p._date).getTime() : now);
      pages.sort((a, b) => t(a) - t(b) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    }

    return this;
  }

  // ─── Programmatic VFS API ─────────────────────────────────────────────
  // Build a site with JS calls instead of a pre-built vfs object:
  //
  //   const engine = new JekyllEngine();
  //   engine.writeFile('_config.yml', 'title: My Site\n');
  //   engine.writeFile('_layouts/default.html', '<html><body>{{ content }}</body></html>');
  //   engine.writeFile('index.md', '---\nlayout: default\ntitle: Home\n---\n# Hi\n');
  //   const pages = await engine.build();
  //
  // Each mutation re-ingests the VFS (O(n)); for bulk loads prefer passing
  // the whole object to the constructor or useVFS() once.

  /** Add or overwrite a single file, then re-ingest the site. */
  writeFile(path, content) {
    this.useVFS({ ...this.vfsTemplates, [path]: content });
    return this;
  }

  /** Read a single file's content (undefined when absent). */
  readFile(path) {
    return this.vfsTemplates[path];
  }

  /** Remove a single file, then re-ingest the site. */
  removeFile(path) {
    const vfs = { ...this.vfsTemplates };
    delete vfs[path];
    this.useVFS(vfs);
    return this;
  }

  /** List every file path currently in the VFS. */
  listFiles() {
    return Object.keys(this.vfsTemplates);
  }

  /**
   * Parse front matter the way Jekyll does (convertible.rb:47-53): on a
   * YAML syntax error, warn and KEEP the document with empty front matter
   * (Jekyll raises only under `strict_front_matter`). Never skip the file.
   *
   * When `type` is given (posts|pages|drafts|<collection name>), matching
   * front-matter `defaults:` from _config.yml are deep-merged in first —
   * front matter itself always wins (frontmatter_defaults.rb).
   */
  /**
   * Jekyll parity (entry_filter.rb): is this VFS path excluded by the
   * `exclude:` config (defaults + user)? `include:` overrides.
   * Matches exact paths and anything under an excluded directory.
   */
  _isExcluded(path) {
    const matches = (list) => list.some((entry) => {
      const normalized = String(entry).replace(/\/$/, '');
      return path === normalized || path.startsWith(normalized + '/');
    });
    // include wins over exclude
    if (matches(this._includeList || [])) return false;
    return matches(this._excludeList || []);
  }

  _parseFrontMatter(path, content, type = null) {
    let attributes;
    let body;
    try {
      ({ attributes, body } = fm(content));
    } catch (e) {
      this.options.logger(`YAML Exception reading ${path}: ${e.message}`, 'warn');
      attributes = {};
      body = content;
    }
    if (type) {
      attributes = deepMerge(this._frontmatterDefaults(path, type), attributes);
    }
    return { attributes, body };
  }

  // ─── Front-matter defaults (Jekyll parity: frontmatter_defaults.rb) ───

  /** Deprecated singular scope types normalize to their plural forms. */
  _normalizeDefaultType(type) {
    return { page: 'pages', post: 'posts', draft: 'drafts' }[type] || type;
  }

  /** Valid default sets from _config.yml; invalid ones warn and are skipped. */
  _validDefaultSets() {
    const sets = this._config.defaults;
    if (!Array.isArray(sets)) return [];
    const out = [];
    for (const set of sets) {
      const valid = set && typeof set === 'object' && set.values && typeof set.values === 'object';
      if (!valid) {
        this.options.logger(
          `Defaults: an invalid front-matter default set was found: ${JSON.stringify(set)}`,
          'warn'
        );
        continue;
      }
      out.push(
        set.scope && set.scope.type
          ? { ...set, scope: { ...set.scope, type: this._normalizeDefaultType(set.scope.type) } }
          : set
      );
    }
    return out;
  }

  /** Does a defaults scope apply to this path+type? (no scope = applies). */
  _defaultScopeApplies(scope, path, type) {
    if (!scope) return true;
    if (scope.type && scope.type !== type) return false;
    const scopePath = scope.path;
    if (typeof scopePath !== 'string' || scopePath === '') return true;
    if (scopePath.includes('*')) {
      const re = new RegExp(
        '^' + scopePath.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
      );
      return re.test(path);
    }
    return path.startsWith(String(scopePath).replace(/^\//, ''));
  }

  /** Mirrors FrontmatterDefaults#has_precedence?: longer path wins; on a tie, a type-scoped set wins; later sets win ties. */
  _defaultHasPrecedence(oldScope, newScope) {
    if (!oldScope) return true;
    const newPath = (newScope && newScope.path) || '';
    const oldPath = (oldScope && oldScope.path) || '';
    if (newPath.length !== oldPath.length) return newPath.length >= oldPath.length;
    if (newScope && newScope.type) return true;
    return !(oldScope && oldScope.type);
  }

  /** Collect the merged defaults for a path+type (frontmatter_defaults.rb#all). */
  _frontmatterDefaults(path, type) {
    let defaults = {};
    let oldScope = null;
    for (const set of this._validDefaultSets()) {
      if (!this._defaultScopeApplies(set.scope, path, type)) continue;
      if (this._defaultHasPrecedence(oldScope, set.scope)) {
        defaults = deepMerge(defaults, set.values);
        oldScope = set.scope;
      } else {
        defaults = deepMerge(set.values, defaults);
      }
    }
    return defaults;
  }

  /** Derive the defaults type for a path (used where the caller doesn't know it). */
  _docTypeForPath(path) {
    if (path.includes('_posts/')) return 'posts';
    if (path.includes('_drafts/')) return 'drafts';
    for (const name of Object.keys(this._collectionsConfig || {})) {
      if (path.startsWith(`_${name}/`)) return name;
    }
    return 'pages';
  }

  // FIX (#9 in review -- site.pages didn't exist):
  // root-level pages (index.md, about.md, blog.md, ...) were parsed into
  // `this._rootPages` but never exposed to templates. `{% for page in
  // site.pages %}` returned nothing. They're now mapped the same way
  // collections are, with front matter parsed and a `url` resolved.
  _buildRootPagesSummary() {
    return this._rootPages.map((p) => {
      const { attributes, body } = this._parseFrontMatter(p.path, p.content, 'pages');
      // FIX (oracle-found): match Jekyll's default /about.html URLs, not /about/.
      const permalinkStyle = this._config?.permalink || this._config?.permalink_style || '';
      const isPretty = permalinkStyle === 'pretty' || permalinkStyle === ':pretty';
      let url;
      if (attributes.permalink) {
        // FIX (Bug 3): Jekyll's Page#url substitutes the page placeholders
        // (:path, :basename, :output_ext -- page.rb #url_placeholders)
        // inside a front-matter `permalink:` instead of emitting it verbatim.
        url = substitutePagePermalinkPlaceholders(attributes.permalink, p.path);
      } else if (p.path === 'index.md' || p.path === 'index.markdown' || p.path === 'index.html') {
        url = '/';
      } else {
        const base = p.path.replace(/\.[^/.]+$/, '');
        const ext = p.path.match(/\.[^/.]+$/)?.[0] || '.html';
        const outExt = ['.md', '.markdown'].includes(ext) ? '.html' : ext;
        // FIX (Bug 1 -- pretty permalinks on non-HTML pages): Jekyll's
        // Page#template (lib/jekyll/page.rb) applies the site's permalink
        // style only to HTML output (`if !html?` guard). atom.xml keeps
        // /atom.xml even with `permalink: pretty` configured.
        const isHtmlOutput = ['.html', '.xhtml', '.htm'].includes(outExt);
        url = isPretty && isHtmlOutput ? `/${base}/` : `/${base}${outExt}`;
      }
      return {
        ...attributes,
        path: p.path,
        url,
        // FIX (just-the-docs S6 -- site.pages/site.html_pages content was
        // raw markdown): real Jekyll's Convertible#to_liquid snapshots each
        // page at template-access time, i.e. AFTER render_document overwrote
        // content with the converted HTML (renderer.rb:85). Prefer the
        // build-time precomputed rendering; fall back to a sync
        // markdown-only conversion for .md sources (the raw body otherwise
        // -- Liquid needs the async renderer, unavailable in this sync
        // method). Never raw markdown for markdown sources.
        content:
          p._renderedContent ?? (/\.(md|markdown)$/i.test(p.path) ? this._renderMarkdown(body) : body),
      };
    });
  }

  /**
   * Map one scanned post entry to its Liquid-visible form (site.posts
   * entries, site.tags/site.categories values, page.next/page.previous).
   * Real Jekyll exposes ALL front matter on a post (the original hardcoded
   * a narrow whitelist, silently dropping custom fields like
   * `listing-order`, `image`, `subtitle` -- now everything spreads through
   * and only the computed fields below are overridden).
   */
  _mapPost(p) {
    // Internal bookkeeping (_body, _permalink, ..., _renderedContent,
    // _renderedExcerpt) must not leak into the Liquid context (there is a
    // test asserting exactly that).
    const {
      _body,
      _permalink,
      _date,
      _slug,
      _excerptSeparator,
      _excerpt,
      _renderedContent,
      _renderedExcerpt,
      content: _rawContent,
      ...rest
    } = p;
    // FIX (oracle-found): real Jekyll provides post.id (URL without extension,
    // e.g. /2026/01/02/second). The feed template uses {{ post.id }}.
    const id = _permalink ? _permalink.replace(/\.html$/, '').replace(/\/$/, '') : '';
    // FIX (oracle-found): real Jekyll's post.date is a Time object with
    // local timezone. We were passing a string which LiquidJS parsed as UTC.
    // Parse as local midnight for correct date_to_xmlschema output.
    const dateObj = parseLocalDate(_date);
    return {
      ...rest,
      url: _permalink,
      id,
      date: dateObj || _date,
      // Also fixes a dead `p._excerpt` reference (that field was never
      // actually set anywhere) -- a real front-matter `excerpt:`
      // override (now living in `rest.excerpt`) is respected first, and is
      // used as-is: real Jekyll only builds an Excerpt object when the
      // front matter has none (document.rb:539-540).
      // FIX: excerpt now respects a configurable excerpt_separator
      // (front matter > site config > Jekyll's own "\n\n" default)
      // instead of always splitting on a blank line.
      // FIX (minimal-mistakes #6): the auto excerpt is Liquid-rendered,
      // then markdown-converted -- real Jekyll runs the full renderer over
      // the extracted text (Excerpt#output, excerpt.rb:82-84).
      // _renderedExcerpt is computed by _precomputeDocumentContent; the
      // scan-time _excerpt (markdown-only) is the fallback before a build.
      // NOTE: ?? (not ||) -- a correctly-rendered excerpt can be the empty
      // string (e.g. the first paragraph was only {% assign %} tags), and
      // that empty result must win over the markdown-only fallback.
      excerpt: rest.excerpt ?? _renderedExcerpt ?? _excerpt ?? '',
      // FIX (S3 / hyde S1 -- site.posts[].content was raw markdown):
      // real Jekyll's Document#content is the Liquid-rendered +
      // markdown-converted HTML -- Renderer#render_document overwrites it
      // (renderer.rb:85) before any page template runs, and
      // DocumentDrop#content reads the live document
      // (document.rb:318-320). Never expose raw markdown here: prefer the
      // build-time precomputed rendering, fall back to a sync
      // markdown-only conversion.
      content: _renderedContent ?? this._renderMarkdown(_body || ''),
    };
  }

  /**
   * Map one scanned generic-collection doc to its Liquid-visible form.
   * Items carry the same `_body`/`_permalink` bookkeeping fields posts do,
   * so they get the same treatment (full front matter preserved, internal
   * fields cleaned up, rendered HTML as `content`).
   */
  _mapCollectionDoc(name, p) {
    const { _body, _permalink, _relPath, _date, _renderedContent, content: _rawContent, ...rest } = p;
    return {
      ...rest,
      // FIX (Bug 3): the scan-time `_permalink` already ran Jekyll's
      // URL placeholder substitution (document.rb #url); it wins
      // over the raw front-matter `permalink:` for `url`.
      url: _permalink || rest.permalink || `/${name}/${(_relPath || p.path).replace(/\.[^/.]+$/, '')}/`,
      path: p.path,
      // FIX (collection docs had no date): real Jekyll's
      // Document#date always resolves (front matter -> filename ->
      // site.time); _date already carries that at scan time.
      date: rest.date || _date,
      // FIX (oracle-found): real Jekyll's doc.content is rendered HTML,
      // not raw markdown -- Renderer#render_document overwrites
      // Document#content with the Liquid-rendered + converted output
      // (renderer.rb:85) before any page template runs. Prefer the
      // build-time precomputed rendering; fall back to a sync
      // markdown-only conversion.
      content: _renderedContent ?? this._renderMarkdown(_body || ''),
      collection: name,
    };
  }

  _buildSiteContext(currentPost = null) {
    // FIX (custom front-matter fields were silently dropped from
    // site.posts): the original hardcoded a narrow whitelist (title,
    // url, date, author, excerpt, content, tags, categories) when
    // mapping posts for templates. Any other front-matter field --
    // `listing-order`, `image`, `subtitle`, anything -- was discarded,
    // so `{{ post.image }}` or `{% assign s = site.posts | sort:
    // "listing-order" %}` silently did nothing. Real Jekyll exposes ALL
    // front matter on a post. Now we spread everything through and only
    // override the handful of computed fields (see _mapPost).
    const posts = (this._collections.posts || []).map((p) => this._mapPost(p));

    const tagsMap = {};
    const categoriesMap = {};

    posts.forEach((post) => {
      if (post.tags) {
        const list = Array.isArray(post.tags) ? post.tags : [post.tags];
        list.forEach((tag) => {
          tagsMap[tag] ||= [];
          tagsMap[tag].push(post);
        });
      }
      if (post.categories) {
        const list = Array.isArray(post.categories) ? post.categories : [post.categories];
        list.forEach((cat) => {
          categoriesMap[cat] ||= [];
          categoriesMap[cat].push(post);
        });
      }
    });

    // FIX (site.related_posts was entirely unimplemented): only
    // computed when rendering an actual post (mirrors real Jekyll's
    // SiteDrop#related_posts returning nil unless the document
    // currently being rendered is a Document/Post). A developer-
    // supplied `relatedPostsFn` (constructor option) fully overrides
    // the default "most recent posts" algorithm.
    let relatedPosts;
    if (currentPost) {
      const currentPostMapped = posts.find((p) => p.path === currentPost.path);
      if (currentPostMapped) {
        const fn = this.options.relatedPostsFn || defaultRelatedPosts;
        relatedPosts = fn(currentPostMapped, posts);
      }
    }

    // FIX (generic collections): items pushed by the new collection-
    // scanning logic in useVFS carry the same `_body`/`_permalink`
    // bookkeeping fields posts do, so they get the same treatment here
    // (full front matter preserved, internal fields cleaned up, real
    // body used as `content`). See _mapCollectionDoc.
    const mappedCollections = Object.fromEntries(
      Object.entries(this._collections).map(([name, pages]) => {
        if (name === 'posts') return [name, posts];
        return [name, pages.map((p) => this._mapCollectionDoc(name, p))];
      })
    );

    const pages = this._buildRootPagesSummary();
    // FIX (site.html_pages was entirely unimplemented): mirrors real
    // Jekyll's SiteDrop#html_pages predicate exactly (`page.html? ||
    // page.url.end_with?("/")`) -- adapted since this engine has no
    // separate "output extension" concept: a page counts as HTML if its
    // resolved url ends with ".html" or with "/".
    const htmlPages = pages.filter((p) => p.url.endsWith('.html') || p.url.endsWith('/'));

    return {
      site: {
        ...this._config,
        // FIX (site.time): Jekyll sets site.time to the build time.
        // Config `time:` overrides (for reproducible builds).
        time: this._config.time ? new Date(this._config.time) : new Date(),
        data: this._data,
        tags: tagsMap,
        categories: categoriesMap,
        pages, // FIX (#9)
        html_pages: htmlPages, // FIX (site.html_pages)
        static_files: this._staticFiles, // FIX (site.static_files)
        related_posts: relatedPosts, // FIX (site.related_posts)
        ...mappedCollections,
        // FIX (site.documents was entirely unimplemented): real Jekyll's
        // Site#documents is every doc in every collection (posts included,
        // output:false included, published:false already filtered at read).
        documents: Object.values(mappedCollections).flat(),
      },
    };
  }

  /**
   * The Liquid context for rendering one document's body during the
   * precompute pass: the full site payload plus `page` (the document's own
   * fields, without `content` -- exactly like _renderPage, where
   * page.content is only assigned AFTER the body renders) and the
   * jekyll.environment/version globals _renderPage injects.
   *
   * NOTE: no currentPost is passed, so site.related_posts is NOT computed
   * here -- _buildSiteContext(post) would invoke the relatedPostsFn once
   * per document, tripling its build() call count (there is a test
   * asserting it fires exactly once per post).
   */
  _pageRenderContext(pageFields) {
    return {
      ...this._buildSiteContext(),
      page: pageFields,
      // FIX (jekyll.environment was never injected): minima and many other
      // themes gate Google Analytics and Disqus behind
      // `if jekyll.environment == "production"`. Mirrors _renderPage.
      jekyll: {
        environment: this.options.environment || 'development',
        version: '4.3.4',
      },
    };
  }

  /**
   * Render one document body exactly like Jekyll's Renderer#render_document
   * (renderer.rb:69-96): Liquid-render the body, then run the markdown
   * converter for .md/.markdown sources. No layouts -- this produces the
   * `content` value, not the final page output. Always goes through the
   * configured markdown plugin via _renderMarkdown (never bypassed).
   */
  async _renderDocumentBody(path, rawBody, pageFields) {
    const ctx = this._pageRenderContext(pageFields);
    let out = await this.renderTemplate(rawBody, ctx);
    if (path.endsWith('.md') || path.endsWith('.markdown')) {
      out = this._renderMarkdown(out);
    }
    return out;
  }

  /**
   * Pre-render every document's body once per build, mirroring real
   * Jekyll's render order: Renderer#render_document runs (Liquid-render,
   * then markdown-convert, no layouts) for every document BEFORE any page
   * template executes, and overwrites Document#content with the converted
   * output (renderer.rb:85). The converted HTML is stored as
   * `_renderedContent` on each scan entry, so _buildSiteContext exposes
   * rendered HTML -- never raw markdown -- as `content` in site.posts,
   * site.pages, site.html_pages, site.documents, site.tags/categories,
   * paginator.posts and page.next/previous.
   *
   * Excerpts get the same treatment: real Jekyll extracts the excerpt from
   * the raw body at read time but RENDERS it lazily -- Excerpt#output runs
   * the full renderer over the extracted text (excerpt.rb:82-84) -- so the
   * auto excerpt is Liquid-rendered then markdown-converted here and stored
   * as `_renderedExcerpt`. A front-matter `excerpt:` override is used as-is
   * (real Jekyll only builds an Excerpt object when the front matter has
   * none -- document.rb:539-540).
   *
   * Resilience: a document whose body fails Liquid rendering during the
   * precompute (e.g. a tag the engine can't resolve in a document that
   * build() would never render anyway) keeps _renderedContent unset, so
   * _buildSiteContext's markdown-only fallback applies -- exactly today's
   * behavior for that document. Documents build() DOES render still fail
   * loudly in _renderPage, so no real error is masked.
   *
   * Idempotent per VFS scan (useVFS resets the flag); _buildSiteContext
   * falls back to a sync markdown-only conversion when the precompute has
   * not run (e.g. direct _buildSiteContext() calls in tests).
   */
  async _precomputeDocumentContent() {
    if (this._contentPrecomputed) return;
    this._contentPrecomputed = true;

    const warn = (path, e) =>
      this.options.logger(
        `Precompute: using markdown-only content for ${path} (${String(e.message).split('\n')[0]})`,
        'warn'
      );

    // Posts first (feeds and indexes read them), then other collections,
    // then root pages -- mirrors Jekyll rendering documents before pages.
    for (const p of this._collections.posts || []) {
      const { content: _pc, ...pageFields } = this._mapPost(p);
      if (!p.excerpt) {
        try {
          const rawExcerpt = extractExcerpt(p._body || '', p._excerptSeparator);
          p._renderedExcerpt = this._renderMarkdown(
            await this.renderTemplate(rawExcerpt, this._pageRenderContext(pageFields))
          );
          pageFields.excerpt = p._renderedExcerpt;
        } catch (e) {
          warn(p.path, e);
        }
      }
      try {
        p._renderedContent = await this._renderDocumentBody(p.path, p._body || '', pageFields);
      } catch (e) {
        warn(p.path, e);
      }
    }
    for (const [name, pages] of Object.entries(this._collections)) {
      if (name === 'posts') continue;
      for (const p of pages) {
        const { content: _c, ...pageFields } = this._mapCollectionDoc(name, p);
        try {
          p._renderedContent = await this._renderDocumentBody(p.path, p._body || '', pageFields);
        } catch (e) {
          warn(p.path, e);
        }
      }
    }
    // Root pages last: templates like just-the-docs' search-data.json
    // iterate site.html_pages expecting converted HTML (S6).
    const summaries = new Map(this._buildRootPagesSummary().map((s) => [s.path, s]));
    for (const rp of this._rootPages) {
      const { body } = this._parseFrontMatter(rp.path, rp.content, 'pages');
      const { content: _c, ...pageFields } = summaries.get(rp.path) || { path: rp.path };
      try {
        rp._renderedContent = await this._renderDocumentBody(rp.path, body, pageFields);
      } catch (e) {
        warn(rp.path, e);
      }
    }
  }

  // FIX (layout names without a file extension didn't resolve): real
  // Jekyll front matter conventionally writes `layout: post`, NOT
  // `layout: post.html` -- Jekyll resolves this against
  // `_layouts/post.html` (or `.htm`) automatically. The original lookup
  // was a literal `this._layouts[layoutName]`, which only worked if
  // someone wrote the full filename with extension. Confirmed via the
  // real minima theme: every one of its layouts and every post in a
  // freshly-scaffolded `jekyll new` site uses the extension-less form,
  // so without this fix NO theme using normal Jekyll conventions would
  // ever have its layout applied.
  _resolveLayout(layoutName) {
    if (this._layouts[layoutName] !== undefined) return this._layouts[layoutName];
    if (this._layouts[`${layoutName}.html`] !== undefined) return this._layouts[`${layoutName}.html`];
    if (this._layouts[`${layoutName}.htm`] !== undefined) return this._layouts[`${layoutName}.htm`];
    return undefined;
  }

  /**
   * Parse + render a template source with the LiquidJS engine, applying
   * source preprocessing first (e.g. parenthesized {% if %} conditions that
   * LiquidJS cannot tokenize but Ruby Liquid treats as grouping).
   * This is the single choke point for direct template parsing — use it
   * instead of calling this.liquidEngine.parseAndRender directly.
   * ({% include %} partials are covered separately via the FS callbacks.)
   */
  async renderTemplate(source, scope) {
    return this.liquidEngine.parseAndRender(preprocessConditionals(source), scope);
  }

  /**
   * Resolve the layout chain for a layout name, innermost-first.
   * Returns [{ name, data, body }] for each level: the page's own layout,
   * then the layout named in that layout's front matter, and so on.
   * Cycles are cut (Jekyll would loop too; we stop instead).
   */
  _layoutChain(layoutName) {
    const chain = [];
    const visited = new Set();
    while (layoutName && !visited.has(layoutName)) {
      visited.add(layoutName);
      const layoutContent = this._resolveLayout(layoutName);
      if (!layoutContent) break;
      const { attributes: fmLayout, body: layoutBody } = this._parseFrontMatter(`_layouts/${layoutName}`, layoutContent);
      chain.push({ name: layoutName, data: fmLayout, body: layoutBody });
      layoutName = fmLayout.layout;
    }
    return chain;
  }

  // FIX (layout merge chain): real Jekyll (lib/jekyll/renderer.rb
  // #render_layout) deep-merges each layout's front matter into the page
  // payload at every level -- the page wins over its layout, which wins
  // over the parent layout -- and exposes the current layout's front
  // matter as the `layout` variable:
  //   payload = Utils.deep_merge_hashes(payload, {
  //     "content" => output, "page" => layout.data.merge(payload["page"]),
  //     "layout"  => layout.data })
  // Before this fix, `{{ layout.css }}` rendered empty (no `layout` var),
  // layout front matter never reached `page.*`, and only the top layout's
  // chain link was honoured.
  async _applyLayouts(html, layoutName, ctx) {
    let page = ctx.page;
    for (const { data, body } of this._layoutChain(layoutName)) {
      page = deepMerge(data, page);
      html = await this.renderTemplate(body, { ...ctx, page, content: html, layout: data });
    }
    return html;
  }

  async _renderPage(path, content, isPost = false, postMeta = null, paginator = null, overridePermalink = null) {
    await this._emit('pre:render', { path, content });
    const { attributes, body } = this._parseFrontMatter(path, content, this._docTypeForPath(path));
    // FIX (site.related_posts): pass the current post through so
    // _buildSiteContext can compute related_posts contextually, exactly
    // like real Jekyll scopes `site.related_posts` to whichever
    // document is currently being rendered.
    const siteCtx = this._buildSiteContext(postMeta);

    // FIX (Bug 3 -- placeholder precedence): for posts/collection docs the
    // scan-time `_permalink` already ran Jekyll's full URL placeholder
    // substitution (document.rb #url via generatePermalink /
    // generateCollectionPermalink), so it wins over the raw front-matter
    // value. Plain pages substitute the smaller page.rb placeholder set
    // (:path, :basename, :output_ext) instead of emitting it verbatim.
    let localPermalink = overridePermalink || null;
    if (!localPermalink && isPost && postMeta) {
      localPermalink = postMeta._permalink;
    }
    if (!localPermalink && attributes.permalink) {
      localPermalink = substitutePagePermalinkPlaceholders(attributes.permalink, path);
    }
    if (!localPermalink) {
      if (path === 'index.md' || path === 'index.markdown' || path === 'index.html') {
        localPermalink = '/';
      } else {
        // FIX (oracle-found): real Jekyll defaults to /about.html style URLs
        // for pages, not /about/ (pretty). Only use pretty when
        // permalink: pretty (or :pretty) is configured.
        const permalinkStyle = this._config?.permalink || this._config?.permalink_style || '';
        const isPretty = permalinkStyle === 'pretty' || permalinkStyle === ':pretty';
        let p = path.replace(/\.[^/.]+$/, '');
        const isDirIndex = p.endsWith('/index');
        if (isDirIndex) p = p.slice(0, -'/index'.length);
        // Default: /:path:output_ext → /about.html; markdown -> .html
        const ext = path.match(/\.[^/.]+$/)?.[0] || '.html';
        const outExt = ['.md', '.markdown'].includes(ext) ? '.html' : ext;
        // FIX (Bug 1 -- pretty permalinks on non-HTML pages): Jekyll's
        // Page#template (lib/jekyll/page.rb) applies the site's permalink
        // style only to HTML output (`if !html?` guard). atom.xml keeps
        // /atom.xml even with `permalink: pretty` configured.
        const isHtmlOutput = ['.html', '.xhtml', '.htm'].includes(outExt);
        if (isDirIndex) {
          // Directory index (docs/index.html) → /docs/ always
          localPermalink = `/${p}/`;
        } else if (isPretty && isHtmlOutput) {
          localPermalink = `/${p}/`;
        } else {
          localPermalink = `/${p}${outExt}`;
        }
      }
    }

    // FIX (page.date/page.excerpt empty on post pages): real Jekyll's
    // DocumentDrop exposes the computed date and excerpt on the post's own
    // page, not just in site.posts. Merge the scan-time computed values
    // (front-matter overrides still win).
    const postFields =
      isPost && postMeta
        ? {
            date: postMeta._date,
            // FIX (minimal-mistakes #6): prefer the fully rendered excerpt
            // (Liquid-rendered + markdown-converted, computed by
            // _precomputeDocumentContent); the scan-time _excerpt
            // (markdown-only) is the fallback. Front-matter wins first,
            // used as-is like real Jekyll (document.rb:539-540). ?? (not
            // ||): a correctly-rendered excerpt can be the empty string.
            excerpt: attributes.excerpt ?? postMeta._renderedExcerpt ?? postMeta._excerpt ?? '',
          }
        : {};
    // FIX (page.id/page.collection/page.next/page.previous were never
    // set): real Jekyll's DocumentDrop exposes these on every collection
    // document and themes depend on them -- page.id for og tags and
    // minimal-mistakes related posts, page.next/page.previous for
    // prev/next post nav (beautiful-jekyll), page.collection for
    // archive/tag/category headings (chirpy). id follows the existing
    // site.posts convention (Document#id: dirname(url) + slug, i.e. the
    // permalink minus .html and trailing slash, e.g. /2026/01/02/second).
    // next is the NEWER post, previous the OLDER one
    // (Document#next_doc/#previous_doc over the newest-first site.posts
    // array). Regular pages get none of these (all nil in real Jekyll --
    // verified against Jekyll 4.4.1 output and document.rb/drop sources).
    let identityFields = {};
    if (isPost && postMeta) {
      const collectionName =
        Object.keys(this._collections).find((name) => postMeta.path.startsWith(`_${name}/`)) || 'posts';
      identityFields.collection = collectionName;
      identityFields.id = (postMeta._permalink || '').replace(/\.html$/, '').replace(/\/$/, '');
      if (collectionName === 'posts') {
        const sitePosts = siteCtx.site.posts || [];
        const idx = sitePosts.findIndex((p) => p.path === postMeta.path);
        if (idx !== -1) {
          identityFields.next = idx > 0 ? sitePosts[idx - 1] : null;
          identityFields.previous = idx < sitePosts.length - 1 ? sitePosts[idx + 1] : null;
        }
      }
    }
    const pageCtx = {
      ...siteCtx,
      page: {
        ...attributes,
        path,
        url: localPermalink,
        ...postFields,
        ...identityFields,
      },
      // FIX (jekyll.environment was never injected): minima and many other
      // themes gate Google Analytics and Disqus behind
      // `if jekyll.environment == "production"`. Without this, the
      // condition always evaluates to false (undefined != "production"),
      // so GA/Disqus blocks are silently absent. This engine defaults to
      // "development", matching `jekyll serve` behaviour. Pass
      // `options.environment` to the constructor to override.
      jekyll: {
        environment: this.options.environment || 'development',
        version: '4.3.4',
      },
    };
    // FIX (pagination was entirely unimplemented): exposes `paginator`
    // in the template context exactly like real Jekyll does for a
    // paginated index page.
    if (paginator) pageCtx.paginator = paginator;

    let rendered = await this.renderTemplate(body, pageCtx);

    // FIX (.markdown extension): also convert .markdown files to HTML,
    // not just .md files.
    if (path.endsWith('.md') || path.endsWith('.markdown')) {
      rendered = this._renderMarkdown(rendered);
    }

    // FIX (page.content was never set): real Jekyll exposes the document's
    // rendered body content (post-conversion, pre-layout) as page.content
    // -- beautiful-jekyll builds meta descriptions from it
    // (`{{ page.content | strip_html | truncatewords: 50 }}`). It is the
    // same value layouts receive as top-level `content`.
    // FIX (beautiful-jekyll S4 -- page/document asymmetry, oracle-verified):
    // real Jekyll snapshots REGULAR PAGES via Convertible#to_liquid (a plain
    // Hash built in assign_pages! BEFORE render_document -- convertible.rb,
    // renderer.rb:52-65), so a page's own `page.content` is the RAW body
    // (real tags/index.html meta descriptions contain the raw `{% assign %}`
    // Liquid source). DOCUMENTS (posts, collection docs) instead get the
    // live DocumentDrop (document.rb:318-320), so their page.content is the
    // rendered HTML. `isPost` covers posts and collection docs here.
    pageCtx.page.content = isPost ? rendered : body;

    if (attributes.layout || postMeta?.layout) {
      rendered = await this._applyLayouts(rendered, attributes.layout || postMeta.layout, pageCtx);
    }

    const result = {
      path,
      permalink: localPermalink,
      data: attributes,
      content: rendered,
      ...(paginator ? { paginator } : {}),
    };
    await this._emit('post:render', result);
    return result;
  }

  // FIX (pagination was entirely unimplemented). See the `buildPaginators`
  // module-level function's comment for the template-page-selection
  // adaptation made for this VFS-based engine.
  _computePagination(allPosts) {
    const perPage = parseInt(this._config.paginate, 10);
    if (!this._config.paginate || !Number.isFinite(perPage) || perPage <= 0) return null;
    if (this._rootPages.length === 0) return null;
    if (!allPosts || allPosts.length === 0) return null;

    const rootSummaries = this._buildRootPagesSummary();
    const templateSummary = rootSummaries.find((p) => p.url === '/');
    if (!templateSummary) {
      this.options.logger(
        "Pagination: couldn't find an index page to use as the pagination template. Skipping pagination.",
        'warn'
      );
      return null;
    }

    const postsForPagination = allPosts.filter((p) => !p.hidden); // mirrors `all_posts.reject { |p| p['hidden'] }`
    const paginatePathPattern = this._config.paginate_path || '/page:num';
    const pagers = buildPaginators(postsForPagination, perPage, paginatePathPattern, templateSummary.url);

    return { templatePath: templateSummary.path, pagers };
  }

  /**
   * Build the site: read pages/posts/collections from the VFS, render
   * Markdown/Liquid through layouts, run generators and hooks, and
   * return every rendered page.
   * @returns {Promise<Array<{path: string, content: string}>>} rendered pages
   */
  async build() {
    await this._emit('pre:build', this);

    // Auto-register built-in JS plugin ports when enabled in config.
    // (Matches Ruby Jekyll's plugin loading via `plugins:` in _config.yml.)
    if (isRedirectFromEnabled(this._config) && !this._redirectFromRegistered) {
      this._redirectFromRegistered = true;
      redirectFromPlugin(this);
    }

    this.options.logger('Compiling resource dependency nodes...', 'info');
    const results = [];

    // FIX (page.content/post.content rendered-vs-raw semantics): real
    // Jekyll renders every document (Liquid + markdown, no layouts) BEFORE
    // any page template runs and overwrites Document#content with the
    // converted output (renderer.rb:85). Precompute those renderings now so
    // the site payload -- which pagination, feeds, indexes and every page
    // template read below -- never exposes raw markdown as `content`.
    await this._precomputeDocumentContent();

    // Posts are needed up front for pagination math, regardless of
    // which root page ends up rendering first.
    const postsForPagination = this._buildSiteContext().site.posts;
    const pagination = this._computePagination(postsForPagination);

    // JS Plugin API: build the mutable site object, run post_read hooks
    // (mirrors Jekyll's :site, :post_read), then generators.
    // Plugins may push new pages to site.pages.
    const pluginSite = this._buildPluginSite();
    this.triggerHook('site', 'post_read', pluginSite);
    for (const gen of this._generators) {
      gen(pluginSite);
    }
    // Pages added by plugins (not already in _rootPages).
    const rootPaths = new Set(this._rootPages.map((p) => p.path));
    const pluginPages = pluginSite.pages.filter((p) => !rootPaths.has(p.path));

    for (const page of this._rootPages) {
      this.options.logger(`Parsing base layer: ${page.path}`, 'info');
      const isPaginationTemplate = pagination && pagination.templatePath === page.path;
      const result = await this._renderPage(
        page.path,
        page.content,
        false,
        null,
        isPaginationTemplate ? pagination.pagers[0] : null
      );
      results.push(result);
      if (this.options.stdout) this.options.stdout(result);
    }

    // Render pages added by plugins (via site.pages.push in hooks/generators).
    // page.data is serialized as front matter so layouts and Liquid work.
    for (const page of pluginPages) {
      this.options.logger(`Rendering plugin page: ${page.path}`, 'info');
      const frontMatter = yaml.dump(page.data || {});
      const fileContent = `---\n${frontMatter}---\n${page.content || ''}`;
      const result = await this._renderPage(page.path, fileContent);
      results.push(result);
      if (this.options.stdout) this.options.stdout(result);
    }

    // FIX (pagination): synthesize page2, page3, ... by re-rendering the
    // template page's own content/layout with a different `paginator`
    // and a different permalink (computed from `paginate_path`) --
    // mirrors how jekyll-paginate's generator clones a new Page per
    // extra pager.
    if (pagination) {
      const templatePage = this._rootPages.find((p) => p.path === pagination.templatePath);
      for (let i = 1; i < pagination.pagers.length; i++) {
        const pager = pagination.pagers[i];
        this.options.logger(`Generating paginated page ${pager.page}`, 'info');
        const result = await this._renderPage(
          templatePage.path,
          templatePage.content,
          false,
          null,
          pager,
          pager.page_path
        );
        results.push(result);
        if (this.options.stdout) this.options.stdout(result);
      }
    }

    for (const [name, pages] of Object.entries(this._collections)) {
      // FIX (collection `output: false` wasn't respected -- and real
      // Jekyll's actual default is `output: false`, i.e. collection
      // items are NOT rendered as standalone files unless you opt in
      // with `output: true`. Only `posts` is special-cased to always
      // render, matching real Jekyll exactly.
      const shouldOutput = name === 'posts' || this._collectionsConfig[name]?.output === true;
      if (!shouldOutput) continue;

      for (const page of pages) {
        // FIX (future collection docs): real Jekyll READS them (they stay
        // in site.<collection>) but never WRITES them (Document#write? ->
        // Publisher#publish?), unless `future: true`. (Future posts never
        // reach here -- PostReader#read_publishable already dropped them.)
        if (!this._config.future && page._date && new Date(page._date) > new Date()) {
          this.options.logger(`Skipping ${page.path}: future date`, 'info');
          continue;
        }
        this.options.logger(`Processing collection item -> ${page.path}`, 'info');
        const result = await this._renderPage(page.path, page.content, true, page);
        results.push(result);
        if (this.options.stdout) this.options.stdout(result);
      }
    }

    this.options.logger(`Engine fully rendered ${results.length} virtual files.`, 'success');

    // FIX (static files were never emitted): useVFS() tracks every
    // non-page asset (images, CSS, JS, fonts, .xml/.json WITHOUT front
    // matter, ...) into this._staticFiles (Jekyll's site.static_files),
    // but build() never wrote them out -- full-theme testing found
    // minimal-mistakes missing 185 assets. Emit them verbatim: Jekyll
    // copies static files as-is to their relative destination, so the
    // permalink is the tracked path itself (leading slash, as Jekyll's
    // StaticFileDrop#path) and `data` is empty. `path` follows the
    // _renderPage convention (VFS path, no leading slash); the tracked
    // path's leading `/` is stripped when reading from vfsTemplates,
    // whose keys have no leading slash.
    for (const staticFile of this._staticFiles) {
      const vfsPath = staticFile.path.startsWith('/')
        ? staticFile.path.slice(1)
        : staticFile.path;
      const staticResult = {
        path: vfsPath,
        permalink: staticFile.path,
        data: {},
        content: this.vfsTemplates[vfsPath],
      };
      results.push(staticResult);
      if (this.options.stdout) this.options.stdout(staticResult);
    }

    // FIX (SCSS assets pipeline): compile all tracked SCSS/Sass assets.
    // Done after template rendering so the full VFS (including any
    // theme _sass/ partials) is already loaded.
    //
    // Sass is an optional plugin, not a core dependency: the compiler is
    // provided via the `sass` engine option so the core bundle stays
    // tree-shakeable and browsers can lazy-load the dart-sass chunk only
    // when the site actually contains Sass files.
    if (this._sassAssets.length > 0 && !this.options.sass) {
      const files = this._sassAssets.map((a) => a.path).join(', ');
      throw new Error(
        `Site contains Sass files (${files}) but no Sass compiler was provided. ` +
          `Pass one via \`new JekyllEngine({ sass })\` — \`import * as sass from 'sass'\` ` +
          `in Node, or load dist/sass-plugin.js (sets window.JekyllSass) in the browser.`
      );
    }
    // Compute the site context once for all Sass assets (below).
    const sassSiteCtx = this._buildSiteContext();
    for (const asset of this._sassAssets) {
      this.options.logger(`Compiling Sass: ${asset.path}`, 'info');
      // FIX (liquid in scss): real Jekyll renders Liquid in .scss/.sass
      // files BEFORE Sass compilation (lib/jekyll/renderer.rb:
      // Renderer#run renders Liquid first, then runs the converter chain
      // including the Sass converter -- that's how themes inject
      // `{{ site.x }}` / `{% if %}` into stylesheets). Order per real
      // Jekyll: strip front matter → render Liquid → compile Sass.
      const { attributes: assetAttrs, body: assetBody } = this._parseFrontMatter(
        asset.path,
        asset.content
      );
      const assetCtx = {
        ...sassSiteCtx,
        // FIX (liquid context): mirror _renderPage's page context so
        // `{{ site.* }}` (and `page.*` / `jekyll.environment`) work in
        // stylesheets exactly like they do in pages.
        page: {
          ...assetAttrs,
          path: asset.path,
          url: '/' + asset.path.replace(/\.(scss|sass)$/, '.css'),
        },
        jekyll: {
          environment: this.options.environment || 'development',
          version: '4.3.4',
        },
      };
      let sassSource = assetBody;
      try {
        sassSource = await this.liquidEngine.parseAndRender(assetBody, assetCtx);
      } catch (err) {
        // Don't silently swallow the Liquid failure, but don't break the
        // existing loud-on-Sass-error behavior either: warn here, then
        // compile the raw content so the Sass error comment + warn still
        // surface exactly as before.
        this.options.logger(`Liquid render error in ${asset.path}: ${err.message}`, 'warn');
      }
      const compiled = compileSassAsset(
        asset.path,
        sassSource,
        this.vfsTemplates,
        this._config,
        this.options.sass
      );
      // FIX (silent Sass failures): the compile error used to hide inside
      // a CSS comment. The comment is still emitted (playground-friendly),
      // but now it also warns loudly so a broken stylesheet can't be missed.
      if (compiled.error) {
        this.options.logger(`Sass compile error in ${asset.path}: ${compiled.error}`, 'warn');
      }
      const cssResult = {
        path: asset.path,
        permalink: compiled.permalink,
        data: {},
        content: compiled.css,
      };
      results.push(cssResult);
      if (this.options.stdout) this.options.stdout(cssResult);
    }

    // FIX (jekyll-feed generator): the real jekyll-feed plugin generates
    // /feed.xml (+ per-category feeds) via its Generator. We implement it
    // natively with the gem's own feed.xml template (jekyllFeed.js) —
    // opt-in via `plugins: [jekyll-feed]` in _config.yml, exactly like
    // real Jekyll.
    if (isFeedEnabled(this._config)) {
      this.options.logger('Generating Atom feeds (jekyll-feed)...', 'info');
      const feedResults = await generateFeeds(this);
      for (const feedResult of feedResults) {
        results.push(feedResult);
        if (this.options.stdout) this.options.stdout(feedResult);
      }
    }

    // FIX (jekyll-sitemap): native sitemap generator, opt-in via
    // `plugins: [jekyll-sitemap]`. (Opal cannot run the real gem:
    // it uses regex lookbehind, which Opal 1.8.2 doesn't support.)
    if (isSitemapEnabled(this._config)) {
      this.options.logger('Generating sitemap.xml (jekyll-sitemap)...', 'info');
      const sitemapResult = await generateSitemap(this);
      results.push(sitemapResult);
      if (this.options.stdout) this.options.stdout(sitemapResult);
    }

    await this._emit('post:build', results);
    return results;
  }
}

// Exported for direct testing / reuse
export {
  slugify,
  computeRelativeUrl,
  computeAbsoluteUrl,
  stripIndex,
  permalinkToOutputPath,
  parseMarkdown,
  getPostCategories,
  getPostTags,
  parsePostFilename,
  generatePermalink,
  normalizeCollectionsConfig,
  generateCollectionPermalink,
  defaultRelatedPosts,
  extractExcerpt,
  buildPaginators,
};
