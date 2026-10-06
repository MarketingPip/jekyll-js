/**
 * Example: Blog with posts, pagination, and Atom feed.
 * Run: node examples/blog.js
 */
import { JekyllEngine } from '../src/engine.js';

const pages = await new JekyllEngine({
  vfs: {
    '_config.yml': [
      'title: My Blog',
      'url: https://example.com',
      'paginate: 2',
      'plugins:',
      '  - jekyll-feed',
      '  - jekyll-sitemap',
      '',
    ].join('\n'),
    '_layouts/default.html': '<html><head><title>{{ page.title }}</title></head><body>{{ content }}</body></html>',
    '_layouts/post.html': '---\nlayout: default\n---\n<article><h1>{{ page.title }}</h1>{{ content }}</article>',
    'index.md': '---\nlayout: default\ntitle: Home\n---\n<h1>Posts</h1>\n{% for post in paginator.posts %}<a href="{{ post.url }}">{{ post.title }}</a>\n{% endfor %}',
    '_posts/2026-01-01-first.md': '---\nlayout: post\ntitle: First Post\n---\nHello world.',
    '_posts/2026-01-02-second.md': '---\nlayout: post\ntitle: Second Post\n---\nAnother post.',
    '_posts/2026-01-03-third.md': '---\nlayout: post\ntitle: Third Post\n---\nYet another.',
  },
  logger: () => {},
}).build();

console.log(`Built ${pages.length} pages:`);
for (const p of pages) {
  console.log(`  ${p.permalink}`);
}
