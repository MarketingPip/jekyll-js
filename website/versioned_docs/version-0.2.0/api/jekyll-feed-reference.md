---
title: Jekyll Feed API
---

## Functions


- [isFeedEnabled()](#isFeedEnabled)


<a name="isFeedEnabled"></a>

## isFeedEnabled()
Whether the site opted into jekyll-feed via `_config.yml` `plugins:`.

**Kind**: global function  
<a name="generateFeeds"></a>

## generateFeeds(engine) ⇒ <code>Promise.&lt;Array.&lt;&#123;path, permalink, content&#125;&gt;&gt;</code>
Generate feed pages. Called by JekyllEngine.build() after normal rendering.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| engine | <code>JekyllEngine</code> | the built engine (for liquidEngine + config) |
