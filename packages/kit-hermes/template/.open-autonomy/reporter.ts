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
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SupercodeHarnessClient, type NormalizedMessage, type SessionActivity, type SessionDescriptor, type SessionLocator } from '@volter-ai-dev/supercode-harness-sdk';
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

const kindOf = (d: SessionDescriptor): 'run' | 'chat' => (d.trigger === 'cron' || d.trigger === 'heartbeat' ? 'run' : 'chat');
// A run's source is its job's name. supercode's job model carries the job's id, not its name; the name is
// how its Hermes codec titles the session (`<job name> · <fired at>`), so the title's first segment is it.
const sourceOf = (d: SessionDescriptor): string => {
  if (d.recurrence?.job_id) return d.title?.split(' · ')[0]?.trim() || d.recurrence.job_id;
  return d.surface?.platform ?? kindOf(d);
};
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
// The roadmap item a run works: the skill lands on agent/<item>, so the branch in a git command names it.
const itemIn = (turns: Turn[]): string | undefined => turns.map((t) => /\bagent\/([a-z0-9][a-z0-9-]*)/.exec(`${t.args ?? ''} ${t.text ?? ''}`)?.[1]).find(Boolean);
const shaIn = (turns: Turn[]): string | undefined => turns.map((t) => /PUSHED_BRANCH=agent\/[a-z0-9-]+ ([0-9a-f]{7,40})/.exec(t.result ?? '')?.[1]).find(Boolean);

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
const index = await sc.subscribeSessionIndex({ harnesses: ['hermes'], homes });
log(`watching ${cfg.hermes_home} for ${cfg.account} → ${baseUrl} (${index.initial.length} session(s) on the index)`);
for (const d of index.initial) await consider(d);
process.on('SIGTERM', () => { void sc.close().then(() => process.exit(0)); });
