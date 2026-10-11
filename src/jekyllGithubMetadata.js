/**
 * jekyllGithubMetadata.js — native jekyll-github-metadata generator
 * (offline subset, no Ruby/network required).
 *
 * Mirrors jekyll-github-metadata 2.16.1's SiteGitHubMunger, which populates
 * `site.github`. The gem's full surface is API-backed (nil without
 * network/auth); this port implements the fields derivable offline from
 * the `repository:` config (name-with-owner), which is all real themes
 * need at build time:
 *
 *   repository_url = "#{owner_url}/#{name}"  (repository.rb:87-89)
 *   owner_url      = "#{github_url}/#{owner}" (Pages.github_url defaults
 *                    to "https://github.com")
 *
 * nwo priority (RepositoryFinder): PAGES_REPO_NWO env > `repository:`
 * config > git remote. There is no git in the VFS, so only the config
 * (and env, in Node) is consulted.
 *
 * Opt-in via `_config.yml`:
 *
 *   plugins:
 *     - jekyll-github-metadata
 */
export function isGithubMetadataEnabled(config) {
  const plugins = config?.plugins || config?.gems || [];
  const list = Array.isArray(plugins) ? plugins : [plugins];
  return list.some((p) => p === 'jekyll-github-metadata' || p === 'jekyll_github_metadata');
}

/**
 * Build the offline-derivable `site.github` namespace, or null when no
 * repository nwo can be determined. A user-supplied `github:` config hash
 * merges over the derived fields (site_github_munger.rb:38-47).
 * @param {Object} config - site config
 * @returns {Object|null}
 */
export function buildGithubNamespace(config) {
  const nwo = String(config?.repository || '').trim();
  if (!nwo || !nwo.includes('/')) return null;
  const githubUrl = 'https://github.com';
  const [owner, ...rest] = nwo.split('/');
  const name = rest.join('/');
  return {
    repository_nwo: nwo,
    repository_url: `${githubUrl}/${nwo}`,
    owner_name: owner,
    owner_url: `${githubUrl}/${owner}`,
    project_title: name,
  };
}
