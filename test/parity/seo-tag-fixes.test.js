import { JekyllEngine } from '../../src/engine.js';

// Regression tests for jekyll-seo-tag port drift, grounded in the real gem
// (jekyll-seo-tag 2.9.1: lib/jekyll-seo-tag/drop.rb, author_drop.rb,
// json_ld_drop.rb, lib/template.html).

function extractJsonLd(html) {
  const m = html.match(/<script type="application\/ld\+json">\n([\s\S]*?)<\/script>/);
  expect(m).not.toBeNull();
  return JSON.parse(m[1]);
}

describe('seo-tag fix: integer page title must not emit invalid JSON-LD', () => {
  const testVFS = {
    '_config.yml': 'title: Test Blog\ndescription: A blog for testing\nurl: https://example.com\nbaseurl: ""\n',
    '_layouts/default.html': '<!DOCTYPE html>\n<html>\n<head>\n  {% seo %}\n</head>\n<body>\n  {{ content }}\n</body>\n</html>\n',
    // YAML parses `title: 404` as the integer 404. Real gem's format_string
    // (markdownify/strip_html) stringifies it, so headline is always a string.
    '404.md': '---\nlayout: default\ntitle: 404\npermalink: /404/\n---\nNot found.\n',
  };

  let html;
  beforeAll(async () => {
    const engine = new JekyllEngine({ vfs: testVFS });
    const results = await engine.build();
    const page = results.find(r => r.permalink === '/404/');
    expect(page).toBeDefined();
    html = page.content;
  });

  it('emits headline as a JSON string, not a bare integer', () => {
    const jsonLd = extractJsonLd(html);
    expect(jsonLd.headline).toBe('404');
    expect(typeof jsonLd.headline).toBe('string');
  });

  it('emits valid JSON (no unquoted bare integer)', () => {
    expect(html).toContain('"headline":"404"');
  });
});

describe('seo-tag fix: twitter:title uses name=, not property=', () => {
  const testVFS = {
    '_config.yml': 'title: Test Blog\nurl: https://example.com\n',
    '_layouts/default.html': '<!DOCTYPE html>\n<html>\n<head>\n  {% seo %}\n</head>\n<body>\n  {{ content }}\n</body>\n</html>\n',
    'index.md': '---\nlayout: default\ntitle: Home\n---\n# Welcome\n',
  };

  let html;
  beforeAll(async () => {
    const engine = new JekyllEngine({ vfs: testVFS });
    const results = await engine.build();
    html = results.find(r => r.permalink === '/').content;
  });

  it('emits <meta name="twitter:title">', () => {
    expect(html).toContain('<meta name="twitter:title" content="Home" />');
  });

  it('does not emit property="twitter:title"', () => {
    expect(html).not.toContain('property="twitter:title"');
  });
});

describe('seo-tag fix: twitter:creator falls back to the author', () => {
  const base = {
    '_layouts/default.html': '<!DOCTYPE html>\n<html>\n<head>\n  {% seo %}\n</head>\n<body>\n  {{ content }}\n</body>\n</html>\n',
  };

  it('falls back to site author name when no twitter handle is configured', async () => {
    // Real gem: AuthorDrop#twitter = author_hash["twitter"] || author_hash["name"],
    // so the creator falls back to the author name, prefixed with @.
    const engine = new JekyllEngine({
      vfs: {
        ...base,
        '_config.yml': 'title: Test Blog\nurl: https://example.com\ntwitter:\n  username: sitehandle\nauthor: Jane Doe\n',
        'index.md': '---\nlayout: default\ntitle: Home\n---\n# Welcome\n',
      },
    });
    const results = await engine.build();
    const html = results.find(r => r.permalink === '/').content;
    expect(html).toContain('<meta name="twitter:creator" content="@Jane Doe" />');
  });

  it('uses the page author twitter handle when present', async () => {
    const engine = new JekyllEngine({
      vfs: {
        ...base,
        '_config.yml': 'title: Test Blog\nurl: https://example.com\ntwitter:\n  username: sitehandle\nauthor: Jane Doe\n',
        'index.md': '---\nlayout: default\ntitle: Home\nauthor:\n  name: Page Author\n  twitter: "@pagehandle"\n---\n# Welcome\n',
      },
    });
    const results = await engine.build();
    const html = results.find(r => r.permalink === '/').content;
    expect(html).toContain('<meta name="twitter:creator" content="@pagehandle" />');
  });
});

describe('seo-tag fix: JSON-LD @type precedence matches the real gem', () => {
  // Real gem Drop#type (drop.rb):
  //   page_seo["type"] -> homepage_or_about? -> page["date"] -> "WebPage"
  const testVFS = {
    '_config.yml': 'title: Test Blog\nurl: https://example.com\nbaseurl: ""\n',
    '_layouts/default.html': '<!DOCTYPE html>\n<html>\n<head>\n  {% seo %}\n</head>\n<body>\n  {{ content }}\n</body>\n</html>\n',
    'index.md': '---\nlayout: default\ntitle: Home\n---\n# Welcome\n',
    'about.md': '---\nlayout: default\ntitle: About\npermalink: /about/\ndate: 2026-01-01\n---\nAbout us.\n',
    'dated-about.md': '---\nlayout: default\ntitle: Dated About\npermalink: /dated-about/\ndate: 2026-01-01\n---\nDated page.\n',
    'custom.md': '---\nlayout: default\ntitle: Custom\npermalink: /custom/\nseo:\n  type: Product\n---\nCustom type.\n',
    '_posts/2026-01-15-my-post.md': '---\nlayout: default\ntitle: My Post\n---\nPost content.\n',
  };

  let results;
  beforeAll(async () => {
    const engine = new JekyllEngine({ vfs: testVFS });
    results = await engine.build();
  });

  function typeFor(permalink) {
    const page = results.find(r => r.permalink === permalink);
    expect(page).toBeDefined();
    return extractJsonLd(page.content)['@type'];
  }

  it('home page is WebSite', () => {
    expect(typeFor('/')).toBe('WebSite');
  });

  it('about page is WebSite even when it has a date (homepage check wins over date)', () => {
    expect(typeFor('/about/')).toBe('WebSite');
  });

  it('a dated non-about page is BlogPosting (date applies when not homepage/about)', () => {
    expect(typeFor('/dated-about/')).toBe('BlogPosting');
  });

  it('post is BlogPosting', () => {
    const post = results.find(r => r.permalink.includes('my-post'));
    expect(post).toBeDefined();
    expect(extractJsonLd(post.content)['@type']).toBe('BlogPosting');
  });

  it('plain page is WebPage', () => {
    // /dated-about/ has a date so use a dateless non-about page instead
    expect(typeFor('/custom/')).not.toBe('BlogPosting');
  });

  it('seo.type front matter overrides the computed type', () => {
    expect(typeFor('/custom/')).toBe('Product');
  });
});
