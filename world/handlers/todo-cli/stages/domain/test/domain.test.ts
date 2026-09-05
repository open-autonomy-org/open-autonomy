import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

test('docs/DOMAIN.md names the domain', () => {
  expect(readFileSync(new URL('../docs/DOMAIN.md', import.meta.url), 'utf8')).toContain('todo-cli.example');
});
