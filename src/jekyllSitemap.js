/**
 * jekyllSitemap.js — native jekyll-sitemap generator (no Ruby/Opal required).
 *
 * Implements the sitemap generation of the real jekyll-sitemap plugin (v1.4.0),
 * using its actual `sitemap.xml` template verbatim (vendored below with
 * attribution). Opt-in via `_config.yml`:
 *
 *   plugins:
 *     - jekyll-sitemap
 *
 * Template source: https://github.com/jekyll/jekyll-sitemap/blob/v1.4.0/lib/sitemap.xml
 * (MIT license, (c) Jekyll contributors)
 */
export function isSitemapEnabled(config) {
  const plugins = config?.plugins || config?.gems || [];
  const list = Array.isArray(plugins) ? plugins : [plugins];
  return list.some((p) => p === 'jekyll-sitemap' || p === 'jekyll_sitemap');
}

// The real jekyll-sitemap v1.4.0 template, verbatim.
export const SITEMAP_TEMPLATE = `<?xml version="1.0" encoding="UTF-8"?>
{% if page.xsl %}
  <?xml-stylesheet type="text/xsl" href="{{ "/sitemap.xsl" | absolute_url }}"?>
{% endif %}
<urlset xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9 http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd" xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  {% assign collections = site.collections | where_exp:'collection','collection.output != false' %}
  {% for collection in collections %}
    {% assign docs = collection.docs | where_exp:'doc','doc.sitemap != false' %}
    {% for doc in docs %}
      <url>
        <loc>{{ doc.url | replace:'/index.html','/' | absolute_url | xml_escape }}</loc>
        {% if doc.last_modified_at or doc.date %}
          <lastmod>{{ doc.last_modified_at | default: doc.date | date_to_xmlschema }}</lastmod>
        {% endif %}
      </url>
    {% endfor %}
  {% endfor %}

  {% assign pages = site.html_pages | where_exp:'doc','doc.sitemap != false' | where_exp:'doc','doc.url != "/404.html"' %}
  {% for page in pages %}
    <url>
      <loc>{{ page.url | replace:'/index.html','/' | absolute_url | xml_escape }}</loc>
      {% if page.last_modified_at %}
        <lastmod>{{ page.last_modified_at | date_to_xmlschema }}</lastmod>
      {% endif %}
    </url>
  {% endfor %}

  {% assign static_files = page.static_files | where_exp:'page','page.sitemap != false' | where_exp:'page','page.name != "404.html"' %}
  {% for file in static_files %}
    <url>
      <loc>{{ file.path | replace:'/index.html','/' | absolute_url | xml_escape }}</loc>
      <lastmod>{{ file.modified_time | date_to_xmlschema }}</lastmod>
    </url>
  {% endfor %}
</urlset>
`;

/**
 * Sort comparator mirroring Jekyll's Document#<=> (document.rb): date
 * ascending, then relative-path tie-break. A doc with no resolvable date
 * compares equal on the date step (real Jekyll falls back to site.time for
 * all of them), so the path decides -- exactly like Ruby's
 * `data["date"] <=> other.data["date"]` returning nil and falling through
 * to the path comparison.
 */
function compareDocsByDateThenPath(dateOf) {
  return (a, b) => {
    const ta = dateOf(a);
    const tb = dateOf(b);
    if (ta !== null && tb !== null && ta !== tb) return ta - tb;
    const pa = a.path || '';
    const pb = b.path || '';
    return pa < pb ? -1 : pa > pb ? 1 : 0;
  };
}

const toTime = (v) => (v == null ? null : new Date(v).getTime());

// Posts: _date is exactly front-matter `date:` || filename date (no
// scan-time fallback is ever applied to posts) -- i.e. Jekyll's Document#date.
const comparePosts = compareDocsByDateThenPath((p) => toTime(p._date));

// Collection docs: mirror Document#date's front-matter -> filename fallback.
// _date carries an extra `new Date()` scan-time fallback which must NOT
// participate in ordering (real Jekyll falls back to site.time for ALL
// undated docs, i.e. they compare equal and the path tie-break decides).
function docFilenameDate(relPath) {
  const base = (relPath || '').split('/').pop() || '';
  const m = base.match(/^(\d{4})-(\d{1,2})-(\d{1,2})-/);
  return m ? new Date(`${m[1]}-${m[2]}-${m[3]}`) : null;
}
const compareDocs = compareDocsByDateThenPath(
  (d) => toTime(d.date ?? docFilenameDate(d._relPath || d.path))
);

// Real Jekyll: `site.pages.sort_by!(&:name)` (reader.rb #sort_files!) --
// pages iterate sorted by basename, not full path.
function comparePagesByName(a, b) {
  const na = (a.path || '').split('/').pop() || '';
  const nb = (b.path || '').split('/').pop() || '';
  return na < nb ? -1 : na > nb ? 1 : 0;
}

/**
 * Generate /sitemap.xml using the real gem's template.
 * @param {JekyllEngine} engine
 * @returns {Promise<{path, permalink, data, content}>}
 */
export async function generateSitemap(engine) {
  const siteCtx = engine._buildSiteContext().site;

  // FIX (oracle-found): the real template iterates site.collections (with
  // output != false), then site.html_pages, then page.static_files.
  // We provide these in the expected shape.

  // FIX (sitemap ordering parity): real Jekyll builds site.collections from
  // the config `collections:` keys IN ORDER, and `posts` is lazily appended
  // at the END via `collections["posts"] ||= Collection.new(self, "posts")`
  // (site.rb) -- unless the user listed posts in `collections:` themselves.
  // Within a collection, docs iterate in Document#<=> order (date ascending,
  // path tie-break), so posts are OLDEST-first here even though the
  // `site.posts` Liquid drop sorts newest-first.
  const collConfig = engine._collectionsConfig || {};
  const collections = [];
  const added = new Set();
  const pushCollection = (name) => {
    if (added.has(name)) return;
    added.add(name);
    const docs = engine._collections?.[name] || [];
    if (name === 'posts') {
      // Real Jekyll always exposes the posts collection with output=true.
      const postsColl = [...docs]
        .sort(comparePosts)
        .map((p) => ({
          url: p._permalink,
          date: p._date,
          sitemap: p.sitemap,
          last_modified_at: p.last_modified_at,
        }));
      collections.push({ docs: postsColl, output: true });
      return;
    }
    const cfg = collConfig[name];
    const collDocs = [...docs]
      .sort(compareDocs)
      .map((d) => ({
        url: d._permalink || d.url,
        date: d._date || d.date,
        sitemap: d.sitemap,
        last_modified_at: d.last_modified_at,
      }));
    collections.push({ docs: collDocs, output: cfg?.output === true });
  };
  for (const name of Object.keys(collConfig)) pushCollection(name);
  pushCollection('posts');

  // FIX (sitemap ordering parity): site.html_pages is the html-filtered page
  // list (the old code passed ALL pages, leaking e.g. /robots.txt into the
  // sitemap), sorted by basename like `site.pages.sort_by!(&:name)`.
  const htmlPages = [...(siteCtx.html_pages || [])].sort(comparePagesByName);

  const html = await engine.liquidEngine.parseAndRender(
    // FIX (oracle-found): real jekyll-sitemap minifies the template with
    // MINIFY_REGEX = /(?<=>\n|})\s+/ — strips whitespace after >\n or }.
    // Note: different from jekyll-feed's /(?<=>|})\s+/ (no \n requirement).
    SITEMAP_TEMPLATE.replace(/(?<=>\n|})\s+/g, ''),
    {
      site: {
        ...siteCtx,
        collections,
        html_pages: htmlPages,
      },
      page: {
        static_files: [],
      },
      jekyll: { version: '4.3.4' },
    }
  );

  return {
    path: 'sitemap.xml',
    permalink: '/sitemap.xml',
    data: {},
    content: html,
  };
}
