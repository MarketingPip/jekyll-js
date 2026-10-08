# Templates

jekyll-js renders Liquid templates with [LiquidJS](https://liquidjs.com/)
(10.x), configured for Jekyll parity, plus a set of Jekyll-specific
tags and filter fixes.

## Variables

Inside layouts, pages, and includes you get Jekyll's familiar context:

```liquid
{{ site.title }}            <!-- from _config.yml -->
{{ site.posts | size }}     <!-- newest first -->
{{ site.pages | size }}     <!-- all pages -->
{{ site.data.authors }}     <!-- _data/authors.yml -->
{{ site.time | date: "%Y" }}

{{ page.title }}            <!-- front matter -->
{{ page.url }}              <!-- resolved URL -->
{{ page.excerpt }}
{{ content }}               <!-- page body, rendered below the layout -->

{{ jekyll.environment }}    <!-- 'development' unless configured -->
{{ jekyll.version }}        <!-- '4.3.4' -->
```

When `paginate:` is set, the index page also gets `paginator.posts`,
`paginator.page`, `paginator.total_pages`,
`paginator.previous_page_path`, and `paginator.next_page_path`.

## Filters

All standard Liquid filters work, plus Jekyll's:

- URL helpers: `relative_url`, `absolute_url`, `strip_index`
- `markdownify` (render Markdown inline), `slugify`, `date_to_string`,
  `date_to_xmlschema` (local timezone, like Jekyll),
  `date_to_long_string`, `xml_escape`, `smartify`,
  `normalize_whitespace`, `number_of_words`,
  `array_to_sentence_string`, `where_exp`, `group_by`
- `to_integer` — truncates floats like Ruby's `.to_i` (LiquidJS alone
  passes floats through)

```liquid
<a href="{{ '/about.html' | relative_url }}">About</a>
{{ page.date | date_to_xmlschema }}
{% assign featured = site.posts | where_exp: "p", "p.featured" %}
```

The LiquidJS instance is pinned to `dynamicPartials: false`,
`jekyllInclude: true`, `jekyllWhere: true` — `{% include foo.html %}`
takes literal filenames, Jekyll-style, and `where` filters accept the
Jekyll argument forms.

## Jekyll tags

```liquid
{% include header.html %}            <!-- _includes/header.html (then _layouts/) -->
{% link about.md %}                  <!-- resolved URL of a page; errors loudly if missing -->
{% post_url 2026-01-01-first %}      <!-- resolved URL of a post; errors loudly if missing -->
{% highlight ruby %}code{% endhighlight %}   <!-- needs the highlighter plugin -->
{% seo %}                            <!-- jekyll-seo-tag 2.8.0 equivalent output -->
{% feed_meta %}                      <!-- <link> to the Atom feed -->
```

Details:

- **`{% include %}`** — searches `_includes/` first, then `_layouts/`.
  Like Ruby Jekyll, it takes a literal filename.
- **`{% highlight lang [linenos] %}`** — wraps code in
  `<figure class="highlight"><pre><code class="language-…">`. Requires
  the `highlighter` plugin ([plugins](plugins)); without it the build
  throws a clear error naming the fix. Unknown languages degrade to
  escaped plain text.
- **`{% link %}` / `{% post_url %}`** — resolve to the document's real
  URL. A missing target fails the build with Jekyll's own error wording,
  instead of silently emitting a wrong URL.
- **`{% seo %}`** — emits the full jekyll-seo-tag set: `<title>`, meta /
  Open Graph / Twitter tags, canonical URL, JSON-LD, author and
  webmaster-verification tags.
- **`{% feed_meta %}`** — emits the Atom `<link>` tag pointing at the
  absolute `/feed.xml` URL (the feed itself is generated when the
  `jekyll-feed` plugin is enabled).

**Not supported:** `{% include_cached %}` (no such tag in this engine —
plain `{% include %}` is cached by the LiquidJS `cache` option instead),
and `{% gist %}` renders nothing (it would need a live network call to
GitHub).

## Custom tags and filters

Plugins can add their own (see [plugins](plugins)):

```js
engine.registerTag('shout', (text) => text.toUpperCase() + '!');
engine.registerFilter('reverse', (s) => [...s].reverse().join(''));
```

```liquid
{% shout "hello" %}      <!-- HELLO! -->
{{ "abc" | reverse }}    <!-- cba -->
```

Tag arguments are evaluated as Liquid expressions: `"hello"` is a string
literal, `page.title` is a variable lookup. A bare word like
`{% shout hello %}` is treated as a (missing) variable, not the string
`"hello"`, so quote literal text.

## Layouts

Front matter picks the layout; names resolve **without the extension**
(`layout: default` finds `_layouts/default.html`), trying the exact
name, then `.html`, then `.htm`. Layouts can nest via their own
`layout:` front matter, just like Ruby Jekyll.
