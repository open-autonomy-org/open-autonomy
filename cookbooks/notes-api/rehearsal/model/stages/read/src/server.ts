// notes-api: a notes service on bun's own server. Every roadmap item adds one route and one test. `serve()`
// starts it on a port (0 for a free one) and returns the server so a test can probe and stop it.
export interface Note { id: number; text: string; created: string }

export function serve(port = 8080) {
  const notes: Note[] = [];
  let nextId = 1;
  return Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);
      if (req.method === 'GET' && url.pathname === '/healthz') return Response.json({ ok: true });
      if (req.method === 'POST' && url.pathname === '/notes') {
        const body = await req.json().catch(() => null) as { text?: unknown } | null;
        if (!body || typeof body.text !== 'string' || !body.text.trim()) return Response.json({ error: 'invalid_note' }, { status: 400 });
        const note: Note = { id: nextId++, text: body.text, created: new Date().toISOString() };
        notes.push(note);
        return Response.json(note, { status: 201 });
      }
      if (req.method === 'GET' && url.pathname === '/notes') return Response.json(notes);
      const one = /^\/notes\/(\d+)$/.exec(url.pathname);
      if (one) {
        const id = Number(one[1]);
        const at = notes.findIndex((n) => n.id === id);
        if (at < 0) return Response.json({ error: 'not_found' }, { status: 404 });
        if (req.method === 'GET') return Response.json(notes[at]);
      }
      return Response.json({ error: 'not_found', path: url.pathname }, { status: 404 });
    },
  });
}

if (import.meta.main) {
  const server = serve(Number(process.env.PORT ?? 8080));
  console.log(`notes-api listening on ${server.url}`);
}
