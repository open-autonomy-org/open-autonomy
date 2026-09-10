// notes-api: a notes service on bun's own server. Every roadmap item adds one route and one test. `serve()`
// starts it on a port (0 for a free one) and returns the server so a test can probe and stop it.
export function serve(port = 8080) {
  return Bun.serve({
    port,
    fetch(req) {
      const url = new URL(req.url);
      if (req.method === 'GET' && url.pathname === '/healthz') return Response.json({ ok: true });
      return Response.json({ error: 'not_found', path: url.pathname }, { status: 404 });
    },
  });
}

if (import.meta.main) {
  const server = serve(Number(process.env.PORT ?? 8080));
  console.log(`notes-api listening on ${server.url}`);
}
