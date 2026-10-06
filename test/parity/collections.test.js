import { JekyllEngine, normalizeCollectionsConfig, generateCollectionPermalink } from '../../engine.js';

describe('FIX -- custom front-matter fields on site.posts (e.g. "sort: listing-order")', () => {
  const vfs = {
    '_config.yml': 'title: Test\n',
    '_posts/2026-01-01-a.md': '---\ntitle: A\nlisting-order: 2\nimage: /img/a.png\n---\nBody A',
    '_posts/2026-01-02-b.md': '---\ntitle: B\nlisting-order: 1\nimage: /img/b.png\n---\nBody B',
  };

  test('custom front-matter fields survive onto site.posts (previously silently dropped)', () => {
    const engine = new JekyllEngine({ vfs });
    const ctx = engine._buildSiteContext();
    const a = ctx.site.posts.find((p) => p.title === 'A');
    expect(a['listing-order']).toBe(2);
    expect(a.image).toBe('/img/a.png');
  });

  test('sort: "listing-order" now actually works against site.posts', async () => {
    const engine = new JekyllEngine({ vfs });
    const ctx = engine._buildSiteContext();
    const out = await engine.liquidEngine.parseAndRender(
      '{% assign s = site.posts | sort: "listing-order" %}{% for p in s %}{{ p.title }} {% endfor %}',
      ctx
    );
    expect(out.trim()).toBe('B A'); // listing-order 1 (B) before 2 (A)
  });

  test('internal bookkeeping fields (_body, _permalink, etc.) are not leaked onto the post object', () => {
    const engine = new JekyllEngine({ vfs });
    const ctx = engine._buildSiteContext();
    const a = ctx.site.posts.find((p) => p.title === 'A');
    expect(a._body).toBeUndefined();
    expect(a._permalink).toBeUndefined();
    expect(a._date).toBeUndefined();
  });

  test('a real front-matter `excerpt:` override is respected (previously dead code checked p._excerpt, which was never set)', () => {
    const vfsWithExcerpt = {
      '_config.yml': 'title: Test\n',
      '_posts/2026-01-01-a.md':
        '---\ntitle: A\nexcerpt: "Custom excerpt text"\n---\nThe real body content here.',
    };
    const engine = new JekyllEngine({ vfs: vfsWithExcerpt });
    const ctx = engine._buildSiteContext();
    expect(ctx.site.posts[0].excerpt).toBe('Custom excerpt text');
  });
});

describe('FIX -- generic Jekyll collections (previously entirely unimplemented)', () => {
  const vfs = {
    '_config.yml': 'title: Test\ncollections:\n  projects:\n    output: true\n',
    '_projects/alpha.md': '---\ntitle: Alpha\nlisting-order: 2\n---\nAlpha body',
    '_projects/beta.md': '---\ntitle: Beta\nlisting-order: 1\n---\nBeta body',
  };

  test('a declared collection is populated as site.<name>', () => {
    const engine = new JekyllEngine({ vfs });
    const ctx = engine._buildSiteContext();
    expect(ctx.site.projects).toBeDefined();
    expect(ctx.site.projects.length).toBe(2);
  });

  test('collection items carry full front matter, including custom fields', () => {
    const engine = new JekyllEngine({ vfs });
    const ctx = engine._buildSiteContext();
    const alpha = ctx.site.projects.find((p) => p.title === 'Alpha');
    expect(alpha['listing-order']).toBe(2);
    expect(alpha.content).toBe('Alpha body');
  });

  test('default collection permalink is /:collection/:path/', () => {
    const engine = new JekyllEngine({ vfs });
    const ctx = engine._buildSiteContext();
    const alpha = ctx.site.projects.find((p) => p.title === 'Alpha');
    expect(alpha.url).toBe('/projects/alpha/');
  });

  test('a custom per-collection permalink pattern is respected', () => {
    const customVfs = {
      '_config.yml': 'collections:\n  projects:\n    permalink: /work/:path/\n',
      '_projects/alpha.md': '---\ntitle: Alpha\n---\nBody',
    };
    const engine = new JekyllEngine({ vfs: customVfs });
    const ctx = engine._buildSiteContext();
    expect(ctx.site.projects[0].url).toBe('/work/alpha/');
  });

  test('nested files within a collection preserve subdirectory structure in the permalink', () => {
    const nestedVfs = {
      '_config.yml': 'collections:\n  projects:\n',
      '_projects/web/widget.md': '---\ntitle: Widget\n---\nBody',
    };
    const engine = new JekyllEngine({ vfs: nestedVfs });
    const ctx = engine._buildSiteContext();
    expect(ctx.site.projects[0].url).toBe('/projects/web/widget/');
  });

  test('an undeclared directory (not listed under config.collections) is NOT treated as a collection', () => {
    const vfsUndeclared = {
      '_config.yml': 'title: Test\n', // no `collections:` key at all
      '_widgets/x.md': '---\ntitle: X\n---\nBody',
    };
    const engine = new JekyllEngine({ vfs: vfsUndeclared });
    const ctx = engine._buildSiteContext();
    expect(ctx.site.widgets).toBeUndefined();
  });

  test('collection items render through build() like posts do', async () => {
    const engine = new JekyllEngine({ vfs });
    const results = await engine.build();
    const alpha = results.find((r) => r.path === '_projects/alpha.md');
    expect(alpha).toBeDefined();
    expect(alpha.permalink).toBe('/projects/alpha/');
    expect(alpha.content).toContain('Alpha body');
  });

  test('front-matter `permalink:` still overrides the collection default', () => {
    const overrideVfs = {
      '_config.yml': 'collections:\n  projects:\n',
      '_projects/alpha.md': '---\ntitle: Alpha\npermalink: /custom/alpha-page/\n---\nBody',
    };
    const engine = new JekyllEngine({ vfs: overrideVfs });
    const ctx = engine._buildSiteContext();
    expect(ctx.site.projects[0].url).toBe('/custom/alpha-page/');
  });
});

describe('normalizeCollectionsConfig', () => {
  test('handles the array-of-names form', () => {
    expect(normalizeCollectionsConfig(['projects', 'team'])).toEqual({ projects: {}, team: {} });
  });

  test('handles the hash-of-options form', () => {
    expect(normalizeCollectionsConfig({ projects: { output: true } })).toEqual({
      projects: { output: true },
    });
  });

  test('handles no collections declared at all', () => {
    expect(normalizeCollectionsConfig(undefined)).toEqual({});
  });
});

describe('generateCollectionPermalink', () => {
  test('default pattern', () => {
    expect(generateCollectionPermalink({}, 'projects', 'alpha.md', {})).toBe('/projects/alpha/');
  });

  test('front-matter permalink wins outright', () => {
    expect(generateCollectionPermalink({ permalink: '/x/' }, 'projects', 'alpha.md', {})).toBe('/x/');
  });
});
