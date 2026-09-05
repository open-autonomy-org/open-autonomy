#!/usr/bin/env bun
// The audit after any number of runs (bun world/run.ts verify): the books, the GitHub twin, the project's
// own check at main, the page, the stream. Never the agent's prose.
import { existsSync } from 'node:fs';
import { ACCOUNT, ENC, HOME_CHANNEL, MODEL, WORK, api, git, need } from './lib.ts';

const pub = api(need('PLATFORM_URL'));
const gh = api(need('GITHUB_TWIN_URL'));
const fail = (m: string) => { throw new Error(`verify: ${m}`); };

// The books: every metered call is the agent's model on the model rail, and money moved.
const calls = await pub.get(`/v1/accounts/${ENC}/calls`);
if (calls.status !== 200) fail(`calls → ${calls.status}`);
if (!(calls.body.calls_total >= 3)) fail(`expected ≥3 metered calls, saw ${calls.body.calls_total}`);
// Every model-rail record is the agent's model; the other rails (a card, a partner) name themselves.
if (!calls.body.calls.every((c: { model?: string; rail: string }) => (c.rail === 'model' ? c.model === MODEL : c.rail === 'card' || c.rail === 'partner'))) fail("a metered call was not the agent's model on the model rail, nor a card or partner record");
if (!calls.body.calls.some((c: { rail: string }) => c.rail === 'model')) fail('no model-rail call on the trail');
const funding = await pub.get(`/v1/accounts/${ENC}`);
if (!(funding.body.consumed_usd_cents > 0 && funding.body.balance_usd_cents < funding.body.granted_in_usd_cents)) fail(`the books did not move: ${JSON.stringify(funding.body).slice(0, 200)}`);

// The twin's main: the landed roadmap. Every done item has a commit by the agent naming it, and the
// project's own check passes at main.
const main = await gh.get(`/repos/${ACCOUNT}/contents/ROADMAP.yml?ref=main`);
if (main.status !== 200) fail(`ROADMAP.yml on main → ${main.status}`);
const yml = Buffer.from(main.body.content, 'base64').toString('utf8');
const done = [...yml.matchAll(/- id: ([a-z0-9-]+)\n(?:(?!- id:)[\s\S])*?status: done/g)].map((m) => m[1]);
if (!done.length) fail('no roadmap item is done on main — nothing landed');
if (!existsSync(WORK)) fail(`${WORK} is missing — run seed first`);
await git(WORK, 'fetch', '-q', 'origin');
const history = (await git(WORK, 'log', '--format=%an%x09%s', 'origin/main')).split('\n').map((l) => { const [author, ...subject] = l.split('\t'); return { author, subject: subject.join('\t') }; });
for (const item of done) if (!history.some((c) => c.author === 'Open Autonomy agent' && c.subject.includes(item))) fail(`item ${item} is done on main but no commit by the agent names it`);
const protection = await gh.get(`/repos/${ACCOUNT}/branches/main/protection`);
if (protection.status !== 200 || !(protection.body?.required_status_checks?.contexts ?? []).includes('ci')) fail('main on the twin does not require the ci check');
const pulls = (await gh.get(`/repos/${ACCOUNT}/pulls?state=all&per_page=100`)).body as Array<{ number: number; merged: boolean; head: { ref: string } }>;
for (const item of done) if (!pulls.some((p) => p.merged && p.head.ref === `agent/${item}`)) fail(`item ${item} is done on main but no merged pull request from agent/${item} exists`);
await git(WORK, 'checkout', '-q', 'main'); await git(WORK, 'reset', '-q', '--hard', 'origin/main');
const check = Bun.spawnSync({ cmd: ['bun', 'run', 'check'], cwd: WORK, stdout: 'pipe', stderr: 'pipe' });
if (check.exitCode !== 0) fail(`the project's own check fails at main:\n${check.stderr.toString().slice(-600)}`);
const kit = Bun.spawnSync({ cmd: ['bun', new URL('../packages/kit-hermes/src/cli.ts', import.meta.url).pathname, 'check', WORK], stdout: 'pipe', stderr: 'pipe' });
if (kit.exitCode !== 0) fail(`the kit's files drifted on main:\n${kit.stderr.toString().slice(-600)}`);

// The stream: a session per run, kind run, ended with a verdict, filed under the item it landed, with its
// settled cents; the item view carries it; the page shows it live-or-ended with the health line.
const stream = (await pub.get(`/v1/accounts/${ENC}/sessions`)).body;
const runs = ((stream?.sessions ?? []) as Array<{ key: string; kind: string; status: string; outcome?: string; item_id?: string; usd_cents: number; turn_count: number; report?: string }>).filter((s) => s.kind === 'run');
if (!runs.length) fail('the account has no run sessions — the reporter published nothing');
const landed = runs.filter((s) => s.status === 'ended' && s.outcome === 'done');
if (!landed.length) fail(`no run session ended done: ${JSON.stringify(runs.map((r) => [r.key, r.status, r.outcome])).slice(0, 300)}`);
for (const item of done) {
  const view = (await pub.get(`/v1/accounts/${ENC}/items/${item}`)).body;
  if (!view?.sessions?.length) fail(`item ${item} landed but its item view carries no session`);
  if (!(view.usd_cents > 0)) fail(`item ${item}'s sessions settled no cents`);
  if (!view.sessions.every((s: { turn_count: number }) => s.turn_count > 0)) fail(`a session on ${item} has no turns`);
}
const page = await pub.get(`/p/${ENC}`);
if (page.status !== 200) fail(`project page → ${page.status}`);
if (!/last run .*: done|last run .*: failed/.test(page.text)) fail('project page has no health line naming the last run');
if (!page.text.includes(encodeURIComponent(landed[0]!.key))) fail("the page does not link the landed run's session");
const itemPage = await pub.get(`/p/${ENC}/items/${done[done.length - 1]}`);
if (itemPage.status !== 200 || !itemPage.text.includes('/sessions/')) fail('the item page does not render the sessions that touched it');
const scenario = await api(need('GATEWAY_TWIN_URL')).get('/twin/scenario');
const clamp = (scenario.body?.handlers ?? []).find((h: { id?: string }) => h.id === 'clamped-output-cap');
if (!clamp) fail('the clamped-output-cap handler is not loaded — the world cannot see a clamping proxy');
if (clamp.matches > 0) fail(`the platform clamped the agent's output cap: ${clamp.matches} request(s) came in under the ceiling`);

// Delivery: the run's report, posted by the bot to its home channel on the Discord twin, through reflect.
const posted = (await api(need('DISCORD_TWIN_URL')).get(`/api/v10/channels/${HOME_CHANNEL}/messages?limit=50`)).body as Array<{ content: string }> | null;
const reports = runs.map((r) => r.report ?? '').filter(Boolean);
const delivered = reports.filter((report) => (posted ?? []).some((m) => m.content.includes(report.slice(0, 60))));
if (!delivered.length) fail(`no run report reached the Discord twin: ${(posted ?? []).length} message(s) in the home channel, none carrying a session's report`);

// The seal: from the agent's own container, a public host is refused, the platform is not.
const context = process.env.WORLD_DOCKER_CONTEXT ?? 'colima-open-autonomy-world';
const probe = (url: string) => Bun.spawnSync({ cmd: ['docker', '--context', context, 'exec', 'oa-agent', 'curl', '-s', '-o', '/dev/null', '-m', '8', '-w', '%{http_code}', url], stdout: 'pipe', stderr: 'pipe' }).stdout.toString().trim();
if (probe('https://openrouter.ai/api/v1/models') !== '000') fail("the agent's container reaches the public internet — the world is not sealed");
if (probe('http://host.docker.internal:47613/healthz') !== '200') fail("the agent's container cannot reach the platform");

console.log(`verify: OK — ${ACCOUNT}: ${calls.body.calls_total} metered spends (every model call ${MODEL}), ${funding.body.consumed_usd_cents.toFixed(4)} cents; done on main: ${done.join(', ')}; ${pulls.filter((p) => p.merged).length} pull request(s) merged; ${runs.length} run session(s), ${landed.length} done; kit files current at main; check green at main; ${delivered.length} report(s) delivered to Discord; egress sealed`);
