// The development-stream client: how a project reports its own work to the platform, on its key. Every
// method is one HTTP call whose raw form is documented in the README, so any language can do the same
// without this package.
//
// Sessions are conversations: opened with a kind (`run` is a scheduled run, the funded work; `chat`
// anything else) and, when known, the roadmap item they serve; turns append with an offset so a retry or
// a reconnect is idempotent; a session ends with an optional outcome. Updates are short progress notes on
// an item. All of it goes to POST /v1/agent/events as CloudEvents 1.0, one or a batch.

import type { Roadmap } from './roadmap.ts';

export interface ClientOptions {
  baseUrl: string; // e.g. https://open-autonomy.org/v1 (the key valve's forwarded address inside a stack)
  key: string;
  fetch?: typeof fetch;
}

export type TurnRole = 'user' | 'assistant' | 'tool' | 'system';
export interface Turn { ts?: string; role: TurnRole; text?: string; tool?: string; args?: string; result?: string }
export type SessionOutcome = 'done' | 'failed';

export interface SessionStart { key: string; kind?: string; title?: string; item?: string; source?: string; modelProvider?: string; startedAt?: string }
export interface SessionEnd { key: string; outcome?: SessionOutcome; report?: string; commit?: string; item?: string; endedAt?: string }
// `id`, when the publisher gives one, is the update's identity: the same id again is the same update (the platform answers
// `idempotent: true` with the record it already holds), so a note survives a lost acknowledgement or a restart without doubling.
export interface Update { item: string; text: string; session?: string; at?: string; id?: string }
// Who the agent is and how it runs, as its substrate publishes it: a persona (the identity text it runs
// with), its model, its schedule, what it knows how to do, and how to run it. The platform shows this
// beside the roadmap; it reads no harness's files for it.
export interface AgentSetup { harness?: string; persona?: string; model?: string; provider?: string; schedule?: Array<{ name: string; schedule: string; description?: string }>; skills?: string[]; setup_md?: string }
export const SETUP_EVENT_TYPE = 'org.open-autonomy.agent.setup';
// The project's documents, from whatever files the substrate keeps: what the project is (`about_md`; the page
// leads with its first paragraph). What shipped is the timeline's past, published as items, never a document.
export interface ProjectDocs { about_md?: string }
export const DOCS_EVENT_TYPE = 'org.open-autonomy.project.docs';
// The agent's operating state, one word in each direction. The owner requests `running` or `paused` on a steer key; the
// automation reads the request, applies it through its own machinery (the platform names no method), and reports the
// state once it is true of itself. The platform keeps the two apart: unrequested means running, unreported means unknown.
export type OperatingState = 'running' | 'paused';
export interface AgentControl {
  desired?: { state: OperatingState; at: string; by: string; reason?: string };
  observed?: { state: OperatingState; at: string; note?: string };
}
export const STATE_EVENT_TYPE = 'org.open-autonomy.agent.state';
// The timeline, published whole by the substrate: its source label and the normalized document (see ./roadmap).
export const TIMELINE_EVENT_TYPE = 'org.open-autonomy.timeline';

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
  return event(EVENT_TYPES.started, s.key, { session_kind: s.kind, title: s.title, item_id: s.item, source: s.source, model_provider: s.modelProvider }, s.startedAt, source);
}
export function sessionTurnsEvent(key: string, seq: number, turns: Turn[], item?: string, source = 'open-autonomy-sdk'): CloudEvent {
  return event(EVENT_TYPES.turns, key, { seq, turns, item_id: item }, undefined, source);
}
export function sessionEndedEvent(e: SessionEnd, source = 'open-autonomy-sdk'): CloudEvent {
  return event(EVENT_TYPES.ended, e.key, { outcome: e.outcome, report: e.report, commit_sha: e.commit, item_id: e.item, ended_at: e.endedAt }, e.endedAt, source);
}
export function updateEvent(u: Update, source = 'open-autonomy-sdk'): CloudEvent {
  return { ...event(EVENT_TYPES.update, u.item, { text: u.text, session: u.session }, u.at, source), ...(u.id ? { id: u.id } : {}) };
}

function event(type: string, subject: string, data: Record<string, unknown>, time?: string, source = 'open-autonomy-sdk'): CloudEvent {
  return { specversion: '1.0', id: crypto.randomUUID(), source, type, subject, time: time ?? new Date().toISOString(), datacontenttype: 'application/json', data: Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) };
}

export interface EventResult { id?: string; ok: boolean; error?: string; idempotent?: boolean; session?: SessionSummary; update?: UpdateRecord; revision?: RoadmapRevision; unchanged?: boolean }
// Every write answers the same way: whether the platform accepted it, the HTTP status, and the platform's error code when not.
export interface WriteResult { ok: boolean; status: number; error?: string }
export interface SessionSummary {
  key: string; account: string; kind: string; status: 'live' | 'ended'; outcome?: SessionOutcome; title?: string; item_id?: string; source?: string;
  model_provider?: string; started_at: string; ended_at?: string; report?: string; commit_sha?: string; turn_count: number; next_seq: number; tool_calls: number; usd_cents: number; calls: number; updated_at: string;
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
  async send(events: CloudEvent | CloudEvent[]): Promise<{ ok: boolean; status: number; error?: string; results: EventResult[] }> {
    const res = await this.fetchImpl(`${this.base}/agent/events`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.opts.key}`, 'content-type': 'application/cloudevents-batch+json' },
      body: JSON.stringify(Array.isArray(events) ? events : [events]),
    });
    // A refusal before any event is read (no key, a wrong scope, a bad body) is the platform's top-level `{ error: { code } }`.
    const body = await res.json().catch(() => ({})) as { ok?: boolean; results?: EventResult[]; error?: { code?: string } | string };
    const error = typeof body.error === 'string' ? body.error : body.error?.code;
    return { ok: res.ok && body.ok === true, status: res.status, ...(error ? { error } : {}), results: body.results ?? [] };
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

  async update(u: Update): Promise<(UpdateRecord & { idempotent?: boolean }) | undefined> {
    const r = await this.send(updateEvent(u));
    const first = r.results[0];
    return first?.update ? { ...first.update, ...(first.idempotent ? { idempotent: true } : {}) } : undefined;
  }
  // One event, one answer in the common shape.
  private async put(type: string, subject: string, data: Record<string, unknown>, time?: string): Promise<WriteResult & { results: EventResult[] }> {
    const r = await this.send(event(type, subject, data, time));
    const first = r.results[0];
    const error = first?.error ?? r.error;
    return { ok: r.ok && first?.ok === true, status: r.status, ...(error ? { error } : {}), results: r.results };
  }

  // A grant: credits from this funder's books to a project's, once per idempotency key, with a word.
  async give(g: { to: string; usd_cents: number; note?: string; key?: string; for?: 'any' | 'model' | { models: string[] } | { item: string } }): Promise<{ ok: boolean; error?: string; from?: string; to_balance_usd_cents?: number; from_balance_usd_cents?: number }> {
    const res = await this.fetchImpl(`${this.base}/grants/give`, { method: 'POST', headers: { authorization: `Bearer ${this.opts.key}`, 'content-type': 'application/json' }, body: JSON.stringify(g) });
    return await res.json() as { ok: boolean; error?: string };
  }

  // The agent's setup, replacing what was there.
  async setup(s: AgentSetup): Promise<WriteResult> {
    const { results: _r, ...w } = await this.put(SETUP_EVENT_TYPE, 'agent', s as unknown as Record<string, unknown>);
    return w;
  }

  // The project's documents, replacing what was there.
  async docs(d: ProjectDocs): Promise<WriteResult> {
    const { results: _r, ...w } = await this.put(DOCS_EVENT_TYPE, 'project', d as unknown as Record<string, unknown>);
    return w;
  }

  // The timeline, whole: the substrate's own label for where it came from and the normalized document. The books keep
  // it revisioned (who, when, from which source, what changed); an unchanged document is not a revision.
  //   POST /v1/agent/events  type org.open-autonomy.timeline  subject project  { source, roadmap, by? }
  async timeline(roadmap: Roadmap, source: string, by?: string): Promise<WriteResult & { revision?: RoadmapRevision; unchanged?: boolean }> {
    const { results, ...w } = await this.put(TIMELINE_EVENT_TYPE, 'project', { source, roadmap, by });
    return { ...w, ...(results[0]?.revision ? { revision: results[0].revision } : {}), ...(results[0]?.unchanged ? { unchanged: true } : {}) };
  }

  // What is true of the automation now (`running` | `paused`), with a word on what that means here. Reported only once
  // true: the answer to the owner's request, never an echo of it.
  //   POST /v1/agent/events  type org.open-autonomy.agent.state  subject agent  { state, note? }
  async reportState(state: OperatingState, note?: string): Promise<WriteResult> {
    const { results: _r, ...w } = await this.put(STATE_EVENT_TYPE, 'agent', { state, note });
    return w;
  }

  // Public reads (no key): the stream, one session with its transcript, one item with everything on it.
  async sessions(account: string, limit = 30): Promise<{ live: string[]; sessions: SessionSummary[] }> {
    const res = await this.fetchImpl(`${this.base}/accounts/${encodeURIComponent(account)}/sessions?limit=${limit}`);
    return await res.json() as { live: string[]; sessions: SessionSummary[] };
  }
  async session(account: string, key: string): Promise<SessionRecord | undefined> {
    const res = await this.fetchImpl(`${this.base}/accounts/${encodeURIComponent(account)}/sessions/${encodeURIComponent(key)}`);
    if (res.status === 404) return undefined;
    if (!res.ok) throw new Error(`read session ${key}: ${res.status}`);
    return ((await res.json()) as { session?: SessionRecord }).session;
  }
  async item(account: string, itemId: string): Promise<ItemView> {
    const res = await this.fetchImpl(`${this.base}/accounts/${encodeURIComponent(account)}/items/${encodeURIComponent(itemId)}`);
    return await res.json() as ItemView;
  }

  // The operating state as the platform holds it: the owner's request and the automation's answer, apart.
  //   GET /v1/accounts/:account/state  → { desired?: { state, at, by, reason? }, observed?: { state, at, note? } }
  async state(account: string): Promise<AgentControl | undefined> {
    const res = await this.fetchImpl(`${this.base}/accounts/${encodeURIComponent(account)}/state`);
    if (!res.ok) return undefined;
    const { desired, observed } = await res.json() as AgentControl;
    return { ...(desired ? { desired } : {}), ...(observed ? { observed } : {}) };
  }
  // The owner's word: run, or pause. Needs the `steer` scope, which a spending key does not carry. Recorded, not applied:
  // the automation applies it and answers through `reportState`.
  //   POST /v1/agent/state  (Authorization: Bearer <steer key>)  { state, reason? }
  async requestState(state: OperatingState, reason?: string): Promise<WriteResult & { unchanged?: boolean } & AgentControl> {
    const res = await this.fetchImpl(`${this.base}/agent/state`, { method: 'POST', headers: { authorization: `Bearer ${this.opts.key}`, 'content-type': 'application/json' }, body: JSON.stringify({ state, reason }) });
    const body = await res.json().catch(() => ({})) as { ok?: boolean; unchanged?: boolean; error?: { code?: string } | string } & AgentControl;
    return { ok: res.ok && body.ok === true, status: res.status, unchanged: body.unchanged, error: typeof body.error === 'string' ? body.error : body.error?.code, ...(body.desired ? { desired: body.desired } : {}), ...(body.observed ? { observed: body.observed } : {}) };
  }

  // The roadmap as the platform holds it: the current normalized revision, and its history.
  //   GET /v1/accounts/:account/roadmap            GET /v1/accounts/:account/roadmap/revisions?limit=
  async roadmap(account: string): Promise<RoadmapRevision | undefined> {
    const res = await this.fetchImpl(`${this.base}/accounts/${encodeURIComponent(account)}/roadmap`);
    if (!res.ok) return undefined;
    return ((await res.json()) as { revision?: RoadmapRevision }).revision;
  }
  async roadmapRevisions(account: string, limit = 20): Promise<RoadmapRevision[]> {
    const res = await this.fetchImpl(`${this.base}/accounts/${encodeURIComponent(account)}/roadmap/revisions?limit=${limit}`);
    return ((await res.json()) as { revisions?: RoadmapRevision[] }).revisions ?? [];
  }
  // An owner-side driver pushes the normalized roadmap it pulled from its tracker. Needs the `steer` scope, which a
  // spending key does not carry; a substrate publishing its own timeline uses `timeline` on the events door instead.
  //   POST /v1/agent/roadmap  (Authorization: Bearer <steer key>)  { source, roadmap, by? }
  async pushRoadmap(roadmap: Roadmap, source: string, by?: string): Promise<WriteResult & { revision?: RoadmapRevision; unchanged?: boolean }> {
    const res = await this.fetchImpl(`${this.base}/agent/roadmap`, { method: 'POST', headers: { authorization: `Bearer ${this.opts.key}`, 'content-type': 'application/json' }, body: JSON.stringify({ source, roadmap, by }) });
    const body = await res.json().catch(() => ({})) as { ok?: boolean; revision?: RoadmapRevision; unchanged?: boolean; error?: { code?: string } };
    return { ok: res.ok && body.ok === true, status: res.status, revision: body.revision, unchanged: body.unchanged, error: body.error?.code };
  }
}

export interface RoadmapRevision {
  revision: number;
  ts: string;
  source: string;
  by?: string;
  roadmap: Roadmap;
  changes: Array<{ id: string; kind: 'added' | 'removed' | 'status' | 'edited'; from?: string; to?: string }>;
  conformance: string[];
}

export class Session {
  constructor(private readonly client: OpenAutonomy, readonly key: string, public seq: number) {}
  async turns(turns: Turn[], item?: string): Promise<void> {
    // The wire accepts at most 100 turns. Advance only to the server's acknowledged
    // offset, including when a retry follows a response lost after acceptance.
    for (let offset = 0; offset < turns.length;) {
      const batch = turns.slice(offset, offset + 100), start = this.seq;
      const r = await this.client.send(sessionTurnsEvent(this.key, start, batch, item));
      const result = r.results[0], next = result?.session?.next_seq;
      if (!r.ok || !result?.ok || !Number.isInteger(next) || next! < start + batch.length) throw new Error(`publish turns ${this.key}: acknowledgment unavailable (${r.status})`);
      this.seq = next!;
      // A server ahead of this exact batch needs reconciliation with its transcript,
      // not another batch at a guessed offset.
      if (next !== start + batch.length) throw new Error(`publish turns ${this.key}: offset changed; reconcile before continuing`);
      offset += batch.length;
    }
  }
  async end(end: Omit<SessionEnd, 'key'> = {}): Promise<void> {
    const r = await this.client.send(sessionEndedEvent({ ...end, key: this.key }));
    if (!r.ok || !r.results[0]?.ok) throw new Error(`end session ${this.key}: acknowledgment unavailable (${r.status})`);
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
// `scopes` picks what the key may do (the platform's default is spend + narrate): a treasurer's key adds `pay`,
// the rails; an owner-side driver's is `steer` alone.
export async function keyMint(baseUrl: string, account: string, models?: string[], scopes?: string[], fetchImpl: typeof fetch = fetch): Promise<MintedKey> {
  const res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/keys/mint`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account, models, ...(scopes ? { scopes } : {}) }) });
  return await res.json() as MintedKey;
}
// `graceSeconds` shortens how long the old key keeps working (the platform's default is a day; it never lengthens).
// A funder: a person who holds grant credits on their own books (`@login`). Their key proves their GitHub
// login through the claim file in a repository they own and can only give.
export async function funderChallenge(baseUrl: string, login: string, fetchImpl: typeof fetch = fetch): Promise<KeyChallenge & { funder?: string }> {
  const res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/keys/challenge?funder=${encodeURIComponent(login)}`);
  return await res.json() as KeyChallenge & { funder?: string };
}
export async function funderMint(baseUrl: string, login: string, repo: string, fetchImpl: typeof fetch = fetch): Promise<MintedKey> {
  const res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/keys/mint`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ funder: login, repo }) });
  return await res.json() as MintedKey;
}
export async function keyRotate(baseUrl: string, currentKey: string, options: { graceSeconds?: number; fetchImpl?: typeof fetch } = {}): Promise<MintedKey> {
  const res = await (options.fetchImpl ?? fetch)(`${baseUrl.replace(/\/$/, '')}/keys/rotate`, { method: 'POST', headers: { authorization: `Bearer ${currentKey}`, 'content-type': 'application/json' }, body: JSON.stringify(options.graceSeconds === undefined ? {} : { grace_seconds: options.graceSeconds }) });
  return await res.json() as MintedKey;
}
