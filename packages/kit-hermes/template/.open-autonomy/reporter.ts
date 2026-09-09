#!/usr/bin/env bun
// The reporter: the project's development stream, published as it happens. An SDK-to-SDK bridge —
// supercode's harness SDK in (it discovers the agent's Hermes sessions and follows each transcript), the
// Open Autonomy SDK out (sessions, turns, updates on the project's page). It runs as the stack's keyless
// third service: it authenticates through the key valve's forwarded narration route and never sees the
// project's key. Nothing here drives the agent; it only reads.
//
//   HERMES_HOME=<the agent's home> OPEN_AUTONOMY_BASE_URL=http://127.0.0.1:8787/v1 bun .open-autonomy/reporter.ts [--config .open-autonomy/config.yaml]
//   Host sidecar: add --container <id> --project <container checkout> --state-file <host cursor file>.
//   Only the native Supercode reader and file/git reads execute inside that container; publishing stays here.
//
// Supercode's contract, as its SDK documents it: `subscribeSessionIndex` lists sessions and streams
// index changes (`sessionIndexEvent`); `session(locator).follow()` yields a snapshot then appended
// messages; `subscribeSessionActivity` reports presence and turn state. A Hermes home is named by the
// path of its state.db in `homes.hermes`.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { SupercodeHarnessClient, type NormalizedMessage, type SessionActivity, type SessionDescriptor, type SessionLocator } from '@volter-ai-dev/supercode-harness-sdk';
import { ROADMAP_SCHEMA, linkOf, linksIn, type Link, type RoadmapItem } from './sdk/roadmap.ts';
import { OpenAutonomy, type Session, type Turn, type TaskReview } from './sdk/client.ts';

const arg = (name: string): string | undefined => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const configPath = resolve(arg('--config') ?? resolve(import.meta.dir, 'config.yaml'));
const cfg = readConfig(configPath);
const container = arg('--container');
if (container && !cfg.hermes_home.startsWith('/')) throw new Error('Container reporting requires HERMES_HOME to name the absolute home inside the container.');
const projectDir = arg('--project') ?? (container ? '/work/project' : resolve(dirname(configPath), '..'));
if (container && cfg.seats) throw new Error('Container reporting reads Hermes in the container; configure host Claude seats with a separate reporter.');
// Keep the existing read-only observer next to its SQLite files. Docker carries its ordinary
// stdio protocol; neither databases nor credentials are mirrored onto another filesystem.
const inContainer = (cmd: string[]) => ['docker', 'exec', '-i', '--user', 'hermes', '--env', `HERMES_HOME=${cfg.hermes_home}`, container!, ...cmd];
const run = (cmd: string[]) => Bun.spawnSync({
  cmd: container ? inContainer(cmd) : cmd, stdout: 'pipe', stderr: 'pipe', timeout: 20_000,
});
const readText = (p: string): string | undefined => {
  try {
    if (!container) return readFileSync(p, 'utf8');
    const r = run(['cat', '--', p]);
    return r.exitCode === 0 ? r.stdout.toString() : undefined;
  } catch { return undefined; }
};
const directories = (p: string): string[] => {
  if (!container) return readdirSync(p, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  const r = run(['python3', '-c', 'import json,os,sys; print(json.dumps([e.name for e in os.scandir(sys.argv[1]) if e.is_dir()]))', p]);
  if (r.exitCode !== 0) throw new Error('Container directory unavailable');
  return JSON.parse(r.stdout.toString());
};
const baseUrl = process.env.OPEN_AUTONOMY_BASE_URL ?? `${cfg.platform}/v1`;
const oa = new OpenAutonomy({ baseUrl, key: process.env.OPEN_AUTONOMY_KEY ?? 'valve' });
const stateFile = resolve(arg('--state-file') ?? cfg.state_file);
const IDLE_END_MS = Number(process.env.OPEN_AUTONOMY_IDLE_END_MS ?? 5 * 60_000);
const TURN_END_MS = Number(process.env.OPEN_AUTONOMY_TURN_END_MS ?? 15_000);
// The board's tasks with an attempt still running, as of its last read: a run session serving one of them is not over,
// however long its transcript is silent.
const runningItems = new Set<string>();
const log = (m: string) => console.log(`reporter: ${m}`);
// The valve holds the key; its health line says when the key expires. Logged once at start so a reader of
// either log sees the expiry.
fetch(`${baseUrl.replace(/\/v1\/?$/, '')}/healthz`).then(async (r) => log(`valve: ${(await r.text()).trim()}`)).catch((e: Error) => log(`valve unreachable at start: ${e.message}`));

interface Config { account: string; platform: string; publish: { runs: boolean; chats: boolean; private: string[] }; hermes_home: string; state_file: string; seats?: string }
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
    hermes_home: top.hermes_home ?? process.env.HERMES_HOME ?? '',
    state_file: resolve(dirname(configPath), top.state_file ?? 'reporter-state.json'),
    // `seats`: a directory under which the project's workers open Claude Code sessions (one worktree per task); their
    // transcripts, in this user's ~/.claude, are followed and published as runs sourced `seat`, each under the board
    // task whose workspace it is. Their model is the seat's own subscription, never the platform's books.
    seats: top.seats ? resolve(top.seats.replace(/^~(?=$|\/)/, process.env.HOME ?? '')) : undefined,
  };
}

// What has been published: ended sessions are never reopened; open ones resume at the platform's offset.
interface State { ended: Record<string, string> }
const state: State = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) as State : { ended: {} };
const saveState = () => { try { writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`); } catch (e) { log(`cannot write ${stateFile}: ${(e as Error).message}`); } };

// A run: the schedule fired it, or the board's dispatcher spawned it for a task (a worker or a reviewer).
const isSeat = (d: SessionDescriptor): boolean => d.locator.harness === 'claude-code' && !!cfg.seats && !!d.cwd && `${resolve(d.cwd)}/`.startsWith(`${cfg.seats}/`);
const kindOf = (d: SessionDescriptor): 'run' | 'chat' => (isSeat(d) || d.trigger === 'cron' || d.trigger === 'heartbeat' || d.trigger === 'task' ? 'run' : 'chat');
// A run's source is its job's name. supercode's job model carries the job's id, not its name; Hermes keeps
// the name beside the id in its own schedule store in the home the reporter reads, so that is where the
// name comes from (read-only, refreshed whenever an id is new), falling back to the id.
const jobNames = new Map<string, string>();
function jobName(id: string): string {
  if (!jobNames.has(id)) {
    try {
      const store = JSON.parse(readText(resolve(cfg.hermes_home, 'cron', 'jobs.json')) ?? '{}') as { jobs?: Array<{ id?: string; name?: string }> } | Array<{ id?: string; name?: string }>;
      for (const j of Array.isArray(store) ? store : store.jobs ?? []) if (j.id && j.name) jobNames.set(j.id, j.name);
    } catch { /* no schedule store yet */ }
  }
  return jobNames.get(id) ?? id;
}
const sourceOf = (d: SessionDescriptor): string => (isSeat(d) ? 'seat' : d.recurrence?.job_id ? jobName(d.recurrence.job_id) : d.trigger === 'task' ? 'board' : d.surface?.platform ?? kindOf(d));
// A provider id is safe to publish; an endpoint and credential are not. The kit's `custom` provider is the
// platform only when its configured base URL names the valve. For any other configured provider, the owner's
// provider account funds the session. An incomplete custom configuration stays unknown.
function configuredProvider(home: string): string | undefined {
  const config = readText(resolve(home, 'config.yaml')) ?? readText(resolve(cfg.hermes_home, 'config.yaml')) ?? '';
  const provider = /^\s+provider:\s*["']?([^\s"']+)/m.exec(config)?.[1];
  const endpoint = /^\s+base_url:\s*["']?([^\s"']+)/m.exec(config)?.[1];
  if (!provider) return undefined;
  if (endpoint === '${OPEN_AUTONOMY_BASE_URL}' || (endpoint && endpoint.replace(/\/$/, '') === baseUrl.replace(/\/$/, ''))) return 'open-autonomy';
  if (provider === 'custom' && !endpoint) return undefined;
  return provider;
}
function modelProviderOf(d: SessionDescriptor): string | undefined {
  if (isSeat(d)) return 'claude-code';
  const home = d.profile && d.profile !== 'default' ? resolve(cfg.hermes_home, 'profiles', d.profile) : cfg.hermes_home;
  return configuredProvider(home);
}
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
    const start = { key: this.key, kind: kindOf(this.d), source: sourceOf(this.d), title: this.d.title ?? undefined, modelProvider: modelProviderOf(this.d), startedAt: this.d.updated_at_ms ? new Date(this.d.updated_at_ms).toISOString() : undefined };
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
          // Only a board run serves an item; a scheduled session (the PM over the whole board) mentions branches and
          // tasks without being about one.
          if (sourceOf(this.d) === 'board') this.item ??= itemIn(turns);
          if (sourceOf(this.d) === 'seat' && this.d.cwd) this.item ??= seatItems.get(resolve(this.d.cwd));
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
    // Silence is not the end of a board run while the board still shows its attempt running: a world coming up or a
    // long check is one tool call, minutes without a word. The board's own record says when the attempt is over.
    if (why.startsWith('idle') && kindOf(this.d) === 'run' && this.item && runningItems.has(this.item)) { this.arm(); return; }
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
const supercode = container ? process.env.SUPERCODE_BIN ?? 'supercode' : [process.env.SUPERCODE_BIN, resolve(import.meta.dir, 'node_modules', '.bin', 'supercode')].filter((p): p is string => !!p).find(existsSync) ?? Bun.which('supercode') ?? 'supercode';
const reader = container ? inContainer([supercode, 'harness', 'serve']) : [supercode, 'harness', 'serve'];
const sc = new SupercodeHarnessClient({ command: reader[0], args: reader.slice(1), env: { ...process.env, HERMES_HOME: cfg.hermes_home } as Record<string, string> });
const homes = { hermes: resolve(cfg.hermes_home, 'state.db'), ...(cfg.seats ? { claude_code: resolve(process.env.HOME ?? '', '.claude') } : {}) };
// The board task each seat directory serves, as of the last board read: the task in flight whose workspace names it.
const seatItems = new Map<string, string>();
const followed = new Map<string, Followed>();
const activitySubs = new Map<string, string>();

async function consider(d: SessionDescriptor): Promise<void> {
  const key = d.locator.session_id;
  if (!(d.locator.harness === 'hermes' || isSeat(d)) || followed.has(key) || state.ended[key]) return;
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
// The timeline, published through the SDK as one document in one language: the past from CHANGELOG.md, the
// present from the board (through supercode's workflow layer) with the sessions serving it, the future from
// ROADMAP.md. Unifying the three is this reporter's job; the platform reads no file and knows no board.
// Every board task is an item — its id, its title, its lane as the status, the `- ` lines of its body as the
// acceptance — and each task's board state (lane, attempts, handoff, review verdicts) is published under that
// item whenever it changes. A task the board marks done after a review it requested was approved by that review.
type BoardTask = { id: string; title?: string; body?: string; workspace?: string; assignee?: string; lane: string; priority?: number; created_at?: string; completed_at?: string; attempts?: Array<{ id: string; profile?: string; status: string; started_at?: string; ended_at?: string; outcome?: string; handoff?: { summary?: string; branch?: string; commit?: string } }>; reviews?: Array<{ verdict: string; by?: string; reason?: string; at?: string }> };
// The lanes as the status words: done; running or review is active; blocked or parked (scheduled) waits on a
// decision, so proposed; the rest is planned. A done task is the past; every other lane is the present.
const statusOf = (lane: string): RoadmapItem['status'] => (lane === 'done' ? 'done' : lane === 'running' || lane === 'review' ? 'active' : lane === 'blocked' || lane === 'scheduled' ? 'proposed' : 'planned');
const defined = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
const dedupe = (links: Link[]): Link[] | undefined => { const m = new Map<string, Link>(); for (const l of links) if (!m.has(l.url)) m.set(l.url, l); return m.size ? [...m.values()] : undefined; };
// A task's proof: the commit its handoff names (as a field, or in the handoff's own words), else the commit the
// session serving it pushed while this reporter watched.
function commitOf(t: BoardTask): string | undefined {
  const last = [...(t.attempts ?? [])].reverse().find((a) => a.handoff);
  const named = last?.handoff?.commit;
  if (named && /^[0-9a-f]{7,40}$/.test(named)) return named;
  const inWords = /\b(?=[0-9a-f]*\d)([0-9a-f]{7,40})\b/.exec(last?.handoff?.summary ?? '')?.[1];
  if (inWords) return inWords;
  return [...followed.values()].filter((f) => f.item === t.id && f.sha).map((f) => f.sha).pop();
}
const boardDigests = new Map<string, string>();
let timelineDigest = '';
let presentCount = 0;
async function board(): Promise<RoadmapItem[] | undefined> {
  let read: { workflow?: { boards?: Record<string, { tasks?: Record<string, BoardTask> }> } };
  try { read = await sc.workflowLoad({ from: 'hermes', home: cfg.hermes_home }) as typeof read; } catch (e) { log(`board unreadable: ${(e as Error).message}`); return undefined; }
  // The developer's tasks are the present. Tasks assigned to another profile (a purchase request for the treasurer)
  // are the board's own bookkeeping: their spend shows on the trail under the developer's task, not as items.
  const tasks = Object.values(read.workflow?.boards ?? {}).flatMap((b) => Object.values(b.tasks ?? {})).filter((t) => t.lane !== 'archived' && (t.assignee ?? 'default') === 'default').sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '') || a.id.localeCompare(b.id));
  for (const t of tasks) { const dir = /^dir:(.+)$/.exec(t.workspace ?? '')?.[1]; if (dir && (t.lane === 'running' || t.lane === 'review' || !seatItems.has(resolve(dir)))) seatItems.set(resolve(dir), t.id); }
  // A read that found no board at all (the database mid-write) is not an empty board: a board that had tasks a
  // moment ago and has none now is skipped; a board that never had any is simply empty, and the past and the
  // future publish without it.
  if (!tasks.length && presentCount > 0) return undefined;
  presentCount = tasks.length;
  runningItems.clear();
  for (const t of tasks) if (t.lane === 'running') runningItems.add(t.id);
  const items: RoadmapItem[] = tasks.map((t) => {
    const attempts = t.attempts ?? [];
    const first = attempts.find((a) => a.started_at);
    const last = [...attempts].reverse().find((a) => a.handoff) ?? attempts[attempts.length - 1];
    return defined({
      id: t.id, title: t.title ?? t.id, tense: t.lane === 'done' ? 'past' : 'present', status: statusOf(t.lane), home: 'kanban', phase: /<!-- roadmap:([A-Za-z0-9][A-Za-z0-9._-]{0,79}):/.exec(t.body ?? '')?.[1],
      priority: t.priority !== undefined ? String(t.priority) : undefined, proposed_at: t.created_at, started_at: first?.started_at, done_at: t.lane === 'done' ? t.completed_at ?? last?.ended_at : undefined,
      by: last?.profile, commit: commitOf(t),
      links: dedupe([...linksIn(t.body ?? ''), ...(last?.handoff?.branch ? [linkOf(`https://github.com/${cfg.account}/tree/${last.handoff.branch}`, last.handoff.branch)] : [])]),
      acceptance: (t.body ?? '').split('\n').filter((l) => /^- /.test(l)).map((l) => l.slice(2).trim()),
    }) as RoadmapItem;
  });
  for (const t of tasks) {
    const item = t.id;
    const attempts = (t.attempts ?? []).map((a) => ({ id: a.id, profile: a.profile, status: a.status, started_at: a.started_at, ended_at: a.ended_at, outcome: a.outcome, summary: a.handoff?.summary }));
    const reviews: TaskReview[] = (t.reviews ?? []).map((r) => ({ verdict: r.verdict as TaskReview['verdict'], by: r.by, reason: r.reason, at: r.at }));
    const requested = [...reviews].reverse().find((r) => r.verdict === 'requested');
    if (t.lane === 'done' && requested && !reviews.some((r) => r.verdict === 'changes_requested' && (r.at ?? '') > (requested.at ?? ''))) reviews.push({ verdict: 'approved', by: attempts[attempts.length - 1]?.profile, at: t.completed_at ?? attempts[attempts.length - 1]?.ended_at });
    const last = [...(t.attempts ?? [])].reverse().find((a) => a.handoff);
    const state = { item, task_id: t.id, lane: t.lane, title: t.title, assignee: t.assignee, attempts, reviews, handoff: last?.handoff, updated_at: new Date().toISOString() };
    const taskDigest = JSON.stringify([state.lane, attempts.map((a) => [a.id, a.status, a.ended_at]), reviews.length, last?.handoff?.summary]);
    if (boardDigests.get(t.id) === taskDigest) continue;
    try { if (await oa.task(state)) { boardDigests.set(t.id, taskDigest); log(`board: ${t.id} (${t.lane}, ${attempts.length} attempt(s), ${reviews.length} review(s))`); } } catch (e) { log(`board publish failed for ${t.id}: ${(e as Error).message}`); }
  }
  return items;
}
// The past, from CHANGELOG.md as the PM keeps it: a `## ` heading per release (`Unreleased` first; a released
// heading carries its date), a `- ` line per change. A line is an item whose id is a hash of its own words,
// so an unchanged line keeps its identity across revisions; a commit or a PR named in the line is its proof.
const plain = (md: string): string => md.replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/`/g, '').replace(/\s+/g, ' ').trim();
const clipWords = (s: string, n: number): string => (s.length <= n ? s : `${s.slice(0, n - 1).replace(/\s+\S*$/, '')}…`);
function changelogItems(md: string | undefined, account: string): RoadmapItem[] {
  const out: RoadmapItem[] = [];
  if (!md) return out;
  const seen = new Set<string>();
  let release: string | undefined;
  let date: string | undefined;
  for (const line of md.split('\n')) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) {
      const head = h[1].replace(/^\[|\]$/g, '').trim();
      if (/^unreleased$/i.test(head)) { release = 'unreleased'; date = undefined; continue; }
      const d = /(\d{4}-\d{2}-\d{2})/.exec(head);
      date = d ? `${d[1]}T00:00:00Z` : undefined;
      release = plain(head.replace(/\s*[—–-]+\s*\d{4}-\d{2}-\d{2}.*$/, '')).slice(0, 80) || 'released';
      continue;
    }
    const b = release !== undefined && /^\s*[-*]\s+(.+?)\s*$/.exec(line);
    if (!b) continue;
    const text = b[1];
    let id = `shipped-${createHash('sha1').update(text).digest('hex').slice(0, 10)}`;
    while (seen.has(id)) id = `${id}-`;
    seen.add(id);
    const commit = /\b(?=[0-9a-f]*\d)([0-9a-f]{7,40})\b/.exec(text)?.[1];
    const links = dedupe([...linksIn(text), ...[...text.matchAll(/(?:PR\s*)?#(\d+)\b/g)].map((m) => linkOf(`https://github.com/${account}/pull/${m[1]}`, `#${m[1]}`))]);
    out.push(defined({ id, title: clipWords(plain(text), 200), tense: 'past', status: 'done', home: 'changelog', release, done_at: date, commit, links, acceptance: [] }) as RoadmapItem);
  }
  return out;
}
// The future, from ROADMAP.md as the PM keeps it: a `## <id>: <title>` section per intention; its `Status:` line
// (planned, else proposed), its `Target version:` as the release, its `Completion:` bullets as the acceptance.
function roadmapItems(md: string | undefined): RoadmapItem[] {
  const out: RoadmapItem[] = [];
  if (!md) return out;
  const seen = new Set<string>();
  let cur: { item: RoadmapItem; bullets: string[]; completion: string[]; inCompletion: boolean; text: string[] } | undefined;
  const close = () => { if (!cur) return; cur.item.acceptance = cur.completion.length ? cur.completion : cur.bullets; cur.item.links = dedupe(linksIn(cur.text.join('\n'))); out.push(defined(cur.item) as RoadmapItem); cur = undefined; };
  for (const line of md.split('\n')) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) {
      close();
      // Only a `## <id>: <title>` section is an intention; a section without an id is the file's own prose.
      const m = /^([A-Za-z0-9][A-Za-z0-9._-]{0,79}):\s+(.+)$/.exec(h[1]);
      if (!m) continue;
      let id = m[1];
      while (seen.has(id)) id = `${id}-`;
      seen.add(id);
      cur = { item: { id, title: clipWords(plain(m[2]), 200), tense: 'future', status: 'proposed', home: 'roadmap', acceptance: [] }, bullets: [], completion: [], inCompletion: false, text: [] };
      continue;
    }
    if (!cur) continue;
    cur.text.push(line);
    const kv = /^([A-Za-z][A-Za-z ]{0,30}):\s*(.*)$/.exec(line);
    if (kv) {
      const key = kv[1].toLowerCase();
      const val = kv[2].trim();
      cur.inCompletion = key === 'completion';
      if (key === 'status') cur.item.status = /^(planned|active)\b/i.test(val) ? (val.toLowerCase().startsWith('active') ? 'active' : 'planned') : 'proposed';
      if (key === 'target version' && val) cur.item.release = plain(val).slice(0, 80);
      if (key === 'target window' && /\d{4}-\d{2}-\d{2}/.test(val)) cur.item.proposed_at ??= `${/(\d{4}-\d{2}-\d{2})/.exec(val)![1]}T00:00:00Z`;
      continue;
    }
    const b = /^\s*[-*]\s+(.+?)\s*$/.exec(line);
    if (b) { (cur.inCompletion ? cur.completion : cur.bullets).push(clipWords(plain(b[1]), 1000)); continue; }
    if (line.trim() === '') cur.inCompletion = false;
  }
  close();
  return out;
}
// One intention is one item across its tenses. A task carries the roadmap section it serves (the scrum's marker,
// kept above in `phase` until folded here): that section is no longer the future, and the task takes its release
// and, when it has none of its own, its acceptance. A changelog line that names a done task's commit or id is that
// task shipped: the task keeps its receipts and takes the line's release and record; the line is not a second item.
// Where a task landed: the merge on main whose subject names its branch (the landing workflow's own words,
// `Merge pull request #N from …/agent/<task id>`), read from the checkout's origin/main and remembered once found.
const landedCache = new Map<string, { sha?: string; pr?: string }>();
function landedOf(id: string): { sha?: string; pr?: string } {
  const known = landedCache.get(id);
  if (known) return known;
  const r = run(['git', '-C', projectDir, 'log', 'origin/main', '--first-parent', '-1', '--format=%H%x1f%s', `--grep=agent/${id}`]);
  const line = r.exitCode === 0 ? r.stdout.toString().trim() : '';
  const [sha, subject] = line.split('\x1f');
  const found = sha ? { sha, pr: /#(\d+)\b/.exec(subject ?? '')?.[1] } : {};
  if (sha) landedCache.set(id, found);
  return found;
}
function fold(tasks: RoadmapItem[], shipped: RoadmapItem[], intentions: RoadmapItem[]): RoadmapItem[] {
  const served = new Map<string, RoadmapItem>(intentions.map((i) => [i.id, i]));
  const items: RoadmapItem[] = [];
  const folded = new Set<string>();
  for (const t of tasks) {
    const section = t.phase ? served.get(t.phase) : undefined;
    const { phase: _section, ...rest } = t;
    const item: RoadmapItem = { ...rest };
    if (section) {
      folded.add(section.id);
      if (section.release && !item.release) item.release = section.release;
      if (!item.acceptance.length) item.acceptance = section.acceptance;
      item.links = dedupe([...(item.links ?? []), ...(section.links ?? [])]);
    }
    if (t.tense === 'past') {
      const landed = landedOf(t.id);
      const prUrl = landed.pr ? `https://github.com/${cfg.account}/pull/${landed.pr}` : undefined;
      if (prUrl) item.links = dedupe([...(item.links ?? []), linkOf(prUrl, `#${landed.pr}`)]);
      const sameCommit = (a?: string, b?: string) => !!a && !!b && (a.startsWith(b) || b.startsWith(a));
      const line = shipped.find((l) => l.title.includes(t.id) || sameCommit(l.commit, t.commit) || sameCommit(l.commit, landed.sha) || (!!prUrl && (l.links ?? []).some((x) => x.url === prUrl)));
      if (line) { folded.add(line.id); if (line.release) item.release = line.release; item.links = dedupe([...(item.links ?? []), ...(line.links ?? [])]); item.commit ??= line.commit; item.done_at ??= line.done_at; }
    }
    items.push(item);
  }
  const ids = new Set(items.map((i) => i.id));
  for (const it of [...shipped, ...intentions]) if (!folded.has(it.id) && !ids.has(it.id)) { ids.add(it.id); items.push(it); }
  return items;
}
// A project file as main has it: the checkout's `origin/main` (refreshed here about once a minute, and by every
// scrum and every worker), never the branch a worker happens to be on; the working tree only when there is no git.
let fetchedAt = 0;
function mainFile(name: string): string | undefined {
  if (Date.now() - fetchedAt > 60_000) { fetchedAt = Date.now(); try { run(['git', '-C', projectDir, 'fetch', '-q', 'origin', 'main']); } catch { /* no remote here */ } }
  const r = run(['git', '-C', projectDir, 'show', `origin/main:${name}`]);
  return r.exitCode === 0 ? r.stdout.toString() : readText(resolve(projectDir, name));
}
async function timeline(): Promise<void> {
  const present = await board();
  if (!present) return;
  const items = fold(present, changelogItems(mainFile('CHANGELOG.md'), cfg.account), roadmapItems(mainFile('ROADMAP.md')));
  const digest = JSON.stringify(items);
  if (digest === timelineDigest || !items.length) return;
  try {
    const r = await oa.pushRoadmap({ schema: ROADMAP_SCHEMA, items }, 'hermes', 'reporter');
    if (r.ok) { timelineDigest = digest; if (!r.unchanged) log(`timeline published (${items.filter((i) => i.tense === 'past').length} past, ${items.filter((i) => i.tense === 'present').length} present, ${items.filter((i) => i.tense === 'future').length} future)`); } else log(`timeline publish refused: ${r.error ?? r.status}`);
  } catch (e) { log(`timeline publish failed: ${(e as Error).message}`); }
}
// The agent's setup, from the home it runs with — the identity text, the model, the schedule seed, the
// skills — published whenever they change. The platform reads no harness file.
// The project's document, from the checkout: CONSTITUTION.md is what the project is (the page leads with its first
// paragraph). Published when it changes. What shipped is the timeline's past, never a document.
let docsDigest = '';
async function docs(): Promise<void> {
  const d = { about_md: readText(resolve(projectDir, 'CONSTITUTION.md')) };
  const digest = JSON.stringify(d);
  if (digest === docsDigest || !d.about_md) return;
  try { if (await oa.docs(d)) { docsDigest = digest; log('document published (about)'); } } catch (e) { log(`document publish failed: ${(e as Error).message}`); }
}
let setupDigest = '';
async function setup(): Promise<void> {
  const home = cfg.hermes_home;
  const config = readText(resolve(home, 'config.yaml')) ?? '';
  const model = /^\s+default:\s*(\S+)/m.exec(config)?.[1];
  const provider = configuredProvider(home);
  let schedule: Array<{ name: string; schedule: string; description?: string }> = [];
  try { const seed = JSON.parse(readText(resolve(home, 'cron', 'jobs.seed.json')) ?? '{}') as { jobs?: Array<{ name?: string; schedule?: string; prompt?: string; script?: string }> }; schedule = (seed.jobs ?? []).filter((j) => j.name && j.schedule).map((j) => ({ name: j.name!, schedule: j.schedule!, description: j.prompt ?? (j.script ? `runs ${j.script}` : undefined) })); } catch { /* no seed */ }
  const skills: string[] = [];
  try { for (const cat of directories(resolve(home, 'skills'))) { try { for (const name of directories(resolve(home, 'skills', cat))) if (readText(resolve(home, 'skills', cat, name, 'SKILL.md')) !== undefined) skills.push(name); } catch { /* a file */ } } } catch { /* no skills */ }
  const s = { harness: 'hermes', persona: readText(resolve(home, 'SOUL.md')), model, provider, schedule, skills: skills.sort(), setup_md: readText(resolve(home, 'README.md')) };
  const digest = JSON.stringify(s);
  if (digest === setupDigest) return;
  try { if (await oa.setup(s)) { setupDigest = digest; log(`setup published (${model ?? 'no model'}, ${schedule.length} job(s), ${skills.length} skill(s))`); } } catch (e) { log(`setup publish failed: ${(e as Error).message}`); }
}
const index = await sc.subscribeSessionIndex({ harnesses: cfg.seats ? ['hermes', 'claude-code'] : ['hermes'], homes });
await setup(); await docs(); await timeline();
setInterval(() => { void setup(); void docs(); void timeline(); }, 10_000);
log(`watching ${cfg.hermes_home} for ${cfg.account} → ${baseUrl} (${index.initial.length} session(s) on the index)`);
for (const d of index.initial) await consider(d);
process.on('SIGTERM', () => { void sc.close().then(() => process.exit(0)); });
