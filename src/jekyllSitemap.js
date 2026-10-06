/**
 * jekyllSitemap.js — native jekyll-sitemap generator (no Ruby/Opal required).
 *
 * Implements the sitemap generation of the real jekyll-sitemap plugin (v1.4.0).
 * Opt-in via `_config.yml`:
 *
 *   plugins:
 *     - jekyll-sitemap
 *
 * Generates `/sitemap.xml` listing all HTML pages, posts, and collection docs.
 * Respects `sitemap: false` front matter to exclude specific pages.
 */
export function isSitemapEnabled(config) {
  const plugins = config?.plugins || config?.gems || [];
  const list = Array.isArray(plugins) ? plugins : [plugins];
  return list.some((p) => p === 'jekyll-sitemap' || p === 'jekyll_sitemap');
}

export async function generateSitemap(engine) {
  const config = engine._config;
  const baseUrl = (config.url || '').replace(/\/$/, '');
  const ctx = engine._buildSiteContext();
  const site = ctx.site;

  const urls = [];

  // Pages (excluding those with sitemap: false)
  for (const page of site.pages || []) {
    if (page.sitemap === false) continue;
    const url = page.url;
    if (!url) continue;
    urls.push({
      loc: baseUrl + url,
      lastmod: page.date ? new Date(page.date).toISOString().split('T')[0] : undefined,
    });
  }

  // Posts
  for (const post of site.posts || []) {
    if (post.sitemap === false) continue;
    urls.push({
      loc: baseUrl + post.url,
      lastmod: post.date ? new Date(post.date).toISOString().split('T')[0] : undefined,
    });
  }

  // Collection docs (output:true only)
  for (const [name, docs] of Object.entries(site.collections || {})) {
    if (name === 'posts') continue;
    for (const doc of docs || []) {
      if (doc.sitemap === false) continue;
      if (!doc.url) continue;
      urls.push({
        loc: baseUrl + doc.url,
        lastmod: doc.date ? new Date(doc.date).toISOString().split('T')[0] : undefined,
      });
    }
  }

  const urlEntries = urls
    .map((u) => {
      const lastmod = u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : '';
      return `  <url>\n    <loc>${u.loc}</loc>${lastmod}\n  </url>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlEntries}\n</urlset>`;

  return {
    path: 'sitemap.xml',
    permalink: '/sitemap.xml',
    data: {},
    content: xml,
  };
}
