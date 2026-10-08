/**
 * Liquid filter semantics parity vs Ruby.
 *
 * Ground truth: real Ruby oracle (jekyll 4.4.1 + liquid 4.0.4, the exact
 * stack Jekyll 4.x ships) rendering the same templates. Ruby-expected values
 * are recorded in comments; the assertions encode them.
 *
 * Every test renders through the real template path
 * (JekyllEngine -> LiquidJS with registerJekyllExtensions), never by calling
 * filter functions directly.
 */
import { JekyllEngine } from '../../src/engine.js';

let engine = null;
async function renderFilter(template, context = {}) {
  if (!engine) engine = new JekyllEngine({ vfs: {}, logger: () => {} });
  const liquid = engine.liquidEngine || engine._liquid;
  if (!liquid) throw new Error('Cannot access Liquid engine');
  return await liquid.parseAndRender(template, context);
}

describe('group_by (Jekyll grouping_filters.rb)', () => {
  // Ruby: input.group_by { |item| item_property(item, property).to_s }
  //   => [{"name" => "", "items" => [...]}, ...]  (nil key -> "")
  // Oracle: {% for x in g %}[{{ x.name }}|{{ x.size }}|...] -> "[|2|a,c][x|1|b]"
  const items = [{ name: 'a' }, { name: 'b', parent: 'x' }, { name: 'c' }];

  test('stringifies nil keys to "" (just-the-docs sidebar nav)', async () => {
    const out = await renderFilter(
      '{% assign g = items | group_by: "parent" %}' +
      '{% for x in g %}[{{ x.name }}:{{ x.items | map: "name" | join: "," }}]{% endfor %}',
      { items }
    );
    expect(out).toBe('[:a,c][x:b]');
  });

  test('each group exposes name/items/size', async () => {
    const out = await renderFilter(
      '{% assign g = items | group_by: "parent" %}{{ g[0].size }}|{{ g[1].size }}|{{ g[0].items | size }}',
      { items }
    );
    expect(out).toBe('2|1|2');
  });

  test('nil-key group matches where_exp: name == empty', async () => {
    // Oracle: {{ items | group_by: "parent" | where_exp: "g", "g.name == empty" | size }} -> "1"
    const out = await renderFilter(
      '{{ items | group_by: "parent" | where_exp: "g", "g.name == empty" | size }}',
      { items }
    );
    expect(out).toBe('1');
  });

  test("nil-key group matches where_exp: name == ''", async () => {
    // Oracle: ... where_exp: "g", "g.name == ''" | size -> "1"
    const out = await renderFilter(
      `{{ items | group_by: "parent" | where_exp: "g", "g.name == ''" | size }}`,
      { items }
    );
    expect(out).toBe('1');
  });

  test('stringifies non-string keys', async () => {
    // Oracle: group_by: "n" over [{n:1},{n:2},{n:1}] -> names "1","2"
    const out = await renderFilter(
      '{% assign g = items | group_by: "n" %}{% for x in g %}{{ x.name }};{% endfor %}',
      { items: [{ n: 1 }, { n: 2 }, { n: 1 }] }
    );
    expect(out).toBe('1;2;');
  });
});

describe('uniq (Liquid 5.x: InputIterator flattens nested arrays)', () => {
  // Ruby: InputIterator.new(input, context).uniq  (input.flatten -- deep)
  // Oracle: [[1,2],[2,3],1,[1]] | uniq | join -> "1,2,3"
  test('flattens nested arrays before uniq', async () => {
    const out = await renderFilter('{{ a | uniq | join: "," }}', { a: [[1, 2], [2, 3], 1, [1]] });
    expect(out).toBe('1,2,3');
  });

  test('deeply nested arrays flatten fully', async () => {
    const out = await renderFilter('{{ a | uniq | join: "," }}', { a: [[[1]], [1, [2]]] });
    expect(out).toBe('1,2');
  });

  test('flat arrays keep order and dedupe', async () => {
    const out = await renderFilter('{{ a | uniq | join: "," }}', { a: [3, 1, 2, 1] });
    expect(out).toBe('3,1,2');
  });
});

describe('split (Ruby String#split)', () => {
  // Ruby: " a  b ".split(" ") -> ["a","b"]  (whitespace runs, leading stripped)
  test('split: " " splits on whitespace runs and strips leading whitespace', async () => {
    const out = await renderFilter('{{ s | split: " " | join: "," }}', { s: ' a  b ' });
    expect(out).toBe('a,b');
  });

  test('split: " " treats tabs and newlines as separators', async () => {
    // Oracle: "a\\tb\\nc".split(" ") -> ["a","b","c"]
    const out = await renderFilter('{{ s | split: " " | join: "," }}', { s: 'a\tb\nc' });
    expect(out).toBe('a,b,c');
  });

  test('split: " " on empty string', async () => {
    // Oracle: "".split(" ") -> []
    const out = await renderFilter('[{{ s | split: " " | join: "," }}]', { s: '' });
    expect(out).toBe('[]');
  });

  test('split: " " on whitespace-only string', async () => {
    // Oracle: "   ".split(" ") -> []
    const out = await renderFilter('[{{ s | split: " " | join: "," }}]', { s: '   ' });
    expect(out).toBe('[]');
  });

  test('other separators stay literal', async () => {
    const out = await renderFilter('{{ s | split: "," | join: ";" }}', { s: 'a,b' });
    expect(out).toBe('a;b');
  });

  test('trailing empty fields are still dropped (Ruby split behavior)', async () => {
    // Ruby: "a,b,".split(",") -> ["a","b"]
    const out = await renderFilter('{{ s | split: "," | join: ";" }}', { s: 'a,b,' });
    expect(out).toBe('a;b');
  });
});

describe('escape (Ruby: nil in -> nil out)', () => {
  // Ruby Liquid: CGI.escapeHTML(...) unless input.nil?  -> nil stays nil (falsy)
  test('escape(nil) is falsy downstream', async () => {
    // Oracle: {% if x | escape %}T{% else %}F{% endif %} -> "F"
    const out = await renderFilter('{% if x | escape %}T{% else %}F{% endif %}');
    expect(out).toBe('F');
  });

  test('escape(nil) renders as empty string', async () => {
    const out = await renderFilter('[{{ x | escape }}]');
    expect(out).toBe('[]');
  });

  test('escapes like CGI.escapeHTML', async () => {
    // Oracle: 'a<b>&"c\'d' | escape -> "a&lt;b&gt;&amp;&quot;c&#39;d"
    const out = await renderFilter('{{ s | escape }}', { s: `a<b>&"c'd` });
    expect(out).toBe('a&lt;b&gt;&amp;&quot;c&#39;d');
  });
});

describe('xml_escape (Jekyll filters.rb)', () => {
  // Ruby: input.to_s.encode(:xml => :attr) -> &amp; &lt; &gt; &quot; &apos;
  // Oracle: 'a&b<c>d"e\'f' | xml_escape -> "a&amp;b&lt;c&gt;d&quot;e&apos;f"
  test('emits &apos; and &quot; (not &#39; / &#34;)', async () => {
    const out = await renderFilter('{{ s | xml_escape }}', { s: `a&b<c>d"e'f` });
    expect(out).toBe('a&amp;b&lt;c&gt;d&quot;e&apos;f');
  });

  test('nil renders as empty string', async () => {
    // Ruby: nil.to_s -> ""
    const out = await renderFilter('[{{ x | xml_escape }}]');
    expect(out).toBe('[]');
  });
});

describe('str[0] indexing (investigated: unfixable without patching LiquidJS)', () => {
  // Ruby Liquid 4.x oracle: {{ "abc"[0] }} -> "" (also [1], [-1])
  // LiquidJS resolves this in Context#readProperty (obj[key] on a string),
  // deep inside the bundled engine -- there is no registerFilter/tag hook
  // that can intercept variable lookup. Fixing it means patching LiquidJS
  // internals, which is out of scope. Documented here as a known divergence.
  test.skip('Ruby returns "" for integer index into a string (LiquidJS returns first char)', async () => {
    const out = await renderFilter('{{ s[0] }}', { s: 'abc' });
    expect(out).toBe('');
  });
});

describe('where (Jekyll compare_property_vs_target)', () => {
  // Ruby (jekyll/lib/jekyll/filters.rb):
  //   target nil            -> match iff property.nil?
  //   target empty/blank    -> target.to_s == "" ; match iff property == "" or Array(property).join == ""
  //   target Array or Hash  -> return input unchanged
  //   else                  -> target = target.to_s;
  //                            String property ? property == target
  //                                            : Array(property).any? { |p| p.to_s == target }
  // Oracle (val in {nil,false,0,"",1,"0","false",[1,2]}):
  //   nil->"nil"  false->"false,strfalse"  0->"zero,str0"  ""->"empty"
  //   1->"one,arr"  "0"->"zero,str0"  array-target->all  empty->"nil,emptystr"
  const w = [
    { title: 'nil', val: null },
    { title: 'false', val: false },
    { title: 'zero', val: 0 },
    { title: 'empty', val: '' },
    { title: 'one', val: 1 },
    { title: 'str0', val: '0' },
    { title: 'strfalse', val: 'false' },
    { title: 'arr', val: [1, 2] },
  ];
  const titles = (target) =>
    renderFilter(`{{ w | where: "val", ${target} | map: "title" | join: "," }}`, { w });

  test('nil target matches only nil', async () => {
    expect(await titles('nil')).toBe('nil');
  });

  test('false target matches false and "false"', async () => {
    expect(await titles('false')).toBe('false,strfalse');
  });

  test('0 target matches 0 and "0"', async () => {
    expect(await titles('0')).toBe('zero,str0');
  });

  test('"" target matches only ""', async () => {
    expect(await titles('""')).toBe('empty');
  });

  test('1 target matches 1 and arrays containing 1', async () => {
    expect(await titles('1')).toBe('one,arr');
  });

  test('array target returns input unchanged', async () => {
    const out = await renderFilter(
      '{{ w | where: "val", aval | map: "title" | join: "," }}',
      { w, aval: [1, 2] }
    );
    expect(out).toBe('nil,false,zero,empty,one,str0,strfalse,arr');
  });

  test('empty literal target matches nil and ""', async () => {
    // Oracle: where: "val", empty over {nil,"",0} -> "nil,emptystr"
    const w2 = [
      { title: 'nil', val: null },
      { title: 'emptystr', val: '' },
      { title: 'zero', val: 0 },
    ];
    const out = await renderFilter(
      '{{ w | where: "val", empty | map: "title" | join: "," }}',
      { w: w2 }
    );
    expect(out).toBe('nil,emptystr');
  });

  test('missing value behaves like explicit nil (deliberate divergence)', async () => {
    // Ruby Jekyll 4.4 raises ArgumentError here ("Liquid error: wrong number
    // of arguments (given 2, expected 3)") -- no working theme can depend on
    // that output, and throwing would turn builds into failures. We
    // deliberately treat a missing value like an explicit nil so 1-arg and
    // 2-arg-nil forms share one mental model ("omitted value = nil").
    const out = await renderFilter('{{ w | where: "val" | map: "title" | join: "," }}', { w });
    expect(out).toBe('nil');
  });
});
