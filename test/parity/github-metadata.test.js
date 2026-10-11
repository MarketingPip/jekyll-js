/**
 * jekyll-github-metadata native offline subset (jekyll-github-metadata 2.16.1).
 *
 * The gem populates `site.github` (via SiteGitHubMunger). Most fields are
 * API-backed (nil without network/auth), but the nwo-derived fields are
 * pure offline derivations from the `repository:` config
 * (lib/jekyll-github-metadata/repository.rb):
 *   repository_url = "#{owner_url}/#{name}"  (owner_url = "#{github_url}/#{owner}")
 * RepositoryFinder nwo priority: PAGES_REPO_NWO env > `repository:` config
 * > git remote (no git in the VFS, so config only).
 */
import { JekyllEngine } from '../../src/engine.js';
import {
  isGithubMetadataEnabled,
  buildGithubNamespace,
} from '../../src/jekyllGithubMetadata.js';

describe('isGithubMetadataEnabled', () => {
  test('true when jekyll-github-metadata is in plugins', () => {
    expect(isGithubMetadataEnabled({ plugins: ['jekyll-github-metadata'] })).toBe(true);
    expect(isGithubMetadataEnabled({ plugins: ['jekyll-sitemap'] })).toBe(false);
    expect(isGithubMetadataEnabled({})).toBe(false);
  });
});

describe('buildGithubNamespace', () => {
  test('derives repository_url from the repository: config (no network)', () => {
    const ns = buildGithubNamespace({ repository: 'just-the-docs/just-the-docs' });
    expect(ns.repository_url).toBe('https://github.com/just-the-docs/just-the-docs');
    expect(ns.repository_nwo).toBe('just-the-docs/just-the-docs');
    expect(ns.owner_name).toBe('just-the-docs');
    expect(ns.owner_url).toBe('https://github.com/just-the-docs');
    expect(ns.project_title).toBe('just-the-docs');
  });

  test('returns null without a repository: nwo', () => {
    expect(buildGithubNamespace({})).toBe(null);
    expect(buildGithubNamespace({ repository: 'no-slash' })).toBe(null);
  });
});

describe('site.github in the engine', () => {
  test('populated when the plugin is enabled (just-the-docs search.md)', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_config.yml':
          'title: T\nrepository: just-the-docs/just-the-docs\nplugins:\n  - jekyll-github-metadata\n',
        'index.md': '---\ntitle: H\n---\n[{{ site.github.repository_url }}]({{ site.github.repository_url }})',
      },
      logger: () => {},
    });
    const res = await engine.build();
    expect(res[0].content).toContain('https://github.com/just-the-docs/just-the-docs');
  });

  test('absent when the plugin is not enabled', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_config.yml': 'title: T\nrepository: just-the-docs/just-the-docs\n',
        'index.md': '---\ntitle: H\n---\n[{{ site.github.repository_url }}](x)',
      },
      logger: () => {},
    });
    const res = await engine.build();
    expect(res[0].content).not.toContain('https://github.com/just-the-docs/just-the-docs');
  });
});
