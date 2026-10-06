/**
 * Example: Custom plugin with hooks and generators.
 * Run: node examples/plugin.js
 *
 * This ports a typical Jekyll Ruby plugin to the JS Plugin API:
 * - A generator that creates an archive page
 * - A hook that modifies pages after reading
 */
import { JekyllEngine } from '../src/engine.js';

function archivePlugin(engine) {
  // Generator: create a yearly archive page
  engine.registerGenerator((site) => {
    const years = {};
    for (const post of site.posts || []) {
      const year = new Date(post.date).getFullYear();
      years[year] = years[year] || [];
      years[year].push(post);
    }
    for (const [year, posts] of Object.entries(years)) {
      const page = engine.createPage({
        dir: 'archive',
        name: `${year}.html`,
        data: { layout: 'default', title: `${year} Archive`, posts },
        content: '<h1>{{ page.title }}</h1>\n{% for post in page.posts %}<a href="{{ post.url }}">{{ post.title }}</a>\n{% endfor %}',
      });
      site.pages.push(page);
    }
  });

  // Hook: add a "reading time" estimate to every post
  engine.registerHook('posts', 'post_render', (post) => {
    const words = (post.content || '').split(/\s+/).length;
    post.data.reading_time = Math.max(1, Math.ceil(words / 200));
  });
}

const pages = await new JekyllEngine({
  vfs: {
    '_layouts/default.html': '<html><body>{{ content }}</body></html>',
    '_posts/2026-01-01-a.md': '---\ntitle: Post A\n---\n' + 'word '.repeat(500),
    '_posts/2026-01-02-b.md': '---\ntitle: Post B\n---\nShort.',
  },
  logger: () => {},
})
  .use(archivePlugin)
  .build();

console.log(`Built ${pages.length} pages:`);
for (const p of pages) {
  console.log(`  ${p.permalink}`);
}
