/**
 * page.content / post.content rendered-vs-raw semantics.
 *
 * Ground truth: Jekyll 4.3.4 gem source
 * (~/workspace/local/ruby/gems/gems/jekyll-4.3.4/lib/jekyll/):
 *
 * - Renderer#run calls assign_pages! (`payload["page"] = document.to_liquid`)
 *   BEFORE render_document (renderer.rb:52-65). render_document ends with
 *   `document.content = output` (renderer.rb:85): the Liquid-rendered +
 *   markdown-converted, layout-less HTML overwrites the raw body.
 * - Page uses Convertible#to_liquid: a plain Hash snapshot built pre-render
 *   (convertible.rb:114-121, not memoized). So a REGULAR page's own
 *   `page.content` is the RAW body -- verified by oracle: beautiful-jekyll's
 *   tags/index.html meta descriptions contain the raw `{% assign %}` Liquid
 *   source (theme-verify/beautiful-jekyll/REPORT.md S4).
 * - Document#to_liquid returns a live DocumentDrop (document.rb:318-320)
 *   delegating `content` to the live document. So posts/collection docs
 *   expose RENDERED HTML as `content` everywhere: their own page,
 *   site.posts, site.documents, site.tags/categories, paginator.posts,
 *   page.next/previous (theme-verify S3/hyde S1/minimal-mistakes #5).
 * - `site.pages` / `site.html_pages` entries are fresh to_liquid snapshots
 *   taken at template-access time, so they expose the converted HTML of
 *   already-rendered pages (theme-verify/just-the-docs S6: real
 *   search-data.json splits page.content on '<h1').
 * - Excerpts: Excerpt#output runs the FULL renderer over the extracted text
 *   (excerpt.rb:82-84: `Renderer.new(doc.site, self, site.site_payload).run`),
 *   so post.excerpt is Liquid-rendered + markdown-converted HTML too
 *   (theme-verify/minimal-mistakes #6: a `{% capture %}` excerpt correctly
 *   renders to empty, not to leaked Liquid source).
 * - A front-matter `excerpt:` string override is used as-is (NOT converted):
 *   Document#generate_excerpt only builds an Excerpt object when the front
 *   matter has none (document.rb:539-540), and DocumentDrop#excerpt calls
 *   .to_s on whatever is there.
 */
import { JekyllEngine } from '../../src/engine.js';

const vfs = {
  '_config.yml': 'title: Content Test\n',
  '_layouts/default.html': '<html><body>{{ content }}</body></html>',
  '_layouts/with-page-content.html':
    '<html><body>PAGE-CONTENT:[{{ page.content }}]</body></html>',
  '_posts/2026-01-01-hello.md':
    '---\nlayout: with-page-content\ntitle: Hello\n---\n# Hello Post\n\nBody with *emphasis*.\n',
  '_posts/2026-01-02-liquid.md':
    '---\nlayout: default\ntitle: Liquid Post\n---\n{% assign who = "World" %}\n\nHello {{ who }}!\n',
  'index.md':
    '---\ntitle: Home\n---\n{% for post in site.posts %}POST-CONTENT:[{{ post.content }}]POST-EXCERPT:[{{ post.excerpt }}]{% endfor %}\n',
  'feed.xml':
    '---\n---\n{% for post in site.posts %}<entry><content>{{ post.content }}</content></entry>{% endfor %}\n',
  'pages-loop.md':
    '---\ntitle: Pages loop\n---\n{% for p in site.html_pages %}HTMLPAGE:[{{ p.title }}|{{ p.content }}]{% endfor %}\n',
  'about.md':
    '---\nlayout: with-page-content\ntitle: About\n---\n# About\n\n{% assign x = 5 %}Raw check {{ x }}.\n',
};

async function buildResults() {
  const engine = new JekyllEngine({ vfs });
  return engine.build();
}

function byPermalink(results, permalink) {
  const r = results.find((x) => x.permalink === permalink);
  if (!r) throw new Error(`no result for permalink ${permalink}`);
  return r;
}

describe('post.content in site payloads is rendered HTML (S3/hyde S1)', () => {
  test('site.posts loop: post.content is converted HTML, not raw markdown', async () => {
    const html = byPermalink(await buildResults(), '/').content;
    expect(html).toContain('<h1');
    expect(html).toContain('Hello Post');
    expect(html).not.toContain('# Hello Post');
  });

  test('site.posts loop: post body Liquid is rendered before conversion', async () => {
    const html = byPermalink(await buildResults(), '/').content;
    // {% assign %} must not leak; {{ who }} must be resolved, then markdown-converted.
    expect(html).not.toContain('{% assign');
    expect(html).not.toContain('{{ who }}');
    expect(html).toContain('Hello World!');
  });

  test('feed-like loop: post.content is rendered HTML (Atom <content> parity)', async () => {
    const xml = byPermalink(await buildResults(), '/feed.xml').content;
    expect(xml).toContain('<content>');
    expect(xml).toContain('<h1');
    expect(xml).not.toContain('# Hello Post');
    expect(xml).not.toContain('{% assign');
  });

  test('post.content is converted exactly once (no double markdown pass)', async () => {
    const html = byPermalink(await buildResults(), '/').content;
    // Double conversion would HTML-escape the tags produced by the first pass.
    expect(html).not.toContain('&lt;h1');
    expect(html).not.toContain('&lt;p');
  });

  test("post's own page: layout {{ page.content }} is rendered HTML", async () => {
    const html = byPermalink(await buildResults(), '/2026/01/01/hello.html').content;
    expect(html).toContain('PAGE-CONTENT:[<h1');
    expect(html).not.toContain('# Hello Post');
  });

  test('site.documents exposes rendered content for posts', async () => {
    const engine = new JekyllEngine({ vfs });
    await engine.build(); // build() precomputes rendered document content
    const docs = engine._buildSiteContext().site.documents;
    const hello = docs.find((d) => d.title === 'Hello');
    expect(hello).toBeDefined();
    expect(hello.content).toContain('<h1');
    expect(hello.content).not.toContain('# Hello Post');
  });
});

describe("regular page's own page.content is the raw body (S4)", () => {
  test('layout {{ page.content }} on a page exposes raw markdown + Liquid source', async () => {
    const html = byPermalink(await buildResults(), '/about.html').content;
    expect(html).toContain('PAGE-CONTENT:[# About');
    // Raw Liquid source survives: real Jekyll snapshots the page pre-render.
    expect(html).toContain('{% assign x = 5 %}');
    expect(html).toContain('{{ x }}');
  });

  test('layout {{ content }} on a page is still the rendered body', async () => {
    const engine = new JekyllEngine({
      vfs: {
        ...vfs,
        '_layouts/with-page-content.html':
          '<html><body>PAGE-CONTENT:[{{ page.content }}]LAYOUT-CONTENT:[{{ content }}]</body></html>',
      },
    });
    const html = byPermalink(await engine.build(), '/about.html').content;
    expect(html).toContain('LAYOUT-CONTENT:[<h1');
    expect(html).not.toMatch(/LAYOUT-CONTENT:\[[^]*\{% assign/);
  });
});

describe('site.pages / site.html_pages content is rendered HTML (S6)', () => {
  test('site.html_pages loop: page.content is converted HTML', async () => {
    const html = byPermalink(await buildResults(), '/pages-loop.html').content;
    // about.md's content, seen through the site.html_pages loop, is rendered.
    const aboutEntry = html.match(/HTMLPAGE:\[About\|([\s\S]*?)\]/);
    expect(aboutEntry).not.toBeNull();
    expect(aboutEntry[1]).toContain('<h1');
    expect(aboutEntry[1]).not.toContain('# About');
  });
});

describe('excerpts are rendered HTML (first paragraph, Liquid-rendered + converted)', () => {
  test('post.excerpt is markdown-converted HTML', async () => {
    const html = byPermalink(await buildResults(), '/').content;
    expect(html).toContain('POST-EXCERPT:[<h1');
    expect(html).not.toContain('POST-EXCERPT:[# Hello Post]');
  });

  test('post.excerpt with only Liquid in the first paragraph renders to empty', async () => {
    // minimal-mistakes #6: real Jekyll liquid-renders the extracted excerpt,
    // so {% assign %}...{{ }} with no output text produces an empty excerpt.
    const engine = new JekyllEngine({ vfs });
    await engine.build();
    const liquidPost = engine._buildSiteContext().site.posts.find((p) => p.title === 'Liquid Post');
    expect(liquidPost).toBeDefined();
    expect(liquidPost.excerpt.trim()).toBe('');
  });

  test('front-matter excerpt: override is respected as-is', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_config.yml': 'title: T\n',
        '_posts/2026-01-01-a.md':
          '---\ntitle: A\nexcerpt: "Custom excerpt text"\n---\nThe real body content here.',
      },
    });
    await engine.build();
    expect(engine._buildSiteContext().site.posts[0].excerpt).toBe('Custom excerpt text');
  });
});

describe('markdownify filter still converts raw markdown (regression guard)', () => {
  test('markdownify is untouched by the content-semantics fix', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_config.yml': 'title: T\n',
        'index.md': '---\ntitle: H\n---\n{{ "# hi" | markdownify }}\n',
      },
    });
    const html = byPermalink(await engine.build(), '/').content;
    expect(html).toContain('<h1');
  });
});
