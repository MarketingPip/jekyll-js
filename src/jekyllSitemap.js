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
 * Generate /sitemap.xml using the real gem's template.
 * @param {JekyllEngine} engine
 * @returns {Promise<{path, permalink, data, content}>}
 */
export async function generateSitemap(engine) {
  const siteCtx = engine._buildSiteContext().site;

  // FIX (oracle-found): the real template iterates site.collections (with
  // output != false), then site.html_pages, then page.static_files.
  // We provide these in the expected shape.

  // Build collections array. Posts come first (real Jekyll orders them so).
  const collections = [];
  const postsColl = (engine._collections?.posts || []).map((p) => ({
    url: p._permalink,
    date: p._date,
    sitemap: p.sitemap,
    last_modified_at: p.last_modified_at,
  }));
  // Real Jekyll always has a posts collection entry
  collections.push({ docs: postsColl, output: true });

  // Other output:true collections
  for (const [name, docs] of Object.entries(engine._collections || {})) {
    if (name === 'posts') continue;
    const collConfig = engine._config?.collections?.[name];
    if (collConfig?.output !== true) continue;
    collections.push({
      docs: (docs || []).map((d) => ({
        url: d._permalink || d.url,
        date: d._date || d.date,
        sitemap: d.sitemap,
        last_modified_at: d.last_modified_at,
      })),
      output: true,
    });
  }

  const html = await engine.renderTemplate(
    // FIX (oracle-found): real jekyll-sitemap minifies the template with
    // MINIFY_REGEX = /(?<=>\n|})\s+/ — strips whitespace after >\n or }.
    // Note: different from jekyll-feed's /(?<=>|})\s+/ (no \n requirement).
    SITEMAP_TEMPLATE.replace(/(?<=>\n|})\s+/g, ''),
    {
      site: {
        ...siteCtx,
        collections,
        html_pages: siteCtx.pages || [],
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
