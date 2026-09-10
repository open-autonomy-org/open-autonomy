import { expect, test } from 'bun:test';
import { serve } from '../src/server.ts';

test('POST /notes creates notes with ids 1 and 2', async () => {
  const server = serve(0);
  try {
    const post = (text: string) => fetch(`${server.url}notes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
    const a = await post('buy milk');
    expect(a.status).toBe(201);
    expect(await a.json()).toMatchObject({ id: 1, text: 'buy milk' });
    expect(await (await post('call mum')).json()).toMatchObject({ id: 2, text: 'call mum' });
    expect((await post('')).status).toBe(400);
  } finally { server.stop(true); }
});
