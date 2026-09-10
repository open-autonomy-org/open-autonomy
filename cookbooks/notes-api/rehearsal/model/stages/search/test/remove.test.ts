import { expect, test } from 'bun:test';
import { serve } from '../src/server.ts';

test('DELETE /notes/:id removes a note, or not_found', async () => {
  const server = serve(0);
  try {
    await fetch(`${server.url}notes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'one' }) });
    expect((await fetch(`${server.url}notes/1`, { method: 'DELETE' })).status).toBe(204);
    expect(await (await fetch(`${server.url}notes`)).json()).toEqual([]);
    expect((await fetch(`${server.url}notes/1`, { method: 'DELETE' })).status).toBe(404);
  } finally { server.stop(true); }
});
