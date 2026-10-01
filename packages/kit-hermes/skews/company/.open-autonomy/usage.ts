#!/usr/bin/env bun
// The owner's usage statement for an organization's install (RFC 0021 decision 10; docs/decisions/0017): a tool the
// owner runs on their side. A session's usage is coded to its card's primary project, and each project this install
// publishes for has its own account; the sessions serving no card (the manager's tick, the account manager's digest,
// the auditor's round, the mail agents' own sessions) are the organization's overhead, shown as their own line. The
// lines are read from the platform, each account through its own key, and published as the organization's "Usage"
// statement (ADR 0012) through the owner's steer key.
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

type Session = { key: string; item_id?: string; source?: string; usd_cents: number; calls: number };
/** Every session of `account`, read with its own key. */
async function sessions(account: string, key: string): Promise<Session[]> {
  const all: Session[] = [];
  for (let before: string | undefined; ;) {
    const url = `${base}/accounts/${encodeURIComponent(account)}/sessions?limit=200${before ? `&before=${encodeURIComponent(before)}` : ''}`;
    const res = await fetch(url, { headers: { authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`${account}: sessions → HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    const page = await res.json() as { sessions: Session[]; next?: string };
    all.push(...page.sessions);
    if (!page.next) return all;
    before = page.next;
  }
}
const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const lines: Array<{ label: string; cents: number; sessions: number; what: string }> = [];
// The organization's own account: what serves a card is a project's; what serves none is overhead.
const own = await sessions(cfg.account, org.OPEN_AUTONOMY_KEY);
const overhead = own.filter((s) => !s.item_id);
const sources = [...new Set(overhead.map((s) => s.source ?? 'session'))].sort();
lines.push({ label: 'Org overhead', cents: overhead.reduce((n, s) => n + s.usd_cents, 0), sessions: overhead.length, what: `the organization's own sessions (${sources.join(', ') || 'none'})` });
// Each project this install publishes for: its key in custody, its sessions on its own account.
for (const project of (cfg.organization?.projects ?? []) as Array<{ account: string }>) {
  const key = env(resolve(secrets, 'projects', ...project.account.split('/'), 'agent.env')).OPEN_AUTONOMY_KEY;
  if (!key) continue;
  const its = await sessions(project.account, key);
  lines.push({ label: project.account, cents: its.reduce((n, s) => n + s.usd_cents, 0), sessions: its.length, what: 'its cards\' sessions' });
}

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
