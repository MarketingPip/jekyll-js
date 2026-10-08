/**
 * jekyllFeed.js — native jekyll-feed generator (no Ruby/Opal required).
 *
 * Implements the feed generation of the real jekyll-feed plugin (v0.17.0),
 * using its actual `feed.xml` template verbatim (vendored below with
 * attribution). Opt-in via `_config.yml`:
 *
 *   plugins:
 *     - jekyll-feed
 *
 * Generates `/feed.xml` plus one `/feed/<category>.xml` per category listed
 * under `feed.categories` — matching the real gem's Generator behavior.
 * Drafts and future posts are excluded (unless `show_drafts`/`future`).
 *
 * Template source: https://github.com/jekyll/jekyll-feed/blob/v0.17.0/lib/jekyll-feed/feed.xml
 * (MIT license, (c) Jekyll contributors)
 */
import { parseMarkdown } from './engine.js';

export const FEED_TEMPLATE = `<?xml version="1.0" encoding="utf-8"?>
{% if page.xsl %}
  <?xml-stylesheet type="text/xml" href="{{ '/feed.xslt.xml' | absolute_url }}"?>
{% endif %}
<feed xmlns="http://www.w3.org/2005/Atom" {% if site.lang %}xml:lang="{{ site.lang }}"{% endif %}>
  <generator uri="https://jekyllrb.com/" version="{{ jekyll.version }}">Jekyll</generator>
  <link href="{{ page.url | absolute_url }}" rel="self" type="application/atom+xml" />
  <link href="{{ '/' | absolute_url }}" rel="alternate" type="text/html" {% if site.lang %}hreflang="{{ site.lang }}" {% endif %}/>
  <updated>{{ site.time | date_to_xmlschema }}</updated>
  <id>{{ page.url | absolute_url | xml_escape }}</id>

  {% assign title = site.title | default: site.name %}
  {% if page.collection != "posts" %}
    {% assign collection = page.collection | capitalize %}
    {% assign title = title | append: " | " | append: collection %}
  {% endif %}
  {% if page.category %}
    {% assign category = page.category | capitalize %}
    {% assign title = title | append: " | " | append: category %}
  {% endif %}

  {% if title %}
    <title type="html">{{ title | smartify | xml_escape }}</title>
  {% endif %}

  {% if site.description %}
    <subtitle>{{ site.description | xml_escape }}</subtitle>
  {% endif %}

  {% if site.author %}
    <author>
        <name>{{ site.author.name | default: site.author | xml_escape }}</name>
      {% if site.author.email %}
        <email>{{ site.author.email | xml_escape }}</email>
      {% endif %}
      {% if site.author.uri %}
        <uri>{{ site.author.uri | xml_escape }}</uri>
      {% endif %}
    </author>
  {% endif %}

  {% if page.tags %}
    {% assign posts = site.tags[page.tags] %}
  {% else %}
    {% assign posts = site[page.collection] %}
  {% endif %}
  {% if page.category %}
    {% assign posts = posts | where: "categories", page.category %}
  {% endif %}
  {% unless site.show_drafts %}
    {% assign posts = posts | where_exp: "post", "post.draft != true" %}
  {% endunless %}
  {% assign posts = posts | sort: "date" | reverse %}
  {% assign posts_limit = site.feed.posts_limit | default: 10 %}
  {% for post in posts limit: posts_limit %}
    <entry{% if post.lang %}{{" "}}xml:lang="{{ post.lang }}"{% endif %}>
      {% assign post_title = post.title | smartify | strip_html | normalize_whitespace | xml_escape %}

      <title type="html">{{ post_title }}</title>
      <link href="{{ post.url | absolute_url }}" rel="alternate" type="text/html" title="{{ post_title }}" />
      <published>{{ post.date | date_to_xmlschema }}</published>
      <updated>{{ post.last_modified_at | default: post.date | date_to_xmlschema }}</updated>
      <id>{{ post.id | absolute_url | xml_escape }}</id>
      {% assign excerpt_only = post.feed.excerpt_only | default: site.feed.excerpt_only %}
      {% unless excerpt_only %}
        <content type="html" xml:base="{{ post.url | absolute_url | xml_escape }}"><![CDATA[{{ post.content | strip }}]]></content>
      {% endunless %}

      {% assign post_author = post.author | default: post.authors[0] | default: site.author %}
      {% assign post_author = site.data.authors[post_author] | default: post_author %}
      {% assign post_author_email = post_author.email | default: nil %}
      {% assign post_author_uri = post_author.uri | default: nil %}
      {% assign post_author_name = post_author.name | default: post_author %}

      <author>
          <name>{{ post_author_name | default: "" | xml_escape }}</name>
        {% if post_author_email %}
          <email>{{ post_author_email | xml_escape }}</email>
        {% endif %}
        {% if post_author_uri %}
          <uri>{{ post_author_uri | xml_escape }}</uri>
        {% endif %}
      </author>

      {% if post.category %}
        <category term="{{ post.category | xml_escape }}" />
      {% elsif post.categories %}
        {% for category in post.categories %}
          <category term="{{ category | xml_escape }}" />
        {% endfor %}
      {% endif %}

      {% for tag in post.tags %}
        <category term="{{ tag | xml_escape }}" />
      {% endfor %}

      {% assign post_summary = post.description | default: post.excerpt %}
      {% if post_summary and post_summary != empty %}
        <summary type="html"><![CDATA[{{ post_summary | strip_html | normalize_whitespace }}]]></summary>
      {% endif %}

      {% assign post_image = post.image.path | default: post.image %}
      {% if post_image %}
        {% unless post_image contains "://" %}
          {% assign post_image = post_image | absolute_url %}
        {% endunless %}
        <media:thumbnail xmlns:media="http://search.yahoo.com/mrss/" url="{{ post_image | xml_escape }}" />
        <media:content medium="image" url="{{ post_image | xml_escape }}" xmlns:media="http://search.yahoo.com/mrss/" />
      {% endif %}
    </entry>
  {% endfor %}
</feed>
`;

/**
 * Whether the site opted into jekyll-feed via `_config.yml` `plugins:`.
 */
export function isFeedEnabled(config) {
  // Jekyll 3.5+ uses `plugins:`; `gems:` is the deprecated alias (still works).
  const plugins = config?.plugins || config?.gems || [];
  const list = Array.isArray(plugins) ? plugins : [plugins];
  return list.some((p) => p === 'jekyll-feed' || p === 'jekyll_feed');
}

/**
 * Generate feed pages. Called by JekyllEngine.build() after normal rendering.
 *
 * @param {JekyllEngine} engine - the built engine (for liquidEngine + config)
 * @returns {Promise<Array<{path, permalink, content}>>}
 */
export async function generateFeeds(engine) {
  const config = engine._config || {};
  const siteCtx = engine._buildSiteContext().site;
  const results = [];

  // FIX (oracle-found): real jekyll-feed uses rendered HTML for post.content,
  // not raw markdown. Render each post's content to HTML.
  for (const post of siteCtx.posts || []) {
    if (post.content && !post.content.includes('<')) {
      // Heuristic: if content doesn't contain HTML tags, it's raw markdown
      post.content = parseMarkdown(post.content);
    }
  }

  const renderFeed = async (page) => {
    // FIX (oracle-found): real jekyll-feed minifies the template with
    // MINIFY_REGEX = /(?<=>|})\s+/ — strips whitespace after > or }.
    const minifiedTemplate = FEED_TEMPLATE.replace(/(?<=>|})\s+/g, '');
    const html = await engine.renderTemplate(minifiedTemplate, {
      site: siteCtx,
      page,
      jekyll: { version: '4.3.4' },
    });
    return {
      path: page.url.slice(1), // 'feed.xml' (no leading slash)
      permalink: page.url,
      data: {},
      content: html,
    };
  };

  // Main feed: all posts
  results.push(await renderFeed({ url: '/feed.xml', collection: 'posts' }));

  // Category feeds (real gem: one per entry in feed.categories)
  const categories = config.feed?.categories || [];
  for (const category of categories) {
    results.push(await renderFeed({
      url: `/feed/${category}.xml`,
      collection: 'posts',
      category,
    }));
  }

  return results;
}
