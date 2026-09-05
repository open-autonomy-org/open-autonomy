import { error, json, methodNotAllowed, parseJson } from './http.js';
import { authedClaims } from './keys.js';
import { LedgerClient, type SessionEvent } from './ledger.js';
import { redactDeep } from './redact.js';
import { hasScope, type Env } from './types.js';

// The development stream's intake and live channels. The reporter speaks CloudEvents 1.0 (one event or a
// batch): sessions are org.open-autonomy.session.{started,turns,ended} with the session key as `subject`;
// updates are org.open-autonomy.item.update with the item id as `subject`. The account is the key's own,
// never the event's. Everything published is public: secret-shaped text is stripped at intake.

const SESSION_EVENT_TYPES: Record<string, 'started' | 'turns' | 'ended'> = {
  'org.open-autonomy.session.started': 'started',
  'org.open-autonomy.session.turns': 'turns',
  'org.open-autonomy.session.ended': 'ended',
};
const UPDATE_EVENT_TYPE = 'org.open-autonomy.item.update';
// The board's state for an item (its task's lane, attempts, handoff, reviews), replaced whole each time.
const TASK_EVENT_TYPE = 'org.open-autonomy.item.task';
// The agent's setup: who it is, its model, its schedule, what it knows — published by its substrate.
const SETUP_EVENT_TYPE = 'org.open-autonomy.agent.setup';

export async function agentEvents(req: Request, env: Env): Promise<Response> {
  if (req.method !== 'POST') return methodNotAllowed();
  const claims = await authedClaims(req, env);
  if (!claims) return error('auth_failed', 401);
  if (!hasScope(claims, 'narrate')) return error('scope_required', 403, { scope: 'narrate' });
  const raw = parseJson<unknown>(await req.text());
  const events = Array.isArray(raw) ? raw : raw ? [raw] : [];
  if (!events.length) return error('invalid_json');
  const ledger = new LedgerClient(env.LIMITS);
  const results: Array<Record<string, unknown>> = [];
  for (const e of events as Array<Record<string, unknown>>) {
    if (!e || typeof e !== 'object' || e.specversion !== '1.0' || typeof e.type !== 'string' || typeof e.subject !== 'string' || !e.subject) return error('invalid_cloudevent', 400);
    const data = redactDeep(e.data && typeof e.data === 'object' ? e.data : {}) as Record<string, unknown>;
    if (e.type === UPDATE_EVENT_TYPE) {
      const result = await ledger.postUpdate(claims.account, e.subject, String(data.text ?? ''), typeof data.session === 'string' ? data.session : undefined, typeof e.time === 'string' ? e.time : undefined);
      results.push({ id: e.id, ...result });
      if (!result.ok) return json({ ok: false, results }, { status: 400 });
      continue;
    }
    if (e.type === SETUP_EVENT_TYPE) {
      const result = await ledger.setupPut(claims.account, data);
      results.push({ id: e.id, ...result });
      if (!result.ok) return json({ ok: false, results }, { status: 400 });
      continue;
    }
    if (e.type === TASK_EVENT_TYPE) {
      const result = await ledger.taskPut(claims.account, e.subject, data);
      results.push({ id: e.id, ...result });
      if (!result.ok) return json({ ok: false, results }, { status: 400 });
      continue;
    }
    const kind = SESSION_EVENT_TYPES[e.type];
    if (!kind) return error('unknown_event_type', 400);
    const ev = { ...data, kind, key: e.subject } as SessionEvent;
    if (kind === 'started' && typeof e.time === 'string' && !(ev as { started_at?: string }).started_at) (ev as { started_at?: string }).started_at = e.time;
    const result = await ledger.sessionEvent(claims.account, ev);
    results.push({ id: e.id, ...result });
    if (!result.ok) return json({ ok: false, results }, { status: result.error === 'session_not_started' ? 404 : 400 });
  }
  return json({ ok: true, results });
}

const SSE_HEADERS = { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive' };
const NL = '\n';

// Server-Sent Events over a session: turns as `turn` events with the offset as the event id, `status` on
// change; Last-Event-ID or ?after= resumes. Closes once the session has ended.
export async function sessionEvents(env: Env, account: string, key: string, req: Request): Promise<Response> {
  if (req.method !== 'GET') return methodNotAllowed();
  const ledger = new LedgerClient(env.LIMITS);
  const first = await ledger.session(account, key);
  if (!first.ok || !first.session) return error('session_not_found', 404);
  const url = new URL(req.url);
  const resumeFrom = Number(req.headers.get('last-event-id') ?? url.searchParams.get('after') ?? -1);
  let after = Number.isFinite(resumeFrom) ? resumeFrom : -1;
  let lastStatus = '';
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (s: string) => controller.enqueue(enc.encode(s));
      send(`retry: 3000${NL}${NL}`);
      let idle = 0;
      for (let i = 0; i < 1800; i += 1) { // ≤ ~1h per connection; EventSource reconnects with Last-Event-ID
        const got = i === 0 ? first : await ledger.session(account, key);
        const session = got.session;
        if (!session) break;
        for (const t of session.turns.filter((t) => typeof t.seq === 'number' && t.seq > after)) { send(`id: ${t.seq}${NL}event: turn${NL}data: ${JSON.stringify(t)}${NL}${NL}`); after = t.seq as number; }
        const status = `${session.status}:${session.turn_count}:${session.calls}:${session.ended_at ?? ''}`;
        if (status !== lastStatus) {
          lastStatus = status;
          send(`event: status${NL}data: ${JSON.stringify({ status: session.status, outcome: session.outcome, turn_count: session.turn_count, usd_cents: session.usd_cents, calls: session.calls, started_at: session.started_at, ended_at: session.ended_at, report: session.report, commit_sha: session.commit_sha, item_id: session.item_id })}${NL}${NL}`);
        }
        if (session.status !== 'live') break;
        if (++idle % 8 === 0) send(`: keepalive${NL}${NL}`);
        await new Promise((r) => setTimeout(r, 2000));
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}

// Server-Sent Events over an item: `item` on any change to what touched it (which sessions, how far each
// got, what they cost, how many updates). Closes when nothing on it is live.
export async function itemEvents(env: Env, account: string, itemId: string, req: Request): Promise<Response> {
  if (req.method !== 'GET') return methodNotAllowed();
  const ledger = new LedgerClient(env.LIMITS);
  const enc = new TextEncoder();
  let last = '';
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (s: string) => controller.enqueue(enc.encode(s));
      send(`retry: 3000${NL}${NL}`);
      let idle = 0;
      for (let i = 0; i < 1800; i += 1) {
        const item = await ledger.item(account, itemId);
        const digest = JSON.stringify([item.live, item.task?.lane, item.task?.reviews.length, item.sessions.map((s) => [s.key, s.status, s.turn_count, s.calls]), item.updates.length, item.usd_cents]);
        if (digest !== last) {
          last = digest;
          send(`event: item${NL}data: ${JSON.stringify({ live: item.live, sessions: item.sessions.length, turn_count: item.sessions.reduce((n, s) => n + s.turn_count, 0), updates: item.updates.length, usd_cents: item.usd_cents })}${NL}${NL}`);
        }
        if (!item.live.length) break;
        if (++idle % 8 === 0) send(`: keepalive${NL}${NL}`);
        await new Promise((r) => setTimeout(r, 2000));
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}

// Server-Sent Events over a project: `project` on any change to the books' numbers, the live set or the
// roadmap's revision. Stays open between sessions — the page between two fires is what it is for.
export async function accountEvents(env: Env, account: string, req: Request): Promise<Response> {
  if (req.method !== 'GET') return methodNotAllowed();
  const ledger = new LedgerClient(env.LIMITS);
  const enc = new TextEncoder();
  let last = '';
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (s: string) => controller.enqueue(enc.encode(s));
      send(`retry: 3000${NL}${NL}`);
      let idle = 0;
      for (let i = 0; i < 1800; i += 1) {
        const p = await ledger.pulse(account);
        const digest = JSON.stringify(p);
        if (digest !== last) { last = digest; send(`event: project${NL}data: ${digest}${NL}${NL}`); }
        if (++idle % 8 === 0) send(`: keepalive${NL}${NL}`);
        await new Promise((r) => setTimeout(r, 2000));
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}
