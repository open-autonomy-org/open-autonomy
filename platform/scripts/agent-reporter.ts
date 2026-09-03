#!/usr/bin/env bun
// The agent-side reporter: narrates the agent's cron runs to the platform so the site can show what the agent
// is doing, did, and (from the schedule) will do. It never touches Hermes. It reads the HERMES home through
// supercode's harness protocol — a subscription to the session index for new runs and a follow on each run
// for appended messages (the normalized session shape, so any harness supercode reads would work) — and
// Hermes's own executions table for run outcomes. It pushes CloudEvents 1.0 on the project's standing key:
// org.open-autonomy.job.{started,turns,finished}, subject = the run's session id, turns carrying their
// offset so a retry or a reconnect is idempotent. The platform's meter stays the independent check.
//
//   bun platform/scripts/agent-reporter.ts [--home <HERMES_HOME>] [--repo <the agent's checkout>] [--env <key file>] [--supercode /path/to/supercode] [--once]
//   bun platform/scripts/agent-reporter.ts --install …    # a launchd agent with the same flags
//
// It runs on the host, outside the agent's container: it reads the container's Hermes home (a bind mount)
// and posts on the project's standing key from --env (default ~/.config/open-autonomy/agent.env, the file
// the key sidecar reads; the agent never sees it). --repo is the host path of the agent's checkout, used to
// find the commit a run landed: the agent pushes a branch and the landing workflow merges it, so the
// commit reaches main after the run; finished receipts are backfilled with it for a day.
// State (turn offsets already sent per run) lives in <home>/reporter-state.json, git-ignored.
import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const arg = (name: string, dflt?: string): string | undefined => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : dflt; };
const HOME = resolve(arg('--home', 'hermes') as string);
const REPO = arg('--repo') ? resolve(arg('--repo') as string) : undefined;
const ENV_FILE = arg('--env') ?? (existsSync(join(homedir(), '.config', 'open-autonomy', 'agent.env')) ? join(homedir(), '.config', 'open-autonomy', 'agent.env') : join(HOME, '.env'));
const SUPERCODE = arg('--supercode', process.env.SUPERCODE_BIN ?? 'supercode') as string;
const ONCE = process.argv.includes('--once');
const STATE_PATH = join(HOME, 'reporter-state.json');
const STORE = join(HOME, 'state.db');
const SOURCE = `hermes://${HOME}/state.db`;

function readEnvFile(): Record<string, string> {
  // The environment wins (the reporter container is told to post through the sidecar); else the key file.
  const out: Record<string, string> = {};
  for (const k of ['OPEN_AUTONOMY_BASE_URL', 'OPEN_AUTONOMY_KEY']) if (process.env[k]) out[k] = process.env[k] as string;
  if (out.OPEN_AUTONOMY_KEY || !existsSync(ENV_FILE)) return out;
  for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) { const m = /^([A-Z_]+)=(.*)$/.exec(line.trim()); if (m) out[m[1]] = m[2]; }
  return out;
}
const env = readEnvFile();
const BASE = (env.OPEN_AUTONOMY_BASE_URL ?? '').replace(/\/v1\/?$/, '');
const KEY = env.OPEN_AUTONOMY_KEY;

if (process.argv.includes('--install')) {
  const plist = join(homedir(), 'Library', 'LaunchAgents', 'org.open-autonomy.reporter.plist');
  const bun = Bun.which('bun') ?? '/usr/local/bin/bun';
  mkdirSync(join(homedir(), 'Library', 'LaunchAgents'), { recursive: true });
  writeFileSync(plist, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>org.open-autonomy.reporter</string>
  <key>ProgramArguments</key><array><string>${bun}</string><string>${resolve(import.meta.path)}</string><string>--home</string><string>${HOME}</string><string>--env</string><string>${ENV_FILE}</string>${REPO ? `<string>--repo</string><string>${REPO}</string>` : ''}<string>--supercode</string><string>${resolve(Bun.which(SUPERCODE) ?? SUPERCODE)}</string></array>
  <key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${join(HOME, 'logs', 'reporter.log')}</string>
  <key>StandardErrorPath</key><string>${join(HOME, 'logs', 'reporter.log')}</string>
</dict></plist>\n`);
  const uid = process.getuid?.() ?? 501;
  Bun.spawnSync({ cmd: ['launchctl', 'bootout', `gui/${uid}/org.open-autonomy.reporter`], stdout: 'ignore', stderr: 'ignore' });
  const r = Bun.spawnSync({ cmd: ['launchctl', 'bootstrap', `gui/${uid}`, plist], stdout: 'pipe', stderr: 'pipe' });
  console.log(r.exitCode === 0 ? `installed ${plist}` : `launchctl bootstrap failed: ${r.stderr.toString()}`);
  process.exit(r.exitCode === 0 ? 0 : 1);
}
if (!BASE || !KEY) { console.error(`no OPEN_AUTONOMY_BASE_URL / OPEN_AUTONOMY_KEY in ${ENV_FILE}`); process.exit(2); }

// ---- supercode harness.v1 over stdio: requests with ids, notifications by method -------------------------
type Notification = { method: string; params: any };
class Harness {
  private proc = Bun.spawn({ cmd: [SUPERCODE, 'harness', 'serve'], stdin: 'pipe', stdout: 'pipe', stderr: 'ignore' });
  private next = 1;
  private pending = new Map<number, (v: any) => void>();
  constructor(private onNotify: (n: Notification) => void) {
    (async () => {
      const reader = this.proc.stdout.getReader(); const dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
          if (!line) continue;
          let msg: any; try { msg = JSON.parse(line); } catch { continue; }
          if (msg.id !== undefined && this.pending.has(msg.id)) { const cb = this.pending.get(msg.id)!; this.pending.delete(msg.id); cb(msg); }
          else if (typeof msg.method === 'string') { try { this.onNotify({ method: msg.method, params: msg.params }); } catch (e) { console.error(`notify: ${(e as Error).message}`); } }
        }
      }
    })();
  }
  call(method: string, params: unknown, timeoutMs = 20_000): Promise<any> {
    const id = this.next++;
    return new Promise((resolveP, reject) => {
      const t = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} timed out`)); }, timeoutMs);
      this.pending.set(id, (msg) => { clearTimeout(t); msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolveP(msg.result); });
      this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      this.proc.stdin.flush();
    });
  }
  close() { this.proc.kill(); }
}

// ---- Hermes-side facts: which job a session belongs to, how its execution ended, what it committed ---------
type JobsFile = { jobs: Array<{ id?: string; name?: string; workdir?: string }> };
function jobsFile(): JobsFile {
  for (const f of ['jobs.json', 'jobs.seed.json']) { const p = join(HOME, 'cron', f); if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8')); }
  return { jobs: [] };
}
function sessionStart(key: string): { jobId: string; startedAt: Date } | null {
  const m = /^cron_([a-z0-9]+)_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/.exec(key);
  if (!m) return null;
  return { jobId: m[1], startedAt: new Date(Number(m[2]), Number(m[3]) - 1, Number(m[4]), Number(m[5]), Number(m[6]), Number(m[7])) };
}
function executionFor(jobId: string, startedAt: Date): { status: string; finished_at: string | null } | null {
  const db = join(HOME, 'cron', 'executions.db');
  if (!existsSync(db)) return null;
  const d = new Database(db, { readonly: true });
  try {
    const rows = d.query('select status, started_at, finished_at from executions where job_id = ?1 order by claimed_at desc limit 20').all(jobId) as Array<{ status: string; started_at: string | null; finished_at: string | null }>;
    let best: { status: string; finished_at: string | null } | null = null; let bestDist = Infinity;
    for (const r of rows) {
      const t = r.started_at ? Date.parse(r.started_at) : NaN; if (!Number.isFinite(t)) continue;
      const dist = Math.abs(t - startedAt.getTime());
      if (dist < bestDist && dist < 10 * 60_000) { bestDist = dist; best = { status: r.status, finished_at: r.finished_at }; }
    }
    return best;
  } finally { d.close(); }
}
// The commit a run landed ON MAIN: the agent's own author, made during the run (author date), or failing
// that a commit naming the item. Reads origin/main after a fetch, since the agent lands through a branch
// and the landing workflow's merge, minutes after the run.
function commitInWindow(workdir: string | undefined, since: Date, until: string | null | undefined, itemId?: string): string | undefined {
  if (!workdir || !existsSync(workdir)) return undefined;
  Bun.spawnSync({ cmd: ['git', '-C', workdir, 'fetch', '-q', 'origin', 'main'], stdout: 'ignore', stderr: 'ignore' });
  const window = ['--no-merges', `--since=${since.toISOString()}`, ...(until ? [`--until=${new Date(Date.parse(until) + 60_000).toISOString()}`] : [])];
  const byAuthor = Bun.spawnSync({ cmd: ['git', '-C', workdir, 'log', '-1', '--format=%H', '--author=Open Autonomy agent', ...window, 'origin/main'], stdout: 'pipe', stderr: 'ignore' }).stdout.toString().trim();
  if (/^[0-9a-f]{40}$/.test(byAuthor)) return byAuthor;
  if (!itemId) return undefined; // a run that committed under another identity: the commit naming its item
  const byItem = Bun.spawnSync({ cmd: ['git', '-C', workdir, 'log', '-1', '--format=%H', `--grep=${itemId}`, ...window, 'origin/main'], stdout: 'pipe', stderr: 'ignore' }).stdout.toString().trim();
  return /^[0-9a-f]{40}$/.test(byItem) ? byItem : undefined;
}
function roadmapIds(workdir: string | undefined): string[] {
  const p = workdir ? join(workdir, 'ROADMAP.yml') : ''; if (!p || !existsSync(p)) return [];
  return [...readFileSync(p, 'utf8').matchAll(/^\s+- id:\s*(\S+)/gm)].map((m) => m[1]);
}

// ---- supercode's normalized messages → the platform's turns ------------------------------------------------
type Turn = { ts?: string; role: 'user' | 'assistant' | 'tool' | 'system'; text?: string; tool?: string; args?: string; result?: string };
function toTurns(messages: any[]): Turn[] {
  const out: Turn[] = [];
  const ts = new Date().toISOString();
  for (const m of messages) {
    const text = typeof m.content === 'string' ? m.content : Array.isArray(m.content) ? m.content.map((c: any) => c.text ?? '').join('\n') : '';
    if (m.role === 'assistant') {
      for (const tc of m.tool_calls ?? []) out.push({ ts, role: 'assistant', tool: tc.function?.name ?? tc.name, args: tc.function?.arguments ?? '' });
      if (text.trim()) out.push({ ts, role: 'assistant', text });
    } else if (m.role === 'tool') out.push({ ts, role: 'tool', tool: m.name, result: text });
    else if (m.role === 'user') out.push({ ts, role: 'user', text: text.slice(0, 600) });
  }
  return out;
}
function detectItem(turns: Turn[], ids: string[]): string | undefined {
  for (const t of turns) { const hay = `${t.text ?? ''}\n${t.args ?? ''}`; for (const id of ids) if (hay.includes(id)) return id; }
  return undefined;
}

// ---- CloudEvents on the standing key ---------------------------------------------------------------------
function cloudEvent(type: 'started' | 'turns' | 'finished', subject: string, data: Record<string, unknown>, time?: string) {
  return { specversion: '1.0', id: crypto.randomUUID(), source: SOURCE, type: `org.open-autonomy.job.${type}`, subject, time: time ?? new Date().toISOString(), datacontenttype: 'application/json', data };
}
async function post(events: unknown[]): Promise<boolean> {
  if (!events.length) return true;
  const res = await fetch(`${BASE}/v1/agent/events`, { method: 'POST', headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/cloudevents-batch+json' }, body: JSON.stringify(events) });
  if (!res.ok) console.error(`events → ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.ok;
}

// ---- the runs we narrate -----------------------------------------------------------------------------------
type RunState = { started: boolean; sent_msgs: number; sent_turns: number; finished: boolean; item_id?: string; last_text?: string; commit_sha?: string; ended_at?: string; status?: string };
const state: Record<string, RunState> = existsSync(STATE_PATH) ? JSON.parse(readFileSync(STATE_PATH, 'utf8')) : {};
const save = () => writeFileSync(STATE_PATH, JSON.stringify(state, null, 1));
const following = new Map<string, string>(); // session id → follow subscription id
const jobs = jobsFile();
// The checkout on THIS host: --repo when given (the job's workdir is a container path), else the job's workdir.
const workdirOf = (jobId: string) => REPO ?? jobs.jobs.find((j) => j.id === jobId)?.workdir ?? jobs.jobs[0]?.workdir;

async function ensureStarted(key: string, title: string | undefined): Promise<RunState | null> {
  const start = sessionStart(key); if (!start) return null;
  const st = (state[key] ??= { started: false, sent_msgs: 0, sent_turns: 0, finished: false });
  if (st.finished) return st;
  if (!st.started) {
    const job = jobs.jobs.find((j) => j.id === start.jobId);
    if (!(await post([cloudEvent('started', key, { title, job_name: job?.name ?? start.jobId }, start.startedAt.toISOString())]))) return null;
    st.started = true; save();
    console.log(`${key}: started`);
  }
  return st;
}
async function narrate(key: string, messages: any[], offset = 0): Promise<void> {
  // `messages` is the run's message list from index `offset` on: a snapshot (offset 0) or an appended tail
  // (offset = total − tail). We send turns for messages beyond what was sent, at the turn offset the platform
  // de-duplicates on, so a re-snapshot or a reconnect never double-narrates.
  const st = state[key]; if (!st || st.finished) return;
  const total = offset + messages.length;
  const fresh = total > st.sent_msgs ? messages.slice(Math.max(0, st.sent_msgs - offset)) : [];
  if (!fresh.length) return;
  const turns = toTurns(fresh);
  const start = sessionStart(key)!;
  st.item_id ??= detectItem(turns, roadmapIds(workdirOf(start.jobId)));
  const lastSay = [...turns].reverse().find((t) => t.role === 'assistant' && t.text); if (lastSay) st.last_text = lastSay.text;
  const batch: unknown[] = [];
  for (let i = 0; i < turns.length; i += 100) batch.push(cloudEvent('turns', key, { seq: st.sent_turns + i, turns: turns.slice(i, i + 100), item_id: st.item_id }));
  if (!(await post(batch))) return;
  st.sent_msgs = total; st.sent_turns += turns.length; save();
}
async function finishIfDone(h: Harness, key: string): Promise<void> {
  const st = state[key]; if (!st || !st.started || st.finished) return;
  const start = sessionStart(key)!;
  const exec = executionFor(start.jobId, start.startedAt);
  // Hermes's terminal statuses: completed | failed | unknown (the scheduler restarted before the run's owner
  // recorded an outcome; whether side effects ran is unknown). Only `completed` is done.
  if (!exec || !['completed', 'failed', 'unknown'].includes(exec.status)) return;
  const workdir = workdirOf(start.jobId);
  st.status = exec.status === 'completed' ? 'done' : 'failed';
  st.ended_at = exec.finished_at ? new Date(Date.parse(exec.finished_at)).toISOString() : undefined;
  st.commit_sha = commitInWindow(workdir, start.startedAt, exec.finished_at, st.item_id);
  const ok = await post([cloudEvent('finished', key, { status: st.status, report: st.last_text, item_id: st.item_id, commit_sha: st.commit_sha, ended_at: st.ended_at })]);
  if (!ok) return;
  st.finished = true; save();
  const sub = following.get(key);
  if (sub) { following.delete(key); await h.call('harness.v1.sessions.unfollow', { subscription: sub }).catch(() => {}); }
  console.log(`${key}: finished (${exec.status}), ${st.sent_turns} turns`);
}
// A run's commit lands on main after the run (branch → landing workflow → auto-merge on green checks):
// keep looking for a day and re-post the receipt with the commit once it is there.
async function backfillCommit(key: string): Promise<void> {
  const st = state[key]; if (!st || !st.finished || st.commit_sha || st.status !== 'done') return;
  const start = sessionStart(key)!;
  if (Date.now() - start.startedAt.getTime() > 24 * 3600_000) return;
  const sha = commitInWindow(workdirOf(start.jobId), start.startedAt, new Date(start.startedAt.getTime() + 24 * 3600_000).toISOString(), st.item_id);
  if (!sha) return;
  if (!(await post([cloudEvent('finished', key, { status: st.status, report: st.last_text, item_id: st.item_id, commit_sha: sha, ended_at: st.ended_at })]))) return;
  st.commit_sha = sha; save();
  console.log(`${key}: landed ${sha.slice(0, 7)}`);
}
async function adopt(h: Harness, descriptor: any): Promise<void> {
  const key: string = descriptor?.locator?.session_id ?? '';
  if (!sessionStart(key)) return;
  const st = await ensureStarted(key, descriptor.title); if (!st || st.finished) return;
  if (ONCE) {
    const loaded = await h.call('harness.v1.sessions.load', { locator: descriptor.locator });
    await narrate(key, loaded?.session?.messages ?? loaded?.messages ?? []);
    return;
  }
  if (following.has(key)) return;
  // Follow: supercode pushes the run's appended messages as they land in the store. A failed follow is logged
  // and retried on the run's next index update (it stays out of `following`).
  const res = await h.call('harness.v1.sessions.follow', { locator: descriptor.locator }).catch((e) => { console.error(`follow ${key}: ${(e as Error).message.slice(0, 120)}`); return null; });
  if (!res?.subscription) return;
  following.set(key, res.subscription);
  const snapshot = res.initial?.session?.messages ?? res.initial?.messages;
  if (Array.isArray(snapshot)) await narrate(key, snapshot);
}

const harness: Harness = new Harness((n) => {
  if (n.method === 'harness.v1.sessions.event') {
    const ev = n.params?.event; const key = [...following.entries()].find(([, sub]) => sub === n.params?.subscription)?.[0];
    if (!key || !ev) return;
    if (ev.type === 'messages_appended') void narrate(key, ev.messages ?? [], (ev.total_message_count ?? 0) - (ev.messages?.length ?? 0));
    else if (ev.type === 'session_snapshot') void narrate(key, ev.session?.messages ?? []);
  } else if (n.method === 'harness.v1.sessions.index_event') {
    if (n.params?.error) console.error(`index: ${n.params.error.message}`);
    for (const c of n.params?.changes ?? []) if ((c.kind === 'added' || c.kind === 'updated') && c.descriptor) void adopt(harness, c.descriptor);
  }
});

try {
  const query = { harnesses: ['hermes'], homes: { hermes: STORE } };
  if (ONCE) {
    // One pass over what exists: discover + load each run (backfill / a check), no subscriptions.
    const disc = await harness.call('harness.v1.sessions.discover', query);
    for (const s of disc.sessions ?? []) await adopt(harness, s);
    for (const key of Object.keys(state)) await finishIfDone(harness, key);
  } else {
    // New runs arrive as index events (supercode watches the store); the initial page covers what already
    // exists. Each run is then followed. Run outcomes come from Hermes's executions table, checked every 5s
    // for runs we have started narrating (supercode has no subscription for that table).
    const sub = await harness.call('harness.v1.sessions.index.subscribe', query);
    for (const s of sub.initial ?? []) await adopt(harness, s);
    let tick = 0;
    for (;;) {
      for (const key of Object.keys(state)) await finishIfDone(harness, key);
      if (tick++ % 12 === 0) for (const key of Object.keys(state)) await backfillCommit(key); // once a minute
      await Bun.sleep(5000);
    }
  }
} finally { harness.close(); }
