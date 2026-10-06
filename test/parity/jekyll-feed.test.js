import { JekyllEngine } from '../../src/engine.js';

describe('jekyll-feed integration', () => {
  const testVFS = {
    '_config.yml': 'title: Test Blog\ndescription: A blog for testing\nurl: https://example.com\nbaseurl: ""\nplugins:\n  - jekyll-feed\nauthor:\n  name: Jane Doe\n  email: jane@example.com\nfeed:\n  categories:\n    - news\n',
    '_layouts/default.html': '<!DOCTYPE html>\n<html>\n<head>\n  {% feed_meta %}\n</head>\n<body>\n  {{ content }}\n</body>\n</html>\n',
    'index.md': '---\nlayout: default\ntitle: Home\n---\n# Welcome to Test Blog\nThis is the home page.\n',
    '_posts/2026-01-15-post.md': '---\nlayout: default\ntitle: Hello World\ndate: 2026-01-15 10:00:00\n---\nFirst post content.\n',
    '_posts/2026-01-20-second-post.md': '---\nlayout: default\ntitle: Second Post\ndate: 2026-01-20 10:00:00\ntags: [news]\ncategories: [news]\n---\nSecond post content.\n',
    '_posts/2026-01-25-draft-post.md': '---\nlayout: default\ntitle: Draft Post\ndate: 2026-01-25 10:00:00\ndraft: true\n---\nDraft content.\n',
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

  it('should generate feed.xml', async () => {
    const feedResult = results.find(r => r.permalink === '/feed.xml');
    expect(feedResult).toBeDefined();
    expect(feedResult.content).toContain('<?xml version="1.0" encoding="utf-8"?>');
    expect(feedResult.content).toContain('<feed xmlns="http://www.w3.org/2005/Atom"');
    expect(feedResult.content).toContain('<title type="html">Test Blog</title>');
  });

  it('should include posts in feed (excluding drafts)', async () => {
    const feedResult = results.find(r => r.permalink === '/feed.xml');
    const content = feedResult.content;
    // Should have 2 entries (draft excluded)
    const entryCount = (content.match(/<entry/g) || []).length;
    expect(entryCount).toBe(2);
    // Should contain Hello World
    expect(content).toContain('Hello World');
    // Should contain Second Post
    expect(content).toContain('Second Post');
    // Should NOT contain Draft Post
    expect(content).not.toContain('Draft Post');
  });

  it('should generate feed/news.xml for news category', async () => {
    const feedResult = results.find(r => r.permalink === '/feed/news.xml');
    expect(feedResult).toBeDefined();
    const content = feedResult.content;
    // Should have 1 entry (only Second Post has news category)
    const entryCount = (content.match(/<entry/g) || []).length;
    expect(entryCount).toBe(1);
    expect(content).toContain('Second Post');
  });

  it('should include feed_meta tag in pages', async () => {
    const indexResult = results.find(r => r.permalink === '/');
    const content = indexResult.content;
    expect(content).toContain('rel="alternate"');
    expect(content).toContain('type="application/atom+xml"');
    expect(content).toContain('href="https://example.com/feed.xml"');
  });

  it('should have proper Atom feed structure', async () => {
    const feedResult = results.find(r => r.permalink === '/feed.xml');
    const content = feedResult.content;
    expect(content).toContain('<generator uri="https://jekyllrb.com/" version="4.3.2">Jekyll</generator>');
    expect(content).toContain('<link href="https://example.com/feed.xml" rel="self"');
    expect(content).toContain('<link href="https://example.com/" rel="alternate"');
    expect(content).toContain('<updated>');
    expect(content).toContain('<id>');
    expect(content).toContain('<author>');
    expect(content).toContain('<name>Jane Doe</name>');
    expect(content).toContain('<email>jane@example.com</email>');
  });
});

describe('jekyll-feed without category config', () => {
  const testVFS = {
    '_config.yml': 'title: Test Blog\ndescription: A blog for testing\nurl: https://example.com\nbaseurl: ""\nplugins:\n  - jekyll-feed\nauthor:\n  name: Jane Doe\n',
    '_layouts/default.html': '<!DOCTYPE html>\n<html>\n<head>\n  {% feed_meta %}\n</head>\n<body>\n  {{ content }}\n</body>\n</html>\n',
    'index.md': '---\nlayout: default\ntitle: Home\n---\n# Welcome\n',
    '_posts/2026-01-15-post.md': '---\nlayout: default\ntitle: Hello World\ndate: 2026-01-15 10:00:00\n---\nFirst post content.\n',
  };

  let engine;
  let results;

  beforeAll(async () => {
    engine = new JekyllEngine({ vfs: testVFS });
    results = await engine.build();
  });

  it('should generate only feed.xml without category feeds', async () => {
    const feedResult = results.find(r => r.permalink === '/feed.xml');
    expect(feedResult).toBeDefined();

    const newsFeed = results.find(r => r.permalink === '/feed/news.xml');
    expect(newsFeed).toBeUndefined();
  });
});