/**
 * Filters from official Jekyll test suite (test_filters.rb).
 * Found missing by auditing against Jekyll's own tests.
 */
import { JekyllEngine } from '../../src/engine.js';

async function renderFilter(template, context = {}) {
  const engine = new JekyllEngine({ vfs: {}, logger: () => {} });
  // Access the LiquidJS instance to render directly
  const liquid = engine.liquidEngine || engine._liquid;
  if (!liquid) throw new Error('Cannot access Liquid engine');
  return await liquid.parseAndRender(template, context);
}

describe('array_to_sentence_string (Jekyll official)', () => {
  const cases = [
    [[], 'and', ''],
    [[1], 'and', '1'],
    [['chunky'], 'and', 'chunky'],
    [[1, 2], 'and', '1 and 2'],
    [['chunky', 'bacon'], 'and', 'chunky and bacon'],
    [[1, 2, 3, 4], 'and', '1, 2, 3, and 4'],
    [['chunky', 'bacon', 'bits', 'pieces'], 'and', 'chunky, bacon, bits, and pieces'],
    [[1, 2], 'or', '1 or 2'],
    [[1, 2, 3, 4], 'or', '1, 2, 3, or 4'],
  ];
  for (const [arr, connector, expected] of cases) {
    test(`${JSON.stringify(arr)} with "${connector}" → "${expected}"`, async () => {
      const template =
        connector === 'and'
          ? '{{ arr | array_to_sentence_string }}'
          : `{{ arr | array_to_sentence_string: "${connector}" }}`;
      const result = await renderFilter(template, { arr });
      expect(result).toBe(expected);
    });
  }
});

describe('find_exp (Jekyll official)', () => {
  test('finds first matching item', async () => {
    const items = [
      { title: 'A', draft: true },
      { title: 'B', draft: false },
      { title: 'C', draft: false },
    ];
    const result = await renderFilter(
      '{{ items | find_exp: "item", "item.draft == false" | map: "title" }}',
      { items }
    );
    expect(result).toBe('B');
  });

  test('returns nil when nothing matches', async () => {
    const result = await renderFilter(
      '{{ items | find_exp: "item", "item.draft == true" | default: "none" }}',
      { items: [{ draft: false }] }
    );
    expect(result).toBe('none');
  });
});

describe('group_by_exp (Jekyll official)', () => {
  test('groups by expression result', async () => {
    const items = [
      { title: 'A', year: 2024 },
      { title: 'B', year: 2025 },
      { title: 'C', year: 2024 },
    ];
    const result = await renderFilter(
      '{{ items | group_by_exp: "item", "item.year" | map: "name" | join: "," }}',
      { items }
    );
    expect(result).toBe('2024,2025');
  });
});
