import { JekyllEngine } from '../../src/engine.js';

describe('jekyll-seo-tag integration', () => {
  const testVFS = {
    '_config.yml': 'title: Test Blog\ndescription: A blog for testing\nurl: https://example.com\nbaseurl: ""\nauthor:\n  name: Jane Doe\n  email: jane@example.com\n',
    '_layouts/default.html': '<!DOCTYPE html>\n<html>\n<head>\n  {% seo %}\n</head>\n<body>\n  {{ content }}\n</body>\n</html>\n',
    'index.md': '---\nlayout: default\ntitle: Home\n---\n# Welcome to Test Blog\nThis is the home page.\n',
    '_posts/2026-01-15-my-first-post.md': '---\nlayout: default\ntitle: My First Post\ndescription: This is a post description\n---\nPost content here.\n'
  };

  let engine;
  let results;

  beforeAll(async () => {
    engine = new JekyllEngine({ vfs: testVFS });
    results = await engine.build();
  });

  it('should build without errors', () => {
    expect(results.length).toBeGreaterThan(0);
  });

  it('should render index page with SEO tags', async () => {
    const indexResult = results.find(r => r.permalink === '/');
    expect(indexResult).toBeDefined();

    const html = indexResult.content;
    // Should have title tag
    expect(html).toContain('<title>');
    // Should have generator meta
    expect(html).toContain('name="generator"');
    // Should have og:title
    expect(html).toContain('property="og:title"');
    // Should have canonical URL
    expect(html).toContain('rel="canonical"');
  });

  it('should render post page with SEO tags', async () => {
    const postResult = results.find(r => r.permalink.includes('my-first-post'));
    expect(postResult).toBeDefined();

    const html = postResult.content;
    // Should have title tag with post title
    expect(html).toContain('<title>My First Post | Test Blog</title>');
    // Should have og:type article
    expect(html).toContain('property="og:type" content="article"');
    // Should have article:published_time
    expect(html).toContain('property="article:published_time"');
    // Should have description
    expect(html).toContain('name="description"');
  });

  it('should not include Twitter card meta when no image', async () => {
    const indexResult = results.find(r => r.permalink === '/');
    const html = indexResult.content;
    // Without image, should have summary card
    expect(html).toContain('name="twitter:card" content="summary"');
  });
});

describe('jekyll-seo-tag with image', () => {
  const testVFS = {
    '_config.yml': 'title: Test Blog\ndescription: A blog for testing\nurl: https://example.com\nbaseurl: ""\nauthor:\n  name: Jane Doe\n',
    '_layouts/default.html': '<!DOCTYPE html>\n<html>\n<head>\n  {% seo %}\n</head>\n<body>\n  {{ content }}\n</body>\n</html>\n',
    'index.md': '---\nlayout: default\ntitle: Home\nimage: /assets/og-image.jpg\n---\n# Welcome\n',
  };

  let engine;
  let results;

  beforeAll(async () => {
    engine = new JekyllEngine({ vfs: testVFS });
    results = await engine.build();
  });

  it('should include og:image when page has image', async () => {
    const indexResult = results.find(r => r.permalink === '/');
    const html = indexResult.content;
    expect(html).toContain('property="og:image"');
    expect(html).toContain('/assets/og-image.jpg');
  });

  it('should include Twitter large image card when image present', async () => {
    const indexResult = results.find(r => r.permalink === '/');
    const html = indexResult.content;
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
  });
});

describe('jekyll-seo-tag JSON-LD', () => {
  const testVFS = {
    '_config.yml': 'title: Test Blog\nurl: https://example.com\n',
    '_layouts/default.html': '<!DOCTYPE html>\n<html>\n<head>\n  {% seo %}\n</head>\n<body>\n  {{ content }}\n</body>\n</html>\n',
    'index.md': '---\nlayout: default\ntitle: Home\n---\n# Welcome\n',
  };

  let engine;
  let results;

  beforeAll(async () => {
    engine = new JekyllEngine({ vfs: testVFS });
    results = await engine.build();
  });

  it('should include JSON-LD script tag', async () => {
    const indexResult = results.find(r => r.permalink === '/');
    const html = indexResult.content;
    expect(html).toContain('type="application/ld+json"');
    expect(html).toContain('@context');
    expect(html).toContain('schema.org');
  });
});