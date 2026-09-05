import { expect, test } from 'bun:test';
import { serve } from '../src/server.ts';

// The check starts the server and probes it: what is not there yet answers not_found.
test('the server starts and answers', async () => {
  const server = serve(0);
  try {
    const res = await fetch(`${server.url}nothing`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found', path: '/nothing' });
  } finally { server.stop(true); }
});
