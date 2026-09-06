#!/usr/bin/env bun
// A deployed cookbook service in the world: it reports the commit it is running on Hookline's `GET /api`
// shape. The operator endpoint lets a world proof move it between a commit and an outage.
let commit: string | undefined;
let reachable = true;

Bun.serve({
  port: Number(process.env.PORT),
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/_world/commit') {
      const body = await request.json().catch(() => ({})) as { commit?: unknown; reachable?: unknown };
      if (typeof body.commit === 'string' && /^[0-9a-f]{7,40}$/i.test(body.commit)) commit = body.commit.slice(0, 7).toLowerCase();
      if (typeof body.reachable === 'boolean') reachable = body.reachable;
      return Response.json({ ok: true, commit: commit ?? null, reachable });
    }
    if (url.pathname === '/api') return reachable ? Response.json({ name: 'todo-cli', version: commit ?? null }) : new Response('unreachable', { status: 503 });
    return new Response('not found', { status: 404 });
  },
});
