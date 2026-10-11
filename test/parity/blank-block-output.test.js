/**
 * Blank block-tag output skipping (Liquid 4.0.4 parity, the exact version
 * Jekyll 4.3.4 ships).
 *
 * Ground truth: real Ruby oracle (jekyll 4.3.4 + liquid 4.0.4).
 * lib/liquid/block_body.rb#render:
 *
 *     when Block
 *       render_node_to_output(node, output, context, node.blank?)
 *
 * A Block tag (if/unless/for/tablerow/case/capture/comment/raw, and
 * Jekyll's Block-based custom tags like {% highlight %}) whose body is
 * statically "blank" -- whitespace-only text plus blank tags like
 * {% assign %} (Assign#blank? => true, Tag#blank? => false) -- is still
 * RENDERED (side effects like {% assign %} happen) but its output is
 * discarded by the parent. Every template list renders through
 * BlockBody#render, so this applies at every nesting level.
 *
 * Oracle evidence (recorded 2026-10-11, liquid 4.0.4):
 *   "A{% if true %}\n    {% assign foo = true %}\n  {% endif %}B[foo={{ foo }}]"
 *     => "AB[foo=true]"
 *   "{% for i in (1..2) %}\n  {% assign f = i %}\n{% endfor %}[f={{ f }}]"
 *     => "[f=2]"
 * Non-blank bodies are unaffected:
 *   "A{% if true %}\n  x\n{% endif %}B" => "A\n  x\nB"
 *
 * Real-world trigger: beautiful-jekyll's _includes/social-share.html --
 * the {% for %} over site.share-links-active contains only {% assign %}
 * inside {% if %}, so real Jekyll emits empty lines where a naive port
 * emits whitespace-only lines (byte-compare diff on both post pages).
 */
import { JekyllEngine } from '../../src/engine.js';

let engine = null;
async function render(template, context = {}) {
  if (!engine) engine = new JekyllEngine({ vfs: {}, logger: () => {} });
  const liquid = engine.liquidEngine || engine._liquid;
  if (!liquid) throw new Error('Cannot access Liquid engine');
  return await liquid.parseAndRender(template, context);
}

describe('blank block-tag output skipping (Liquid 4.0.4)', () => {
  test('blank if (whitespace + assign): output skipped, assign still runs', async () => {
    const out = await render(
      'A{% if true %}\n    {% assign foo = true %}\n  {% endif %}B[foo={{ foo }}]'
    );
    expect(out).toBe('AB[foo=true]');
  });

  test('blank unless: output skipped', async () => {
    const out = await render('A{% unless false %}\n  {% assign u = 1 %}\n{% endunless %}B');
    expect(out).toBe('AB');
  });

  test('blank case/when: output skipped', async () => {
    const out = await render(
      'A{% case 1 %}{% when 1 %}\n  {% assign c = 1 %}\n{% endcase %}B'
    );
    expect(out).toBe('AB');
  });

  test('blank for body: per-iteration whitespace skipped, loop still runs', async () => {
    const out = await render(
      '{% for i in (1..2) %}\n  {% assign f = i %}\n{% endfor %}[f={{ f }}]'
    );
    expect(out).toBe('[f=2]');
  });

  test('nested blank ifs: skipped at every level', async () => {
    const out = await render(
      'A{% if true %}{% if true %}\n  {% assign n = 1 %}\n{% endif %}{% endif %}B'
    );
    expect(out).toBe('AB');
  });

  test('false blank if: skipped, assign never runs', async () => {
    const out = await render(
      'A{% if false %}\n  {% assign z = 1 %}\n{% endif %}B[z={{ z | default: "nil" }}]'
    );
    expect(out).toBe('AB[z=nil]');
  });

  test('non-blank if: whitespace preserved', async () => {
    const out = await render('A{% if true %}\n  x\n{% endif %}B');
    expect(out).toBe('A\n  x\nB');
  });

  test('non-blank for: iterations render normally', async () => {
    const out = await render('{% for i in (1..2) %}\n  {{ i }}\n{% endfor %}');
    expect(out).toBe('\n  1\n\n  2\n');
  });

  test('capture still assigns (skip is a no-op for capture)', async () => {
    const out = await render('{% capture cap %}hello{% endcapture %}[{{ cap }}]');
    expect(out).toBe('[hello]');
  });

  test('social-share pattern: blank for over hash with blank if body', async () => {
    // Mirrors beautiful-jekyll's _includes/social-share.html structure
    // (blank line between {% endfor %} and {% if %}).
    const out = await render(
      '<!-- x -->\n' +
        '{% assign any = false %}\n' +
        '{% for links in site.share %}\n' +
        '  {% if links[1] == true %}\n' +
        '    {% assign any = true %}\n' +
        '  {% endif %}\n' +
        '{% endfor %}\n' +
        '\n' +
        '{% if any %}\n' +
        '<section>y</section>\n' +
        '{% endif %}',
      { site: { share: { twitter: true, facebook: false } } }
    );
    expect(out).toBe('<!-- x -->\n\n\n\n\n<section>y</section>\n');
  });
});
