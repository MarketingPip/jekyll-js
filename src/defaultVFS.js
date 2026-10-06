export const defaultVFS = {
  '_config.yml': `title: "Static Site Sandbox"
author: "Lead Designer"
permalink: /blog/:title/
baseurl: ""
`,
  '_layouts/default.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>{{ page.title }} | {{ site.title }}</title>
</head>
<body>
  <header>
    <h1>{{ site.title }}</h1>
    {% include navigation.html %}
  </header>

  <div class="layout-grid">
    <main>
      {{ content }}
    </main>

    <aside>
      {% assign custom_component = "sidebar_card.html" %}
      {% include {{ custom_component }} title="Local Sandbox Scope" type="info" %}
    </aside>
  </div>

  <footer>
    <p>© {{ 'now' | date: '%Y' }} {{ site.author }}. Compiled inside Web Liquid VM.</p>
  </footer>
</body>
</html>`,
  '_includes/navigation.html': `<nav>
  <a href="/">Home</a>
  <a href="/about">About</a>
  <a href="/blog">Blog</a>
</nav>`,
  '_includes/sidebar_card.html': `<div class="sidebar-card">
  <h4>{{ include.title }}</h4>
  <p>
    This sidebar represents a dynamic card using:
  </p>
  <code>
    include.type = {{ include.type }}
  </code>
</div>`,
  '_includes/alert_box.html': `<div class="alert-box">
  <strong>{{ include.heading | default: "Notification" }}</strong>
  {{ include.body_content }}
</div>`,
  '_data/authors.yml': `alice:
  name: "Alice Chen"
  bio: "Frontend architect and design enthusiast."
  twitter: "@alicechen"

bob:
  name: "Bob Smith"
  bio: "Systems dev specializing in distributed runtime sandboxes."
  twitter: "@bobsmith"`,
  'index.md': `---
layout: default.html
title: "Welcome"
---

# Jekyll LiquidJS Compiler Sandbox

This playground features the upgraded **LiquidJS** execution compiler with full Jekyll options.

{% include alert_box.html heading="Compilation Alert" body_content="Notice how the parameter assigns with an equals sign instead of a colon, and compiles straight to include.heading!" %}
`,
  'about.md': `---
layout: default.html
title: "About"
permalink: /about/
---

# About Authors

{% assign author = site.data.authors.alice %}
### {{ author.name }}
> {{ author.bio }}
`,
  'blog.md': `---
layout: default.html
title: "Blog"
permalink: /blog/
---

# Live Sandbox Feed

{% for post in site.posts %}
<div>
  <h2><a href="{{ post.url }}">{{ post.title }}</a></h2>
  <small>Published: {{ post.date | date_to_string }}</small>
  <p>{{ post.excerpt | strip_html | truncate: 150 }}</p>
</div>
{% endfor %}`,
  '_posts/2026-06-20-getting-started.md': `---
layout: default.html
title: "Getting Started with the Compiler"
date: 2026-06-20
author: alice
tags: [tutorial, compiler, runtime]
---

# Static Sandbox Runtimes

This system mimics basic static compilers. When you trigger "Build", it maps files in scope, evaluates template dependency bindings, and publishes the static tree.

## Dynamic Code Execution Block

Current year: **{{ 'now' | date: '%Y' }}**
Site config author: **{{ site.author }}**
Current tags: **{{ page.tags | join: ', ' }}**

[Back to main blog](/blog)`,
  '_posts/2026-06-15-advanced-liquid.md': `---
layout: default.html
title: "Evaluation Engine Techniques"
date: 2026-06-15
author: bob
tags: [advanced, design, patterns]
---

# Complex Processing Filters

Liquid filters transform local outputs dynamically:

- **String Uppercasing**: {{ "hello standard runtime" | upcase }}
- **Truncating Output**: {{ "This is a long sentence parsed straight from a YAML front matter file format." | truncate: 45 }}

Enjoy evaluating code execution locally inside memory!`,
};
