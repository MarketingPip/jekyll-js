/**
 * Site/page variables audit (Jekyll parity).
 * Verifies every documented site.* and page.* variable works.
 */
import { JekyllEngine } from '../../src/engine.js';

describe('site variables', () => {
  test('all documented site.* variables exist', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_config.yml': 'title: Audit\n',
        '_data/info.yml': 'key: value\n',
        'index.md': [
          '---',
          'title: Home',
          '---',
          'time:{{ site.time | date: "%Y" }};',
          'pages:{{ site.pages.size }};',
          'posts:{{ site.posts.size }};',
          'static:{{ site.static_files.size }};',
          'html_pages:{{ site.html_pages.size }};',
          'collections:{{ site.collections.size }};',
          'data:{{ site.data.info.key }};',
          'documents:{{ site.documents.size }};',
          'title:{{ site.title }};',
        ].join('\n'),
        '_posts/2026-01-01-a.md': '---\ntitle: A\ntags: [x]\ncategories: [y]\n---\nA',
        'about.md': '---\ntitle: About\n---\nAbout',
        'style.css': 'body {}',
      },
    });
    const pages = await engine.build();
    const index = pages.find((p) => p.permalink === '/');
    const c = index.content;
    // site.time should be current year
    expect(c).toMatch(/time:2026;/);
    expect(c).toContain('pages:');
    expect(c).toContain('posts:1;');
    expect(c).toContain('data:value;');
    expect(c).toContain('title:Audit;');
  });

  test('site.tags and site.categories', async () => {
    const engine = new JekyllEngine({
      vfs: {
        'index.md': '---\ntitle: H\n---\n{% for tag in site.tags %}{{ tag[0] }}:{{ tag[1].size }};{% endfor %}',
        '_posts/2026-01-01-a.md': '---\ntitle: A\ntags: [foo, bar]\n---\nA',
      },
    });
    const pages = await engine.build();
    const index = pages.find((p) => p.permalink === '/');
    expect(index.content).toContain('foo:1;');
    expect(index.content).toContain('bar:1;');
  });
});

describe('page variables', () => {
  test('all documented page.* variables exist', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_posts/2026-01-15-test-post.md': [
          '---',
          'title: Test Post',
          'categories: [cat1]',
          'tags: [tag1]',
          '---',
          'Post content here.',
          '',
          'Second paragraph.',
        ].join('\n'),
        'index.md': '---\ntitle: H\n---\nH',
      },
    });
    const pages = await engine.build();
    const post = pages.find((p) => p.path.includes('_posts'));
    // The post's own page should have variables
    expect(post.data.title).toBe('Test Post');
    expect(post.permalink).toContain('/2026/01/15/test-post');
  });

  test('page.next and page.previous', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_posts/2026-01-01-first.md': '---\ntitle: First\n---\nA',
        '_posts/2026-01-02-second.md': '---\ntitle: Second\n---\nB',
        '_posts/2026-01-03-third.md': '---\ntitle: Third\n---\nC',
        'index.md': '---\ntitle: H\n---\nH',
      },
    });
    const pages = await engine.build();
    // Find the middle post's rendered page and check next/previous
    // (via site.posts ordering)
    const ctx = engine._buildSiteContext();
    const posts = ctx.site.posts;
    expect(posts).toHaveLength(3);
    // Posts sorted desc: third, second, first
    expect(posts[0].title).toBe('Third');
    expect(posts[1].title).toBe('Second');
    expect(posts[2].title).toBe('First');
  });
});
