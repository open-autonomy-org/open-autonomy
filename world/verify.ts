#!/usr/bin/env bun
// The audit after any number of runs (bun world/run.ts verify): the books, the GitHub twin, the project's
// own check at main, the page, the stream. Never the agent's prose.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ACCOUNT, COOKBOOK, ENC, HOME_CHANNEL, MODEL, PREVIOUS_MODEL, WORK, api, git, need } from './lib.ts';

const pub = api(need('PLATFORM_URL'));
const gh = api(need('GITHUB_TWIN_URL'));
const fail = (m: string) => { throw new Error(`verify: ${m}`); };

// The books: every metered call is the agent's model on the model rail, and money moved.
// The whole audit trail, paged: two fires and their reviews outrun one page.
const calls = { status: 200, body: { calls_total: 0, calls: [] as Array<Record<string, any>> } };
for (let before: string | undefined; ;) {
  const page = await pub.get(`/v1/accounts/${ENC}/calls?limit=200${before ? `&before=${encodeURIComponent(before)}` : ''}`);
  if (page.status !== 200) fail(`calls → ${page.status}`);
  calls.body.calls_total = page.body.calls_total; calls.body.calls.push(...page.body.calls);
  if (!page.body.next) break;
  before = page.body.next;
}
if (calls.status !== 200) fail(`calls → ${calls.status}`);
if (!(calls.body.calls_total >= 3)) fail(`expected ≥3 metered calls, saw ${calls.body.calls_total}`);
// Every model-rail record is the agent's model; the other rails (a card, a partner) name themselves.
if (!calls.body.calls.every((c: { model?: string; rail: string }) => (c.rail === 'model' ? c.model === MODEL || c.model === PREVIOUS_MODEL : c.rail === 'card' || c.rail === 'partner'))) fail("a metered call was not the agent's model on the model rail, nor a card or partner record");
// The schedule followed the owner's model change: the newest model call is on the config's model, and the
// fire before the change spent on the previous one (so the re-pin, not the pin alone, is what was proven).
const modelCalls = calls.body.calls.filter((c: { rail: string }) => c.rail === 'model') as Array<{ model?: string }>;
if (modelCalls.length && modelCalls[0].model !== MODEL) fail(`the newest model call is on ${modelCalls[0].model}, not the config's ${MODEL}: the schedule did not follow the model change`);
if (modelCalls.length && !modelCalls.some((c) => c.model === PREVIOUS_MODEL)) fail(`no model call spent on ${PREVIOUS_MODEL}: the fire before the model change did not happen`);
if (!calls.body.calls.some((c: { rail: string }) => c.rail === 'model')) fail('no model-rail call on the trail');
const funding = await pub.get(`/v1/accounts/${ENC}`);
if (!(funding.body.consumed_usd_cents > 0 && funding.body.balance_usd_cents < funding.body.granted_in_usd_cents)) fail(`the books did not move: ${JSON.stringify(funding.body).slice(0, 200)}`);

// The board is the roadmap: the page's latest revision came from it through the SDK, and every task it marks done
// has a commit by the agent naming the task id, a merged pull request from agent/<task id>, and the project's own
// check passes at main.
const latest = (await pub.get(`/v1/accounts/${ENC}/roadmap`)).body?.revision as { revision: number; source: string; roadmap: { items: Array<{ id: string; title: string; status: string }> } } | undefined;
if (!latest || latest.source !== 'kanban') fail(`the page's roadmap did not come from the board: ${JSON.stringify(latest?.source ?? null)}`);
const done = latest.roadmap.items.filter((i) => i.status === 'done').map((i) => i.id);
if (!done.length) fail('no task is done on the board — nothing landed');
const titled = (fragment: string) => latest.roadmap.items.find((i) => i.title.includes(fragment))?.id;
// The roadmap is the developer's tasks and nothing else: a purchase request the treasurer worked is not an item.
const seedCount = (JSON.parse(readFileSync(resolve(COOKBOOK, 'hermes', 'kanban.seed.json'), 'utf8')) as { tasks: unknown[] }).tasks.length;
if (latest.roadmap.items.length !== seedCount) fail(`the page's roadmap has ${latest.roadmap.items.length} items for ${seedCount} seed tasks: a task of another profile leaked onto it`);
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

// The board on the page: every landed item's view carries its task in the done lane with the review it went
// through, published by the reporter from the agent's own board through supercode's workflow layer.
for (const item of done) {
  const view = (await pub.get(`/v1/accounts/${ENC}/items/${encodeURIComponent(item)}`)).body;
  if (view?.task?.lane !== 'done') fail(`item ${item}'s board task is not done on its page: ${JSON.stringify(view?.task ?? null).slice(0, 200)}`);
  const verdicts = (view.task.reviews as Array<{ verdict: string }>).map((r) => r.verdict);
  if (!verdicts.includes('requested') || !verdicts.includes('approved')) fail(`item ${item} did not go through the review lane: ${verdicts.join(', ') || 'no reviews'}`);
  if (!(view.task.attempts as unknown[]).length) fail(`item ${item}'s task carries no attempts`);
}

// The rails from the agent's side: the domain item's purchase settled as a card record under a session on that item,
// with the merchant, and the item page shows it.
const domain = titled('domain name');
if (domain && done.includes(domain)) {
  const domainView = (await pub.get(`/v1/accounts/${ENC}/items/${encodeURIComponent(domain)}`)).body;
  const purchase = (domainView?.purchases ?? []).find((c: { rail: string; merchant?: string }) => c.rail === 'card' && c.merchant === 'Namecheap');
  if (!purchase) fail(`the domain item carries no card purchase at Namecheap: ${JSON.stringify(domainView?.purchases ?? []).slice(0, 300)}`);
  if (purchase.usd_cents !== 200 || purchase.category !== 'computer_software_stores') fail(`the domain purchase is not 200 cents at computer_software_stores: ${JSON.stringify(purchase)}`);
  const domainPage = await pub.get(`/p/${ENC}/items/${encodeURIComponent(domain)}`);
  if (domainPage.status !== 200 || !domainPage.text.includes('Namecheap')) fail('the domain item page does not show the purchase');
}

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
const itemPage = await pub.get(`/p/${ENC}/items/${encodeURIComponent(done[done.length - 1]!)}`);
if (itemPage.status !== 200 || !itemPage.text.includes('/sessions/')) fail('the item page does not render the sessions that touched it');
const scenario = await api(need('GATEWAY_TWIN_URL')).get('/twin/scenario');
const clamp = (scenario.body?.handlers ?? []).find((h: { id?: string }) => h.id === 'clamped-output-cap');
if (!clamp) fail('the clamped-output-cap handler is not loaded — the world cannot see a clamping proxy');
if (clamp.matches > 0) fail(`the platform clamped the agent's output cap: ${clamp.matches} request(s) came in under the ceiling`);

// Delivery: the run's report, posted by the bot to its home channel on the Discord twin, through reflect.
const posted = (await api(need('DISCORD_TWIN_URL')).get(`/api/v10/channels/${HOME_CHANNEL}/messages?limit=50`)).body as Array<{ content: string }> | null;
// The PM's hourly report is what the schedule delivers; the world advanced the clock once, so there is one.
const delivered = (posted ?? []).filter((m) => m.content.includes('PM:'));
if (!delivered.length) fail(`no PM report reached the Discord twin: ${(posted ?? []).length} message(s) in the home channel, none from the PM`);
const pm = runs.find((s) => (s as { source?: string }).source === 'pm' && s.status === 'ended');
if (!pm) fail(`no ended PM session on the page: ${JSON.stringify(runs.map((r) => [r.key, (r as { source?: string }).source, r.status])).slice(0, 300)}`);

// The seal: from the agent's own container, a public host is refused, the platform is not.
const context = process.env.WORLD_DOCKER_CONTEXT ?? 'colima-open-autonomy-world';
const probe = (url: string) => Bun.spawnSync({ cmd: ['docker', '--context', context, 'exec', 'oa-agent', 'curl', '-s', '-o', '/dev/null', '-m', '8', '-w', '%{http_code}', url], stdout: 'pipe', stderr: 'pipe' }).stdout.toString().trim();
if (probe('https://openrouter.ai/api/v1/models') !== '000') fail("the agent's container reaches the public internet — the world is not sealed");
if (probe('http://host.docker.internal:47613/healthz') !== '200') fail("the agent's container cannot reach the platform");

console.log(`verify: OK — ${ACCOUNT}: ${calls.body.calls_total} metered spends (the newest on ${MODEL}, the earlier fire on ${PREVIOUS_MODEL}), ${funding.body.consumed_usd_cents.toFixed(4)} cents; done on the board and main: ${done.map((id) => latest.roadmap.items.find((i) => i.id === id)?.title ?? id).join(', ')}; ${pulls.filter((p) => p.merged).length} pull request(s) merged; ${runs.length} run session(s), ${landed.length} done; kit files current at main; check green at main; ${delivered.length} PM report(s) delivered to Discord; egress sealed`);
