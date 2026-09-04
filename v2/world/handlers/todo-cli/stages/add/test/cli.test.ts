import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HELP, main } from '../src/cli.ts';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'todo-')); process.env.TODO_FILE = join(dir, 'todo.json'); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));
const store = () => JSON.parse(readFileSync(process.env.TODO_FILE!, 'utf8'));

test('help is the default and names every command', () => {
  expect(main([]).out).toBe(HELP);
  expect(main(['help']).code).toBe(0);
  expect(main(['nope']).code).toBe(2);
  expect(HELP).toContain('  add <text>');
});

test('add appends items with ids 1 and 2 and stores the text', () => {
  expect(main(['add', 'buy milk'])).toEqual({ code: 0, out: '1\n' });
  expect(main(['add', 'walk', 'the', 'dog']).out).toBe('2\n');
  expect(store().items.map((i: any) => [i.id, i.text, i.done])).toEqual([[1, 'buy milk', false], [2, 'walk the dog', false]]);
  expect(typeof store().items[0].created).toBe('string');
  expect(main(['add']).code).toBe(2);
});
