import { expect, test } from 'bun:test';
import { HELP, main } from '../src/cli.ts';

test('help is the default and names every command', () => {
  expect(main([]).out).toBe(HELP);
  expect(main(['help']).code).toBe(0);
  expect(main(['nope']).code).toBe(2);
});
