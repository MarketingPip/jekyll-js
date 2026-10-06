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

import { TokenKind } from 'liquidjs';

// NOTE: highlight.js is NOT imported here. It is an optional plugin (~1.5MB
// for the full language build): the caller passes the highlighter into
// registerJekyllExtensions(). This keeps the core bundle tree-shakeable and
// lets browser builds lazy-load it only when the site uses {% highlight %}.

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
function registerHighlightTag(engine, highlighter) {
  engine.registerTag('highlight', {
    parse(tagToken, remainTokens) {
      const args = tagToken.args.trim().split(/\s+/);
      this.lang = args[0] || 'plaintext';
      this.linenos = args.includes('linenos');
      this.tokens = [];
      let closed = false;
      while (remainTokens.length) {
        const token = remainTokens.shift();
        // FIX (minification fragility): the old check used
        // token.constructor.name === 'TagToken', which breaks under
        // minified LiquidJS builds (the browser path this engine
        // documents). TokenKind.Tag is minification-safe.
        if (token.kind === TokenKind.Tag && token.name === 'endhighlight') {
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
        if (!highlighter) {
          throw new Error(
            `{% highlight %} used but no syntax highlighter was provided. ` +
              `Pass one via \`new JekyllEngine({ highlighter })\` — ` +
              `\`import hljs from 'highlight.js'\` in Node, or load ` +
              `dist/highlight-plugin.js (sets window.JekyllHighlight) in the browser.`
          );
        }
        const lang = this.lang === 'plaintext' ? 'text' : this.lang;
        if (highlighter.getLanguage(lang)) {
          highlighted = highlighter.highlight(code, { language: lang, ignoreIllegals: true }).value;
        } else {
          highlighted = escapeHtml(code);
        }
      } catch (err) {
        // A missing-highlighter error is honest: rethrow it. Anything else
        // (bad language grammar, etc.) degrades to escaped plain text.
        if (/no syntax highlighter was provided/.test(err.message)) throw err;
        highlighted = escapeHtml(code);
      }

      const langClass = `language-${this.lang}`;
      let inner;
      if (this.linenos) {
        // FIX (linenos parsed but ignored): mirror Rouge's linenos table
        // shape so themes' syntax stylesheets actually apply.
        const lineCount = highlighted.split('\n').length;
        const numbers = Array.from({ length: lineCount }, (_, i) => i + 1).join('\n');
        inner =
          `<code class="${langClass}" data-lang="${this.lang}">` +
          `<table class="rouge-table"><tbody><tr>` +
          `<td class="rouge-gutter gl"><pre class="lineno">${numbers}</pre></td>` +
          `<td class="rouge-code"><pre>${highlighted}</pre></td>` +
          `</tr></tbody></table></code>`;
      } else {
        inner = `<code class="${langClass}" data-lang="${this.lang}">${highlighted}</code>`;
      }
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
      // FIX (silent wrong URL): real Jekyll raises
      // "Could not find document 'x' in tag 'link'" and fails the build.
      // Returning a plausible-but-wrong URL hides broken links; loud wins.
      throw new Error(
        `Could not find document '${this.target}' in tag 'link'. ` +
          `Make sure the document exists and the path is correct.`
      );
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
      // FIX (silent wrong output): real Jekyll raises
      // 'Could not find post "x" in tag 'post_url'' and fails the build,
      // instead of emitting a literal error string into the page.
      throw new Error(`Could not find post "${this.slug}" in tag 'post_url'.`);
    },
  });
}

// ─── {% seo %} tag ──────────────────────────────────────────────────────────
// A faithful (not no-op) implementation of the most load-bearing parts of
// the jekyll-seo-tag plugin, grounded directly in the real gem's
// lib/jekyll-seo-tag/drop.rb and lib/template.html (read from the installed gem).
// minima's _includes/head.html relies ENTIRELY on {% seo %} for the page's
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
//   <meta property="og:site_name">
//   Twitter card meta (summary / summary_large_image)
//   og:image, og:image:width, og:image:height, og:image:alt
//   JSON-LD structured data script tag
//   Author meta
//   Webmaster verification tags (google, bing, alexa, yandex, baidu, facebook)
//   Facebook meta (admins, publisher, app_id)
//
// The implementation mirrors the real jekyll-seo-tag 2.8.0 template.html
// and the Drop class logic from drop.rb, author_drop.rb, image_drop.rb,
// json_ld_drop.rb, and url_helper.rb.
function registerSeoTag(engine) {
  engine.registerTag('seo', {
    parse(tagToken) {
      this.raw = tagToken.args || '';
    },
    async render(ctx) {
      const site = ctx.get(['site']) || {};
      const page = ctx.get(['page']) || {};
      const jekyll = ctx.get(['jekyll']) || {};
      const paginator = ctx.get(['paginator']) || null;

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

      // Image handling (mirrors ImageDrop logic)
      let imagePath = null;
      let imageWidth = null;
      let imageHeight = null;
      let imageAlt = null;
      if (page.image) {
        if (typeof page.image === 'string') {
          imagePath = page.image;
        } else if (typeof page.image === 'object') {
          imagePath = page.image.path || page.image.facebook || page.image.twitter;
          imageWidth = page.image.width;
          imageHeight = page.image.height;
          imageAlt = page.image.alt;
        }
      }

      // Author handling (mirrors AuthorDrop logic)
      let authorName = null;
      let authorTwitter = null;
      if (page.author) {
        if (typeof page.author === 'string') {
          authorName = page.author;
        } else if (typeof page.author === 'object') {
          authorName = page.author.name;
          authorTwitter = page.author.twitter;
        }
      } else if (site.author) {
        if (typeof site.author === 'string') {
          authorName = site.author;
        } else if (typeof site.author === 'object') {
          authorName = site.author.name;
          authorTwitter = site.author.twitter;
        }
      }

      // JSON-LD generation (mirrors JSONLDDrop logic)
      function buildJsonLd() {
        // FIX (oracle-found): Field order and values must match the real
        // jekyll-seo-tag 2.8.0 gem exactly. For WebSite type:
        // - order: @context, @type, description, headline, name, url
        // - name is the SITE title, not page title
        const jsonLd = {
          '@context': 'https://schema.org',
        };

        // @type
        let type = 'WebPage';
        if (page.date) {
          type = 'BlogPosting';
        } else if (page.url && (page.url === '/' || page.url === '/index.html' || page.url === '/about/' || page.url === '/about.html')) {
          type = 'WebSite';
        }
        jsonLd['@type'] = type;

        // description (before headline/name, per real gem)
        if (description) jsonLd.description = description;

        // headline (page title)
        if (pageTitle) jsonLd.headline = pageTitle;

        // name: site title for WebSite, page title otherwise
        if (type === 'WebSite') {
          if (site.title) jsonLd.name = site.title;
        } else if (pageTitle) {
          jsonLd.name = pageTitle;
        }

        // url (canonical)
        if (site.url) {
          const canonical = (site.url || '') + (site.baseurl || '') + (page.url || '');
          jsonLd.url = canonical;
        }

        // datePublished / dateModified
        if (page.date) {
          const datePublished = new Date(page.date).toISOString();
          jsonLd.datePublished = datePublished;
        }

        // author
        if (authorName) {
          jsonLd.author = {
            '@type': 'Person',
            name: authorName,
          };
        }

        // image
        if (imagePath) {
          jsonLd.image = imagePath;
        }

        // publisher (if logo)
        if (site.logo) {
          jsonLd.publisher = {
            '@type': 'Organization',
            logo: {
              '@type': 'ImageObject',
              url: site.logo,
            },
          };
          if (authorName) jsonLd.publisher.name = authorName;
        }

        // mainEntityOfPage
        if (type === 'BlogPosting' || type === 'CreativeWork') {
          jsonLd.mainEntityOfPage = {
            '@type': 'WebPage',
            '@id': jsonLd.url,
          };
        }

        // sameAs (links)
        const links = (site.social && site.social.links) || [];
        if (links.length > 0) {
          jsonLd.sameAs = links;
        }

        return jsonLd;
      }

      const jsonLd = buildJsonLd();
      const jsonLdString = JSON.stringify(jsonLd, null, 0);

      // FIX (oracle-found): SEO tag version is the gem version (2.8.0),
      // not the Jekyll version. The real gem hardcodes this.
      const lines = [`<!-- Begin Jekyll SEO tag v2.8.0 -->`];

      // Title
      if (showTitle) lines.push(`<title>${escapeHtml(stripHtml(title))}</title>`);

      // Generator
      lines.push(`<meta name="generator" content="Jekyll v${jekyll.version || '4.3.4'}" />`);

      // og:title
      if (pageTitle) lines.push(`<meta property="og:title" content="${escapeHtml(stripHtml(pageTitle))}" />`);

      // Author name meta
      if (authorName) lines.push(`<meta name="author" content="${escapeHtml(stripHtml(authorName))}" />`);

      // og:locale
      const pageLang = page.lang || site.lang || 'en_US';
      const pageLocale = (page.locale || site.locale || pageLang).replace('-', '_');
      lines.push(`<meta property="og:locale" content="${pageLocale}" />`);

      // Description
      if (description) {
        const d = escapeHtml(stripHtml(description));
        lines.push(`<meta name="description" content="${d}" />`);
        lines.push(`<meta property="og:description" content="${d}" />`);
      }

      // Canonical URL and og:url
      if (site.url) {
        const canonical = (site.url || '') + (site.baseurl || '') + (page.url || '');
        lines.push(`<link rel="canonical" href="${canonical}" />`);
        lines.push(`<meta property="og:url" content="${canonical}" />`);
      }

      // og:site_name
      if (siteTitle) lines.push(`<meta property="og:site_name" content="${escapeHtml(stripHtml(siteTitle))}" />`);

      // og:type
      if (page.date) {
        lines.push(`<meta property="og:type" content="article" />`);
        const datePublished = new Date(page.date).toISOString();
        lines.push(`<meta property="article:published_time" content="${datePublished}" />`);
      } else {
        lines.push(`<meta property="og:type" content="website" />`);
      }

      // Pagination prev/next
      if (paginator) {
        if (paginator.previous_page) {
          const prevUrl = (site.url || '') + (site.baseurl || '') + (paginator.previous_page_path || '');
          lines.push(`<link rel="prev" href="${prevUrl}" />`);
        }
        if (paginator.next_page) {
          const nextUrl = (site.url || '') + (site.baseurl || '') + (paginator.next_page_path || '');
          lines.push(`<link rel="next" href="${nextUrl}" />`);
        }
      }

      // Image meta
      if (imagePath) {
        lines.push(`<meta property="og:image" content="${escapeHtml(imagePath)}" />`);
        if (imageHeight) lines.push(`<meta property="og:image:height" content="${imageHeight}" />`);
        if (imageWidth) lines.push(`<meta property="og:image:width" content="${imageWidth}" />`);
        if (imageAlt) lines.push(`<meta property="og:image:alt" content="${escapeHtml(stripHtml(imageAlt))}" />`);
      }

      // Twitter cards
      if (imagePath) {
        const twitterCard = page.twitter?.card || site.twitter?.card || 'summary_large_image';
        lines.push(`<meta name="twitter:card" content="${twitterCard}" />`);
        lines.push(`<meta property="twitter:image" content="${escapeHtml(imagePath)}" />`);
      } else {
        lines.push(`<meta name="twitter:card" content="summary" />`);
      }
      if (imageAlt) lines.push(`<meta name="twitter:image:alt" content="${escapeHtml(stripHtml(imageAlt))}" />`);
      if (pageTitle) lines.push(`<meta property="twitter:title" content="${escapeHtml(stripHtml(pageTitle))}" />`);

      // Twitter site/creator
      if (site.twitter?.username) {
        const twitterSite = site.twitter.username.replace('@', '');
        lines.push(`<meta name="twitter:site" content="@${twitterSite}" />`);
      }
      if (authorTwitter) {
        const twitterCreator = authorTwitter.replace('@', '');
        lines.push(`<meta name="twitter:creator" content="@${twitterCreator}" />`);
      }

      // Facebook meta
      if (site.facebook) {
        if (site.facebook.admins) lines.push(`<meta property="fb:admins" content="${site.facebook.admins}" />`);
        if (site.facebook.publisher) lines.push(`<meta property="article:publisher" content="${site.facebook.publisher}" />`);
        if (site.facebook.app_id) lines.push(`<meta property="fb:app_id" content="${site.facebook.app_id}" />`);
      }

      // Webmaster verifications
      const webmaster = site.webmaster_verifications || {};
      if (webmaster.google) lines.push(`<meta name="google-site-verification" content="${webmaster.google}" />`);
      if (webmaster.bing) lines.push(`<meta name="msvalidate.01" content="${webmaster.bing}" />`);
      if (webmaster.alexa) lines.push(`<meta name="alexaVerifyID" content="${webmaster.alexa}" />`);
      if (webmaster.yandex) lines.push(`<meta name="yandex-verification" content="${webmaster.yandex}" />`);
      if (webmaster.baidu) lines.push(`<meta name="baidu-site-verification" content="${webmaster.baidu}" />`);
      if (webmaster.facebook) lines.push(`<meta name="facebook-domain-verification" content="${webmaster.facebook}" />`);
      // Legacy google_site_verification
      else if (site.google_site_verification) {
        lines.push(`<meta name="google-site-verification" content="${site.google_site_verification}" />`);
      }

      // JSON-LD structured data
      // FIX (oracle-found): real gem outputs compact JSON on one line,
      // with </script> on the same line as the JSON.
      lines.push(`<script type="application/ld+json">`);
      lines.push(`${jsonLdString}</script>`);

      lines.push(`<!-- End Jekyll SEO tag -->`);
      // FIX (oracle-found): real gem's output ends with a newline,
      // so </head> starts on a new line.
      return lines.join('\n') + '\n';
    },
  });
}

function stripHtml(str) {
  return String(str).replace(/<\/?[^>]+>/g, '');
}

// ─── {% feed_meta %} tag ────────────────────────────────────────────────────
// jekyll-feed's tag, which outputs a <link rel="alternate" type="application/
// atom+xml"> pointing at the site's feed.xml (absolute URL, matching the
// real gem's meta-tag.rb). The feed itself is generated by the native
// jekyll-feed generator (jekyllFeed.js) when `plugins: [jekyll-feed]` is set.
function registerFeedMetaTag(engine) {
  engine.registerTag('feed_meta', {
    parse() {},
    render(ctx) {
      const site = ctx.get(['site']) || {};
      const title = site.title || site.name || '';
      const url = (site.url || '').replace(/\/$/, '') + (site.baseurl || '') + '/feed.xml';
      return `<link type="application/atom+xml" rel="alternate" href="${url}" title="${escapeHtml(stripHtml(title))}" />`;
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

  // Core Jekyll filters needed by the real jekyll-feed template (and useful
  // generally). Grounded in jekyll/lib/jekyll/filters.rb.
  engine.registerFilter('xml_escape', (input) => {
    if (input == null) return '';
    return String(input)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  });

  engine.registerFilter('smartify', (input) => {
    if (input == null) return '';
    return String(input)
      .replace(/---/g, '\u2014')
      .replace(/--/g, '\u2013')
      .replace(/\.\.\./g, '\u2026')
      .replace(/"([^"]*)"/g, '\u201c$1\u201d')
      .replace(/'([^']*)'/g, '\u2018$1\u2019');
  });

  engine.registerFilter('normalize_whitespace', (input) => {
    if (input == null) return '';
    return String(input).replace(/\s+/g, ' ').trim();
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

export function registerJekyllExtensions(liquidEngine, opts = {}) {
  registerHighlightTag(liquidEngine, opts.highlighter);
  registerLinkTag(liquidEngine);
  registerPostUrlTag(liquidEngine);
  registerSeoTag(liquidEngine);
  registerFeedMetaTag(liquidEngine);
  registerPluginStubs(liquidEngine);
  registerFilterFixes(liquidEngine);
}
