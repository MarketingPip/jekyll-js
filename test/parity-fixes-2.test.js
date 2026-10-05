/**
 * parity-fixes-2.test.js — round-2 parity fixes (all verified against real
 * Jekyll behavior or the engine's own internal consistency).
 *
 * 1. codespan HTML escaping (kramdown parity)
 * 2. front-matter `date:` drives permalink :year/:month/:day
 * 3. page.date / page.excerpt populated on post pages
 * 4. {% include %} resolves _includes/ before _layouts/
 * 5. {% link %} / {% post_url %} raise on missing targets (like Jekyll)
 * 6. parse failures log warnings instead of vanishing silently
 * 7. engine must not mutate the global marked instance
 * 8. {% highlight linenos %} renders line numbers
 * 9. .scss/.sass with front matter compiles outside assets/ (not _sass/)
 */
import { JekyllEngine, parseMarkdown } from '../engine.js';
import { isSassAsset } from '../assetsPipeline.js';
import { marked } from 'marked';

function collectLogger() {
  const logs = [];
  return { logs, logger: (message, level) => logs.push({ message, level }) };
}

describe('FIX 1: codespan HTML escaping', () => {
  test('inline code escapes HTML like kramdown does', () => {
    const html = parseMarkdown('`<b>bold</b>`');
    expect(html).toContain('&lt;b&gt;');
    expect(html).not.toContain('<b>bold</b>');
  });

  test('inline code escapes ampersands', () => {
    const html = parseMarkdown('`a & b`');
    expect(html).toContain('a &amp; b');
  });
});

describe('FIX 2: front-matter date drives permalink', () => {
  test('front matter date overrides the filename date in :year/:month/:day', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_config.yml': 'title: T\n',
        '_posts/2026-06-20-hello.md': '---\ntitle: Hi\ndate: 2024-01-05 10:00:00 +0000\n---\nBody',
      },
    });
    const res = await engine.build();
    const post = res.find((r) => r.path.includes('_posts'));
    expect(post.permalink).toBe('/2024/01/05/hello.html');
  });

  test('filename date still used when no front-matter date is given', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_config.yml': 'title: T\n',
        '_posts/2026-06-20-hello.md': '---\ntitle: Hi\n---\nBody',
      },
    });
    const res = await engine.build();
    const post = res.find((r) => r.path.includes('_posts'));
    expect(post.permalink).toBe('/2026/06/20/hello.html');
  });
});

describe('FIX 3: page.date / page.excerpt on post pages', () => {
  const vfs = {
    '_config.yml': 'title: T\n',
    '_layouts/default.html': 'D:{{ page.date | date: "%Y-%m-%d" }}|E:{{ page.excerpt | strip_html | strip }}',
    '_posts/2026-06-20-hello.md': '---\nlayout: default\ntitle: Hi\n---\nFirst paragraph here.\n\nSecond paragraph.',
    'index.md': '---\ntitle: Home\n---\nHome.',
  };

  test('post page exposes the filename date as page.date', async () => {
    const engine = new JekyllEngine({ vfs });
    const res = await engine.build();
    const post = res.find((r) => r.path.includes('_posts'));
    expect(post.content).toContain('D:2026-06-20');
  });

  test('post page exposes the computed excerpt as page.excerpt', async () => {
    const engine = new JekyllEngine({ vfs });
    const res = await engine.build();
    const post = res.find((r) => r.path.includes('_posts'));
    expect(post.content).toContain('First paragraph here.');
  });

  test('explicit front-matter excerpt still wins on the post page', async () => {
    const engine = new JekyllEngine({
      vfs: {
        ...vfs,
        '_posts/2026-06-20-hello.md':
          '---\nlayout: default\ntitle: Hi\nexcerpt: Custom teaser.\n---\nFirst paragraph here.\n\nSecond.',
      },
    });
    const res = await engine.build();
    const post = res.find((r) => r.path.includes('_posts'));
    expect(post.content).toContain('Custom teaser.');
  });
});

describe('FIX 4: {% include %} precedence', () => {
  test('include resolves _includes/ before _layouts/', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_config.yml': 'title: T\n',
        '_layouts/default.html': '<html><body>{{ content }}</body></html>',
        '_layouts/dup.html': 'LAYOUT-FILE',
        '_includes/dup.html': 'INCLUDE-FILE',
        'index.md': '---\nlayout: default\ntitle: H\n---\n{% include dup.html %}',
      },
    });
    const res = await engine.build();
    expect(res[0].content).toContain('INCLUDE-FILE');
    expect(res[0].content).not.toContain('LAYOUT-FILE');
  });
});

describe('FIX 5: missing link targets raise', () => {
  test('{% link %} to a missing page raises like Jekyll', async () => {
    const engine = new JekyllEngine({
      vfs: { 'index.md': '---\ntitle: H\n---\n{% link nope.md %}' },
    });
    await expect(engine.build()).rejects.toThrow(/Could not find document/);
  });

  test('{% post_url %} for a missing post raises like Jekyll', async () => {
    const engine = new JekyllEngine({
      vfs: { 'index.md': '---\ntitle: H\n---\n{% post_url 1999-01-01-ghost %}' },
    });
    await expect(engine.build()).rejects.toThrow(/Could not find post/);
  });

  test('{% link %} to an existing page still resolves', async () => {
    const engine = new JekyllEngine({
      vfs: {
        'index.md': '---\ntitle: H\n---\n{% link about.md %}',
        'about.md': '---\ntitle: About\n---\nAbout.',
      },
    });
    const res = await engine.build();
    expect(res[0].content).toContain('/about/');
  });
});

describe('FIX 6: parse failures warn loudly', () => {
  test('bad _config.yml logs a warning', () => {
    const { logs, logger } = collectLogger();
    new JekyllEngine({
      vfs: { '_config.yml': 'title: [unclosed\n' },
      logger,
    });
    expect(logs.some((l) => l.level === 'warn' && l.message.includes('_config'))).toBe(true);
  });

  test('bad _data file logs a warning', () => {
    const { logs, logger } = collectLogger();
    new JekyllEngine({
      vfs: { '_data/authors.yml': 'name: [unclosed\n' },
      logger,
    });
    expect(logs.some((l) => l.level === 'warn' && l.message.includes('_data/authors.yml'))).toBe(true);
  });

  test('post with bad front matter logs a warning and is skipped', async () => {
    const { logs, logger } = collectLogger();
    const engine = new JekyllEngine({
      vfs: {
        '_posts/2026-06-20-bad.md': '---\ntitle: [unclosed\n---\nBody',
        'index.md': '---\ntitle: H\n---\nHome.',
      },
      logger,
    });
    const res = await engine.build();
    expect(logs.some((l) => l.level === 'warn')).toBe(true);
    expect(res.some((r) => r.path.includes('bad'))).toBe(false);
    expect(res.some((r) => r.path === 'index.md')).toBe(true);
  });

  test('sass compile error logs a warning', async () => {
    const { logs, logger } = collectLogger();
    const engine = new JekyllEngine({
      vfs: { 'assets/main.scss': '---\n---\n.broken {\n  @error "boom";\n}\n' },
      logger,
    });
    await engine.build();
    expect(logs.some((l) => l.level === 'warn' && l.message.includes('main.scss'))).toBe(true);
  });
});

describe('FIX 7: no global marked mutation', () => {
  test('the shared marked instance keeps its default renderer', () => {
    const html = marked.parse('`<b>x</b>`');
    expect(html).not.toContain('highlighter-rouge');
    expect(html).toContain('&lt;b&gt;');
  });
});

describe('FIX 8: highlight linenos', () => {
  test('{% highlight %} with linenos renders line numbers', async () => {
    const engine = new JekyllEngine({
      vfs: {
        'index.md':
          '---\ntitle: H\n---\n{% highlight ruby linenos %}\ndef foo\n  1\nend\n{% endhighlight %}',
      },
    });
    const res = await engine.build();
    expect(res[0].content).toContain('rouge-table');
    expect(res[0].content).toContain('lineno');
  });

  test('{% highlight %} without linenos keeps the plain shape', async () => {
    const engine = new JekyllEngine({
      vfs: {
        'index.md': '---\ntitle: H\n---\n{% highlight ruby %}\ndef foo\nend\n{% endhighlight %}',
      },
    });
    const res = await engine.build();
    expect(res[0].content).toContain('<figure class="highlight">');
    expect(res[0].content).not.toContain('rouge-table');
  });
});

describe('FIX 9: scss entry points outside assets/', () => {
  test('isSassAsset accepts any front-matter scss except _sass/ and partials', () => {
    expect(isSassAsset('css/main.scss', '---\n---\n')).toBe(true);
    expect(isSassAsset('assets/main.scss', '---\n---\n')).toBe(true);
    expect(isSassAsset('_sass/minima.scss', '---\n---\n')).toBe(false);
    expect(isSassAsset('assets/_partial.scss', '---\n---\n')).toBe(false);
    expect(isSassAsset('css/main.scss', 'no front matter')).toBe(false);
    expect(isSassAsset('css/main.css', '---\n---\n')).toBe(false);
  });

  test('scss outside assets/ compiles and lands at the mirrored css path', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_sass/_vars.scss': '$c: red;',
        'css/main.scss': '---\n---\n@import "vars";\na { color: $c; }',
      },
    });
    const res = await engine.build();
    const css = res.find((r) => r.permalink === '/css/main.css');
    expect(css).toBeDefined();
    expect(css.content).toContain('color:red');
  });

  test('_sass/ files are never emitted as compiled pages', async () => {
    const engine = new JekyllEngine({
      vfs: {
        '_sass/minima.scss': '---\n---\n$x: 1;\n',
      },
    });
    const res = await engine.build();
    expect(res.some((r) => r.permalink.includes('_sass'))).toBe(false);
  });
});
