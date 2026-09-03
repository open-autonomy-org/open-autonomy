#!/usr/bin/env bun
// The agent-side reporter: narrates the agent's cron runs to the platform so the site can show what the agent
// is doing, did, and (from the schedule) will do. It never touches Hermes; it reads the HERMES home through
// supercode's harness protocol (the normalized session shape, so any harness supercode reads would work) and
// Hermes's own executions table for run outcomes, and pushes `started → turns → finished` events on the
// project's standing key. The platform's meter stays the independent check on every number.
//
//   bun platform/scripts/agent-reporter.ts [--home hermes] [--supercode /path/to/supercode] [--interval 5] [--once]
//   bun platform/scripts/agent-reporter.ts --install      # a launchd agent that runs the loop beside the gateway
//
// State (which turns were already sent) lives in <home>/reporter-state.json, git-ignored.
import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const arg = (name: string, dflt?: string): string | undefined => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : dflt; };
const HOME = resolve(arg('--home', 'hermes') as string);
const SUPERCODE = arg('--supercode', process.env.SUPERCODE_BIN ?? 'supercode') as string;
const INTERVAL_MS = Number(arg('--interval', '5')) * 1000;
const ONCE = process.argv.includes('--once');
const STATE_PATH = join(HOME, 'reporter-state.json');

function readEnvFile(): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(join(HOME, '.env'))) return out;
  for (const line of readFileSync(join(HOME, '.env'), 'utf8').split('\n')) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim()); if (m) out[m[1]] = m[2];
  }
  return out;
}
const env = readEnvFile();
const BASE = (env.OPEN_AUTONOMY_BASE_URL ?? '').replace(/\/v1\/?$/, '');
const KEY = env.OPEN_AUTONOMY_KEY;

if (process.argv.includes('--install')) {
  const plist = join(homedir(), 'Library', 'LaunchAgents', 'org.open-autonomy.reporter.plist');
  const bun = Bun.which('bun') ?? '/usr/local/bin/bun';
  const script = resolve(import.meta.path);
  mkdirSync(join(homedir(), 'Library', 'LaunchAgents'), { recursive: true });
  writeFileSync(plist, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>org.open-autonomy.reporter</string>
  <key>ProgramArguments</key><array><string>${bun}</string><string>${script}</string><string>--home</string><string>${HOME}</string><string>--supercode</string><string>${resolve(Bun.which(SUPERCODE) ?? SUPERCODE)}</string></array>
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
if (!BASE || !KEY) { console.error(`no OPEN_AUTONOMY_BASE_URL / OPEN_AUTONOMY_KEY in ${join(HOME, '.env')}`); process.exit(2); }

// ---- supercode harness.v1 over stdio ----------------------------------------------------------------
class Harness {
  private proc = Bun.spawn({ cmd: [SUPERCODE, 'harness', 'serve'], stdin: 'pipe', stdout: 'pipe', stderr: 'ignore' });
  private next = 1;
  private pending = new Map<number, (v: any) => void>();
  constructor() {
    (async () => {
      const reader = this.proc.stdout.getReader(); const dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
          if (!line) continue;
          try { const msg = JSON.parse(line); const cb = this.pending.get(msg.id); if (cb) { this.pending.delete(msg.id); cb(msg); } } catch { /* not ours */ }
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

// ---- Hermes-side facts: which job a session belongs to, and how its execution ended --------------------
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
function commitSince(workdir: string | undefined, since: Date, until?: string | null, itemId?: string): string | undefined {
  if (!workdir || !existsSync(workdir)) return undefined;
  const window = [`--since=${since.toISOString()}`, ...(until ? [`--until=${new Date(Date.parse(until) + 60_000).toISOString()}`] : [])];
  const r = Bun.spawnSync({ cmd: ['git', '-C', workdir, 'log', '-1', '--format=%H', '--author=Open Autonomy agent', ...window], stdout: 'pipe', stderr: 'ignore' });
  const sha = r.stdout.toString().trim();
  if (/^[0-9a-f]{40}$/.test(sha)) return sha;
  // A run that committed under another identity (before the agent had its own): the commit in the run's window
  // whose message names the item it worked.
  if (!itemId) return undefined;
  const r2 = Bun.spawnSync({ cmd: ['git', '-C', workdir, 'log', '-1', '--format=%H', `--grep=${itemId}`, ...window], stdout: 'pipe', stderr: 'ignore' });
  const sha2 = r2.stdout.toString().trim();
  return /^[0-9a-f]{40}$/.test(sha2) ? sha2 : undefined;
}
function roadmapIds(workdir: string | undefined): string[] {
  const p = workdir ? join(workdir, 'ROADMAP.yml') : ''; if (!p || !existsSync(p)) return [];
  return [...readFileSync(p, 'utf8').matchAll(/^\s+- id:\s*(\S+)/gm)].map((m) => m[1]);
}

// ---- supercode's normalized messages → the platform's turns ---------------------------------------------
type Turn = { ts?: string; role: 'user' | 'assistant' | 'tool' | 'system'; text?: string; tool?: string; args?: string; result?: string };
function toTurns(messages: any[], from: number): Turn[] {
  const out: Turn[] = [];
  const ts = new Date().toISOString();
  for (const m of messages.slice(from)) {
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

// ---- the loop ----------------------------------------------------------------------------------------------
type State = Record<string, { started: boolean; sent: number; finished: boolean; item_id?: string }>;
const state: State = existsSync(STATE_PATH) ? JSON.parse(readFileSync(STATE_PATH, 'utf8')) : {};
const save = () => writeFileSync(STATE_PATH, JSON.stringify(state, null, 1));
async function post(event: unknown): Promise<boolean> {
  const res = await fetch(`${BASE}/v1/agent/events`, { method: 'POST', headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }, body: JSON.stringify(event) });
  if (!res.ok) console.error(`event ${JSON.stringify(event).slice(0, 80)} → ${res.status} ${await res.text()}`);
  return res.ok;
}
async function tick(h: Harness): Promise<void> {
  const disc = await h.call('harness.v1.sessions.discover', { harnesses: ['hermes'], homes: { hermes: join(HOME, 'state.db') } });
  const jobs = jobsFile();
  for (const s of disc.sessions ?? []) {
    const key: string = s.locator?.session_id ?? ''; const start = sessionStart(key);
    if (!start) continue;
    const st = (state[key] ??= { started: false, sent: 0, finished: false });
    if (st.finished) continue;
    const job = jobs.jobs.find((j) => j.id === start.jobId);
    const workdir = job?.workdir ?? jobs.jobs[0]?.workdir;
    if (!st.started) {
      if (!(await post({ kind: 'started', key, title: s.title, job_name: job?.name ?? start.jobId, started_at: start.startedAt.toISOString() }))) continue;
      st.started = true; save();
    }
    const loaded = await h.call('harness.v1.sessions.load', { locator: s.locator });
    const messages: any[] = loaded?.session?.messages ?? loaded?.messages ?? [];
    if (messages.length > st.sent) {
      const turns = toTurns(messages, st.sent);
      st.item_id ??= detectItem(turns, roadmapIds(workdir));
      for (let i = 0; i < turns.length; i += 100) {
        if (!(await post({ kind: 'turns', key, turns: turns.slice(i, i + 100), item_id: st.item_id }))) return;
      }
      st.sent = messages.length; save();
    }
    const exec = executionFor(start.jobId, start.startedAt);
    if (exec && (exec.status === 'completed' || exec.status === 'failed')) {
      const lastText = [...messages].reverse().find((m) => m.role === 'assistant' && typeof m.content === 'string' && m.content.trim());
      const ok = await post({ kind: 'finished', key, status: exec.status === 'failed' ? 'failed' : 'done', report: lastText?.content, commit_sha: commitSince(workdir, start.startedAt, exec.finished_at, st.item_id), item_id: st.item_id });
      if (ok) { st.finished = true; save(); console.log(`${key}: finished (${exec.status}), ${st.sent} messages`); }
    }
  }
}
const h = new Harness();
try {
  for (;;) {
    try { await tick(h); } catch (e) { console.error(`tick: ${(e as Error).message}`); }
    if (ONCE) break;
    await Bun.sleep(INTERVAL_MS);
  }
} finally { h.close(); }
