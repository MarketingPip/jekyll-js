import { JekyllEngine } from '../../src/engine.js';

// True-parity tests grounded in Jekyll 4.3.2 source:
//   Site#documents -> every doc in every collection (docs + files).
//   SiteDrop#[]   -> site["projects"] resolves collection docs in Liquid.
//   Default collection permalink is /:collection/:path/; :name and :title
//   placeholders and custom patterns work per-document.
//   Front-matter `defaults:` with `scope: { type: <collection> }` applies
//   to collection documents (see also test/parity/frontmatter-defaults.test.js).

describe('PARITY -- site.documents (every document in every collection)', () => {
  const vfs = {
    '_config.yml': 'collections:\n  projects:\n    output: true\n  team:\n    output: false\n',
    '_posts/2026-01-01-a.md': '---\ntitle: Post A\n---\nA',
    '_projects/alpha.md': '---\ntitle: Alpha\n---\nAlpha',
    '_team/bob.md': '---\ntitle: Bob\n---\nBob',
  };

  test('includes posts and custom docs, even from output:false collections', () => {
    const engine = new JekyllEngine({ vfs });
    const titles = engine._buildSiteContext().site.documents.map((d) => d.title).sort();
    expect(titles).toEqual(['Alpha', 'Bob', 'Post A']);
  });

  test('excludes published:false documents', () => {
    const vfs2 = {
      '_config.yml': 'collections:\n  projects:\n    output: true\n',
      '_projects/alpha.md': '---\ntitle: Alpha\n---\nAlpha',
      '_projects/hidden.md': '---\ntitle: Hidden\npublished: false\n---\nHidden',
    };
    const engine = new JekyllEngine({ vfs: vfs2 });
    const titles = engine._buildSiteContext().site.documents.map((d) => d.title);
    expect(titles).toEqual(['Alpha']);
  });

  test('documents carry url + collection fields', () => {
    const engine = new JekyllEngine({ vfs });
    const alpha = engine._buildSiteContext().site.documents.find((d) => d.title === 'Alpha');
    expect(alpha.url).toBe('/projects/alpha/');
    expect(alpha.collection).toBe('projects');
  });
});

describe('PARITY -- site.<collection_name> inside real Liquid templates', () => {
  const vfs = {
    '_config.yml': 'collections:\n  projects:\n    output: true\n',
    '_projects/alpha.md': '---\ntitle: Alpha\n---\nAlpha body',
    '_projects/beta.md': '---\ntitle: Beta\n---\nBeta body',
  };

  test('{% for doc in site.projects %} iterates documents', async () => {
    const engine = new JekyllEngine({ vfs });
    const ctx = engine._buildSiteContext();
    const out = await engine.liquidEngine.parseAndRender(
      '{% for p in site.projects %}{{ p.title }};{% endfor %}',
      ctx
    );
    expect(out).toContain('Alpha');
    expect(out).toContain('Beta');
  });

  test('document url/content/collection are reachable in Liquid', async () => {
    const engine = new JekyllEngine({ vfs });
    const ctx = engine._buildSiteContext();
    const out = await engine.liquidEngine.parseAndRender(
      '{% for p in site.projects %}{{ p.url }}|{{ p.collection }} {% endfor %}',
      ctx
    );
    expect(out).toContain('/projects/alpha/|projects');
  });

  test('{% for doc in site.documents %} works in Liquid', async () => {
    const engine = new JekyllEngine({ vfs });
    const ctx = engine._buildSiteContext();
    const out = await engine.liquidEngine.parseAndRender(
      '{{ site.documents.size }}',
      ctx
    );
    expect(out.trim()).toBe('2');
  });
});

describe('PARITY -- collection permalink patterns (:name / :title / custom)', () => {
  test('/:collection/:name style pattern', () => {
    const vfs = {
      '_config.yml': 'collections:\n  projects:\n    permalink: /work/:name/\n',
      '_projects/alpha.md': '---\ntitle: Alpha\n---\nBody',
    };
    const engine = new JekyllEngine({ vfs });
    expect(engine._buildSiteContext().site.projects[0].url).toBe('/work/alpha/');
  });

  test(':title placeholder uses the front-matter slug (Jekyll UrlDrop#title)', () => {
    const vfs = {
      '_config.yml': 'collections:\n  projects:\n    permalink: /:collection/:title/\n',
      '_projects/alpha.md': '---\ntitle: My Cool Thing\nslug: my-cool-slug\n---\nBody',
    };
    const engine = new JekyllEngine({ vfs });
    expect(engine._buildSiteContext().site.projects[0].url).toBe('/projects/my-cool-slug/');
  });

  test(':title falls back to the slugified basename without a slug', () => {
    const vfs = {
      '_config.yml': 'collections:\n  projects:\n    permalink: /:collection/:title/\n',
      '_projects/alpha.md': '---\ntitle: My Cool Thing\n---\nBody',
    };
    const engine = new JekyllEngine({ vfs });
    expect(engine._buildSiteContext().site.projects[0].url).toBe('/projects/alpha/');
  });

  test('custom pattern preserves subdirectory :path', () => {
    const vfs = {
      '_config.yml': 'collections:\n  projects:\n    permalink: /showcase/:path.html\n',
      '_projects/web/widget.md': '---\ntitle: Widget\n---\nBody',
    };
    const engine = new JekyllEngine({ vfs });
    expect(engine._buildSiteContext().site.projects[0].url).toBe('/showcase/web/widget.html');
  });
});

describe('PARITY -- collection front-matter defaults', () => {
  test('defaults: with scope.type applies to collection documents', () => {
    const vfs = {
      '_config.yml':
        'collections:\n  projects:\n    output: true\n' +
        'defaults:\n  - scope:\n      type: projects\n    values:\n      author: Jane\n',
      '_projects/alpha.md': '---\ntitle: Alpha\n---\nBody',
    };
    const engine = new JekyllEngine({ vfs });
    // Real Jekyll merges scope-matching defaults into every document's data.
    expect(engine._buildSiteContext().site.projects[0].author).toBe('Jane');
  });
});
