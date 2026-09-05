import { expect, test } from 'bun:test';
import { serve } from '../src/server.ts';

test('GET /notes?q= searches the notes, case-insensitive', async () => {
  const server = serve(0);
  try {
    for (const text of ['Buy milk', 'call mum']) await fetch(`${server.url}notes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
    expect((await (await fetch(`${server.url}notes?q=MILK`)).json() as Array<{ text: string }>).map((n) => n.text)).toEqual(['Buy milk']);
    expect(await (await fetch(`${server.url}notes?q=zebra`)).json()).toEqual([]);
  } finally { server.stop(true); }
});
