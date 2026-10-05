import { Liquid } from 'liquidjs';
test('liquidjs loads', async () => {
  const engine = new Liquid();
  const out = await engine.parseAndRender('{{ x | upcase }}', { x: 'hi' });
  expect(out).toBe('HI');
});
