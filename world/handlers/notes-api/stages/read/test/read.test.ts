import { expect, test } from 'bun:test';
import { serve } from '../src/server.ts';

test('GET /notes/:id reads one note, or not_found', async () => {
  const server = serve(0);
  try {
    await fetch(`${server.url}notes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'one' }) });
    expect(await (await fetch(`${server.url}notes/1`)).json()).toMatchObject({ id: 1, text: 'one' });
    const missing = await fetch(`${server.url}notes/9`);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'not_found' });
  } finally { server.stop(true); }
});
