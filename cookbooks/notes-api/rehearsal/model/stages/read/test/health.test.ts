import { expect, test } from 'bun:test';
import { serve } from '../src/server.ts';

test('GET /healthz says the service is up', async () => {
  const server = serve(0);
  try {
    const res = await fetch(`${server.url}healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  } finally { server.stop(true); }
});
