/**
 * Build a Jekyll site with pure JS function calls — no VFS JSON blob.
 *
 * Run: node examples/build-site.js
 */
import { JekyllEngine } from '../engine.js';

const engine = new JekyllEngine();

// Site config
engine.writeFile('_config.yml', `title: "Patch's Notes"
author: "Patch"
permalink: /blog/:title/
`);

// Layout + include
engine.writeFile(
  '_layouts/default.html',
  `<!DOCTYPE html>
<html><head><title>{{ page.title }} | {{ site.title }}</title></head>
<body>
  <header><h1>{{ site.title }}</h1>{% include nav.html %}</header>
  <main>{{ content }}</main>
  <footer>by {{ site.author }}</footer>
</body></html>`
);
engine.writeFile('_includes/nav.html', `<nav><a href="/">Home</a> <a href="/about/">About</a></nav>`);

// Pages
engine.writeFile(
  'index.md',
  `---
layout: default
title: Home
---
# Welcome

Latest posts:

{% for post in site.posts limit:3 %}
- [{{ post.title }}]({{ post.url }}) — {{ post.date | date: "%Y-%m-%d" }}
{% endfor %}
`
);
engine.writeFile(
  'about.md',
  `---
layout: default
title: About
permalink: /about/
---
# About

Built entirely through the JS API — no files, no JSON.
`
);

// A post
engine.writeFile(
  '_posts/2026-10-05-hello-world.md',
  `---
layout: default
title: Hello, World
---
# Hello, World

First post, written with \`engine.writeFile\`.
`
);

console.log('files:', engine.listFiles().join(', '));

const pages = await engine.build();
console.log(`\nbuilt ${pages.length} pages:`);
for (const p of pages) {
  console.log(`  ${p.permalink}  (${p.content.length} chars)`);
}

// Read back + remove demo
console.log('\nreadFile index.md:', JSON.stringify(engine.readFile('index.md').slice(0, 40)) + '…');
engine.removeFile('about.md');
console.log('after removeFile:', engine.listFiles().filter((f) => f.endsWith('.md')).join(', '));
const rebuilt = await engine.build();
console.log(`rebuilt ${rebuilt.length} pages (about gone: ${!rebuilt.some((p) => p.permalink === '/about/')})`);
