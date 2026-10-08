/**
 * Theme-pipeline fixes (Jekyll parity).
 *
 * Four bugs in the read/discovery pipeline (src/engine.js useVFS() and
 * helpers), found via the minimal-mistakes / chirpy battle tests:
 *
 * 1. Drafts (_drafts/) rendered without show_drafts — they fell through
 *    the post scan (which skipped them correctly) and were ingested as
 *    nested pages. Real Jekyll excludes _drafts/ entirely unless
 *    `show_drafts: true` (PostReader#read_drafts).
 * 2. :categories slugified in permalinks — Jekyll's UrlDrop#categories
 *    (drops/url_drop.rb:30-35) downcases and joins category names RAW
 *    with "/", never slugifies: /post formats/..., not /post-formats/...
 * 3. YAML merge keys (<<: *anchor) unresolved in _data — js-yaml 5.x
 *    dropped the merge tag from the default schema; Ruby's Psych
 *    resolves them (verified against the native Jekyll oracle).
 * 4. _data subdirectories flattened — Jekyll nests them:
 *    _data/subdir/file.yml -> site.data.subdir.file (verified against
 *    the native Jekyll oracle).
 */
import { JekyllEngine, generatePermalink, getPostCategories } from '../../src/engine.js';

describe('pipeline fix: drafts excluded without show_drafts', () => {
  const draftVfs = (configExtra = '') => ({
    '_config.yml': `title: Test\n${configExtra}`,
    '_layouts/default.html': '{{ content }}',
    'index.md': '---\nlayout: default\n---\nhome page',
    '_posts/2026-01-01-a.md': '---\ntitle: A\nlayout: default\n---\nA',
    '_drafts/my-draft.md': '---\ntitle: Draft\nlayout: default\n---\nsecret draft body',
  });

  test('draft is not rendered to output without show_drafts', async () => {
    const engine = new JekyllEngine({ vfs: draftVfs(), logger: () => {} });
    const pages = await engine.build();
    const leaked = pages.filter((p) => p.path.includes('_drafts/'));
    expect(leaked).toEqual([]);
  });

  test('draft does not appear in site.pages without show_drafts', async () => {
    const engine = new JekyllEngine({ vfs: draftVfs(), logger: () => {} });
    const pages = await engine.build();
    const index = pages.find((p) => p.permalink === '/');
    expect(index.content).not.toContain('secret draft body');
    const sitePages = engine._buildSiteContext().site.pages.map((p) => p.path);
    expect(sitePages).not.toContain('_drafts/my-draft.md');
  });

  test('draft without front matter is not copied as a static file either', async () => {
    const vfs = draftVfs();
    vfs['_drafts/notes.txt'] = 'plain notes';
    const engine = new JekyllEngine({ vfs, logger: () => {} });
    await engine.build();
    const statics = engine._staticFiles.map((s) => s.path);
    expect(statics).not.toContain('/_drafts/notes.txt');
  });

  test('show_drafts: true still publishes the draft as a post', async () => {
    const engine = new JekyllEngine({ vfs: draftVfs('show_drafts: true\n'), logger: () => {} });
    await engine.build();
    const titles = engine._buildSiteContext().site.posts.map((p) => p.title);
    expect(titles).toContain('Draft');
  });
});

describe('pipeline fix: :categories joined raw (not slugified) in permalinks', () => {
  test('generatePermalink joins categories raw with /, downcased like UrlDrop#categories', () => {
    const url = generatePermalink(
      { categories: getPostCategories({ categories: ['Post Formats'] }, '_posts/2020-01-01-x.md') },
      'hello-world',
      '2020-01-01',
      {}
    );
    expect(url).toBe('/post formats/2020/01/01/hello-world.html');
  });

  test('full build: post with a spaced category lands under /post formats/', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_config.yml': 'title: T\n',
        '_layouts/default.html': '{{ content }}',
        '_posts/2020-01-01-hello-world.md':
          '---\ntitle: Hello\nlayout: default\ncategories:\n  - Post Formats\n---\nhi',
      },
      logger: () => {},
    });
    await engine.build();
    const post = engine._collections.posts[0];
    expect(post._permalink).toBe('/post formats/2020/01/01/hello-world.html');
    // categories on the document itself stay raw (untouched by this fix)
    expect(post.categories).toEqual(['Post Formats']);
  });

  test('multiple categories joined with /', () => {
    const url = generatePermalink(
      { categories: ['Tech News', 'Guides'] },
      'slug',
      '2020-01-01',
      { permalink: 'none' }
    );
    expect(url).toBe('/tech news/guides/slug.html');
  });
});

describe('pipeline fix: YAML merge keys resolve in _data', () => {
  test('<<: *anchor merges like Ruby Psych', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_config.yml': 'title: T\n',
        '_data/ui.yml': 'base: &b\n  x: 1\nchild:\n  <<: *b\n  y: 2\n',
      },
      logger: () => {},
    });
    await engine.build();
    const ui = engine._buildSiteContext().site.data.ui;
    expect(ui.child).toEqual({ x: 1, y: 2 });
    expect(ui.child['<<']).toBeUndefined();
  });
});

describe('pipeline fix: _data subdirectories nest instead of flatten', () => {
  test('_data/subdir/file.yml is site.data.subdir.file', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_config.yml': 'title: T\n',
        '_data/info.yml': 'title: Top Level\n',
        '_data/subdir/nested.yml': 'title: Nested File\n',
      },
      logger: () => {},
    });
    await engine.build();
    const data = engine._buildSiteContext().site.data;
    expect(data.info.title).toBe('Top Level');
    expect(data.subdir.nested.title).toBe('Nested File');
    expect(data['subdir/nested']).toBeUndefined();
  });

  test('deeply nested _data paths nest recursively', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_config.yml': 'title: T\n',
        '_data/a/b/c.yml': 'v: 42\n',
      },
      logger: () => {},
    });
    await engine.build();
    expect(engine._buildSiteContext().site.data.a.b.c.v).toBe(42);
  });

  test('nested data renders through a liquid template', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_config.yml': 'title: T\n',
        '_data/ui-text/en.yml': 'menu: Main Menu\n',
        'index.md': '---\n---\n{{ site.data.ui-text.en.menu }}',
      },
      logger: () => {},
    });
    const pages = await engine.build();
    const index = pages.find((p) => p.permalink === '/');
    expect(index.content).toContain('Main Menu');
  });
});
