import { expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { load, main, render } from '../src/lexicon.ts';

// A term is defined once (CONSTITUTION.md): the store refuses a second definition of the same term.
test('a term is defined once', () => {
  process.env.LEXICON_FILE = join(mkdtempSync(join(tmpdir(), 'lexicon-')), 'lexicon.json');
  expect(main(['add', 'twin', '--', 'a local stand-in for a vendor'])).toBe('added twin');
  expect(main(['list'])).toBe('twin: a local stand-in for a vendor');
  expect(() => main(['add', 'Twin', '--', 'again'])).toThrow('defined once');
});

// The homepage renders from the store and nothing else (CONSTITUTION.md): docs/index.html is exactly what the
// committed store renders to.
test('the homepage is the store, rendered', () => {
  process.env.LEXICON_FILE = new URL('../lexicon.json', import.meta.url).pathname;
  expect(readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8')).toBe(render(load(), 'cookbook/lexicon', 'https://open-autonomy.org'));
});
