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
import { marked } from 'marked';
import * as yaml from 'js-yaml';
import fm from 'front-matter';
import { registerJekyllExtensions } from './jekyllTags.js';
import { isSassAsset, compileSassAsset } from './assetsPipeline.js';

const noop = () => {};

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
const markedRenderer = new marked.Renderer();
markedRenderer.codespan = (token) => {
  const text = typeof token === 'object' ? token.text : token;
  return `<code class="language-plaintext highlighter-rouge">${text}</code>`;
};
markedRenderer.code = (token) => {
  const { text, lang } = typeof token === 'object' ? token : { text: token, lang: undefined };
  const langClass = lang ? `language-${lang}` : 'language-plaintext';
  return `<figure class="highlight"><pre><code class="${langClass} highlighter-rouge">${escapeHtmlForMarkdown(
    text
  )}</code></pre></figure>`;
};
marked.setOptions({ renderer: markedRenderer });

function escapeHtmlForMarkdown(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function parseMarkdown(md) {
  return marked.parse(String(md));
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
  const match = filename.match(/^(\d{4})-(\d{2})-(\d{2})-(.+)\.(md|markdown)$/);
  if (!match) return null;
  const [, year, month, day, slug] = match;
  return { date: `${year}-${month}-${day}`, slug: slug.replace(/-/g, ' ') };
}

function generatePermalink(frontMatter, slug, date, config = {}) {
  if (frontMatter.permalink) return frontMatter.permalink;

  let pattern = frontMatter.permalink_style || config.permalink || 'date';

  const presets = {
    date: '/:categories/:year/:month/:day/:title.html',
    pretty: '/:categories/:year/:month/:day/:title/',
    none: '/:categories/:title',
  };

  if (presets[pattern]) {
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
    categoriesStr = cats.map((c) => slugify(c)).filter(Boolean).join('/');
  }

  let path = pattern
    .replace(/:categories/g, categoriesStr)
    .replace(/:year/g, year)
    .replace(/:month/g, month)
    .replace(/:day/g, day)
    .replace(/:title/g, s)
    .replace(/:slug/g, slugify(slug || ''));

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
function generateCollectionPermalink(frontMatter, collectionName, relPath, collectionConfig = {}) {
  if (frontMatter.permalink) return frontMatter.permalink;

  const pattern = frontMatter.permalink_style || collectionConfig.permalink || '/:collection/:path/';

  const lastSlash = relPath.lastIndexOf('/');
  const dir = lastSlash === -1 ? '' : relPath.slice(0, lastSlash);
  const base = (lastSlash === -1 ? relPath : relPath.slice(lastSlash + 1)).replace(/\.[^/.]+$/, '');
  const pathSlug = [dir, slugify(base)].filter(Boolean).join('/');

  let path = pattern
    .replace(/:collection/g, collectionName)
    .replace(/:path/g, pathSlug)
    .replace(/:name/g, slugify(base))
    .replace(/:title/g, slugify(base));

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
  constructor(options = {}) {
    this.options = {
      logger: options.logger || noop,
      stdout: options.stdout || null,
      cache: options.cache !== false,
      ...options,
    };

    this._config = {};
    this._layouts = {};
    this._includes = {};
    this._data = {};
    this._collections = {};
    this._rootPages = [];
    this._staticFiles = [];
    this._sassAssets = [];
    this.vfsTemplates = {};

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
            return this.vfsTemplates[cleanFile];
          }
          throw new Error(`Template not resolved: ${file}`);
        },
        readFileSync: (file) => {
          const cleanFile = this._resolveVfsPath(file);
          if (this.vfsTemplates[cleanFile] !== undefined) {
            return this.vfsTemplates[cleanFile];
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
    registerJekyllExtensions(this.liquidEngine);
    if (options.vfs) this.useVFS(options.vfs);
  }

  _resolveVfsPath(file) {
    let cleaned = file.replace(/^\//, '');
    if (this.vfsTemplates[cleaned] !== undefined) {
      return cleaned;
    }

    const layoutPath = `_layouts/${cleaned}`;
    if (this.vfsTemplates[layoutPath] !== undefined) {
      return layoutPath;
    }

    const includePath = `_includes/${cleaned}`;
    if (this.vfsTemplates[includePath] !== undefined) {
      return includePath;
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
      markdownify: (input) => parseMarkdown(input),
    };

    for (const [name, fn] of Object.entries(filters)) {
      this.liquidEngine.registerFilter(name, fn);
    }
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
        } catch (e) {}
        break;
      }
    }
    this._collectionsConfig = normalizeCollectionsConfig(this._config.collections);

    for (const [path, content] of Object.entries(vfs)) {
      this.vfsTemplates[path] = content;

      if (path === '_config.yml' || path === '_config.yaml') {
        continue; // already parsed above
      }
      if (path.startsWith('_layouts/')) {
        this._layouts[path.replace('_layouts/', '')] = content;
        continue;
      }
      if (path.startsWith('_includes/')) {
        this._includes[path.replace('_includes/', '')] = content;
        continue;
      }
      if (path.startsWith('_data/')) {
        try {
          const name = path.replace('_data/', '').replace(/\.[^/.]+$/, '');
          this._data[name] = yaml.load(content);
        } catch (e) {}
        continue;
      }

      // FIX (.markdown posts): Jekyll accepts both `.md` and `.markdown`
      // as post file extensions. The original `parsePostFilename` only
      // matched `.md`.
      if (path.includes('_posts/')) {
        const postsIndex = path.indexOf('_posts/');
        const filename = path.slice(postsIndex + '_posts/'.length);
        const parsed = parsePostFilename(filename);
        try {
          const { attributes, body } = fm(content);

          const postCategories = getPostCategories(attributes, path);
          const postTags = getPostTags(attributes);

          attributes.categories = postCategories;
          attributes.tags = postTags;

          const permalink = generatePermalink(attributes, parsed?.slug, parsed?.date, this._config);
          this._collections.posts ||= [];
          this._collections.posts.push({
            path,
            content,
            ...attributes,
            categories: postCategories,
            tags: postTags,
            _body: body,
            _permalink: permalink,
            _date: attributes.date || parsed?.date,
            _slug: parsed?.slug,
            // FIX (excerpt_separator was hardcoded): front matter wins
            // over site config, which wins over Jekyll's own default of
            // "\n\n" -- mirrors Document#excerpt_separator exactly.
            _excerptSeparator: attributes.excerpt_separator || this._config.excerpt_separator || '\n\n',
          });
        } catch (e) {}
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
          const { attributes, body } = fm(content);
          const permalink = generateCollectionPermalink(
            attributes,
            collectionName,
            relPath,
            this._collectionsConfig[collectionName]
          );
          this._collections[collectionName] ||= [];
          this._collections[collectionName].push({
            path,
            content,
            ...attributes,
            _body: body,
            _permalink: permalink,
            _relPath: relPath,
          });
        } catch (e) {}
        continue;
      }

      // FIX (.markdown extension): Jekyll supports both .md and .markdown
      // as Markdown file extensions. The original only checked for .md in
      // the root page branch.
      if (/\.(md|markdown|html|liquid)$/i.test(path) && !path.includes('/')) {
        this._rootPages.push({ path, content });
        continue;
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

      if (!/\.(md|markdown|html|htm|liquid)$/i.test(path)) {
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

    return this;
  }

  // FIX (#9 in review -- site.pages didn't exist):
  // root-level pages (index.md, about.md, blog.md, ...) were parsed into
  // `this._rootPages` but never exposed to templates. `{% for page in
  // site.pages %}` returned nothing. They're now mapped the same way
  // collections are, with front matter parsed and a `url` resolved.
  _buildRootPagesSummary() {
    return this._rootPages.map((p) => {
      const { attributes, body } = fm(p.content);
      const url =
        attributes.permalink ||
        (p.path === 'index.md' || p.path === 'index.markdown' || p.path === 'index.html' ? '/' : `/${p.path.replace(/\.[^/.]+$/, '')}/`);
      return {
        ...attributes,
        path: p.path,
        url,
        content: body,
      };
    });
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
    // override the handful of computed fields.
    const posts = (this._collections.posts || []).map((p) => {
      const { _body, _permalink, _date, _slug, _excerptSeparator, content: _rawContent, ...rest } = p;
      return {
        ...rest,
        url: _permalink,
        date: _date,
        // Also fixes a dead `p._excerpt` reference (that field was never
        // actually set anywhere) -- a real front-matter `excerpt:`
        // override (now living in `rest.excerpt`) is respected first.
        // FIX: excerpt now respects a configurable excerpt_separator
        // (front matter > site config > Jekyll's own "\n\n" default)
        // instead of always splitting on a blank line.
        excerpt: rest.excerpt || (_body ? parseMarkdown(extractExcerpt(_body, _excerptSeparator)) : ''),
        content: _body,
      };
    });

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
    // body used as `content`).
    const mappedCollections = Object.fromEntries(
      Object.entries(this._collections).map(([name, pages]) => {
        if (name === 'posts') return [name, posts];
        return [
          name,
          pages.map((p) => {
            const { _body, _permalink, _relPath, content: _rawContent, ...rest } = p;
            return {
              ...rest,
              url: rest.permalink || _permalink || `/${name}/${(_relPath || p.path).replace(/\.[^/.]+$/, '')}/`,
              path: p.path,
              content: _body,
              collection: name,
            };
          }),
        ];
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
        data: this._data,
        tags: tagsMap,
        categories: categoriesMap,
        pages, // FIX (#9)
        html_pages: htmlPages, // FIX (site.html_pages)
        static_files: this._staticFiles, // FIX (site.static_files)
        related_posts: relatedPosts, // FIX (site.related_posts)
        ...mappedCollections,
      },
    };
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

  async _applyLayouts(html, layoutName, ctx) {
    const visited = new Set();
    while (layoutName && !visited.has(layoutName)) {
      visited.add(layoutName);
      const layoutContent = this._resolveLayout(layoutName);
      if (!layoutContent) break;
      const { attributes: fmLayout, body: layoutBody } = fm(layoutContent);
      html = await this.liquidEngine.parseAndRender(layoutBody, { ...ctx, content: html });
      layoutName = fmLayout.layout;
    }
    return html;
  }

  async _renderPage(path, content, isPost = false, postMeta = null, paginator = null, overridePermalink = null) {
    const { attributes, body } = fm(content);
    // FIX (site.related_posts): pass the current post through so
    // _buildSiteContext can compute related_posts contextually, exactly
    // like real Jekyll scopes `site.related_posts` to whichever
    // document is currently being rendered.
    const siteCtx = this._buildSiteContext(postMeta);

    let localPermalink = overridePermalink || attributes.permalink;
    if (!localPermalink) {
      if (isPost && postMeta) {
        localPermalink = postMeta._permalink;
      } else if (path === 'index.md' || path === 'index.markdown' || path === 'index.html') {
        localPermalink = '/';
      } else {
        localPermalink = `/${path.replace(/\.[^/.]+$/, '')}/`;
      }
    }

    const pageCtx = {
      ...siteCtx,
      page: {
        ...attributes,
        path,
        url: localPermalink,
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
        version: '4.3.2',
      },
    };
    // FIX (pagination was entirely unimplemented): exposes `paginator`
    // in the template context exactly like real Jekyll does for a
    // paginated index page.
    if (paginator) pageCtx.paginator = paginator;

    let rendered = await this.liquidEngine.parseAndRender(body, pageCtx);

    // FIX (.markdown extension): also convert .markdown files to HTML,
    // not just .md files.
    if (path.endsWith('.md') || path.endsWith('.markdown')) {
      rendered = parseMarkdown(rendered);
    }

    if (attributes.layout || postMeta?.layout) {
      rendered = await this._applyLayouts(rendered, attributes.layout || postMeta.layout, pageCtx);
    }

    return {
      path,
      permalink: localPermalink,
      data: attributes,
      content: rendered,
      ...(paginator ? { paginator } : {}),
    };
  }

  // FIX (pagination was entirely unimplemented). See the `buildPaginators`
  // module-level function's comment for the template-page-selection
  // adaptation made for this VFS-based engine.
  _computePagination(allPosts) {
    const perPage = parseInt(this._config.paginate, 10);
    if (!this._config.paginate || !Number.isFinite(perPage) || perPage <= 0) return null;
    if (this._rootPages.length === 0) return null;

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

  async build() {
    this.options.logger('Compiling resource dependency nodes...', 'info');
    const results = [];

    // Posts are needed up front for pagination math, regardless of
    // which root page ends up rendering first.
    const postsForPagination = this._buildSiteContext().site.posts;
    const pagination = this._computePagination(postsForPagination);

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
        this.options.logger(`Processing collection item -> ${page.path}`, 'info');
        const result = await this._renderPage(page.path, page.content, true, page);
        results.push(result);
        if (this.options.stdout) this.options.stdout(result);
      }
    }

    this.options.logger(`Engine fully rendered ${results.length} virtual files.`, 'success');

    // FIX (SCSS assets pipeline): compile all tracked SCSS/Sass assets.
    // Done after template rendering so the full VFS (including any
    // theme _sass/ partials) is already loaded.
    for (const asset of this._sassAssets) {
      this.options.logger(`Compiling Sass: ${asset.path}`, 'info');
      const compiled = compileSassAsset(asset.path, asset.content, this.vfsTemplates, this._config);
      const cssResult = {
        path: asset.path,
        permalink: compiled.permalink,
        data: {},
        content: compiled.css,
      };
      results.push(cssResult);
      if (this.options.stdout) this.options.stdout(cssResult);
    }

    return results;
  }
}

// Exported for direct testing / reuse
export {
  slugify,
  computeRelativeUrl,
  computeAbsoluteUrl,
  stripIndex,
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
