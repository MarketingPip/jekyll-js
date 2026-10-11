/**
 * EntryFilter parity (Jekyll lib/jekyll/entry_filter.rb + reader.rb).
 *
 * Real Jekyll rejects, at every directory level, entries that:
 *  - start with `.`, `_`, `#`, `~` (special) or end with `~` (backup),
 *  - match an `exclude:` glob (Ruby File.fnmatch WITHOUT flags, so `*`
 *    crosses `/`; plus plain prefix match and trailing-slash dir match),
 * unless `include:` matches (include wins over both).
 * Directly-read dirs (_posts, _drafts, _plugins, _site, collections,
 * _layouts/_includes/_data/_sass) bypass the filter; _plugins/_site are
 * never emitted. `include:` files under excluded dirs are re-read after
 * the walk (reader.rb#read_included_excludes).
 */
import { JekyllEngine } from '../../src/engine.js';

const staticPaths = async (vfs) => {
  const engine = new JekyllEngine({ vfs });
  await engine.build();
  return engine._buildSiteContext().site.static_files.map((f) => f.path);
};
const permalinks = async (vfs) => {
  const engine = new JekyllEngine({ vfs });
  return (await engine.build()).map((p) => p.permalink);
};

describe('entry filter', () => {
  test('underscore dirs are never emitted as static files (_javascript)', async () => {
    const paths = await staticPaths({
      'index.md': '---\n---\n# Home',
      'assets/ok.js': 'console.log(0)',
      '_javascript/commons.js': 'console.log(1)',
      '_javascript/modules/a.js': 'console.log(2)',
    });
    expect(paths).not.toContain('/_javascript/commons.js');
    expect(paths).not.toContain('/_javascript/modules/a.js');
    expect(paths).toContain('/assets/ok.js');
  });

  test('_plugins files are never emitted', async () => {
    const paths = await staticPaths({
      'index.md': '---\n---\n# Home',
      '_plugins/hook.rb': 'puts 1',
    });
    expect(paths).not.toContain('/_plugins/hook.rb');
  });

  test('exclude globs match like Ruby fnmatch without flags (*.config.js, package*.json)', async () => {
    const paths = await staticPaths({
      '_config.yml': 'exclude:\n  - "*.config.js"\n  - "package*.json"\n',
      'index.md': '---\n---\n# Home',
      'eslint.config.js': 'x',
      'package.json': '{}',
      'package-lock.json': '{}',
      'sub/rollup.config.js': 'y',
    });
    expect(paths).not.toContain('/eslint.config.js');
    expect(paths).not.toContain('/package.json');
    expect(paths).not.toContain('/package-lock.json');
    // no FNM_PATHNAME: * crosses directories
    expect(paths).not.toContain('/sub/rollup.config.js');
  });

  test('special and backup entries are excluded at every level', async () => {
    const paths = await staticPaths({
      'index.md': '---\n---\n# Home',
      'assets/ok.css': 'x',
      '#autosave.js': 'x',
      'notes~': 'x',
      'assets/#draft.css': 'x',
      'assets/old~': 'x',
    });
    expect(paths).not.toContain('/#autosave.js');
    expect(paths).not.toContain('/notes~');
    expect(paths).not.toContain('/assets/#draft.css');
    expect(paths).not.toContain('/assets/old~');
    expect(paths).toContain('/assets/ok.css');
  });

  test('include resurrects a file under an excluded dir (read_included_excludes)', async () => {
    const paths = await staticPaths({
      '_config.yml': 'exclude:\n  - assets\ninclude:\n  - assets/keep.css\n',
      'index.md': '---\n---\n# Home',
      'assets/drop.css': 'a{}',
      'assets/keep.css': 'b{}',
    });
    expect(paths).not.toContain('/assets/drop.css');
    expect(paths).toContain('/assets/keep.css');
  });

  test('include wins over special (.htaccess default)', async () => {
    const paths = await staticPaths({
      'index.md': '---\n---\n# Home',
      '.htaccess': 'x',
      '.nojekyll': 'y',
    });
    expect(paths).toContain('/.htaccess');
    expect(paths).not.toContain('/.nojekyll');
  });

  test('_posts still ingested as posts (direct read bypasses the filter)', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_config.yml': 'title: t\n',
        '_layouts/default.html': '{{ content }}',
        '_posts/2026-01-01-a.md': '---\ntitle: A\nlayout: default\n---\nA',
      },
    });
    const pages = await engine.build();
    expect(pages.map((p) => p.permalink)).toContain('/2026/01/01/a.html');
  });

  test('exclude [_posts] drops posts via inner-level prefix rule', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_config.yml': 'exclude:\n  - _posts\n',
        'index.md': '---\n---\n# Home',
        '_posts/2026-01-01-a.md': '---\ntitle: A\n---\nA',
      },
    });
    await engine.build();
    expect((engine._buildSiteContext().site.posts || []).length).toBe(0);
  });

  test('underscore file inside a normal dir is excluded, normal sibling kept', async () => {
    const paths = await staticPaths({
      'index.md': '---\n---\n# Home',
      'assets/_partial.css': 'x',
      'assets/main.css': 'y',
    });
    expect(paths).not.toContain('/assets/_partial.css');
    expect(paths).toContain('/assets/main.css');
  });
});
