import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

// The project's own check starts here; a test is added only where an acceptance line guards the constitution.
test('the repository names itself', () => {
  expect(readFileSync(new URL('../README.md', import.meta.url), 'utf8').startsWith('# lexicon')).toBe(true);
});
