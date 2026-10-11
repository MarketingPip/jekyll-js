import { normalizeDotBracket } from '../../src/liquidPreprocess.js';
import { Liquid } from 'liquidjs';

describe('normalizeDotBracket (LiquidJS .[ ] parity)', () => {
  test('.[var] rewrites to [var] inside {{ }}', () => {
    expect(normalizeDotBracket('{{ tabs.[k] }}')).toBe('{{ tabs[k] }}');
  });
  test('renders the looked-up value, not [object Object]', async () => {
    const engine = new Liquid();
    const src = normalizeDotBracket('{{ tabs.[k] | upcase }}');
    expect(await engine.parseAndRender(src, { tabs: { a: 'hi' }, k: 'a' })).toBe('HI');
  });
  test('leaves .[ inside quoted strings alone', () => {
    expect(normalizeDotBracket('{{ "a.[b" }}')).toBe('{{ "a.[b" }}');
  });
  test('leaves {% raw %} blocks untouched', () => {
    const src = '{% raw %}{{ tabs.[k] }}{% endraw %}';
    expect(normalizeDotBracket(src)).toBe(src);
  });
  test('no-op when no .[ present', () => {
    expect(normalizeDotBracket('{{ tabs[k] }}')).toBe('{{ tabs[k] }}');
  });
});
