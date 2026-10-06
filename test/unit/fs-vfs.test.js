/**
 * fs-vfs.js: universal directory → VFS adapter (Node + browser via memfs).
 * Real temp dirs, a fake fs proving the injectable interface, and guards
 * that keep the module browser-safe.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readDirToVFS, DEFAULT_IGNORE } from '../../fs-vfs.js';
import { JekyllEngine } from '../../engine.js';

function makeTempSite(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jekyll-fs-test-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

describe('readDirToVFS', () => {
  test('reads a real directory into a VFS object', () => {
    const dir = makeTempSite({
      '_config.yml': 'title: FS Site\n',
      'index.md': '---\ntitle: Home\n---\nHi',
      '_posts/2026-01-01-a.md': '---\ntitle: A\n---\nA',
      '_layouts/default.html': '<html>{{ content }}</html>',
    });
    const vfs = readDirToVFS(dir, { fs });
    expect(Object.keys(vfs).sort()).toEqual([
      '_config.yml',
      '_layouts/default.html',
      '_posts/2026-01-01-a.md',
      'index.md',
    ]);
    expect(vfs['index.md']).toBe('---\ntitle: Home\n---\nHi');
  });

  test('ignores build output and VCS dirs by default, at any depth', () => {
    const dir = makeTempSite({
      'index.md': 'x',
      '_site/index.html': '<cached>',
      '.git/config': '[core]',
      'node_modules/foo/index.js': 'x',
      'theme/node_modules/bar/index.js': 'y',
      'docs/_site/nested.html': 'z',
    });
    const vfs = readDirToVFS(dir, { fs });
    expect(Object.keys(vfs)).toEqual(['index.md']);
    expect(DEFAULT_IGNORE).toContain('_site');
  });

  test('custom ignore list replaces the default (not merged)', () => {
    const dir = makeTempSite({ 'index.md': 'x', 'drafts/a.md': 'y', 'node_modules/dep.js': 'z' });
    const vfs = readDirToVFS(dir, { fs, ignore: ['drafts'] });
    expect(Object.keys(vfs).sort()).toEqual(['index.md', 'node_modules/dep.js']);
  });

  test('empty dir throws a clear error', () => {
    expect(() => readDirToVFS('', { fs })).toThrow(/non-empty path/);
    expect(() => readDirToVFS('   ', { fs })).toThrow(/non-empty path/);
  });

  test('binary files get a placeholder (engine only needs them to exist)', () => {
    const dir = makeTempSite({ 'index.md': 'x', 'assets/logo.png': 'fake-bytes' });
    const vfs = readDirToVFS(dir, { fs });
    expect(vfs['assets/logo.png']).toBe('');
  });

  test('extensionless files are read as text, not mistaken for binary', () => {
    const dir = makeTempSite({ 'LICENSE': 'MIT', 'pdf': 'not actually a pdf' });
    const vfs = readDirToVFS(dir, { fs });
    expect(vfs['LICENSE']).toBe('MIT');
    expect(vfs['pdf']).toBe('not actually a pdf');
  });

  test('throws a clear error when no fs is provided', () => {
    expect(() => readDirToVFS('./site')).toThrow(/`fs` option/);
    expect(() => readDirToVFS('./site')).toThrow(/memfs/);
    expect(() => readDirToVFS('./site', { fs: {} })).toThrow(/`fs` option/);
  });

  test('has no node: imports, so it bundles for the browser', () => {
    const src = fs.readFileSync(new URL('../../fs-vfs.js', import.meta.url), 'utf8');
    // Strip comments: the doc comment and error message legitimately
    // mention 'node:fs' — we only care about real import statements.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/^\s*import\s.*\sfrom\s*["']node:/m);
    expect(code).not.toMatch(/import\s*\(\s*["']node:/);
    expect(code).not.toMatch(/require\s*\(\s*["']node:/);
  });

  test('accepts any fs-compatible implementation (memfs shape)', () => {
    // Minimal fake with the same interface memfs exposes.
    const fakeFs = {
      readdirSync: (d, opts) => {
        if (!opts?.withFileTypes) throw new Error('expected withFileTypes');
        const names = d === '/site' ? ['index.md', '_config.yml'] : [];
        return names.map((name) => ({ name, isDirectory: () => false, isFile: () => true }));
      },
      readFileSync: (full, enc) => `<content of ${full}>`,
    };
    const vfs = readDirToVFS('/site', { fs: fakeFs });
    expect(vfs['index.md']).toBe('<content of /site/index.md>');
    expect(vfs['_config.yml']).toBe('<content of /site/_config.yml>');
  });

  test('end to end: real dir -> VFS -> built pages', async () => {
    const dir = makeTempSite({
      '_config.yml': 'title: E2E\n',
      'index.md': '---\ntitle: Home\n---\n# Hello from disk',
    });
    const engine = new JekyllEngine({ vfs: readDirToVFS(dir, { fs }) });
    const pages = await engine.build();
    expect(pages.find((p) => p.permalink === '/').content).toContain('Hello from disk');
  });

  test('works with real memfs (the browser path)', async () => {
    const { fs: memfs, vol } = await import('memfs');
    vol.fromJSON({
      '/site/_config.yml': 'title: Memfs Site\n',
      '/site/index.md': '---\ntitle: Home\n---\n# Hello from memfs',
      '/site/_posts/2026-01-01-a.md': '---\ntitle: A\n---\npost A',
      '/site/node_modules/dep/index.js': 'x',
    });
    const vfs = readDirToVFS('/site', { fs: memfs });
    expect(Object.keys(vfs).sort()).toEqual([
      '_config.yml',
      '_posts/2026-01-01-a.md',
      'index.md',
    ]);
    const engine = new JekyllEngine({ vfs });
    const pages = await engine.build();
    expect(pages.find((p) => p.permalink === '/').content).toContain('Hello from memfs');
    expect(pages.find((p) => p.permalink === '/2026/01/01/a.html').content).toContain('post A');
    vol.reset();
  });
});
