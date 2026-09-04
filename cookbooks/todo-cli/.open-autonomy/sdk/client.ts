// The development-stream client: how a project reports its own work to the platform, on its key. Every
// method is one HTTP call whose raw form is documented in the README, so any language can do the same
// without this package.
//
// Sessions are conversations: opened with a kind (`run` is a scheduled run, the funded work; `chat`
// anything else) and, when known, the roadmap item they serve; turns append with an offset so a retry or
// a reconnect is idempotent; a session ends with an optional outcome. Updates are short progress notes on
// an item. All of it goes to POST /v1/agent/events as CloudEvents 1.0, one or a batch.

export interface ClientOptions {
  baseUrl: string; // e.g. https://open-autonomy.org/v1 (the key sidecar's forwarded address inside a stack)
  key: string;
  fetch?: typeof fetch;
}

export type TurnRole = 'user' | 'assistant' | 'tool' | 'system';
export interface Turn { ts?: string; role: TurnRole; text?: string; tool?: string; args?: string; result?: string }
export type SessionOutcome = 'done' | 'failed';

export interface SessionStart { key: string; kind?: string; title?: string; item?: string; source?: string; startedAt?: string }
export interface SessionEnd { key: string; outcome?: SessionOutcome; report?: string; commit?: string; item?: string; endedAt?: string }
export interface Update { item: string; text: string; session?: string; at?: string }

export interface CloudEvent {
  specversion: '1.0';
  id: string;
  source: string;
  type: string;
  subject: string;
  time: string;
  datacontenttype: 'application/json';
  data: Record<string, unknown>;
}

export const EVENT_TYPES = {
  started: 'org.open-autonomy.session.started',
  turns: 'org.open-autonomy.session.turns',
  ended: 'org.open-autonomy.session.ended',
  update: 'org.open-autonomy.item.update',
} as const;

export function sessionStartedEvent(s: SessionStart, source = 'open-autonomy-sdk'): CloudEvent {
  return event(EVENT_TYPES.started, s.key, { session_kind: s.kind, title: s.title, item_id: s.item, source: s.source }, s.startedAt, source);
}
export function sessionTurnsEvent(key: string, seq: number, turns: Turn[], item?: string, source = 'open-autonomy-sdk'): CloudEvent {
  return event(EVENT_TYPES.turns, key, { seq, turns, item_id: item }, undefined, source);
}
export function sessionEndedEvent(e: SessionEnd, source = 'open-autonomy-sdk'): CloudEvent {
  return event(EVENT_TYPES.ended, e.key, { outcome: e.outcome, report: e.report, commit_sha: e.commit, item_id: e.item, ended_at: e.endedAt }, e.endedAt, source);
}
export function updateEvent(u: Update, source = 'open-autonomy-sdk'): CloudEvent {
  return event(EVENT_TYPES.update, u.item, { text: u.text, session: u.session }, u.at, source);
}

function event(type: string, subject: string, data: Record<string, unknown>, time?: string, source = 'open-autonomy-sdk'): CloudEvent {
  return { specversion: '1.0', id: crypto.randomUUID(), source, type, subject, time: time ?? new Date().toISOString(), datacontenttype: 'application/json', data: Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) };
}

export interface EventResult { id?: string; ok: boolean; error?: string; idempotent?: boolean; session?: SessionSummary; update?: UpdateRecord }
export interface SessionSummary {
  key: string; account: string; kind: string; status: 'live' | 'ended'; outcome?: SessionOutcome; title?: string; item_id?: string; source?: string;
  started_at: string; ended_at?: string; report?: string; commit_sha?: string; turn_count: number; next_seq: number; tool_calls: number; usd_cents: number; calls: number; updated_at: string;
}
export interface SessionRecord extends Omit<SessionSummary, 'tool_calls'> { turns: Array<Turn & { seq?: number }> }
export interface UpdateRecord { id: string; account: string; item_id: string; ts: string; text: string; session?: string }
export interface ItemView { ok: true; account: string; item_id: string; live: string[]; sessions: SessionSummary[]; updates: UpdateRecord[]; usd_cents: number }

export class OpenAutonomy {
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  constructor(private readonly opts: ClientOptions) {
    this.base = opts.baseUrl.replace(/\/$/, '');
    this.fetchImpl = opts.fetch ?? fetch;
  }

  // POST /v1/agent/events  (Authorization: Bearer <key>; body: one CloudEvent or an array)
  async send(events: CloudEvent | CloudEvent[]): Promise<{ ok: boolean; status: number; results: EventResult[] }> {
    const res = await this.fetchImpl(`${this.base}/agent/events`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.opts.key}`, 'content-type': 'application/cloudevents-batch+json' },
      body: JSON.stringify(Array.isArray(events) ? events : [events]),
    });
    const body = await res.json().catch(() => ({})) as { ok?: boolean; results?: EventResult[] };
    return { ok: res.ok && body.ok === true, status: res.status, results: body.results ?? [] };
  }

  // A session, as a small object that remembers its offset. `resume` reads the platform's own offset first,
  // so a reporter that restarts mid-session continues where the books are rather than replaying.
  async open(start: SessionStart): Promise<Session> {
    const r = await this.send(sessionStartedEvent(start));
    if (!r.ok) throw new Error(`open ${start.key}: ${r.status} ${r.results[0]?.error ?? ''}`);
    return new Session(this, start.key, r.results[0]?.session?.next_seq ?? 0);
  }

  async resume(key: string, account: string, fallback: SessionStart): Promise<Session> {
    const existing = await this.session(account, key);
    if (existing) return new Session(this, key, existing.next_seq);
    return this.open(fallback);
  }

  async update(u: Update): Promise<UpdateRecord | undefined> {
    const r = await this.send(updateEvent(u));
    return r.results[0]?.update;
  }

  // Public reads (no key): the stream, one session with its transcript, one item with everything on it.
  async sessions(account: string, limit = 30): Promise<{ live: string[]; sessions: SessionSummary[] }> {
    const res = await this.fetchImpl(`${this.base}/accounts/${encodeURIComponent(account)}/sessions?limit=${limit}`);
    return await res.json() as { live: string[]; sessions: SessionSummary[] };
  }
  async session(account: string, key: string): Promise<SessionRecord | undefined> {
    const res = await this.fetchImpl(`${this.base}/accounts/${encodeURIComponent(account)}/sessions/${encodeURIComponent(key)}`);
    if (!res.ok) return undefined;
    return ((await res.json()) as { session?: SessionRecord }).session;
  }
  async item(account: string, itemId: string): Promise<ItemView> {
    const res = await this.fetchImpl(`${this.base}/accounts/${encodeURIComponent(account)}/items/${encodeURIComponent(itemId)}`);
    return await res.json() as ItemView;
  }
}

export class Session {
  constructor(private readonly client: OpenAutonomy, readonly key: string, public seq: number) {}
  async turns(turns: Turn[], item?: string): Promise<void> {
    if (!turns.length) return;
    const r = await this.client.send(sessionTurnsEvent(this.key, this.seq, turns, item));
    if (r.ok) this.seq += turns.length;
  }
  async end(end: Omit<SessionEnd, 'key'> = {}): Promise<void> {
    await this.client.send(sessionEndedEvent({ ...end, key: this.key }));
  }
}

// Key helpers: the adopter way, with no admin token anywhere. Prove control of the repository by
// committing the claim the platform names, then mint; rotate with the current key.
export interface KeyChallenge { ok: boolean; account: string; file: string; claim: string; valid_through: string }
export interface MintedKey { ok: boolean; token: string; key: { kid: string; account: string; models: string[]; iat: string; exp: string }; previous?: { kid: string; exp: string } }

export async function keyChallenge(baseUrl: string, account: string, fetchImpl: typeof fetch = fetch): Promise<KeyChallenge> {
  const res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/keys/challenge?account=${encodeURIComponent(account)}`);
  return await res.json() as KeyChallenge;
}
export async function keyMint(baseUrl: string, account: string, models?: string[], fetchImpl: typeof fetch = fetch): Promise<MintedKey> {
  const res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/keys/mint`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account, models }) });
  return await res.json() as MintedKey;
}
export async function keyRotate(baseUrl: string, currentKey: string, fetchImpl: typeof fetch = fetch): Promise<MintedKey> {
  const res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/keys/rotate`, { method: 'POST', headers: { authorization: `Bearer ${currentKey}` } });
  return await res.json() as MintedKey;
}
