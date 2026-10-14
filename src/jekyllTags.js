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

import { TokenKind, Context } from 'liquidjs';
import { patchBlankBlockSkipping } from './liquidBlankBlocks.js';
import { SEO_TAG_TEMPLATE } from './seoTagTemplate.js';
import { compileSassString } from './assetsPipeline.js';

// ─── Ruby Liquid string-indexing parity ─────────────────────────────────────
// Ruby Liquid (variable_lookup.rb): a String does not respond to `key?` or
// `fetch`, so `"str"[0]` is nil. LiquidJS does JS string indexing
// (`"str"[0]` → `"s"`), which is truthy. This breaks
// `{% if imginfo[0] %}` guards on string values (beautiful-jekyll header).
const _liquidReadProperty = Context.prototype.readProperty;
Context.prototype.readProperty = function (obj, key) {
  if (typeof obj === 'string') {
    if (typeof key === 'number' || (typeof key === 'string' && /^-?\d+$/.test(key))) {
      return undefined;
    }
  }
  return _liquidReadProperty.call(this, obj, key);
};

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
      // FIX (nested-block parity): Ruby Liquid's BlockBody#parse parses
      // nested blocks of the SAME name recursively, and Raw/Comment blocks
      // opaquely (their inner tags are raw text, never parsed). Mirror
      // that so `{% raw %}{% highlight x %}...{% endhighlight %}{% endraw %}`
      // inside a highlight body doesn't terminate the outer block early
      // (just-the-docs line-numbers.md) and nested {% highlight %} nests.
      let depth = 1;
      const shiftOpaque = (endName) => {
        while (remainTokens.length) {
          const t = remainTokens.shift();
          this.tokens.push(t);
          if (t.kind === TokenKind.Tag && t.name === endName) return;
        }
      };
      while (remainTokens.length) {
        const token = remainTokens.shift();
        // FIX (minification fragility): the old check used
        // token.constructor.name === 'TagToken', which breaks under
        // minified LiquidJS builds (the browser path this engine
        // documents). TokenKind.Tag is minification-safe.
        if (token.kind === TokenKind.Tag) {
          if (token.name === 'highlight') depth++;
          else if (token.name === 'endhighlight') {
            depth--;
            if (depth === 0) {
              closed = true;
              break;
            }
          } else if (token.name === 'raw') {
            this.tokens.push(token);
            shiftOpaque('endraw');
            continue;
          } else if (token.name === 'comment') {
            this.tokens.push(token);
            shiftOpaque('endcomment');
            continue;
          }
        }
        this.tokens.push(token);
      }
      if (!closed) throw new Error('{% highlight %} tag not closed with {% endhighlight %}');
    },
    async render(ctx) {
      // FIX (Highlight#render parity): Jekyll::Tags::Highlight#render calls
      // `super` — the block body is rendered through Liquid FIRST (so
      // {% raw %} is consumed and {{ variables }} resolve), and only the
      // rendered text is syntax-highlighted.
      const rawBody = this.tokens
        .map((t) => (typeof t.getText === 'function' ? t.getText() : t.value ?? ''))
        .join('');
      const renderedBody = await this.liquid.parseAndRender(rawBody, ctx.getAll());
      // Jekyll::Tags::Highlight#render: strips ALL leading/trailing \r and \n.
      const code = renderedBody.replace(/^[\r\n]+/, '').replace(/[\r\n]+$/, '');

      if (!highlighter || typeof highlighter.highlight !== 'function') {
        throw new Error(
          `{% highlight %} used but no syntax highlighter was provided. ` +
            `Pass one via \`new JekyllEngine({ highlighter })\` — ` +
            `e.g. \`import rougeAdapter from 'jekyll-js/adapters/highlight-rouge'\`.`
        );
      }
      let highlighted;
      try {
        // Rouge-compat adapter: highlight(code, lang) returns inner HTML;
        // supports(lang) gates the language. (Jekyll 4.3.4 highlight.rb
        // render_rouge: Lexer.find_fancy(@lang, code) || PlainText.)
        //
        // FIX (raw-hljs call convention): the engine documents raw
        // highlight.js (`import hljs from 'highlight.js'`) as the
        // highlighter, but hljs v11's highlight(code, options) reads a
        // STRING second arg as the deprecated v10 (lang, code) signature —
        // so highlight(code, lang) highlights nothing (and warns). Detect
        // raw hljs by its getLanguage() (adapters don't have it) and call
        // highlight(code, { language }) instead.
        const isRawHljs =
          typeof highlighter.getLanguage === 'function' &&
          typeof highlighter.supports !== 'function';
        let supported;
        let hljsLang = null;
        if (typeof highlighter.supports === 'function') {
          supported = highlighter.supports(this.lang);
        } else if (isRawHljs) {
          hljsLang = highlighter.getLanguage(this.lang)
            ? this.lang
            : highlighter.getLanguage(this.lang.toLowerCase())
              ? this.lang.toLowerCase()
              : null;
          supported = hljsLang !== null;
        } else {
          supported = true;
        }
        if (supported) {
          highlighted = isRawHljs
            ? highlighter.highlight(code, { language: hljsLang }).value
            : await highlighter.highlight(code, this.lang);
        }
        if (highlighted == null) highlighted = escapeRougeText(code);
      } catch (err) {
        highlighted = escapeRougeText(code);
      }
      // Jekyll::Tags::Highlight#add_code_tag: "#{code.chomp}" — one trailing
      // line break removed from the FINAL output. For non-linenos that's the
      // highlighted code; for linenos, Rouge's HTMLTable ensures the code
      // cell ends with \n (and gutter numbers end with \n).
      let highlightedStr = String(highlighted);
      if (!this.linenos) {
        highlightedStr = highlightedStr.replace(/(\r\n|\n|\r)$/, '');
      } else if (!/(\r\n|\n|\r)$/.test(highlightedStr)) {
        highlightedStr += '\n';
      }
      highlighted = highlightedStr;

      // Jekyll: "language-#{@lang.to_s.tr("+", "-")}" (e.g. c++ → c--).
      const langClass = `language-${this.lang.replace(/\+/g, '-')}`;
      let inner;
      if (this.linenos) {
        // Jekyll 4.3.4 highlight.rb passes gutter_class: "gutter",
        // code_class: "code" to Rouge's HTMLTable (plus hardcoded "gl").
        // Rouge's HTMLTable: numbers are "1\n2\n...\n" (trailing newline).
        const lineCount = code.split('\n').length;
        const numbers = Array.from({ length: lineCount }, (_, i) => i + 1).join('\n') + '\n';
        inner =
          `<code class="${langClass}" data-lang="${this.lang}">` +
          `<table class="rouge-table"><tbody><tr>` +
          `<td class="gutter gl"><pre class="lineno">${numbers}</pre></td>` +
          `<td class="code"><pre>${highlighted}</pre></td>` +
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
// Faithful jekyll-seo-tag 2.9.1 port: renders the gem's own lib/template.html
// (vendored in ./seoTagTemplate.js, minified with the gem's MINIFY_REGEX)
// through LiquidJS, driven by a drop implementing the gem's Drop (drop.rb),
// AuthorDrop (author_drop.rb), ImageDrop (image_drop.rb) and JSONLDDrop
// (json_ld_drop.rb). Grounded in the installed jekyll-seo-tag-2.9.1 gem.
//
// 2.8.0 -> 2.9.1 deltas covered (all oracle-verified):
// - version v2.9.1; title=false / canonical=false text switches
// - description: format_string (markdownify/strip_html/normalize_whitespace/
//   escape_once) + snippet() truncation to seo_description_max_words (100)
// - name: page seo[name], else homepage social.name, else site title
// - date_modified (page seo[date_modified] || last_modified_at || date)
//   and the article:modified_time meta tag
// - dates via date_to_xmlschema (site.timezone), never toISOString
// - canonical/og:url emitted whenever site.url is not nil ("" counts --
//   Ruby Liquid truthiness, not JS truthiness)
// - JSON-LD keys sorted alphabetically (JSONLDDrop#to_json sorts)
// - twitter:creator nested inside the site.twitter guard
// - seo_json_escape on the JSON-LD payload

// jekyll-seo-tag 2.9.1 format_string helpers (drop.rb FORMAT_STRING_METHODS:
// markdownify, strip_html, normalize_whitespace, escape_once)
function seoStripHtml(s) {
  return String(s ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/?[^>]+>/g, '');
}
function seoNormalizeWhitespace(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}
function seoEscapeOnce(s) {
  return String(s ?? '')
    .replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]+|#[0-9]+|#x[0-9a-fA-F]+);)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
// drop.rb #snippet: first maxWords whitespace-separated words + "…" if cut
function seoSnippet(s, maxWords) {
  if (s == null) return s;
  const str = String(s);
  const words = str.split(/\s+/);
  if (words.length <= maxWords) return str;
  return words.slice(0, maxWords).join(' ') + '…';
}
// json_filters.rb JSON_ESCAPE
const SEO_JSON_ESCAPES = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};
function seoJsonEscape(s) {
  return String(s ?? '').replace(/[<>&\u2028\u2029]/g, (c) => SEO_JSON_ESCAPES[c]);
}
function seoIsAbsoluteUrl(s) {
  return /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(String(s || ''));
}
// Jekyll's URI escape for image/logo paths (conservative: encodeURI leaves
// ;,/?:@&=+$,# unescaped, matching Addressable for typical asset paths)
function seoUriEscape(s) {
  return encodeURI(String(s ?? '')).replace(/#/g, '%23');
}

function registerSeoTag(engine, opts = {}) {
  const markdownify = opts.markdownify || ((s) => String(s ?? ''));
  const dateToXmlschema = opts.dateToXmlschema || ((s) => String(s ?? ''));
  const absoluteUrl = opts.absoluteUrl || ((u) => String(u ?? ''));
  // drop.rb #format_string
  const formatString = (s) => {
    if (s == null) return null;
    const out = seoEscapeOnce(seoNormalizeWhitespace(seoStripHtml(markdownify(String(s)))));
    return out === '' ? null : out;
  };

  engine.registerTag('seo', {
    parse(tagToken) {
      this.raw = tagToken.args || '';
    },
    async render(ctx) {
      const site = ctx.get(['site']) || {};
      const page = ctx.get(['page']) || {};
      const jekyll = ctx.get(['jekyll']) || {};
      const paginator = ctx.get(['paginator']) || null;

      const pageSeo = page.seo && typeof page.seo === 'object' ? page.seo : {};
      const siteSocial =
        site.social && typeof site.social === 'object' ? site.social : {};
      const homepageOrAbout = /^\/(about\/)?(index\.html?)?$/.test(page.url || '');

      const siteTitle = formatString(site.title || site.name);
      const siteDescription = formatString(site.description);
      const siteTagline = formatString(site.tagline);

      // Drop#page_title (with title_category support)
      let pageTitle;
      {
        const t = formatString(page.title);
        const tc = formatString(page.title_category);
        pageTitle = t && tc && t !== tc ? `${t} | ${tc}` : t || tc || siteTitle;
      }

      // Drop#title (with paginator page_number prefix)
      let title;
      if (siteTitle && pageTitle !== siteTitle) {
        title = `${pageTitle} | ${siteTitle}`;
      } else if (siteDescription && siteTitle) {
        title = `${siteTitle} | ${siteTagline || siteDescription}`;
      } else {
        title = pageTitle || siteTitle;
      }
      if (paginator && paginator.page > 1 && title) {
        const msg = site.seo_paginator_message || 'Page %<current>s of %<total>s for ';
        title =
          msg
            .replace('%<current>s', String(paginator.page))
            .replace('%<total>s', String(paginator.total_pages)) + title;
      }

      // AuthorDrop (author_drop.rb): page.author, page.authors.first,
      // site.author; a string author merges site.data.authors metadata.
      const authorDrop = { name: null, twitter: null };
      {
        const authorsArray = Array.isArray(page.authors) ? page.authors[0] : undefined;
        const resolved = [page.author, authorsArray, site.author].find(
          (a) => a !== undefined && a !== null && String(a) !== ''
        );
        let hash = {};
        if (resolved && typeof resolved === 'object') {
          hash = resolved;
        } else if (typeof resolved === 'string') {
          hash = { name: resolved };
          const dataAuthors = site.data && site.data.authors;
          if (dataAuthors && typeof dataAuthors === 'object') {
            const meta = dataAuthors[resolved];
            if (meta && typeof meta === 'object') hash = { ...hash, ...meta };
          }
        }
        if (hash.name) {
          authorDrop.name = String(hash.name);
          const tw = hash.twitter || hash.name;
          authorDrop.twitter =
            typeof tw === 'string' && tw !== '' ? tw.replace(/^@/, '') : null;
          if (hash.type) authorDrop.type = hash.type;
          if (hash.url) authorDrop.url = hash.url;
        }
      }

      // Drop#description: format_string(page.description || page.excerpt) ||
      // site_description, truncated to seo_description_max_words (100)
      const description = seoSnippet(
        formatString(page.description || page.excerpt) || siteDescription,
        page.seo_description_max_words || 100
      );

      // Drop#name: seo_name, else homepage social.name, else site title
      const seoName = pageSeo.name ? formatString(pageSeo.name) : null;
      const name =
        seoName ||
        (!homepageOrAbout
          ? null
          : siteSocial.name
            ? formatString(siteSocial.name)
            : siteTitle);

      // Drop#canonical_url
      const canonicalUrl =
        page.canonical_url && String(page.canonical_url) !== ''
          ? page.canonical_url
          : absoluteUrl(page.url || '').replace(/\/index\.html$/, '/');

      // ImageDrop (image_drop.rb): {"path" => nil}.merge!(image_meta) for a
      // hash (ALL keys preserved), {"path" => image_meta} for a string.
      let imageDrop = null;
      {
        const meta = page.image;
        let imageHash;
        if (meta && typeof meta === 'object') imageHash = { path: null, ...meta };
        else if (typeof meta === 'string') imageHash = { path: meta };
        else imageHash = { path: null };
        const rawPath = imageHash.path || imageHash.facebook || imageHash.twitter;
        if (rawPath) {
          const absPath = seoIsAbsoluteUrl(rawPath)
            ? rawPath
            : absoluteUrl(rawPath);
          // Preserve every image_meta key (lqip, height, width, alt, ...),
          // replacing path with the absolute URI-escaped URL.
          imageDrop = { ...imageHash, path: seoUriEscape(absPath) };
        }
      }

      // Drop#date_published / #date_modified (formatted via date_to_xmlschema;
      // the template re-applies the filter, which is idempotent)
      const datePublished = page.date ? dateToXmlschema(page.date) || null : null;
      const dateModifiedRaw = pageSeo.date_modified || page.last_modified_at || page.date;
      const dateModified = dateModifiedRaw ? dateToXmlschema(dateModifiedRaw) || null : null;

      // Drop#type
      const type = pageSeo.type || (homepageOrAbout ? 'WebSite' : page.date ? 'BlogPosting' : 'WebPage');

      // Drop#links
      const links = pageSeo.links || (homepageOrAbout && siteSocial.links) || null;

      // Drop#logo
      let logoUrl = null;
      if (site.logo) {
        const rawLogo = String(site.logo);
        logoUrl = seoUriEscape(seoIsAbsoluteUrl(rawLogo) ? rawLogo : absoluteUrl(rawLogo));
      }

      // JSONLDDrop (json_ld_drop.rb): delegators + to_json sorts keys
      const jsonLd = { '@context': 'https://schema.org', '@type': type };
      jsonLd['url'] = canonicalUrl;
      if (dateModified) jsonLd['dateModified'] = dateModified;
      if (datePublished) jsonLd['datePublished'] = datePublished;
      if (description) jsonLd['description'] = String(description);
      if (pageTitle) jsonLd['headline'] = String(pageTitle);
      if (imageDrop) {
        if (Object.keys(imageDrop).length === 1) {
          jsonLd['image'] = imageDrop.path;
        } else {
          const h = { ...imageDrop, url: imageDrop.path, '@type': 'imageObject' };
          delete h.path;
          jsonLd['image'] = h;
        }
      }
      if (logoUrl) {
        jsonLd['publisher'] = {
          '@type': 'Organization',
          logo: { '@type': 'ImageObject', url: logoUrl },
        };
        if (authorDrop.name) jsonLd['publisher']['name'] = authorDrop.name;
      }
      if (type === 'BlogPosting' || type === 'CreativeWork') {
        jsonLd['mainEntityOfPage'] = { '@type': 'WebPage', '@id': canonicalUrl };
      }
      if (name) jsonLd['name'] = String(name);
      if (authorDrop.name) {
        const a = { '@type': authorDrop.type || 'Person', name: authorDrop.name };
        if (authorDrop.url) a['url'] = authorDrop.url;
        jsonLd['author'] = a;
      }
      if (links) jsonLd['sameAs'] = links;
      // Ruby: keys.sort.each_with_object (alphabetical, nils omitted)
      const sortedJsonLd = {};
      for (const k of Object.keys(jsonLd).sort()) sortedJsonLd[k] = jsonLd[k];

      const pageLang = page.lang || site.lang || 'en_US';

      const drop = {
        version: '2.9.1',
        'title?': !!title && !/title=false/i.test(this.raw),
        'canonical?': !/canonical=false/i.test(this.raw),
        title: title || null,
        page_title: pageTitle || null,
        author: authorDrop,
        page_locale: (page.locale || site.locale || pageLang).replace(/-/g, '_'),
        description: description || null,
        site_title: siteTitle || null,
        canonical_url: canonicalUrl,
        image: imageDrop,
        date_published: datePublished,
        date_modified: dateModified,
        json_ld: sortedJsonLd,
      };

      // Render the gem's own template, exactly like jekyll-seo-tag.rb #render
      // (which minifies + renders lib/template.html through Ruby Liquid).
      const html = await engine.parseAndRender(SEO_TAG_TEMPLATE, {
        seo_tag: drop,
        site,
        page,
        paginator,
        jekyll,
      });
      // FIX (oracle-found): real gem's output ends with a newline,
      // so </head> starts on a new line.
      return html.endsWith('\n') ? html : html + '\n';
    },
  });
}

// (used by feed_meta tag)
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
// {% gist %} embeds a GitHub Gist. Mirrors jekyll-gist 1.5.0
// (lib/jekyll-gist/gist_tag.rb): fetches the raw gist for the <noscript>
// fallback (3s timeout, network failure → no noscript, matching Ruby's
// rescue → nil), always emits the <script> tag. Verified byte-identical
// vs real Jekyll 4.3.4 output 2026-10-11.
function registerGistTag(engine) {
  engine.registerTag('gist', {
    parse(tagToken) {
      this.markup = tagToken.args || '';
    },
    async render(ctx) {
      // Ruby: determine_arguments — /\A([\S]+|.*(?=\/).+)\s?(\S*)\Z/
      const input = (this.markup || '').trim();
      const m = input.match(/^(\S+|.*(?=\/).+)\s?(\S*)$/);
      if (!m) {
        throw new Error(
          `Syntax error in tag 'gist' while parsing the following markup:\n\n    ${this.markup}\n\n  Valid syntax:\n    {% gist user/1234567 %}\n    {% gist user/1234567 foo.js %}`
        );
      }
      let gistId = m[1].trim();
      let filename = m[2].trim();
      // Ruby: if the id/filename is a Liquid variable, resolve it
      try {
        const v = ctx.get([gistId]);
        if (v != null && typeof v !== 'object') gistId = String(v);
      } catch {}
      try {
        const v = ctx.get([filename]);
        if (v != null && typeof v !== 'object') filename = String(v);
      } catch {}

      const scriptTag =
        `<script src="https://gist.github.com/${gistId}.js${filename ? `?file=${filename}` : ''}"> </script>`;

      // Ruby: gist_noscript_tag — skipped if site.gist.noscript == false
      let noscriptTag = '';
      let skipNoscript = false;
      try {
        const site = ctx.get(['site']);
        if (site && site.gist && site.gist.noscript === false) skipNoscript = true;
      } catch {}
      if (!skipNoscript) {
        try {
          const url = `https://gist.githubusercontent.com/${gistId}/raw${filename ? `/${filename}` : ''}`;
          const resp = await fetch(url, { signal: AbortSignal.timeout(3000) });
          // Ruby uses response.body regardless of status (404 body → "404: Not Found")
          const code = await resp.text();
          const escaped = code
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
          noscriptTag = `<noscript><pre>${escaped}</pre></noscript>`;
        } catch {
          // Network failure → no noscript (Ruby rescues to nil)
        }
      }
      return noscriptTag + scriptTag;
    },
  });
}

function registerPluginStubs(engine) {
  registerGistTag(engine);
}

// ─── filter fixes ───────────────────────────────────────────────────────────
function registerFilterFixes(engine, opts = {}) {
  // FIX (Jekyll::Filters#sort parity): Jekyll 4.3.4 overrides Liquid's sort
  // (lib/jekyll/filters.rb): `input.sort` with no property -- and Ruby's
  // Hash#sort returns [[key, value], ...] pairs sorted by key. LiquidJS wraps
  // a hash as [hash] instead. Chirpy's categories.html depends on the Ruby
  // behavior: `{% assign sort_categories = site.categories | sort %}` then
  // `category | first` (name) / `category | last` (posts).
  const origSort = engine.filters.sort;
  engine.registerFilter('sort', function (input, property) {
    if (
      property == null &&
      input !== null &&
      typeof input === 'object' &&
      !Array.isArray(input)
    ) {
      return Object.entries(input).sort((a, b) =>
        a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0
      );
    }
    return origSort.call(this, input, property);
  });
  // FIX: Ruby Liquid's truncatewords returns the input UNCHANGED (newlines
  // preserved) when word count <= limit, and appends "..." only when
  // wordlist.length > words. LiquidJS always splits/joins (collapsing
  // newlines) and uses >= for the ellipsis (off-by-one).
  engine.registerFilter('truncatewords', (input, words = 15, truncateString = '...') => {
    if (input == null) return '';
    const str = String(input);
    const wordlist = str.split(/\s+/).filter((w) => w.length > 0);
    let limit = parseInt(words, 10);
    if (isNaN(limit)) limit = 15;
    if (wordlist.length <= limit) return str;
    return wordlist.slice(0, limit).join(' ') + String(truncateString);
  });

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
      // FIX: Jekyll emits &apos; (Ruby: input.to_s.encode(:xml => :attr)),
      // not LiquidJS's &#39;. Verified against oracle:
      //   'a&b<c>d"e\'f' | xml_escape -> "a&amp;b&lt;c&gt;d&quot;e&apos;f"
      .replace(/'/g, '&apos;');
  });

  engine.registerFilter('smartify', (input) => {
    if (input == null) return '';
    return String(input)
      // FIX (parity): Ruby's smartify runs through kramdown's SmartyPants
      // parser, which decodes &nbsp; to U+00A0. Our regex version must do
      // the same, otherwise xml_escape double-escapes it to &amp;nbsp;.
      // Verified vs oracle: "Special&nbsp;---&nbsp;Characters"
      //   -> "Special\u00A0\u2014\u00A0Characters"
      .replace(/&nbsp;/g, '\u00A0')
      .replace(/---/g, '\u2014')
      .replace(/--/g, '\u2013')
      .replace(/\.\.\./g, '\u2026')
      .replace(/"([^"]*)"/g, '\u201c$1\u201d')
      .replace(/'([^']*)'/g, '\u2018$1\u2019');
  });

  engine.registerFilter('normalize_whitespace', (input) => {
    if (input == null) return '';
    // FIX (Ruby \s parity): Jekyll's normalize_whitespace is
    // `input.to_s.gsub(%r!\s+!, " ").strip` (filters.rb) and Ruby's \s is
    // ASCII-only ([ \t\r\n\f\v]) — unlike JS \s, it does NOT match U+00A0
    // or other Unicode spaces, and Ruby's strip only trims ASCII
    // whitespace (+ \0). Verified: just-the-docs footnote backlinks keep
    // their U+00A0 through this filter in real Jekyll output.
    return String(input)
      .replace(/[ \t\r\n\f\v]+/g, ' ')
      .replace(/^[ \t\r\n\f\v\0]+|[ \t\r\n\f\v\0]+$/g, '');
  });

  // FIX: Ruby's grouping_filters.rb stringifies group keys:
  //   input.group_by { |item| item_property(item, property).to_s }
  // so items with a missing/nil key group under "" (and each group carries
  // name/items/size). LiquidJS left the key undefined, which made
  // `where_exp: "g.name == ''"` match nothing -- just-the-docs' entire
  // sidebar nav rendered empty. Verified against oracle:
  //   group_by: "parent" -> [{"name"=>"","items"=>[a,c],"size"=>2}, ...]
  // NOTE: group_by_exp is intentionally NOT overridden -- Ruby does not
  // stringify keys there either (parsed_expr.render(@context) raw).
  engine.registerFilter('group_by', function (arr, property) {
    if (arr == null) return [];
    if (!Array.isArray(arr)) return arr; // Ruby: non-groupable input passes through
    const groups = new Map();
    for (const item of arr) {
      const key = liquidProp(this.context, item, property);
      const name = key == null ? '' : String(key);
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(item);
    }
    return [...groups.entries()].map(([name, items]) => ({ name, items, size: items.length }));
  });

  // FIX: Ruby Liquid's uniq flattens nested arrays first (InputIterator:
  // input.flatten -- deep -- then uniq). LiquidJS deduped the raw array, so
  // [[1,2],[2,3],1] stayed 3 elements. Verified against oracle:
  //   [[1,2],[2,3],1,[1]] | uniq -> [1,2,3]
  engine.registerFilter('uniq', (arr) => {
    const list = arr == null ? [] : Array.isArray(arr) ? arr.flat(Infinity) : [arr];
    return [...new Set(list)];
  });

  // FIX: Ruby's String#split(" ") splits on whitespace RUNS and strips
  // leading whitespace (" a  b ".split(" ") -> ["a","b"]). LiquidJS split on
  // the literal single space (" a  b " -> ["","a","","b",""]). Other
  // separators keep Ruby's trailing-empty-field drop (as LiquidJS did).
  // Ruby's "whitespace" here is ASCII-only [ \t\r\n\f\v]: U+00A0 (nbsp) is
  // NOT split or stripped ("a\u00a0b".split(" ") -> ["a\u00a0b"], verified live).
  // JS /\s+/ and String#trim() both treat U+00A0 as whitespace, which broke
  // just-the-docs footnote backlinks (kramdown emits U+00A0; the compress
  // layout's `split: " " | join: " "` turned it into a regular space).
  engine.registerFilter('split', (input, separator) => {
    const str = input == null ? '' : String(input);
    if (separator === ' ') {
      const trimmed = str.replace(/^[ \t\r\n\f\v]+/, '');
      if (trimmed === '') return [];
      const parts = trimmed.split(/[ \t\r\n\f\v]+/);
      while (parts.length && parts[parts.length - 1] === '') parts.pop();
      return parts;
    }
    const parts = str.split(separator == null ? undefined : String(separator));
    while (parts.length && parts[parts.length - 1] === '') parts.pop();
    return parts;
  });

  // FIX: Ruby Liquid's escape returns nil for nil input (falsy downstream);
  // LiquidJS stringified it to "" (truthy). Entity map matches CGI.escapeHTML
  // (& < > " ', with ' -> &#39;). Verified against oracle:
  //   {% if x | escape %} -> false ; 'a<b>&"c\'d' -> "a&lt;b&gt;&amp;&quot;c&#39;d"
  engine.registerFilter('escape', (input) => {
    if (input == null) return input;
    return String(input)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  });

  // FIX: Jekyll's `where` (compare_property_vs_target, filters.rb) does NOT
  // use plain ==: it stringifies the target and compares per element, so
  // `where: "val", 0` matches 0 AND "0", `where: "val", false` matches false
  // AND "false", nil matches only nil, and an Array/Hash target returns the
  // input unchanged. LiquidJS used strict equals, so "0"/"false" never
  // matched. Verified against oracle (jekyll 4.4.1 + liquid 4.0.4).
  // Deliberate divergence: Ruby raises ArgumentError for a missing value
  // ("Liquid error: wrong number of arguments"); we treat it like an
  // explicit nil instead of failing the build.
  engine.registerFilter('where', function (arr, property, expected) {
    if (!Array.isArray(arr)) return arr;
    const kind = dropKind(expected);
    if (expected === undefined || kind === 'NullDrop') {
      return arr.filter((item) => liquidProp(this.context, item, property) == null);
    }
    if (kind === 'EmptyDrop' || kind === 'BlankDrop') {
      // Ruby: target.to_s == ""; match iff property == "" or Array(property).join == ""
      return arr.filter((item) => {
        const v = liquidProp(this.context, item, property);
        const list = v == null ? [] : Array.isArray(v) ? v : [v];
        return list.join('') === '';
      });
    }
    if (Array.isArray(expected) || isPlainObject(expected)) return arr;
    const target = String(expected);
    return arr.filter((item) => {
      const v = liquidProp(this.context, item, property);
      if (typeof v === 'string') return v === target;
      const list = v == null ? [] : Array.isArray(v) ? v : [v];
      return list.some((p) => String(p) === target);
    });
  });

  // FIX (Ruby Time#to_json parity): Jekyll's `{{ post.date | jsonify }}` emits
  // Ruby's Time#to_s format ("2019-08-11 00:34:00 +0800"), not ISO 8601.
  // LiquidJS's jsonify uses JSON.stringify (ISO). Override to format Date
  // objects in site.timezone like Ruby.
  const getTimezone = opts.getTimezone || (() => 'UTC');
  const formatRubyTime = (value) => {
    // Ruby Time#to_s: "%Y-%m-%d %H:%M:%S %z" in site timezone
    const tz = getTimezone() || 'UTC';
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    });
    const parts = Object.fromEntries(
      fmt.formatToParts(value).map((p) => [p.type, p.value])
    );
    const utcFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false,
      timeZoneName: 'shortOffset',
    });
    const tzName = utcFmt.formatToParts(value).find((p) => p.type === 'timeZoneName')?.value || 'GMT';
    const m = tzName.match(/GMT([+-])(\d+)(?::(\d+))?/);
    let offset = '+0000';
    if (m) {
      const sign = m[1];
      const hh = String(m[2]).padStart(2, '0');
      const mm = String(m[3] || '0').padStart(2, '0');
      offset = `${sign}${hh}${mm}`;
    }
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} ${offset}`;
  };
  engine.registerFilter('jsonify', function (input) {
    // JSON.stringify calls Date#toJSON before the replacer; handle top-level
    // Dates directly, nested Dates via a toJSON-suppressing replacer.
    if (input instanceof Date) return JSON.stringify(formatRubyTime(input));
    const replacer = (key, value) => {
      if (this instanceof Date) return formatRubyTime(this);
      return value;
    };
    // Temporarily suppress Date#toJSON so the replacer sees Date objects.
    const origToJSON = Date.prototype.toJSON;
    Date.prototype.toJSON = undefined;
    try {
      return JSON.stringify(input, replacer);
    } finally {
      Date.prototype.toJSON = origToJSON;
    }
  });

  // FIX (scssify): Jekyll::Filters#scssify (jekyll 4.3.4, filters.rb:49-53)
  // compiles an SCSS string via the site's shared Scss converter. LiquidJS
  // has no such filter. compileSassString() mirrors Scss#convert exactly as
  // it behaves from a filter: no associated page → source_map: false,
  // charset: false, expanded style, VFS _sass/ import resolution.
  // (jekyll-sass-converter 3.1.0, lib/jekyll/converters/scss.rb:162-176)
  engine.registerFilter('scssify', function (input) {
    return compileSassString(input, {
      vfs: typeof opts.getVfsTemplates === 'function' ? opts.getVfsTemplates() : {},
      config: typeof opts.getConfig === 'function' ? opts.getConfig() : {},
      sass: opts.sass,
    });
  });
}

// ─── filter-fix helpers ─────────────────────────────────────────────────────
// Resolve a dotted property path the way Jekyll's `item_property` does
// (read_liquid_attribute splits on "."), but through LiquidJS's own lookup so
// Drop-based documents (liquidMethodMissing) keep working. `this` in a
// registered filter is { context, token, liquid } (see liquidjs Filter#render).
function liquidProp(context, item, property) {
  if (property == null) return undefined;
  return context.spawn(item).get(String(property).split('.'));
}

// LiquidJS does not export its Drop subclasses; identify the nil/empty/blank
// literals by constructor name (present in the shipped dist bundle).
function dropKind(v) {
  if (v !== null && typeof v === 'object' && v.constructor) {
    const n = v.constructor.name;
    if (n === 'NullDrop' || n === 'EmptyDrop' || n === 'BlankDrop') return n;
  }
  return null;
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v) && dropKind(v) === null;
}

// ─── helpers ────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Rouge::Formatters::HTML escapes only &<> (rouge 4.7.0, formatters/html.rb).
// Used for the {% highlight %} plaintext fallback (unknown language ->
// Rouge::Lexers::PlainText), where escaping " would diverge from the oracle.
function escapeRougeText(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function registerJekyllExtensions(liquidEngine, opts = {}) {
  registerHighlightTag(liquidEngine, opts.highlighter);
  registerLinkTag(liquidEngine);
  registerPostUrlTag(liquidEngine);
  registerSeoTag(liquidEngine, opts);
  liquidEngine.registerFilter('seo_json_escape', seoJsonEscape);
  registerFeedMetaTag(liquidEngine);
  registerIncludeCachedTag(liquidEngine, opts);
  registerPluginStubs(liquidEngine);
  registerFilterFixes(liquidEngine, opts);
  // FIX (blank-block skip): Ruby Liquid 4.0.4's BlockBody#render discards the
  // output of any Block child whose static body is whitespace + non-output
  // tags only (assign/capture/comment). LiquidJS renders that interior
  // whitespace, causing stray blank/indented-empty lines vs real Jekyll
  // (minimal-mistakes footer.html is the archetype). See liquidBlankBlocks.js.
  patchBlankBlockSkipping(liquidEngine);
}

// ─── include_cached tag ─────────────────────────────────────────────────────
// {% include_cached file.html param="value" %} — from jekyll-include-cache.
// Renders identically to {% include %}; caching is a performance detail.
// This unblocks minimal-mistakes, just-the-docs, and chirpy (3 top themes).
function registerIncludeCachedTag(engine, opts = {}) {
  // opts.getInclude should be a function(filename) => content or null
  // If not provided, we try to use the engine's FS directly.
  engine.registerTag('include_cached', {
    parse(tagToken) {
      // Parse: filename.html key="value" key2=var
      // LiquidJS tokenizes args; we need to extract filename and params
      const args = tagToken.args || '';
      // Simple parse: first token is filename, rest are key=value
      const parts = args.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
      this.file = parts[0] ? parts[0].replace(/^["']|["']$/g, '') : '';
      this.params = {};
      for (let i = 1; i < parts.length; i++) {
        const m = parts[i].match(/^(\w+)=(.*)$/);
        if (m) {
          this.params[m[1]] = m[2];
        }
      }
    },
    async render(ctx) {
      // Get the include content via opts.getInclude or fallback
      let content = null;
      if (opts.getInclude) {
        content = opts.getInclude(this.file);
      }
      if (!content) {
        // Try via LiquidJS's FS if available
        // For now, throw a helpful error
        throw new Error(
          `include_cached: Could not find include '${this.file}'. ` +
          `Make sure _includes/${this.file} exists.`
        );
      }
      // Build include scope with params.
      // FIX (Jekyll include.rb #parse_params parity -- chirpy's
      // `{% include_cached trending-tags.html lang=include.lang %}`):
      // jekyll-include-cache subclasses Jekyll::Tags::Include, so params
      // parse exactly like {% include %}: quoted values are literals, bare
      // words are context lookups supporting dotted paths, and an
      // unresolvable variable is nil -- never the literal text.
      const includeScope = {};
      for (const [k, v] of Object.entries(this.params)) {
        // Evaluate the value (could be a string literal or variable)
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          includeScope[k] = v.slice(1, -1);
        } else {
          let val = null;
          try {
            val = ctx.get(v.split('.'));
          } catch {
            val = null;
          }
          includeScope[k] = val === undefined ? null : val;
        }
      }
      // Render the include with the scope
      // We need to push the include variable onto the context
      ctx.push({ include: includeScope });
      try {
        // P0 (parenthesized {% if %}): preprocess include content the same way
      // the engine's FS choke point does for plain {% include %} tags.
      const result = await engine.parseAndRender(
        opts.preprocess ? opts.preprocess(content) : content,
        ctx.getAll()
      );
        return result;
      } finally {
        ctx.pop();
      }
    },
  });
}
