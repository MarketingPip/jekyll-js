---
title: Jekyll Compatibility
---

## Functions


- [applyJekyllCompat(engine, config)](#applyJekyllCompat)


<a name="applyJekyllCompat"></a>

## applyJekyllCompat(engine, config)
Apply Jekyll _config.yml compatibility.

Reads `markdown`, `highlighter`, and `sass` keys from config
and loads the corresponding adapters.

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| engine | <code>JekyllEngine</code> | The engine instance |
| config | <code>Object</code> | Parsed _config.yml |

<a name="detectJekyllCompat"></a>

## detectJekyllCompat(config) ⇒ <code>Object</code>
Detect Jekyll version-specific behaviors from config.

**Kind**: global function  
**Returns**: <code>Object</code> - Compatibility flags  

| Param | Type |
| --- | --- |
| config | <code>Object</code> |
