import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

// The project's own check starts here. Every roadmap item adds tests for what it adds.
test('the repository names itself', () => {
  expect(readFileSync(new URL('../README.md', import.meta.url), 'utf8').startsWith('# __PROJECT__')).toBe(true);
});
