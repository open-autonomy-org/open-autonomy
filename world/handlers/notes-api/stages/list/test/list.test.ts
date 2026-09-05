import { expect, test } from 'bun:test';
import { serve } from '../src/server.ts';

test('GET /notes lists the notes, oldest first', async () => {
  const server = serve(0);
  try {
    for (const text of ['one', 'two']) await fetch(`${server.url}notes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
    const res = await fetch(`${server.url}notes`);
    expect(res.status).toBe(200);
    expect((await res.json() as Array<{ text: string }>).map((n) => n.text)).toEqual(['one', 'two']);
  } finally { server.stop(true); }
});
