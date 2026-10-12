/**
 * escape_once parity vs Ruby Liquid.
 * LiquidJS's built-in escape_once double-escapes existing entities
 * (&#8617; → &amp;#8617;). Ruby uses a negative lookahead to preserve them.
 * Ground truth: Ruby Liquid's CGI.escapeHTML + entity lookahead.
 */
import { JekyllEngine } from '../../src/engine.js';

describe('escape_once', () => {
  test('preserves numeric entities', async () => {
    const engine = new JekyllEngine({ vfs: {} });
    const out = await engine.renderTemplate('{{ "a &#8617; b" | escape_once }}', {});
    expect(out).toBe('a &#8617; b');
  });

  test('preserves named entities', async () => {
    const engine = new JekyllEngine({ vfs: {} });
    const out = await engine.renderTemplate('{{ "a &mdash; b" | escape_once }}', {});
    expect(out).toBe('a &mdash; b');
  });

  test('escapes bare ampersands', async () => {
    const engine = new JekyllEngine({ vfs: {} });
    const out = await engine.renderTemplate('{{ "a & b" | escape_once }}', {});
    expect(out).toBe('a &amp; b');
  });

  test('escapes angle brackets and quotes', async () => {
    const engine = new JekyllEngine({ vfs: {} });
    const out = await engine.renderTemplate('{{ "<a href=\\"x\\">" | escape_once }}', {});
    expect(out).toBe('&lt;a href=&quot;x&quot;&gt;');
  });
});
