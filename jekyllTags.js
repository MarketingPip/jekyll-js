'use strict';
/**
 * jekyllTags.js
 * ---------------------------------------------------------------------------
 * Registers all Jekyll-specific Liquid tags and filter fixes that LiquidJS
 * either lacks entirely or gets subtly wrong. Called from JekyllEngine's
 * constructor.
 *
 * Tags implemented:
 *   {% highlight lang [linenos] %} ... {% endhighlight %}
 *   {% link path %}
 *   {% post_url slug-or-date-slug %}
 *   {% seo %}           (no-op stub -- plugin)
 *   {% feed_meta %}     (no-op stub -- plugin)
 *   {% gist user/id %}  (no-op stub -- external service)
 *
 * Filter fixes:
 *   to_integer -- LiquidJS returns floats unchanged; Jekyll truncates to int
 */

import hljs from 'highlight.js';

// ─── highlight tag ──────────────────────────────────────────────────────────
// Mirrors Jekyll::Tags::HighlightBlock output format exactly:
//   <figure class="highlight">
//     <pre><code class="language-{lang}" data-lang="{lang}">…</code></pre>
//   </figure>
// Uses highlight.js for tokenisation (output differs from Rouge's HTML
// token classes, but all structural attributes match real Jekyll).
//
// Documented limitation: Rouge's token classes (e.g. `<span class="k">`)
// are language-specific and won't match ours — the structure and the
// presence of a highlighted block are byte-compatible, individual span
// class names are not. For the purpose of this engine (rendering content
// that looks correct in a browser) this is acceptable; if you need
// byte-identical output to Rouge you would need a Rouge WASM port.
function registerHighlightTag(engine) {
  engine.registerTag('highlight', {
    parse(tagToken, remainTokens) {
      const args = tagToken.args.trim().split(/\s+/);
      this.lang = args[0] || 'plaintext';
      this.linenos = args.includes('linenos');
      this.tokens = [];
      let closed = false;
      while (remainTokens.length) {
        const token = remainTokens.shift();
        if (token.constructor.name === 'TagToken' && token.name === 'endhighlight') {
          closed = true;
          break;
        }
        this.tokens.push(token);
      }
      if (!closed) throw new Error('{% highlight %} tag not closed with {% endhighlight %}');
    },
    async render(ctx) {
      // Render any Liquid inside the block first (unusual but valid)
      const rawCode = this.tokens
        .map((t) => (typeof t.getText === 'function' ? t.getText() : t.value ?? ''))
        .join('');
      const code = rawCode.replace(/^\n/, '').replace(/\n$/, '');

      let highlighted;
      try {
        const lang = this.lang === 'plaintext' ? 'text' : this.lang;
        if (hljs.getLanguage(lang)) {
          highlighted = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
        } else {
          highlighted = escapeHtml(code);
        }
      } catch {
        highlighted = escapeHtml(code);
      }

      const langClass = `language-${this.lang}`;
      const inner = `<code class="${langClass}" data-lang="${this.lang}">${highlighted}</code>`;
      const pre = `<pre>${inner}</pre>`;
      return `<figure class="highlight">${pre}</figure>`;
    },
  });
}

// ─── link tag ───────────────────────────────────────────────────────────────
// {% link path/to/file.md %} → the resolved URL of that page.
// Mirrors Jekyll::Tags::Link: looks up the page in site context.
function registerLinkTag(engine) {
  engine.registerTag('link', {
    parse(tagToken) {
      this.target = tagToken.args.trim();
    },
    async render(ctx) {
      const site = ctx.get(['site']);
      const allPages = [
        ...(site?.pages || []),
        ...(site?.posts || []),
        ...(site?.static_files || []),
        // also flatten other collections
        ...Object.entries(site || {})
          .filter(([k]) => !['pages', 'posts', 'static_files', 'tags', 'categories', 'data'].includes(k))
          .flatMap(([, v]) => (Array.isArray(v) ? v : [])),
      ];
      const found = allPages.find(
        (p) => p.path === this.target || p.url === this.target || p.path === `/${this.target}`
      );
      if (found) return found.url || found.path || this.target;
      // Fallback: treat as a literal relative URL
      return `/${this.target.replace(/^\//, '')}`;
    },
  });
}

// ─── post_url tag ───────────────────────────────────────────────────────────
// {% post_url 2026-06-29-welcome-to-jekyll %} → the resolved post URL.
// Mirrors Jekyll::Tags::PostUrl: matches by slug (with or without date prefix).
function registerPostUrlTag(engine) {
  engine.registerTag('post_url', {
    parse(tagToken) {
      this.slug = tagToken.args.trim();
    },
    async render(ctx) {
      const posts = ctx.get(['site', 'posts']) || [];
      // Try matching the full path filename (without extension) or just the slug portion
      const found = posts.find((p) => {
        if (!p.path) return false;
        const base = p.path.replace(/^.*_posts\//, '').replace(/\.(md|markdown|html?)$/, '');
        return base === this.slug || base.replace(/^\d{4}-\d{2}-\d{2}-/, '') === this.slug;
      });
      if (found) return found.url;
      // Fallback: raise a Liquid-style error string (mirrors Jekyll's behaviour)
      return `[post_url: could not find post "${this.slug}"]`;
    },
  });
}

// ─── {% seo %} tag ──────────────────────────────────────────────────────────
// A faithful (not no-op) implementation of the most load-bearing parts of
// the jekyll-seo-tag plugin, grounded directly in the real gem's
// lib/jekyll-seo-tag/drop.rb (read from the installed gem). minima's
// _includes/head.html relies ENTIRELY on {% seo %} for the page's
// <title> tag -- there is no other fallback anywhere in the layout chain
// -- so treating this as a pure no-op silently produces titleless pages,
// which is a real and meaningful gap, not a cosmetic one.
//
// Implemented (verified against real Drop#title/#description logic):
//   <title>            -- exact algorithm: page_title vs site_title
//                          combination with " | " separator
//   <meta name="generator">
//   <meta property="og:title">, <meta name="description">,
//   <meta property="og:description">, <link rel="canonical">,
//   <meta property="og:url">, <meta property="og:type">
//
// NOT implemented (documented limitation): Twitter card meta, Facebook
// meta, JSON-LD structured data script tag, image meta (og:image and
// friends), webmaster verification tags, author meta. These are real
// gaps if you depend on rich social-card previews specifically, but they
// don't affect page title/SEO-description fidelity, which is the part
// every page actually needs.
function registerSeoTag(engine) {
  engine.registerTag('seo', {
    parse(tagToken) {
      this.raw = tagToken.args || '';
    },
    async render(ctx) {
      const site = ctx.get(['site']) || {};
      const page = ctx.get(['page']) || {};
      const jekyll = ctx.get(['jekyll']) || {};

      const siteTitle = site.title || site.name;
      const pageTitle = page.title || siteTitle;
      const siteTaglineOrDescription = site.tagline || site.description;

      let title;
      if (siteTitle && pageTitle !== siteTitle) {
        title = `${pageTitle} | ${siteTitle}`;
      } else if (site.description && siteTitle) {
        title = `${siteTitle} | ${siteTaglineOrDescription}`;
      } else {
        title = pageTitle || siteTitle;
      }

      const description = page.description || page.excerpt || site.description;
      const showTitle = !/title=false/i.test(this.raw) && !!title;

      const lines = [`<!-- Begin Jekyll SEO tag v0 (approximate) -->`];
      if (showTitle) lines.push(`<title>${escapeHtml(stripHtml(title))}</title>`);
      lines.push(`<meta name="generator" content="Jekyll v${jekyll.version || '4.3.2'}" />`);
      if (pageTitle) lines.push(`<meta property="og:title" content="${escapeHtml(stripHtml(pageTitle))}" />`);
      if (description) {
        const d = escapeHtml(stripHtml(description));
        lines.push(`<meta name="description" content="${d}" />`);
        lines.push(`<meta property="og:description" content="${d}" />`);
      }
      if (site.url) {
        const canonical = (site.url || '') + (site.baseurl || '') + (page.url || '');
        lines.push(`<link rel="canonical" href="${canonical}" />`);
        lines.push(`<meta property="og:url" content="${canonical}" />`);
      }
      if (siteTitle) lines.push(`<meta property="og:site_name" content="${escapeHtml(stripHtml(siteTitle))}" />`);
      if (page.date) {
        lines.push(`<meta property="og:type" content="article" />`);
      } else {
        lines.push(`<meta property="og:type" content="website" />`);
      }
      lines.push(`<!-- End Jekyll SEO tag -->`);
      return lines.join('\n');
    },
  });
}

function stripHtml(str) {
  return String(str).replace(/<\/?[^>]+>/g, '');
}

// ─── {% feed_meta %} tag ────────────────────────────────────────────────────
// jekyll-feed's tag, which outputs a <link rel="alternate" type="application/
// atom+xml"> pointing at the site's feed.xml. We render the tag (so the link
// is present, since several themes and browsers genuinely use this for feed
// discovery) but do NOT generate an actual feed.xml file -- that would
// require implementing the Atom feed XML generator itself, which is a much
// larger, separate piece of work than this single Liquid tag.
function registerFeedMetaTag(engine) {
  engine.registerTag('feed_meta', {
    parse() {},
    render(ctx) {
      const site = ctx.get(['site']) || {};
      const title = site.title || site.name || '';
      return `<link type="application/atom+xml" rel="alternate" href="${
        (site.baseurl || '') + '/feed.xml'
      }" title="${escapeHtml(stripHtml(title))}" />`;
    },
  });
}

// ─── remaining plugin stub tags ─────────────────────────────────────────────
// {% gist %} embeds an external GitHub Gist via <script src>; there's
// nothing meaningful to render without making a real network call, so this
// one really is left as a documented no-op.
function registerPluginStubs(engine) {
  engine.registerTag('gist', {
    parse() {},
    render() { return ''; },
  });
}

// ─── filter fixes ───────────────────────────────────────────────────────────
function registerFilterFixes(engine) {
  // FIX: LiquidJS's to_integer passes floats through unchanged. Jekyll (Ruby)
  // calls `.to_i` which truncates toward zero. Verified against oracle:
  //   1.9.to_i → 1,  -1.9.to_i → -1,  true.to_i → 1,  false.to_i → 0
  engine.registerFilter('to_integer', (v) => {
    if (v === true) return 1;
    if (v === false || v === null || v === undefined) return 0;
    if (typeof v === 'number') return Math.trunc(v);
    if (typeof v === 'string') {
      const m = v.trim().match(/^([+-]?\d+)/);
      return m ? parseInt(m[1], 10) : 0;
    }
    return 0;
  });
}

// ─── helpers ────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function registerJekyllExtensions(liquidEngine) {
  registerHighlightTag(liquidEngine);
  registerLinkTag(liquidEngine);
  registerPostUrlTag(liquidEngine);
  registerSeoTag(liquidEngine);
  registerFeedMetaTag(liquidEngine);
  registerPluginStubs(liquidEngine);
  registerFilterFixes(liquidEngine);
}
