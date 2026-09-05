#!/usr/bin/env bun
// lexicon — a shared glossary in a JSON file, rendered to the homepage. Commands are added by the board, one
// task at a time. Usage: bun src/lexicon.ts <command> [args]   (the store is ./lexicon.json, or $LEXICON_FILE)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export interface Term { term: string; definition: string; source?: string; added: string }
export const HELP = `lexicon — a shared glossary in a JSON file

usage: lexicon <command> [args]

commands:
  help                                          show this help
  add <term> -- <definition> [--source <url>]   add a term (a term is defined once)
  list                                          every term, alphabetically, with its definition
`;
const store = (): string => process.env.LEXICON_FILE ?? 'lexicon.json';
export const load = (): Term[] => (existsSync(store()) ? (JSON.parse(readFileSync(store(), 'utf8')) as Term[]) : []);
const save = (terms: Term[]): void => writeFileSync(store(), `${JSON.stringify(terms, null, 2)}\n`);

export function add(term: string, definition: string, source?: string): Term {
  if (!term.trim() || !definition.trim()) throw new Error('a term and its definition are both required');
  const terms = load();
  if (terms.some((t) => t.term.toLowerCase() === term.trim().toLowerCase())) throw new Error(`${term} is already defined; a term is defined once`);
  const entry: Term = { term: term.trim(), definition: definition.trim(), ...(source ? { source } : {}), added: new Date().toISOString().slice(0, 10) };
  save([...terms, entry].sort((a, b) => a.term.localeCompare(b.term)));
  return entry;
}
export const list = (): string => load().map((t) => `${t.term}: ${t.definition}${t.source ? ` (${t.source})` : ''}`).join('\n') || '(no terms yet)';

export function main(argv: string[]): string {
  const [command, ...rest] = argv;
  if (!command || command === 'help') return HELP;
  if (command === 'add') {
    const sep = rest.indexOf('--');
    if (sep < 0) throw new Error('usage: lexicon add <term> -- <definition> [--source <url>]');
    const tail = rest.slice(sep + 1);
    const src = tail.indexOf('--source');
    const source = src >= 0 ? tail[src + 1] : undefined;
    const definition = (src >= 0 ? [...tail.slice(0, src), ...tail.slice(src + 2)] : tail).join(' ');
    return `added ${add(rest.slice(0, sep).join(' '), definition, source).term}`;
  }
  if (command === 'list') return list();
  throw new Error(`unknown command: ${command}\n\n${HELP}`);
}
if (import.meta.main) {
  try { console.log(main(process.argv.slice(2))); } catch (e) { console.error((e as Error).message); process.exit(1); }
}
