#!/usr/bin/env bun
// The platform's proof, without an agent: the operator exercises the platform's own doors against the
// world (bun world/run.ts probe, after seed). Each line is an acceptance line of the platform read back
// through a public route: the books move on a metered call, the key survives a redeploy, a session posted
// on the key lands on the page, an item view carries what touched it, egress to the docs goes to the twin.
import { ACCOUNT, ENC, MODEL, agentEnv, api, need } from './lib.ts';

const platform = need('PLATFORM_URL');
const pub = api(platform);
const admin = api(platform, { 'x-admin-token': process.env.AGENT_PROXY_ADMIN_TOKEN ?? 'world-admin' });
const key = agentEnv().OPEN_AUTONOMY_KEY;
const bearer = api(platform, { authorization: `Bearer ${key}` });
const fail = (m: string) => { throw new Error(`probe: ${m}`); };
const ok: string[] = [];

// 1. The books before: funded, nothing spent.
const before = (await pub.get(`/v1/accounts/${ENC}`)).body;
if (!before?.funded || before.consumed_usd_cents !== 0) fail(`the seed did not fund a clean account: ${JSON.stringify(before).slice(0, 200)}`);

// 2. A session opens on the key, then a model call through the platform to the gateway twin is metered
//    and attributed to it.
const ce = (type: string, subject: string, data: unknown) => ({ specversion: '1.0', id: crypto.randomUUID(), source: 'world/probe', type: `org.open-autonomy.${type}`, subject, time: new Date().toISOString(), data });
const started = await bearer.post('/v1/agent/events', ce('session.started', 'probe-1', { session_kind: 'run', source: 'probe', item_id: 'add' }));
if (started.status !== 200) fail(`session.started → ${started.status} ${started.text.slice(0, 200)}`);
const call = await bearer.post('/v1/chat/completions', { model: MODEL, messages: [{ role: 'user', content: 'probe: say ok' }], max_tokens: 20000 });
if (call.status !== 200) fail(`model call → ${call.status} ${call.text.slice(0, 200)}`);
if (!call.headers.get('x-open-autonomy-balance-usd-cents')) fail('the model call carries no balance header');
const after = (await pub.get(`/v1/accounts/${ENC}`)).body;
if (!(after.consumed_usd_cents > 0) || !(after.balance_usd_cents < before.balance_usd_cents)) fail(`the books did not move: ${JSON.stringify(after).slice(0, 200)}`);
const calls = (await pub.get(`/v1/accounts/${ENC}/calls`)).body;
if (calls.calls_total !== 1 || calls.calls[0].model !== MODEL || calls.calls[0].session !== 'probe-1' || calls.calls[0].rail !== 'model') fail(`the audit trail is wrong: ${JSON.stringify(calls).slice(0, 300)}`);
ok.push(`metered ${after.consumed_usd_cents} cents on the model rail, attributed to the live session`);

// 3. Turns, an update, the end; the session and the item read back; the pages render them.
const turns = await bearer.post('/v1/agent/events', [
  ce('session.turns', 'probe-1', { seq: 0, turns: [{ role: 'assistant', tool: 'terminal', args: '{"command":"bun run check"}' }, { role: 'tool', tool: 'terminal', result: 'ok' }, { role: 'assistant', text: 'The check passes.' }] }),
  ce('item.update', 'add', { text: 'probe: halfway through add', session: 'probe-1' }),
  ce('session.ended', 'probe-1', { outcome: 'done', report: 'probe: done', commit_sha: 'abcdef1' }),
]);
if (turns.status !== 200) fail(`turns/update/ended → ${turns.status} ${turns.text.slice(0, 200)}`);
const session = (await pub.get(`/v1/accounts/${ENC}/sessions/probe-1`)).body?.session;
if (session?.status !== 'ended' || session.outcome !== 'done' || session.turn_count !== 3 || session.item_id !== 'add' || !(session.usd_cents > 0)) fail(`the session read back wrong: ${JSON.stringify(session).slice(0, 300)}`);
const item = (await pub.get(`/v1/accounts/${ENC}/items/add`)).body;
if (item.sessions?.[0]?.key !== 'probe-1' || item.updates?.length !== 1 || !(item.usd_cents > 0)) fail(`the item view is wrong: ${JSON.stringify(item).slice(0, 300)}`);
for (const path of [`/p/${ENC}`, `/p/${ENC}/sessions/probe-1`, `/p/${ENC}/items/add`]) {
  const page = await pub.get(path);
  if (page.status !== 200) fail(`${path} → ${page.status}`);
  if (!page.text.includes('probe')) fail(`${path} does not show the probe's session`);
}
const page = (await pub.get(`/p/${ENC}`)).text;
if (!page.includes('todo add appends an item')) fail('the project page does not render the roadmap synced from the twin');
if (!/last run .*: done/.test(page)) fail('the project page has no health line naming the last run');
ok.push('the session, the update and the item read back and render on the page');

// 4. The key survives the platform restarting with its books (a redeploy): the same key still spends.
//    The world's supervisor restarts wrangler dev on exit; here the equivalent is a second call after the
//    Durable Object has been evicted, which the pages above already forced. A second call must still meter.
const again = await bearer.post('/v1/chat/completions', { model: MODEL, messages: [{ role: 'user', content: 'probe: again' }], max_tokens: 20000 });
if (again.status !== 200) fail(`second model call → ${again.status}`);
if ((await pub.get(`/v1/accounts/${ENC}`)).body.calls_total !== 2) fail('the second call was not metered');
ok.push('the key spent again after the books were re-read');

// 5. A forged key, a wrong model and an unfunded account are refused; the widgets serve.
const forged = api(platform, { authorization: `Bearer ${key.split('.')[0]}.AAAA` });
if ((await forged.post('/v1/chat/completions', { model: MODEL, messages: [] })).status !== 401) fail('a forged key was accepted');
if ((await bearer.post('/v1/chat/completions', { model: 'gpt-4o', messages: [] })).status !== 403) fail('a model outside the key was accepted');
for (const w of ['runway', 'roadmap', 'activity', 'now']) if ((await pub.get(`/v1/accounts/${ENC}/${w}.svg`)).status !== 200) fail(`${w}.svg did not serve`);
if ((await admin.get('/admin/status')).status !== 200) fail('admin status did not serve');
ok.push('refusals and widgets as specified');

// 6. The roadmap drivers against the twin. The cookbook's roadmap came through the file driver on sync; a
//    second project whose config names github-milestones is created on the twin with two milestones, and
//    the platform pulls them, credential-free, into a revision with the driver's conformance.
const road = (await pub.get(`/v1/accounts/${ENC}/roadmap`)).body;
if (road?.revision?.source !== 'file' || !road.revision.roadmap.items.length) fail(`the cookbook's roadmap did not come through the file driver: ${JSON.stringify(road).slice(0, 200)}`);
const gh = api(need('GITHUB_TWIN_URL'));
const created = await gh.post('/orgs/cookbook/repos', { name: 'milestones-demo' });
if (![201, 422].includes(created.status)) fail(`github twin: create milestones-demo → ${created.status}`);
const put = async (path: string, content: string) => gh.put(`/repos/cookbook/milestones-demo/contents/${path}`, { message: `add ${path}`, content: Buffer.from(content).toString('base64') });
if ((await put('.open-autonomy/config.yaml', 'account: cookbook/milestones-demo\nroadmap:\n  source: github-milestones\n')).status >= 300) fail('github twin: cannot write the demo config');
await put('README.md', '# milestones-demo\n');
for (const m of [{ title: 'Add & list', description: '- add appends\n- list prints', due_on: '2026-10-01T00:00:00Z', state: 'closed' }, { title: 'Search', description: 'Find things.', due_on: '2026-11-01T00:00:00Z' }]) {
  const r = await gh.post('/repos/cookbook/milestones-demo/milestones', { title: m.title, description: m.description, due_on: m.due_on });
  if (r.status !== 201) fail(`github twin: create milestone → ${r.status} ${r.text.slice(0, 120)}`);
  if (m.state === 'closed' && (await gh.patch(`/repos/cookbook/milestones-demo/milestones/${r.body.number}`, { state: 'closed' })).status !== 200) fail('github twin: cannot close a milestone');
}
const demoEnc = encodeURIComponent('cookbook/milestones-demo');
if ((await admin.post(`/admin/accounts/${demoEnc}/mint`, { amount_usd_cents: 1, key: 'probe-demo' })).status !== 200) fail('cannot materialize the demo account');
const synced = await admin.post(`/admin/accounts/${demoEnc}/sync`);
if (synced.body?.ok !== true) fail(`the demo project did not sync: ${synced.text.slice(0, 200)}`);
const demo = (await pub.get(`/v1/accounts/${demoEnc}/roadmap`)).body?.revision;
if (demo?.source !== 'github-milestones') fail(`the milestones driver did not pull: ${JSON.stringify(demo).slice(0, 200)}`);
const ids = demo.roadmap.items.map((i: { id: string; status: string }) => `${i.id}:${i.status}`);
if (!(ids.includes('add-list:done') && ids.includes('search:planned'))) fail(`the milestones mapped wrong: ${ids.join(' ')}`);
if (!demo.conformance.length) fail('the milestones driver declared no conformance');
const demoPage = await pub.get(`/p/${demoEnc}`);
if (demoPage.status !== 200 || !demoPage.text.includes('Roadmap from <b>github-milestones</b>')) fail('the demo page does not render the milestones roadmap');
ok.push('the file driver and the milestones driver both landed revisions from the twin');

// Leave the books as the seed left them for what follows: the probe's session is dropped.
await admin.del(`/admin/accounts/${ENC}/sessions/probe-1`);
console.log(`probe: OK — ${ACCOUNT}\n  ${ok.join('\n  ')}`);
