import { JekyllEngine } from '../../engine.js';

describe('site.static_files', () => {
  const vfs = {
    '_config.yml': 'title: Test\n',
    'style.css': 'body { color: red; }',
    'assets/img/logo.png': 'PNGDATA',
    'index.md': '---\ntitle: Home\n---\nHi',
  };

  test('non-page/non-special files are tracked as static files', () => {
    const engine = new JekyllEngine({ vfs });
    const ctx = engine._buildSiteContext();
    const names = ctx.site.static_files.map((f) => f.name).sort();
    expect(names).toEqual(['logo.png', 'style.css']);
  });

  test('exposes the real Jekyll StaticFileDrop field set: name, extname, basename, path, modified_time', () => {
    const engine = new JekyllEngine({ vfs });
    const ctx = engine._buildSiteContext();
    const css = ctx.site.static_files.find((f) => f.name === 'style.css');
    expect(css.extname).toBe('.css');
    expect(css.basename).toBe('style');
    expect(css.path).toBe('/style.css');
    expect(css.modified_time).toBeInstanceOf(Date);
  });

  test('nested static files preserve their directory in `path`', () => {
    const engine = new JekyllEngine({ vfs });
    const ctx = engine._buildSiteContext();
    const logo = ctx.site.static_files.find((f) => f.name === 'logo.png');
    expect(logo.path).toBe('/assets/img/logo.png');
  });

  test('pages/layouts/includes/data/config are NOT counted as static files', () => {
    const engine = new JekyllEngine({ vfs });
    const ctx = engine._buildSiteContext();
    expect(ctx.site.static_files.length).toBe(2); // only style.css + logo.png
  });
});

describe('site.related_posts', () => {
  // Build 15 posts, newest = post15 ... oldest = post1, to exercise the
  // exact Jekyll default algorithm: (11 most recent, reversed) - [post],
  // first(10).
  const vfs = { '_config.yml': 'title: Test\n' };
  for (let i = 1; i <= 15; i++) {
    const day = String(i).padStart(2, '0');
    vfs[`_posts/2026-01-${day}-post-${i}.md`] = `---\ntitle: Post ${i}\n---\nBody ${i}`;
  }

  test('for a recent post, related_posts is the other most-recent posts (real Jekyll default has nothing to do with content similarity)', () => {
    const engine = new JekyllEngine({ vfs });
    const ctx = engine._buildSiteContext();
    const post15 = ctx.site.posts.find((p) => p.title === 'Post 15'); // newest
    const related = engine._buildSiteContext(post15).site.related_posts;
    // Jekyll: (11 most recent, newest-first) - [post15], first(10)
    // = Post14..Post4 (10 posts)
    expect(related.length).toBe(10);
    expect(related.map((p) => p.title)).toEqual([
      'Post 14', 'Post 13', 'Post 12', 'Post 11', 'Post 10',
      'Post 9', 'Post 8', 'Post 7', 'Post 6', 'Post 5',
    ]);
  });

  test('for an old post (not among the 11 most recent), related_posts is still just the 11 most recent (minus nothing) -- a known real Jekyll quirk, not a bug here', () => {
    const engine = new JekyllEngine({ vfs });
    const ctx = engine._buildSiteContext();
    const post1 = ctx.site.posts.find((p) => p.title === 'Post 1'); // oldest
    const related = engine._buildSiteContext(post1).site.related_posts;
    expect(related.length).toBe(10);
    expect(related[0].title).toBe('Post 15');
    expect(related.map((p) => p.title)).not.toContain('Post 1');
  });

  test('related_posts is undefined/null for a non-post page (mirrors site.related_posts returning nil)', () => {
    const engine = new JekyllEngine({ vfs });
    const ctx = engine._buildSiteContext(); // no current post
    expect(ctx.site.related_posts == null).toBe(true);
  });

  test('a developer-supplied relatedPostsFn fully overrides the default algorithm', () => {
    const customFn = (post, allPosts) => allPosts.filter((p) => p.title !== post.title).slice(0, 2);
    const engine = new JekyllEngine({ vfs, relatedPostsFn: customFn });
    const ctx = engine._buildSiteContext();
    const post15 = ctx.site.posts.find((p) => p.title === 'Post 15');
    const related = engine._buildSiteContext(post15).site.related_posts;
    expect(related.length).toBe(2);
  });

  test('build() wires related_posts correctly per-post automatically', async () => {
    const engine = new JekyllEngine({ vfs });
    // spy via a custom relatedPostsFn to observe what build() passes in
    const seen = [];
    engine.options.relatedPostsFn = (post, allPosts) => {
      seen.push(post.title);
      return [];
    };
    await engine.build();
    expect(seen.length).toBe(15); // called once per post
  });
});

describe('site.html_pages', () => {
  const vfs = {
    '_config.yml': 'title: Test\n',
    'index.md': '---\ntitle: Home\n---\nHi',
    'about.md': '---\ntitle: About\npermalink: /about.html\n---\nHi',
  };

  test('includes pages whose url ends with "/" or ".html"', () => {
    const engine = new JekyllEngine({ vfs });
    const ctx = engine._buildSiteContext();
    expect(ctx.site.html_pages.length).toBe(ctx.site.pages.length);
  });

  test('matches real Jekyll\'s SiteDrop#html_pages predicate exactly (url ends with "/" or ".html")', () => {
    const vfsWithNonHtml = {
      '_config.yml': 'title: Test\n',
      'index.md': '---\ntitle: Home\npermalink: /data.json\n---\n{}',
    };
    const engine = new JekyllEngine({ vfs: vfsWithNonHtml });
    const ctx = engine._buildSiteContext();
    expect(ctx.site.html_pages.length).toBe(0);
  });
});

describe('configurable excerpt_separator', () => {
  test('default separator is "\\n\\n" (NOT "<!--more-->" -- confirmed against real Jekyll defaults)', async () => {
    const vfs = {
      '_config.yml': 'title: Test\n',
      '_posts/2026-01-01-a.md': '---\ntitle: A\n---\nFirst para.\n\nSecond para.',
    };
    const engine = new JekyllEngine({ vfs });
    const ctx = engine._buildSiteContext();
    expect(ctx.site.posts[0].excerpt).toContain('First para');
    expect(ctx.site.posts[0].excerpt).not.toContain('Second para');
  });

  test('a site-config excerpt_separator (e.g. "<!--more-->") is honored', () => {
    const vfs = {
      '_config.yml': 'title: Test\nexcerpt_separator: "<!--more-->"\n',
      '_posts/2026-01-01-a.md': '---\ntitle: A\n---\nIntro text.\n<!--more-->\nRest of the post.',
    };
    const engine = new JekyllEngine({ vfs });
    const ctx = engine._buildSiteContext();
    expect(ctx.site.posts[0].excerpt).toContain('Intro text');
    expect(ctx.site.posts[0].excerpt).not.toContain('Rest of the post');
  });

  test('a front-matter excerpt_separator overrides the site config one', () => {
    const vfs = {
      '_config.yml': 'title: Test\nexcerpt_separator: "<!--more-->"\n',
      '_posts/2026-01-01-a.md':
        '---\ntitle: A\nexcerpt_separator: "==="\n---\nIntro.\n===\nRest.\n<!--more-->\nIgnored.',
    };
    const engine = new JekyllEngine({ vfs });
    const ctx = engine._buildSiteContext();
    expect(ctx.site.posts[0].excerpt).toContain('Intro');
    expect(ctx.site.posts[0].excerpt).not.toContain('Rest');
  });

  test('if the separator never appears, the whole content becomes the excerpt (matches Ruby String#partition fallback)', () => {
    const vfs = {
      '_config.yml': 'title: Test\nexcerpt_separator: "<!--more-->"\n',
      '_posts/2026-01-01-a.md': '---\ntitle: A\n---\nJust one short paragraph, no separator at all.',
    };
    const engine = new JekyllEngine({ vfs });
    const ctx = engine._buildSiteContext();
    expect(ctx.site.posts[0].excerpt).toContain('Just one short paragraph');
  });
});

describe('pagination (classic jekyll-paginate semantics)', () => {
  const vfs = {
    '_config.yml': 'title: Test\npaginate: 2\n',
    'index.md': '---\ntitle: Home\n---\nHome page',
  };
  for (let i = 1; i <= 5; i++) {
    vfs[`_posts/2026-01-0${i}-post-${i}.md`] = `---\ntitle: Post ${i}\n---\nBody`;
  }

  test('disabled by default (no `paginate` config) -- no extra pages, no paginator', async () => {
    const noPaginateVfs = { ...vfs };
    delete noPaginateVfs['_config.yml'];
    noPaginateVfs['_config.yml'] = 'title: Test\n';
    const engine = new JekyllEngine({ vfs: noPaginateVfs });
    const results = await engine.build();
    expect(results.length).toBe(1 + 5); // index + 5 posts, no synthetic pages
  });

  test('generates ceil(total/per_page) pages, with correct per-page post slices', async () => {
    const engine = new JekyllEngine({ vfs });
    const results = await engine.build();
    const paginated = results.filter((r) => r.permalink.match(/^\/(page\d*)?$/));
    // ceil(5/2) = 3 pages total: "/" (page1), "/page2", "/page3"
    expect(paginated.map((r) => r.permalink).sort()).toEqual(['/', '/page2', '/page3']);
  });

  test('paginator object has the real Jekyll field shape', async () => {
    const engine = new JekyllEngine({ vfs });
    const results = await engine.build();
    const page1 = results.find((r) => r.permalink === '/');
    expect(page1.paginator).toMatchObject({
      page: 1,
      per_page: 2,
      total_posts: 5,
      total_pages: 3,
      previous_page: null,
      next_page: 2,
    });
    expect(page1.paginator.posts.length).toBe(2);
  });

  test('last page has the remainder of posts and no next_page', async () => {
    const engine = new JekyllEngine({ vfs });
    const results = await engine.build();
    const page3 = results.find((r) => r.permalink === '/page3');
    expect(page3.paginator.posts.length).toBe(1); // 5 posts, 2 per page -> last page has 1
    expect(page3.paginator.next_page).toBeNull();
    expect(page3.paginator.previous_page).toBe(2);
  });

  test('a custom paginate_path is respected', async () => {
    const customVfs = {
      '_config.yml': 'title: Test\npaginate: 2\npaginate_path: "/blog/page:num/"\n',
      'index.md': '---\ntitle: Home\n---\nHome page',
    };
    for (let i = 1; i <= 5; i++) {
      customVfs[`_posts/2026-01-0${i}-post-${i}.md`] = `---\ntitle: Post ${i}\n---\nBody`;
    }
    const engine = new JekyllEngine({ vfs: customVfs });
    const results = await engine.build();
    const permalinks = results.map((r) => r.permalink).filter((p) => p.includes('page'));
    expect(permalinks.sort()).toEqual(['/blog/page2/', '/blog/page3/']);
  });
});

describe('collection `output: false` (the real Jekyll default!)', () => {
  test('a collection WITHOUT output:true has its data in site.<name> but renders no standalone files', async () => {
    const vfs = {
      '_config.yml': 'collections:\n  projects:\n', // no `output: true`
      '_projects/alpha.md': '---\ntitle: Alpha\n---\nBody',
    };
    const engine = new JekyllEngine({ vfs });
    const ctx = engine._buildSiteContext();
    expect(ctx.site.projects.length).toBe(1); // data still available

    const results = await engine.build();
    expect(results.find((r) => r.path === '_projects/alpha.md')).toBeUndefined();
  });

  test('a collection WITH output:true renders standalone files (previous behavior, now conditional)', async () => {
    const vfs = {
      '_config.yml': 'collections:\n  projects:\n    output: true\n',
      '_projects/alpha.md': '---\ntitle: Alpha\n---\nBody',
    };
    const engine = new JekyllEngine({ vfs });
    const results = await engine.build();
    expect(results.find((r) => r.path === '_projects/alpha.md')).toBeDefined();
  });

  test('posts always render regardless of any collection output setting (sanity check, unaffected)', async () => {
    const vfs = {
      '_config.yml': 'title: Test\n',
      '_posts/2026-01-01-a.md': '---\ntitle: A\n---\nBody',
    };
    const engine = new JekyllEngine({ vfs });
    const results = await engine.build();
    expect(results.find((r) => r.path === '_posts/2026-01-01-a.md')).toBeDefined();
  });
});
