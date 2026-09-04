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

test('list prints open items oldest first, or nothing to do', () => {
  expect(main(['list']).out).toBe('nothing to do\n');
  main(['add', 'a']); main(['add', 'b']);
  expect(main(['list']).out).toBe('1  a\n2  b\n');
});

test('done hides an item from list unless --all, and rejects an unknown id', () => {
  main(['add', 'a']); main(['add', 'b']);
  expect(main(['done', '1'])).toEqual({ code: 0, out: '' });
  expect(main(['list']).out).toBe('2  b\n');
  expect(main(['list', '--all']).out).toBe('[x] 1  a\n2  b\n');
  expect(main(['done', '9'])).toEqual({ code: 1, out: 'no such item: 9\n' });
});

test('remove deletes an item and its id is never reused', () => {
  main(['add', 'a']); main(['add', 'b']);
  expect(main(['remove', '2']).code).toBe(0);
  expect(main(['remove', '2'])).toEqual({ code: 1, out: 'no such item: 2\n' });
  expect(main(['add', 'c']).out).toBe('3\n');
  expect(main(['list']).out).toBe('1  a\n3  c\n');
});

test('list --json prints the items as JSON', () => {
  main(['add', 'a']); main(['add', 'b']); main(['done', '2']);
  const open = JSON.parse(main(['list', '--json']).out);
  expect(open.map((i: any) => Object.keys(i).sort())).toEqual([['created', 'done', 'id', 'text']]);
  expect(open[0]).toMatchObject({ id: 1, text: 'a', done: false });
  expect(JSON.parse(main(['list', '--all', '--json']).out).length).toBe(2);
});
