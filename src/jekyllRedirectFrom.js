/**
 * jekyll-redirect-from.js — JS port of the jekyll-redirect-from Ruby plugin (v0.16.0).
 *
 * Original: https://github.com/jekyll/jekyll-redirect-from
 * (MIT license, (c) Jekyll contributors)
 *
 * Generates redirect pages for `redirect_from` front matter and handles
 * `redirect_to` front matter, matching the Ruby plugin's behavior.
 *
 * Usage in _config.yml:
 *   plugins:
 *     - jekyll-redirect-from
 *
 * Or programmatically:
 *   import { redirectFromPlugin } from './jekyllRedirectFrom.js';
 *   engine.use(redirectFromPlugin);
 */

const REDIRECT_TEMPLATE = `<!DOCTYPE html>
<html lang="en-US">
  <meta charset="utf-8">
  <title>Redirecting&hellip;</title>
  <link rel="canonical" href="{{ page.redirect.to }}">
  <script>location="{{ page.redirect.to }}"</script>
  <meta http-equiv="refresh" content="0; url={{ page.redirect.to }}">
  <meta name="robots" content="noindex">
  <h1>Redirecting&hellip;</h1>
  <a href="{{ page.redirect.to }}">Click here if you are not redirected.</a>
</html>
`;

function redirectHtml(to) {
  // Render the template with the redirect target
  // (matches Ruby plugin's redirect.html layout output)
  return REDIRECT_TEMPLATE.replace(/\{\{\s*page\.redirect\.to\s*\}\}/g, to);
}

export function redirectFromPlugin(engine) {
  // Use the event listener API (on), not registerHook (which is for Jekyll-style hooks)
  engine.on('post:build', async (results) => {
    // The post:build event receives the results array directly
    const pages = Array.isArray(results) ? results : (results.pages || []);
    const redirects = [];
    const newPages = [];

    // Collect all pages and docs (posts + collection docs)
    const allDocs = [...(pages || [])];

    // Also check site.posts and collections for redirect_from/to
    // (pages array should already include rendered posts, but be safe)
    for (const page of allDocs) {
      const data = page.data || {};

      // Handle redirect_from: generate redirect pages
      const redirectFrom = data.redirect_from;
      if (redirectFrom) {
        const paths = Array.isArray(redirectFrom) ? redirectFrom : [redirectFrom];
        for (const fromPath of paths) {
          // Normalize path: ensure leading slash, no trailing .html handling
          // (Ruby plugin uses the path as-is for the page URL)
          let url = String(fromPath);
          if (!url.startsWith('/')) url = '/' + url;

          // The redirect target is the page's own URL
          const to = page.permalink || page.url || '/';

          newPages.push({
            path: `redirect-${Date.now()}-${Math.random().toString(36).slice(2)}.html`,
            permalink: url,
            data: {
              sitemap: false,
              layout: null,
              redirect: { from: url, to },
            },
            content: redirectHtml(to),
          });
          redirects.push({ from: url, to });
        }
      }

      // Handle redirect_to: make this page a redirect
      const redirectTo = data.redirect_to;
      if (redirectTo) {
        const to = String(redirectTo);
        // Replace the page content with redirect HTML
        page.content = redirectHtml(to);
        // Update data
        page.data = page.data || {};
        page.data.sitemap = false;
        redirects.push({ from: page.permalink || page.url, to });
      }
    }

    // Add new redirect pages
    for (const p of newPages) {
      pages.push(p);
    }

    // Generate redirects.json if configured (default: true)
    // Ruby plugin: site.config.dig("redirect_from", "json") != false
    const config = engine._config || {};
    const redirectConfig = config.redirect_from || {};
    if (redirectConfig.json !== false) {
      const jsonMap = {};
      for (const r of redirects) {
        jsonMap[r.from] = r.to;
      }
      // Only generate if not already exists and we have redirects
      const hasJson = pages.some(p => p.permalink === '/redirects.json');
      if (!hasJson && Object.keys(jsonMap).length > 0) {
        pages.push({
          path: 'redirects.json',
          permalink: '/redirects.json',
          data: { sitemap: false, layout: null },
          content: JSON.stringify(jsonMap),
        });
      }
    }
  });
}

export default redirectFromPlugin;
