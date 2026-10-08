---
title: Jekyll Feed API
---

## Functions

<dl>
<dt><a href="#isFeedEnabled">isFeedEnabled()</a></dt>
<dd><p>Whether the site opted into jekyll-feed via <code>_config.yml</code> <code>plugins:</code>.</p>
</dd>
<dt><a href="#generateFeeds">generateFeeds(engine)</a> ⇒ <code>Promise.&lt;Array.&lt;{path, permalink, content}&gt;&gt;</code></dt>
<dd><p>Generate feed pages. Called by JekyllEngine.build() after normal rendering.</p>
</dd>
</dl>

<a name="isFeedEnabled"></a>

## isFeedEnabled()
Whether the site opted into jekyll-feed via `_config.yml` `plugins:`.

**Kind**: global function  
<a name="generateFeeds"></a>

## generateFeeds(engine) ⇒ <code>Promise.&lt;Array.&lt;{path, permalink, content}&gt;&gt;</code>
Generate feed pages. Called by JekyllEngine.build() after normal rendering.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| engine | <code>JekyllEngine</code> | the built engine (for liquidEngine + config) |
