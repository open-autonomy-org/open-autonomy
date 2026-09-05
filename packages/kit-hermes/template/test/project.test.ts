import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

// The project's own check starts here. A test proves an acceptance line or guards a bug that happened.
test('the repository names itself', () => {
  expect(readFileSync(new URL('../README.md', import.meta.url), 'utf8').startsWith('# __PROJECT__')).toBe(true);
});
