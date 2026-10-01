#!/usr/bin/env bun
// The owner's usage statement for an organization's install (RFC 0021 decision 10; docs/decisions/0017): a tool the
// owner runs on their side. The organization pays: every model call goes through its key (RFC 0021 decision 7), so the
// spend is read from the organization's calls, each booked to the session that made it. A session is coded to its card's
// primary project when that project's reporter published it (a project this install publishes for has its own account);
// every other call (the manager's tick, the account manager's digest, the auditor's round, the mail agents' own sessions)
// is the organization's overhead, shown as its own line. The statement is published as the organization's "Usage"
// (ADR 0012) through the owner's steer key.
//
//   bun .open-autonomy/usage.ts [--secrets <dir>] [--publish]
//
// Keys, in the install's custody: <secrets>/agent.env (the organization's account), <secrets>/projects/<owner>/<repo>/
// agent.env (each project's), <secrets>/steer.env (OPEN_AUTONOMY_STEER_KEY, the organization's steer key; --publish).
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const arg = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const secrets = resolve(arg('--secrets') ?? process.env.AGENT_SECRETS ?? resolve(homedir(), '.config', 'open-autonomy'));
const cfg = Bun.YAML.parse(readFileSync(resolve(import.meta.dir, 'config.yaml'), 'utf8')) as any;
const env = (file: string): Record<string, string> => existsSync(file)
  ? Object.fromEntries(readFileSync(file, 'utf8').split('\n').map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l.trim())).filter((m): m is RegExpExecArray => !!m).map((m) => [m[1], m[2]]))
  : {};
const org = env(resolve(secrets, 'agent.env'));
const base = (org.OPEN_AUTONOMY_BASE_URL ?? '').replace(/\/$/, '');
if (!base || !org.OPEN_AUTONOMY_KEY) { console.error(`usage: no key in ${resolve(secrets, 'agent.env')}`); process.exit(1); }

/** Every page of one of `account`'s lists (`sessions`, `calls`), read with its own key. */
async function list<T>(account: string, key: string, kind: 'sessions' | 'calls'): Promise<T[]> {
  const all: T[] = [];
  for (let before: string | undefined; ;) {
    const url = `${base}/accounts/${encodeURIComponent(account)}/${kind}?limit=200${before ? `&before=${encodeURIComponent(before)}` : ''}`;
    const res = await fetch(url, { headers: { authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`${account}: ${kind} → HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    const page = await res.json() as Record<string, unknown> & { next?: string };
    all.push(...(page[kind] as T[]));
    if (!page.next) return all;
    before = page.next;
  }
}
type Session = { key: string; item_id?: string; source?: string };
type Call = { session?: string; usd_cents: number };
const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
// A published session continues as `<id>~<n>` after its source was rewritten; its calls name the native id.
const nativeId = (key: string) => key.replace(/~\d+$/, '');

// Each project this install publishes for: the sessions its reporter published, read through its key in custody.
const coded = new Map<string, string>();
const projects: string[] = [];
for (const project of (cfg.organization?.projects ?? []) as Array<{ account: string }>) {
  const key = env(resolve(secrets, 'projects', ...project.account.split('/'), 'agent.env')).OPEN_AUTONOMY_KEY;
  if (!key) continue;
  projects.push(project.account);
  for (const s of await list<Session>(project.account, key, 'sessions')) coded.set(nativeId(s.key), project.account);
}
// The organization's calls, each coded by its session; the organization's own published sessions name the overhead's sources.
const calls = await list<Call>(cfg.account, org.OPEN_AUTONOMY_KEY, 'calls');
const sources = [...new Set((await list<Session>(cfg.account, org.OPEN_AUTONOMY_KEY, 'sessions')).filter((s) => !s.item_id).map((s) => s.source ?? 'session'))].sort();
const tally = (owner: string | undefined) => {
  const its = calls.filter((c) => (c.session ? coded.get(c.session) : undefined) === owner);
  return { cents: its.reduce((n, c) => n + (c.usd_cents ?? 0), 0), sessions: new Set(its.map((c) => c.session ?? '')).size };
};
const lines: Array<{ label: string; cents: number; sessions: number; what: string }> = [];
lines.push({ label: 'Org overhead', ...tally(undefined), what: `calls serving no card (${sources.join(', ') || 'none published'})` });
for (const account of projects) lines.push({ label: account, ...tally(account), what: 'its cards\' sessions' });

const day = new Date().toISOString().slice(0, 10);
const until = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
const statement = {
  id: 'usage', title: 'Usage', source: { name: 'the owner\'s usage statement' }, as_of: day,
  badges: lines.slice(0, 8).map((l) => ({ label: l.label.slice(0, 40), message: `${usd(l.cents)} in ${l.sessions} sessions`.slice(0, 60), tone: 'info' as const, until })),
  body_md: ['| Line | Usage | Sessions | What |', '|---|---|---|---|', ...lines.map((l) => `| ${l.label} | ${usd(l.cents)} | ${l.sessions} | ${l.what} |`)].join('\n'),
};
for (const l of lines) console.log(`${l.label.padEnd(36)} ${usd(l.cents).padStart(10)}  ${String(l.sessions).padStart(4)} sessions  ${l.what}`);
if (args.includes('--publish')) {
  const steer = env(resolve(secrets, 'steer.env')).OPEN_AUTONOMY_STEER_KEY;
  if (!steer) { console.error(`usage: no steer key in ${resolve(secrets, 'steer.env')}; not published`); process.exit(1); }
  const res = await fetch(`${base}/agent/statement`, { method: 'POST', headers: { authorization: `Bearer ${steer}`, 'content-type': 'application/json' }, body: JSON.stringify(statement) });
  console.log(`published the Usage statement on ${cfg.account}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
}
