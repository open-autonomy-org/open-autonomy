#!/usr/bin/env bun
// todo — a todo list in a JSON file. Commands are added by the roadmap, one item at a time.
// Usage: bun src/cli.ts <command> [args]   (the store is ./todo.json, or $TODO_FILE)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export const HELP = `todo — a todo list in a JSON file

usage: todo <command> [args]

commands:
  help          show this help
  add <text>    append an item and print its id
`;

export interface Item { id: number; text: string; done: boolean; created: string }
interface Store { next: number; items: Item[] }

const storePath = () => process.env.TODO_FILE ?? './todo.json';
export function load(): Store {
  if (!existsSync(storePath())) return { next: 1, items: [] };
  return JSON.parse(readFileSync(storePath(), 'utf8')) as Store;
}
function save(store: Store): void {
  writeFileSync(storePath(), `${JSON.stringify(store, null, 2)}\n`);
}

export function main(argv: string[]): { code: number; out: string } {
  const [command, ...rest] = argv;
  if (!command || command === 'help' || command === '--help') return { code: 0, out: HELP };
  if (command === 'add') {
    const text = rest.join(' ').trim();
    if (!text) return { code: 2, out: 'usage: todo add <text>\n' };
    const store = load();
    const item: Item = { id: store.next, text, done: false, created: new Date().toISOString() };
    store.next += 1;
    store.items.push(item);
    save(store);
    return { code: 0, out: `${item.id}\n` };
  }
  return { code: 2, out: `unknown command: ${command}\n\n${HELP}` };
}

if (import.meta.main) {
  const { code, out } = main(process.argv.slice(2));
  process.stdout.write(out);
  process.exit(code);
}
