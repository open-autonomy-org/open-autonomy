#!/usr/bin/env bun
// lexicon — a shared glossary in a JSON file, rendered to the homepage. Commands are added by the board, one
// task at a time. Usage: bun src/lexicon.ts <command> [args]   (the store is ./lexicon.json, or $LEXICON_FILE)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface Term { term: string; definition: string; source?: string; added: string }
export const HELP = `lexicon — a shared glossary in a JSON file

usage: lexicon <command> [args]

commands:
  help                                          show this help
  add <term> -- <definition> [--source <url>]   add a term (a term is defined once)
  list                                          every term, alphabetically, with its definition
  render [<file>]                               the homepage from the store alone → docs/index.html
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
// The homepage: every term, and the project's four widgets from its Open Autonomy page (the account is
// LEXICON_ACCOUNT, the platform LEXICON_PLATFORM). Rendered from the store and nothing else.
const escape = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function render(terms: Term[], account = process.env.LEXICON_ACCOUNT ?? 'cookbook/lexicon', platform = process.env.LEXICON_PLATFORM ?? 'https://open-autonomy.org'): string {
  const acct = encodeURIComponent(account);
  const widgets = ['runway', 'now', 'roadmap', 'activity'].map((w) => `<a href="${platform}/p/${acct}"><img src="${platform}/v1/accounts/${acct}/${w}.svg" alt="${w}"></a>`).join('\n      ');
  const entries = terms.map((t) => `<dt id="${escape(t.term.toLowerCase().replace(/\s+/g, '-'))}">${escape(t.term)}</dt>\n      <dd>${escape(t.definition)}${t.source ? ` <a href="${escape(t.source)}">source</a>` : ''}<small> added ${t.added}</small></dd>`).join('\n      ');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>lexicon</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>body{font:16px/1.5 system-ui,sans-serif;max-width:48rem;margin:3rem auto;padding:0 1rem;color:#222}dt{font-weight:600;margin-top:1rem}dd{margin:0}small{color:#777;margin-left:.5rem}.widgets img{max-width:100%;margin:.25rem 0}</style>
</head>
<body>
  <h1>lexicon</h1>
  <p>A shared glossary, written by its community through this project's agent. ${terms.length} term${terms.length === 1 ? '' : 's'}. Propose one in an issue titled <code>request: add the term …</code>.</p>
  <dl>
      ${entries}
  </dl>
  <section class="widgets">
      ${widgets}
  </section>
</body>
</html>
`;
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
  if (command === 'render') { const out = rest[0] ?? 'docs/index.html'; mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, render(load())); return `rendered ${load().length} term(s) → ${out}`; }
  throw new Error(`unknown command: ${command}\n\n${HELP}`);
}
if (import.meta.main) {
  try { console.log(main(process.argv.slice(2))); } catch (e) { console.error((e as Error).message); process.exit(1); }
}
