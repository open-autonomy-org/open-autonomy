#!/usr/bin/env bun
// The reporter: the project's development stream, published as it happens. An SDK-to-SDK bridge —
// supercode's harness SDK in (it discovers the agent's Hermes sessions and follows each transcript), the
// Open Autonomy SDK out (sessions, turns, updates on the project's page). It runs as the stack's keyless
// third service: it authenticates through the key valve's forwarded narration route and never sees the
// project's key. Nothing here drives the agent; it only reads.
//
//   OPEN_AUTONOMY_BASE_URL=http://valve:8787/v1 bun .open-autonomy/reporter.ts [--config .open-autonomy/config.yaml]
//
// Supercode's contract, as its SDK documents it: `subscribeSessionIndex` lists sessions and streams
// index changes (`sessionIndexEvent`); `session(locator).follow()` yields a snapshot then appended
// messages; `subscribeSessionActivity` reports presence and turn state. A Hermes home is named by the
// path of its state.db in `homes.hermes`.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SupercodeHarnessClient, type NormalizedMessage, type SessionActivity, type SessionDescriptor, type SessionLocator } from '@volter-ai-dev/supercode-harness-sdk';
import { ROADMAP_SCHEMA, type RoadmapItem } from './sdk/roadmap.ts';
import { OpenAutonomy, type Session, type Turn } from './sdk/client.ts';

const arg = (name: string): string | undefined => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const configPath = resolve(arg('--config') ?? resolve(import.meta.dir, 'config.yaml'));
const cfg = readConfig(configPath);
const baseUrl = process.env.OPEN_AUTONOMY_BASE_URL ?? `${cfg.platform}/v1`;
const oa = new OpenAutonomy({ baseUrl, key: process.env.OPEN_AUTONOMY_KEY ?? 'valve' });
const stateFile = resolve(cfg.state_file);
const IDLE_END_MS = Number(process.env.OPEN_AUTONOMY_IDLE_END_MS ?? 5 * 60_000);
const TURN_END_MS = Number(process.env.OPEN_AUTONOMY_TURN_END_MS ?? 15_000);
const log = (m: string) => console.log(`reporter: ${m}`);
// The valve holds the key; its health line says when the key expires. Logged once at start so a reader of
// either log sees the expiry.
fetch(`${baseUrl.replace(/\/v1\/?$/, '')}/healthz`).then(async (r) => log(`valve: ${(await r.text()).trim()}`)).catch((e: Error) => log(`valve unreachable at start: ${e.message}`));

interface Config { account: string; platform: string; publish: { runs: boolean; chats: boolean; private: string[] }; hermes_home: string; state_file: string }
// The config's shape is small and fixed, so a line reader suffices: top-level `key: value` and the
// `publish:` block's own keys and list.
function readConfig(path: string): Config {
  const text = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const top: Record<string, string> = {};
  const publish: Record<string, string> = {};
  const priv: string[] = [];
  let block = '';
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+#.*$/, '').trimEnd();
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const topKey = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (topKey) { block = topKey[2] === '' ? topKey[1] : ''; if (topKey[2]) top[topKey[1]] = topKey[2].trim(); continue; }
    if (block === 'publish') {
      const kv = /^\s+([a-z_]+):\s*(.*)$/.exec(line);
      if (kv) { if (kv[2]) publish[kv[1]] = kv[2].trim(); else if (kv[1] === 'private') publish.private = ''; continue; }
      const item = /^\s+-\s+(.+)$/.exec(line);
      if (item && item[1] !== '[]') priv.push(item[1].trim());
    }
  }
  return {
    account: top.account ?? '', platform: (top.platform ?? 'https://open-autonomy.org').replace(/\/$/, ''),
    publish: { runs: (publish.runs ?? 'true') !== 'false', chats: (publish.chats ?? 'false') === 'true', private: priv },
    hermes_home: top.hermes_home ?? process.env.HERMES_HOME ?? '/opt/data',
    state_file: top.state_file ?? resolve(import.meta.dir, 'reporter-state.json'),
  };
}

// What has been published: ended sessions are never reopened; open ones resume at the platform's offset.
interface State { ended: Record<string, string> }
const state: State = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) as State : { ended: {} };
const saveState = () => { try { writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`); } catch (e) { log(`cannot write ${stateFile}: ${(e as Error).message}`); } };

// A run: the schedule fired it, or the board's dispatcher spawned it for a task (a worker or a reviewer).
const kindOf = (d: SessionDescriptor): 'run' | 'chat' => (d.trigger === 'cron' || d.trigger === 'heartbeat' || d.trigger === 'task' ? 'run' : 'chat');
// A run's source is its job's name. supercode's job model carries the job's id, not its name; Hermes keeps
// the name beside the id in its own schedule store in the home the reporter reads, so that is where the
// name comes from (read-only, refreshed whenever an id is new), falling back to the id.
const jobNames = new Map<string, string>();
function jobName(id: string): string {
  if (!jobNames.has(id)) {
    try {
      const store = JSON.parse(readFileSync(resolve(cfg.hermes_home, 'cron', 'jobs.json'), 'utf8')) as { jobs?: Array<{ id?: string; name?: string }> } | Array<{ id?: string; name?: string }>;
      for (const j of Array.isArray(store) ? store : store.jobs ?? []) if (j.id && j.name) jobNames.set(j.id, j.name);
    } catch { /* no schedule store yet */ }
  }
  return jobNames.get(id) ?? id;
}
const sourceOf = (d: SessionDescriptor): string => (d.recurrence?.job_id ? jobName(d.recurrence.job_id) : d.trigger === 'task' ? 'board' : d.surface?.platform ?? kindOf(d));
function publishes(d: SessionDescriptor): boolean {
  const id = d.locator.session_id;
  if (cfg.publish.private.includes(id) || (d.recurrence?.job_id && cfg.publish.private.includes(d.recurrence.job_id))) return false;
  return kindOf(d) === 'run' ? cfg.publish.runs : cfg.publish.chats;
}

// A transcript message as the platform's turns: a tool call is one turn, its result another.
function turnsOf(m: NormalizedMessage): Turn[] {
  const text = typeof m.content === 'string' ? m.content : Array.isArray(m.content) ? m.content.map((p) => (typeof p === 'string' ? p : (p as { text?: string })?.text ?? '')).join('') : '';
  const ts = m.metadata?.timestamp ?? m.metadata?.ts;
  if (m.role === 'tool') return [{ ts, role: 'tool', tool: m.name ?? 'tool', result: text.slice(0, 600) }];
  if (m.role === 'assistant') {
    const out: Turn[] = [];
    if (text.trim()) out.push({ ts, role: 'assistant', text: text.slice(0, 2000) });
    for (const c of m.tool_calls ?? []) out.push({ ts, role: 'assistant', tool: c.function.name, args: c.function.arguments.slice(0, 600) });
    return out;
  }
  if (m.role === 'user') return [{ ts, role: 'user', text: text.slice(0, 2000) }];
  return [];
}
// The task a session serves is the board's task id: the dispatcher's own prompt names it (`work kanban task <id>`), and
// so does the agent branch (agent/<task id>) in what the session says, runs, or reads back.
const itemIn = (turns: Turn[]): string | undefined => turns.map((t) => (t.role === 'user' ? /\bkanban task (\S+)/.exec(t.text ?? '')?.[1] : undefined) ?? /\bagent\/([A-Za-z0-9][A-Za-z0-9._-]*)/.exec(`${t.args ?? ''} ${t.text ?? ''} ${t.result ?? ''}`)?.[1]).find(Boolean);
const shaIn = (turns: Turn[]): string | undefined => turns.map((t) => /PUSHED_BRANCH=agent\/[A-Za-z0-9._-]+ ([0-9a-f]{7,40})/.exec(t.result ?? '')?.[1]).find(Boolean);

// supercode synthesizes this result for a tool call whose answer is not recorded yet; a live follow sees it
// before the real result lands in its place. Such a turn is held back until it resolves.
const PLACEHOLDER = '[no tool result recorded — turn interrupted]';
const contentOf = (m: NormalizedMessage): string => (typeof m.content === 'string' ? m.content : Array.isArray(m.content) ? m.content.map((p) => (typeof p === 'string' ? p : (p as { text?: string })?.text ?? '')).join('') : '');
const isPlaceholder = (m: NormalizedMessage): boolean => m.role === 'tool' && contentOf(m) === PLACEHOLDER;

class Followed {
  session?: Session;
  seq = 0;
  // How many of the transcript's messages have been published (the platform counts turns; a message may
  // be several).
  sentMessages = 0;
  item?: string;
  sha?: string;
  lastAt = Date.now();
  ended = false;
  private timer?: ReturnType<typeof setTimeout>;
  private syncing = false;
  private dirty = false;
  constructor(readonly d: SessionDescriptor) {}
  get key(): string { return this.d.locator.session_id; }
  async open(): Promise<void> {
    const start = { key: this.key, kind: kindOf(this.d), source: sourceOf(this.d), title: this.d.title ?? undefined, startedAt: this.d.updated_at_ms ? new Date(this.d.updated_at_ms).toISOString() : undefined };
    this.session = await oa.resume(this.key, cfg.account, start);
    this.seq = this.session.seq;
    // Resuming at the platform's turn offset: the message index it corresponds to.
    if (this.seq > 0) {
      const { session } = await sc.loadWindow(this.d.locator, { message_limit: 5000 });
      let counted = 0;
      for (const m of session.messages) { if (counted >= this.seq) break; counted += turnsOf(m).length; this.sentMessages += 1; }
    }
    log(`${this.key}: ${kindOf(this.d)} (${sourceOf(this.d)}) open at turn ${this.seq}`);
  }
  // Publish what the transcript holds beyond what was sent, read through supercode's window: everything up
  // to the first unresolved tool result, all of it once the session is ending.
  async sync(final = false): Promise<void> {
    if (this.syncing) { this.dirty = true; return; }
    this.syncing = true;
    try {
      do {
        this.dirty = false;
        const { session } = await sc.loadWindow(this.d.locator, { message_offset: this.sentMessages, message_limit: 500 });
        const msgs = session.messages;
        let n = final ? msgs.length : msgs.findIndex(isPlaceholder);
        if (n < 0) n = msgs.length;
        const ready = msgs.slice(0, n);
        const turns = ready.flatMap(turnsOf);
        if (turns.length) {
          this.item ??= itemIn(turns);
          this.sha ??= shaIn(turns);
          await this.session!.turns(turns, this.item);
          this.seq = this.session!.seq;
          this.sentMessages += n;
          this.lastAt = Date.now();
        }
        // The shape of a turn's end: the last message is the assistant's own text with no tool call pending.
        // The timer is (re)armed only when the transcript moved; a quiet re-read leaves it running.
        const last = msgs[msgs.length - 1];
        if (!this.ended && (turns.length || !this.timer)) this.arm(n === msgs.length && last?.role === 'assistant' && !(last.tool_calls?.length));
      } while (this.dirty);
    } catch (e) { log(`${this.key}: sync failed (${(e as Error).message})`); }
    finally { this.syncing = false; }
  }
  // A session ends when its transcript has ended: a closing assistant text followed by fifteen seconds of silence
  // (a tool call in flight is never silence, its result is still to come), else the idle fallback.
  arm(turnEnded = false): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.end(turnEnded ? 'turn ended' : 'idle'), turnEnded ? TURN_END_MS : IDLE_END_MS);
  }
  async end(why: string): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    clearTimeout(this.timer);
    await this.sync(true);
    let outcome: 'done' | 'failed' | undefined;
    let report: string | undefined;
    try {
      const { summary } = await sc.loadWindow(this.d.locator, { message_tail: 20 });
      report = summary.last_assistant_text?.slice(0, 4000) || undefined;
      if (kindOf(this.d) === 'run') outcome = summary.end_of_turn && !!report ? 'done' : 'failed';
    } catch (e) { log(`${this.key}: summary unavailable (${(e as Error).message})`); if (kindOf(this.d) === 'run') outcome = 'failed'; }
    await this.session?.end({ outcome, report, commit: this.sha, item: this.item, endedAt: new Date().toISOString() });
    state.ended[this.key] = new Date().toISOString();
    saveState();
    log(`${this.key}: ended (${why}${outcome ? `, ${outcome}` : ''})`);
  }
}

// supercode is the reporter's own dependency (its npm package carries the binary), so it is found beside
// this file before anywhere on PATH; SUPERCODE_BIN names another build outright.
const supercode = [process.env.SUPERCODE_BIN, resolve(import.meta.dir, 'node_modules', '.bin', 'supercode')].filter((p): p is string => !!p).find(existsSync) ?? Bun.which('supercode') ?? 'supercode';
const sc = new SupercodeHarnessClient({ command: supercode, env: { ...process.env, HERMES_HOME: cfg.hermes_home } as Record<string, string> });
const homes = { hermes: resolve(cfg.hermes_home, 'state.db') };
const followed = new Map<string, Followed>();
const activitySubs = new Map<string, string>();

async function consider(d: SessionDescriptor): Promise<void> {
  const key = d.locator.session_id;
  if (d.locator.harness !== 'hermes' || followed.has(key) || state.ended[key]) return;
  if (!publishes(d)) { log(`${key}: ${kindOf(d)} (${sourceOf(d)}) is private; not published`); state.ended[key] = 'private'; saveState(); return; }
  const f = new Followed(d);
  followed.set(key, f);
  try {
    await f.open();
    f.arm();
    const act = await sc.subscribeSessionActivity([d.locator], homes);
    activitySubs.set(act.subscription, key);
    for (const a of act.initial) activity(key, a);
    void follow(f);
  } catch (e) { log(`${key}: cannot open (${(e as Error).message})`); followed.delete(key); }
}

// The follow stream is the trigger: every event means the transcript moved, and the window read is the
// truth of what it now holds. A slow tick covers a tool result landing in place without an event.
async function follow(f: Followed): Promise<void> {
  const tick = setInterval(() => { if (!f.ended) void f.sync(); }, 5000);
  try {
    await f.sync();
    for await (const ev of sc.session(f.d.locator).follow({ view: { tailMessages: 50, maxMessageChars: 200, includeSubagents: false } })) {
      if (f.ended) break;
      // `runtime_state` describes a supercode-managed runtime; a Hermes session never has one, so `persisted`
      // says nothing about whether the run is over. Only a shutdown of one is an end.
      if (ev.type === 'runtime_state' && ev.state === 'shutting_down' && f.seq > 0) await f.end(`runtime ${ev.state}`);
      else if (ev.type === 'session_snapshot' || ev.type === 'messages_appended') await f.sync();
    }
  } catch (e) { log(`${f.key}: follow ended (${(e as Error).message})`); }
  finally { clearInterval(tick); }
}

let seenWorking = new Set<string>();
function activity(key: string, a: SessionActivity): void {
  const f = followed.get(key);
  if (!f || f.ended) return;
  if (a.turn === 'working' || a.presence === 'running') seenWorking.add(key);
  else if (a.presence === 'persisted' && a.turn === 'idle' && seenWorking.has(key) && f.seq > 0) void f.end('idle after working');
}

sc.on('sessionIndexEvent', (ev) => { if ('changes' in ev) for (const c of ev.changes) if (c.kind !== 'removed') void consider(c.descriptor); });
sc.on('sessionActivityEvent', (ev) => { const key = activitySubs.get(ev.subscription); if (key) for (const a of ev.activities) activity(key, a); });
sc.on('exit', (code) => { log(`supercode harness serve exited (${code}); stopping`); process.exit(1); });

await sc.start();
// The board, through supercode's workflow layer, is the project's roadmap and its work record, both published
// through the SDK. Every task is a roadmap item — its id, its title, its lane as the item's status, the `- `
// lines of its body as the acceptance — and each task's board state (lane, attempts, handoff, review verdicts)
// is published under that item whenever it changes. A task the board marks done after a review it requested
// was approved by that review.
type BoardTask = { id: string; title?: string; body?: string; assignee?: string; lane: string; priority?: number; created_at?: string; completed_at?: string; attempts?: Array<{ id: string; profile?: string; status: string; started_at?: string; ended_at?: string; outcome?: string; handoff?: { summary?: string; branch?: string; commit?: string } }>; reviews?: Array<{ verdict: string; by?: string; reason?: string; at?: string }> };
// The lanes as the roadmap's four words: done; running or review is active; blocked waits on the owner, so proposed;
// the rest is planned.
const statusOf = (lane: string): RoadmapItem['status'] => (lane === 'done' ? 'done' : lane === 'running' || lane === 'review' ? 'active' : lane === 'blocked' ? 'proposed' : 'planned');
const boardDigests = new Map<string, string>();
let roadmapDigest = '';
async function board(): Promise<void> {
  let read: { workflow?: { boards?: Record<string, { tasks?: Record<string, BoardTask> }> } };
  try { read = await sc.workflowLoad({ from: 'hermes', home: cfg.hermes_home }) as typeof read; } catch (e) { log(`board unreadable: ${(e as Error).message}`); return; }
  const tasks = Object.values(read.workflow?.boards ?? {}).flatMap((b) => Object.values(b.tasks ?? {})).filter((t) => t.lane !== 'archived').sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '') || a.id.localeCompare(b.id));
  // A read that found no board at all (the database mid-write) is not an empty board.
  if (!tasks.length) return;
  const items: RoadmapItem[] = tasks.map((t) => ({ id: t.id, title: t.title ?? t.id, status: statusOf(t.lane), acceptance: (t.body ?? '').split('\n').filter((l) => /^- /.test(l)).map((l) => l.slice(2).trim()) }));
  const digest = JSON.stringify(items);
  if (digest !== roadmapDigest) {
    try { const r = await oa.pushRoadmap({ schema: ROADMAP_SCHEMA, items }, 'kanban', 'reporter'); if (r.ok) { roadmapDigest = digest; if (!r.unchanged) log(`roadmap published from the board (${items.length} task(s))`); } else log(`roadmap publish refused: ${r.error ?? r.status}`); } catch (e) { log(`roadmap publish failed: ${(e as Error).message}`); }
  }
  for (const t of tasks) {
    const item = t.id;
    const attempts = (t.attempts ?? []).map((a) => ({ id: a.id, profile: a.profile, status: a.status, started_at: a.started_at, ended_at: a.ended_at, outcome: a.outcome, summary: a.handoff?.summary }));
    const reviews = (t.reviews ?? []).map((r) => ({ verdict: r.verdict as 'requested', by: r.by, reason: r.reason, at: r.at }));
    const requested = [...reviews].reverse().find((r) => r.verdict === 'requested');
    if (t.lane === 'done' && requested && !reviews.some((r) => r.verdict === 'changes_requested' && (r.at ?? '') > (requested.at ?? ''))) reviews.push({ verdict: 'approved' as 'requested', by: attempts[attempts.length - 1]?.profile, at: t.completed_at ?? attempts[attempts.length - 1]?.ended_at });
    const last = [...(t.attempts ?? [])].reverse().find((a) => a.handoff);
    const state = { item, task_id: t.id, lane: t.lane, title: t.title, assignee: t.assignee, attempts, reviews, handoff: last?.handoff, updated_at: new Date().toISOString() };
    const taskDigest = JSON.stringify([state.lane, attempts.map((a) => [a.id, a.status, a.ended_at]), reviews.length, last?.handoff?.summary]);
    if (boardDigests.get(t.id) === taskDigest) continue;
    try { if (await oa.task(state)) { boardDigests.set(t.id, taskDigest); log(`board: ${t.id} (${t.lane}, ${attempts.length} attempt(s), ${reviews.length} review(s))`); } } catch (e) { log(`board publish failed for ${t.id}: ${(e as Error).message}`); }
  }
}
// The agent's setup, from the home it runs with — the identity text, the model, the schedule seed, the
// skills — published whenever they change. The platform reads no harness file.
const readText = (p: string): string | undefined => { try { return readFileSync(p, 'utf8'); } catch { return undefined; } };
let setupDigest = '';
async function setup(): Promise<void> {
  const home = cfg.hermes_home;
  const config = readText(resolve(home, 'config.yaml')) ?? '';
  const model = /^\s+default:\s*(\S+)/m.exec(config)?.[1];
  const provider = /^\s+provider:\s*(\S+)/m.exec(config)?.[1];
  let schedule: Array<{ name: string; schedule: string; description?: string }> = [];
  try { const seed = JSON.parse(readText(resolve(home, 'cron', 'jobs.seed.json')) ?? '{}') as { jobs?: Array<{ name?: string; schedule?: string; prompt?: string; script?: string }> }; schedule = (seed.jobs ?? []).filter((j) => j.name && j.schedule).map((j) => ({ name: j.name!, schedule: j.schedule!, description: j.prompt ?? (j.script ? `runs ${j.script}` : undefined) })); } catch { /* no seed */ }
  const skills: string[] = [];
  try { for (const cat of readdirSync(resolve(home, 'skills'))) { try { for (const name of readdirSync(resolve(home, 'skills', cat))) if (existsSync(resolve(home, 'skills', cat, name, 'SKILL.md'))) skills.push(name); } catch { /* a file */ } } } catch { /* no skills */ }
  const s = { harness: 'hermes', persona: readText(resolve(home, 'SOUL.md')), model, provider, schedule, skills: skills.sort(), setup_md: readText(resolve(home, 'README.md')) };
  const digest = JSON.stringify(s);
  if (digest === setupDigest) return;
  try { if (await oa.setup(s)) { setupDigest = digest; log(`setup published (${model ?? 'no model'}, ${schedule.length} job(s), ${skills.length} skill(s))`); } } catch (e) { log(`setup publish failed: ${(e as Error).message}`); }
}
const index = await sc.subscribeSessionIndex({ harnesses: ['hermes'], homes });
await setup(); await board();
setInterval(() => { void setup(); void board(); }, 10_000);
log(`watching ${cfg.hermes_home} for ${cfg.account} → ${baseUrl} (${index.initial.length} session(s) on the index)`);
for (const d of index.initial) await consider(d);
process.on('SIGTERM', () => { void sc.close().then(() => process.exit(0)); });
