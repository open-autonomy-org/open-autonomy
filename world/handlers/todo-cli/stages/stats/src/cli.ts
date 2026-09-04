#!/usr/bin/env bun
// todo — a todo list in a JSON file. Commands are added by the roadmap, one item at a time.
// Usage: bun src/cli.ts <command> [args]   (the store is ./todo.json, or $TODO_FILE)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export const HELP = `todo — a todo list in a JSON file

usage: todo <command> [args]

commands:
  help                     show this help
  add <text> [--due DATE]  append an item (DATE is YYYY-MM-DD) and print its id
  list [--all] [--json]    print open items, due ones first (--all: done ones too, marked [x]; --json: as JSON)
  done <id>                mark an item finished
  remove <id>              delete an item (its id is never reused)
  stats                    count open, done and overdue items
`;

export interface Item { id: number; text: string; done: boolean; created: string; due?: string }
interface Store { next: number; items: Item[] }

const storePath = () => process.env.TODO_FILE ?? './todo.json';
export function load(): Store {
  if (!existsSync(storePath())) return { next: 1, items: [] };
  return JSON.parse(readFileSync(storePath(), 'utf8')) as Store;
}
function save(store: Store): void {
  writeFileSync(storePath(), `${JSON.stringify(store, null, 2)}\n`);
}
const today = () => process.env.TODO_TODAY ?? new Date().toISOString().slice(0, 10);
export const overdue = (item: Item) => !item.done && item.due !== undefined && item.due < today();
function ordered(items: Item[]): Item[] {
  const due = items.filter((i) => i.due).sort((a, b) => a.due!.localeCompare(b.due!) || a.id - b.id);
  return [...due, ...items.filter((i) => !i.due)];
}
function line(item: Item): string {
  const due = item.due ? ` (due ${item.due})${overdue(item) ? ' OVERDUE' : ''}` : '';
  return `${item.done ? '[x] ' : ''}${item.id}  ${item.text}${due}`;
}

export function main(argv: string[]): { code: number; out: string } {
  const [command, ...rest] = argv;
  const flags = new Set(rest.filter((a) => a.startsWith('--')));
  const args = rest.filter((a) => !a.startsWith('--'));
  if (!command || command === 'help' || command === '--help') return { code: 0, out: HELP };
  if (command === 'add') {
    const usage = { code: 2, out: 'usage: todo add <text> [--due YYYY-MM-DD]\n' };
    const dueAt = rest.indexOf('--due');
    const due = dueAt >= 0 ? rest[dueAt + 1] : undefined;
    if (dueAt >= 0 && !/^\d{4}-\d{2}-\d{2}$/.test(due ?? '')) return usage;
    const text = (dueAt >= 0 ? [...rest.slice(0, dueAt), ...rest.slice(dueAt + 2)] : rest).join(' ').trim();
    if (!text) return usage;
    const store = load();
    const item: Item = { id: store.next, text, done: false, created: new Date().toISOString(), ...(due ? { due } : {}) };
    store.next += 1;
    store.items.push(item);
    save(store);
    return { code: 0, out: `${item.id}\n` };
  }
  if (command === 'list') {
    const items = ordered(load().items.filter((i) => flags.has('--all') || !i.done));
    if (flags.has('--json')) return { code: 0, out: `${JSON.stringify(items)}\n` };
    if (!items.length) return { code: 0, out: 'nothing to do\n' };
    return { code: 0, out: `${items.map(line).join('\n')}\n` };
  }
  if (command === 'done' || command === 'remove') {
    const store = load();
    const item = store.items.find((i) => i.id === Number(args[0]));
    if (!item) return { code: 1, out: `no such item: ${args[0]}\n` };
    if (command === 'done') item.done = true; else store.items = store.items.filter((i) => i !== item);
    save(store);
    return { code: 0, out: '' };
  }
  if (command === 'stats') {
    const items = load().items;
    return { code: 0, out: `open ${items.filter((i) => !i.done).length}  done ${items.filter((i) => i.done).length}  overdue ${items.filter(overdue).length}\n` };
  }
  return { code: 2, out: `unknown command: ${command}\n\n${HELP}` };
}

if (import.meta.main) {
  const { code, out } = main(process.argv.slice(2));
  process.stdout.write(out);
  process.exit(code);
}
