#!/usr/bin/env bun
// The audit after any number of runs (bun world/run.ts verify): the books, the GitHub twin, the project's own
// check at main, the page. Never the agent's prose.
import { existsSync } from 'node:fs';
import { ACCOUNT, ENC, MODEL, WORK, api, git, need } from './lib.ts';

const pub = api(need('PLATFORM_URL'));
const gh = api(need('GITHUB_TWIN_URL'));
const fail = (m: string) => { throw new Error(`verify: ${m}`); };

// The books: every metered call is the agent's model, and money moved.
const calls = await pub.get(`/v1/accounts/${ENC}/calls`);
if (calls.status !== 200) fail(`calls → ${calls.status}`);
if (!(calls.body.calls_total >= 3)) fail(`expected ≥3 metered calls, saw ${calls.body.calls_total}`);
if (!calls.body.calls.every((c: { model: string }) => c.model === MODEL)) fail("a metered call was not the agent's model");
const funding = await pub.get(`/v1/accounts/${ENC}`);
if (!(funding.body.consumed_usd_cents > 0 && funding.body.balance_usd_cents < 500)) fail(`the books did not move: ${JSON.stringify(funding.body).slice(0, 200)}`);

// The twin's main: the landed roadmap. Every done item has a commit by the agent naming it, and the
// project's own check passes at main.
const main = await gh.get(`/repos/${ACCOUNT}/contents/ROADMAP.yml?ref=main`);
if (main.status !== 200) fail(`ROADMAP.yml on main → ${main.status}`);
const yml = Buffer.from(main.body.content, 'base64').toString('utf8');
const done = [...yml.matchAll(/- id: ([a-z0-9-]+)\n(?:(?!- id:)[\s\S])*?status: done/g)].map((m) => m[1]);
if (!done.length) fail('no roadmap item is done on main — nothing landed');
// The twin's main, read over its git wire (the source the REST plane projects from).
if (!existsSync(WORK)) fail(`${WORK} is missing — run seed first`);
await git(WORK, 'fetch', '-q', 'origin');
const history = (await git(WORK, 'log', '--format=%an%x09%s', 'origin/main')).split('\n').map((l) => { const [author, ...subject] = l.split('\t'); return { author, subject: subject.join('\t') }; });
for (const item of done) {
  if (!history.some((c) => c.author === 'Open Autonomy agent' && c.subject.includes(item))) fail(`item ${item} is done on main but no commit by the agent names it`);
}
// Landed the way the convention lands: a merged pull request per item, on a main that requires the check.
const protection = await gh.get(`/repos/${ACCOUNT}/branches/main/protection`);
if (protection.status !== 200 || !(protection.body?.required_status_checks?.contexts ?? []).includes('ci')) fail('main on the twin does not require the ci check');
const pulls = (await gh.get(`/repos/${ACCOUNT}/pulls?state=all&per_page=100`)).body as Array<{ number: number; merged: boolean; head: { ref: string } }>;
for (const item of done) {
  if (!pulls.some((p) => p.merged && p.head.ref === `agent/${item}`)) fail(`item ${item} is done on main but no merged pull request from agent/${item} exists`);
}
const stray = await gh.get(`/repos/${ACCOUNT}/branches`);
// A branch whose pull request merged is landed; its deletion is the repository setting's next tick.
const unlanded = (stray.body as Array<{ name: string }>).map((b) => b.name).filter((n) => n.startsWith('agent/') && !pulls.some((p) => p.merged && p.head.ref === n));
await git(WORK, 'checkout', '-q', 'main'); await git(WORK, 'reset', '-q', '--hard', 'origin/main');
const check = Bun.spawnSync({ cmd: ['bun', 'run', 'check'], cwd: WORK, stdout: 'pipe', stderr: 'pipe' });
if (check.exitCode !== 0) fail(`the project's own check fails at main:\n${check.stderr.toString().slice(-600)}`);

// The page: a receipt per run, the health line naming the last one, the clamp handler armed but silent.
const page = await pub.get(`/p/${ENC}`);
if (page.status !== 200) fail(`project page → ${page.status}`);
if (!/last run .*: done|last run .*: failed/.test(page.text)) fail('project page has no health line naming the last run');
const jobs = await pub.get(`/v1/accounts/${ENC}/jobs`);
const receipts = (jobs.body?.jobs ?? []) as Array<{ key: string; status: string }>;
if (!receipts.length) fail('the account has no job receipts — the runs were never narrated');
if (!page.text.includes(encodeURIComponent(receipts[0]!.key))) fail("the page's health line does not link the latest receipt");
const scenario = await api(need('GATEWAY_TWIN_URL')).get('/twin/scenario');
const clamp = (scenario.body?.handlers ?? []).find((h: { id?: string }) => h.id === 'clamped-output-cap');
if (!clamp) fail('the clamped-output-cap handler is not loaded — the world cannot see a clamping proxy');
if (clamp.matches > 0) fail(`the platform clamped the agent's output cap: ${clamp.matches} request(s) came in under the ceiling`);

// The seal: from the agent's own container, a public host is refused, the platform is not.
const context = process.env.WORLD_DOCKER_CONTEXT ?? 'colima-open-autonomy-world';
const probe = (url: string) => Bun.spawnSync({ cmd: ['docker', '--context', context, 'exec', 'oa-agent', 'curl', '-s', '-o', '/dev/null', '-m', '8', '-w', '%{http_code}', url], stdout: 'pipe', stderr: 'pipe' }).stdout.toString().trim();
if (probe('https://openrouter.ai/api/v1/models') !== '000') fail("the agent's container reaches the public internet — the world is not sealed");
if (probe('http://host.docker.internal:47613/healthz') !== '200') fail("the agent's container cannot reach the platform");

console.log(`verify: OK — ${ACCOUNT}: ${calls.body.calls_total} metered calls (all ${MODEL}), ${funding.body.consumed_usd_cents.toFixed(4)} cents; done on main: ${done.join(', ')}; ${pulls.filter((p) => p.merged).length} pull request(s) merged; ${receipts.length} receipt(s)${unlanded.length ? `; not landed: ${unlanded.join(', ')}` : ''}; check green at main; egress sealed`);
