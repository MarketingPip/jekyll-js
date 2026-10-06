/**
 * Front-matter `defaults:` (Jekyll parity: lib/jekyll/frontmatter_defaults.rb,
 * v4.3.2).
 *
 * Config shape:
 *   defaults:
 *     - scope:
 *         path: ""        # prefix match ("" = all paths); "*" globs supported
 *         type: "posts"   # pages | posts | drafts | <collection name> (optional)
 *       values:
 *         layout: "default"
 *
 * Rules (from source):
 * - A set without `values:` as a Hash is invalid: warned and skipped.
 * - No scope (or empty scope) matches every document.
 * - Front matter always wins over defaults.
 * - Precedence among matching sets: longer scope.path wins; on equal
 *   length, a type-scoped set beats an unscoped one; later sets win ties.
 * - Values deep-merge for nested hashes.
 * - Deprecated singular types (page/post/draft) normalize to plural.
 */
import { JekyllEngine } from '../../engine.js';

function build(vfs) {
  return new JekyllEngine({ vfs })._buildSiteContext();
}

describe('front-matter defaults', () => {
  test('unscoped values apply to every document', () => {
    const ctx = build({
      '_config.yml': 'defaults:\n  - scope:\n      path: ""\n    values:\n      author: Jane\n',
      'index.md': '---\ntitle: Home\n---\nHi',
      '_posts/2026-01-01-a.md': '---\ntitle: A\n---\nA',
    });
    expect(ctx.site.pages[0].author).toBe('Jane');
    expect(ctx.site.posts[0].author).toBe('Jane');
  });

  test('front matter wins over defaults', () => {
    const ctx = build({
      '_config.yml': 'defaults:\n  - scope:\n      path: ""\n    values:\n      layout: default\n      author: Jane\n',
      'index.md': '---\ntitle: Home\nlayout: custom\n---\nHi',
    });
    expect(ctx.site.pages[0].layout).toBe('custom');
    expect(ctx.site.pages[0].author).toBe('Jane');
  });

  test('scope.type: posts applies to posts, not pages', () => {
    const ctx = build({
      '_config.yml':
        'defaults:\n  - scope:\n      type: posts\n    values:\n      author: Jane\n',
      'index.md': '---\ntitle: Home\n---\nHi',
      '_posts/2026-01-01-a.md': '---\ntitle: A\n---\nA',
    });
    expect(ctx.site.posts[0].author).toBe('Jane');
    expect(ctx.site.pages[0].author).toBeUndefined();
  });

  test('scope.type: pages applies to pages, not posts', () => {
    const ctx = build({
      '_config.yml':
        'defaults:\n  - scope:\n      type: pages\n    values:\n      layout: page\n',
      'index.md': '---\ntitle: Home\n---\nHi',
      '_posts/2026-01-01-a.md': '---\ntitle: A\n---\nA',
    });
    expect(ctx.site.pages[0].layout).toBe('page');
    expect(ctx.site.posts[0].layout).toBeUndefined();
  });

  test('scope.path prefix-matches document paths', () => {
    const ctx = build({
      '_config.yml':
        'defaults:\n  - scope:\n      path: "_posts"\n    values:\n      sidebar: true\n',
      '_posts/2026-01-01-a.md': '---\ntitle: A\n---\nA',
      'index.md': '---\ntitle: Home\n---\nHi',
    });
    expect(ctx.site.posts[0].sidebar).toBe(true);
    expect(ctx.site.pages[0].sidebar).toBeUndefined();
  });

  test('longer scope.path wins over shorter scope.path', () => {
    const ctx = build({
      '_config.yml':
        'defaults:\n' +
        '  - scope:\n      path: ""\n    values:\n      theme: light\n' +
        '  - scope:\n      path: "_posts"\n    values:\n      theme: dark\n',
      '_posts/2026-01-01-a.md': '---\ntitle: A\n---\nA',
      'index.md': '---\ntitle: Home\n---\nHi',
    });
    expect(ctx.site.posts[0].theme).toBe('dark');
    expect(ctx.site.pages[0].theme).toBe('light');
  });

  test('later sets win when precedence ties', () => {
    const ctx = build({
      '_config.yml':
        'defaults:\n' +
        '  - scope:\n      path: ""\n    values:\n      author: First\n' +
        '  - scope:\n      path: ""\n    values:\n      author: Second\n',
      'index.md': '---\ntitle: Home\n---\nHi',
    });
    expect(ctx.site.pages[0].author).toBe('Second');
  });

  test('scope.type with a collection name applies to that collection', () => {
    const ctx = build({
      '_config.yml':
        'collections:\n  projects:\n    output: true\n' +
        'defaults:\n  - scope:\n      type: projects\n    values:\n      author: Jane\n',
      '_projects/alpha.md': '---\ntitle: Alpha\n---\nBody',
    });
    expect(ctx.site.projects[0].author).toBe('Jane');
  });

  test('deprecated singular scope types normalize (post -> posts)', () => {
    const ctx = build({
      '_config.yml':
        'defaults:\n  - scope:\n      type: post\n    values:\n      author: Jane\n',
      '_posts/2026-01-01-a.md': '---\ntitle: A\n---\nA',
    });
    expect(ctx.site.posts[0].author).toBe('Jane');
  });

  test('sets without values are invalid: warned and skipped', () => {
    const logs = [];
    const engine = new JekyllEngine({
      vfs: {
        '_config.yml': 'defaults:\n  - scope:\n      path: ""\n',
        'index.md': '---\ntitle: Home\n---\nHi',
      },
      logger: (message, level) => logs.push({ message, level }),
    });
    const ctx = engine._buildSiteContext();
    expect(logs.some((l) => l.level === 'warn' && /default/i.test(l.message))).toBe(true);
    expect(ctx.site.pages[0].author).toBeUndefined();
  });

  test('nested value hashes deep-merge', () => {
    const ctx = build({
      '_config.yml':
        'defaults:\n  - scope:\n      path: ""\n    values:\n      meta:\n        a: 1\n        b: 2\n',
      'index.md': '---\ntitle: Home\nmeta:\n  b: 99\n---\nHi',
    });
    // front matter wins per-key; defaults fill the rest
    expect(ctx.site.pages[0].meta).toEqual({ a: 1, b: 99 });
  });

  test('no defaults key is a no-op', () => {
    const ctx = build({
      '_config.yml': 'title: Plain\n',
      'index.md': '---\ntitle: Home\n---\nHi',
    });
    expect(ctx.site.pages[0].title).toBe('Home');
  });
});
