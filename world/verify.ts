#!/usr/bin/env bun
// The audit after a run (bun world/run.ts verify): the books, then the GitHub twin. Never the agent's prose.
import { ACCOUNT, ENC, MODEL, api, need } from './lib.ts';

const pub = api(need('PLATFORM_URL'));
const gh = api(need('GITHUB_TWIN_URL'));
const fail = (m: string) => { throw new Error(`verify: ${m}`); };

const calls = await pub.get(`/v1/accounts/${ENC}/calls`);
if (calls.status !== 200) fail(`calls → ${calls.status}`);
if (!(calls.body.calls_total >= 3)) fail(`expected ≥3 metered calls, saw ${calls.body.calls_total}`);
if (!calls.body.calls.every((c: { model: string }) => c.model === MODEL)) fail('a metered call was not the agent\'s model');
const funding = await pub.get(`/v1/accounts/${ENC}`);
if (!(funding.body.consumed_usd_cents > 0 && funding.body.balance_usd_cents < 500)) fail(`the books did not move: ${JSON.stringify(funding.body).slice(0, 200)}`);

// The agent lands on its branch; main is GitHub's to merge (the landing workflow is not in the twin).
const branch = await gh.get(`/repos/${ACCOUNT}/commits/${encodeURIComponent('agent/world-item')}`); // a ref with a slash is one path segment
if (branch.status !== 200) fail(`agent/world-item is not on the twin (${branch.status})`);
if (branch.body.commit.author.name !== 'Open Autonomy agent') fail(`branch head author is ${branch.body.commit.author.name}`);
if (!String(branch.body.commit.message).includes('world-item')) fail(`branch head message does not name the item: ${branch.body.commit.message}`);
const file = await gh.get(`/repos/${ACCOUNT}/contents/ROADMAP.yml?ref=agent/world-item`);
if (file.status !== 200) fail(`ROADMAP.yml on the branch → ${file.status}`);
const yml = Buffer.from(file.body.content, 'base64').toString('utf8');
if (!/id: world-item\n    phase: 1\n    priority: high\n    status: done/.test(yml)) fail('world-item is not done on the agent\'s branch');
const main = await gh.get(`/repos/${ACCOUNT}/contents/ROADMAP.yml?ref=main`);
if (!/status: planned/.test(Buffer.from(main.body.content, 'base64').toString('utf8'))) fail('main changed: the agent must land through its branch, never main');

// The clamp handler must be armed but silent: a run that tripped it never gets here, so a run that gets
// here with the handler having matched means the platform forwarded a cap it should not have.
// The project page's health line: after a run, the page must name the outcome of the account's most
// recent finished run, rendered from its job receipts (world-health-badge).
const page = await pub.get(`/p/${ENC}`);
if (page.status !== 200) fail(`project page -> ${page.status}`);
if (!/last run .*: done|last run .*: failed/.test(page.text)) fail(`project page has no health line naming the last run: ${page.text.slice(0, 200)}`);
if (!page.text.includes('receipt')) fail(`project page health line is not backed by a job receipt`);

const scenario = await api(need('OPENAI_TWIN_URL')).get('/twin/scenario');
const clamp = (scenario.body?.handlers ?? []).find((h: { id?: string }) => h.id === 'clamped-output-cap');
if (!clamp) fail('the clamped-output-cap handler is not loaded — the world cannot see a clamping proxy');
if (clamp.matches > 0) fail(`the platform clamped the agent's output cap: ${clamp.matches} request(s) came in under the ceiling`);

console.log(`verify: OK — ${calls.body.calls_total} metered calls (all ${MODEL}), ${funding.body.consumed_usd_cents.toFixed(4)} cents consumed; agent/world-item at ${branch.body.sha.slice(0, 7)} by ${branch.body.commit.author.name}; main untouched`);
