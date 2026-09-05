#!/usr/bin/env bun
// The platform's proof, without an agent: the operator exercises the platform's own doors against the
// world (bun world/run.ts probe, after seed). Each line is an acceptance line of the platform read back
// through a public route: the books move on a metered call, the key survives a redeploy, a session posted
// on the key lands on the page, an item view carries what touched it, egress to the docs goes to the twin.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseRoadmap } from '../packages/sdk/src/roadmap.ts';
import { ACCOUNT, COOKBOOK, ENC, MODEL, agentEnv, api, need } from './lib.ts';

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
// The roadmap arrives through the key, the way a project's reporter narrates the file it works.
const pushed = await bearer.post('/v1/agent/roadmap', { source: 'file', roadmap: parseRoadmap(readFileSync(resolve(COOKBOOK, 'ROADMAP.yml'), 'utf8')) });
if (pushed.status !== 200) fail(`roadmap push through the key → ${pushed.status} ${pushed.text.slice(0, 200)}`);
const page = (await pub.get(`/p/${ENC}`)).text;
if (!page.includes('todo add appends an item')) fail('the project page does not render the roadmap published through the key');
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
if (road?.revision?.source !== 'file' || !road.revision.roadmap.items.length) fail(`the cookbook's roadmap did not arrive through the key: ${JSON.stringify(road).slice(0, 200)}`);
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

// 7. The rails beyond the model, against the Stripe twin. A card minted against the balance, bounded by the
//    cookbook's config; a merchant's authorization within the bound and category is approved in real time
//    through the platform's webhook, its capture settles on the books as a card rail record and retires the
//    card; a partner's charge settles as a partner rail record. Bounds refuse what the owner did not allow.
const stripeTwin = api(need('STRIPE_TWIN_URL'), { authorization: 'Bearer sk_test_world', 'content-type': 'application/x-www-form-urlencoded' });
const form = (o: Record<string, string>) => Object.entries(o).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
const balanceBefore = (await pub.get(`/v1/accounts/${ENC}`)).body.balance_usd_cents as number;
if ((await bearer.post('/v1/rails/card', { usd_cents: 100000, purpose: 'too much' })).status !== 403) fail('a card over the owner\'s bound was minted');
const minted = await bearer.post('/v1/rails/card', { usd_cents: 250, purpose: 'probe: a domain' });
if (minted.status !== 200 || !minted.body?.card?.id) fail(`card mint → ${minted.status} ${minted.text.slice(0, 200)}`);
const cardId = minted.body.card.id as string;
if (minted.body.card.single_use !== true || minted.body.card.usd_cents !== 250) fail('the minted card is not a single-use card of the requested amount');
// Present a merchant authorization at the issuer: the twin asks the platform in real time.
const present = async (amount: number, category: string) => fetch(`${need('STRIPE_TWIN_URL')}/v1/test_helpers/issuing/authorizations`, { method: 'POST', headers: { authorization: 'Bearer sk_test_world', 'content-type': 'application/x-www-form-urlencoded' }, body: form({ card: cardId, amount: String(amount), 'merchant_data[category]': category, 'merchant_data[name]': 'Namecheap' }) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) as Record<string, any> }));
const auth = await present(200, 'computer_software_stores');
if (auth.status !== 200 || auth.body.approved !== true) fail(`the in-bound authorization was not approved: ${auth.status} ${JSON.stringify(auth.body).slice(0, 300)}`);
const captured = await stripeTwin.post(`/v1/test_helpers/issuing/authorizations/${auth.body.id}/capture`, '');
if (captured.status !== 200) fail(`capture → ${captured.status} ${captured.text.slice(0, 200)}`);
await Bun.sleep(1500); // the twin delivers the transaction event to the platform's webhook
const afterCard = (await pub.get(`/v1/accounts/${ENC}`)).body;
if (Math.round(balanceBefore - afterCard.balance_usd_cents) !== 200) fail(`the capture did not settle 200 cents: balance ${balanceBefore} → ${afterCard.balance_usd_cents}`);
const trail = (await pub.get(`/v1/accounts/${ENC}/calls`)).body.calls as Array<Record<string, unknown>>;
const cardRecord = trail.find((c) => c.rail === 'card');
if (!cardRecord || cardRecord.merchant !== 'Namecheap' || cardRecord.usd_cents !== 200 || cardRecord.category !== 'computer_software_stores') fail(`no card rail record on the audit trail: ${JSON.stringify(cardRecord)}`);
// Single use: the same card is refused a second time; a card for the wrong category is declined and spends nothing.
if ((await present(50, 'computer_software_stores')).body.approved === true) fail('a settled card authorized again');
const second = await bearer.post('/v1/rails/card', { usd_cents: 100, purpose: 'probe: wrong category' });
const declined = await fetch(`${need('STRIPE_TWIN_URL')}/v1/test_helpers/issuing/authorizations`, { method: 'POST', headers: { authorization: 'Bearer sk_test_world', 'content-type': 'application/x-www-form-urlencoded' }, body: form({ card: second.body.card.id, amount: '80', 'merchant_data[category]': 'bakeries', 'merchant_data[name]': 'Cake' }) }).then((r) => r.json() as Promise<Record<string, any>>);
if (declined.approved !== false) fail(`an out-of-category authorization was approved: ${JSON.stringify(declined).slice(0, 200)}`);
if ((await pub.get(`/v1/accounts/${ENC}`)).body.balance_usd_cents !== afterCard.balance_usd_cents) fail('a declined authorization moved the books');
if ((await pub.get(`/v1/accounts/${ENC}`)).body.reserved_usd_cents !== 0) fail('a declined card kept its reservation');
// The partner rail.
if ((await bearer.post('/v1/rails/partner', { partner: 'nobody', usd_cents: 10 })).status !== 403) fail('an unlisted partner settled a charge');
const partner = await bearer.post('/v1/rails/partner', { partner: 'browserless', usd_cents: 30, unit: 'minute', quantity: 3, reference: 'probe-1' });
if (partner.status !== 200) fail(`partner settle → ${partner.status} ${partner.text.slice(0, 200)}`);
const partnerRecord = ((await pub.get(`/v1/accounts/${ENC}/calls`)).body.calls as Array<Record<string, unknown>>).find((c) => c.rail === 'partner');
if (!partnerRecord || partnerRecord.partner !== 'browserless' || partnerRecord.usd_cents !== 30 || partnerRecord.quantity !== 3) fail(`no partner rail record on the audit trail: ${JSON.stringify(partnerRecord)}`);
ok.push('a minted card paid a merchant within its bound and settled on the books; the wrong category and an unlisted partner were refused; a partner charge settled');

// 8. Money in, against the Polar twin. A patron picks a tier on the page: the platform creates the tier's
//    products at Polar and opens a checkout; the patron pays (confirms at the twin) and lands on the thanks
//    page, which reads the checkout back and mints once; a renewal arrives as Polar's signed order event and
//    mints once; a forged event is refused.
const polarTwin = api(need('POLAR_TWIN_URL'), { authorization: 'Bearer polar_at_world' });
const opened = await pub.post('/v1/patrons/checkout', { account: ACCOUNT, tier: 0, interval: 'month' });
if (opened.status !== 200 || !opened.body?.checkout_id || !opened.body?.url) fail(`patron checkout → ${opened.status} ${opened.text.slice(0, 200)}`);
const checkoutId = opened.body.checkout_id as string;
const tier = opened.body.usd_cents as number;
const paid = await polarTwin.post(`/v1/checkouts/${checkoutId}/confirm`, { customer_email: 'pat@example.com', customer_name: 'Pat Patron' });
if (paid.status !== 200 || paid.body?.status !== 'confirmed') fail(`the twin did not confirm the checkout: ${paid.status} ${paid.text.slice(0, 200)}`);
const booksBefore = (await pub.get(`/v1/accounts/${ENC}`)).body.balance_usd_cents as number;
for (let i = 0; i < 2; i++) { const thanks = await pub.get(`/p/${ENC}/thanks?checkout_id=${checkoutId}`); if (thanks.status !== 200 || !thanks.text.includes('Thank you')) fail(`thanks page → ${thanks.status}`); }
const booksAfter = (await pub.get(`/v1/accounts/${ENC}`)).body.balance_usd_cents as number;
if (!tier || Math.round(booksAfter - booksBefore) !== tier) fail(`the paid checkout did not mint the tier once: ${booksBefore} → ${booksAfter} (tier ${tier})`);
const patronPage = await pub.get(`/p/${ENC}`);
if (!patronPage.text.includes('@pat')) fail('the patron is not on the page');
const secretBytes = new TextEncoder().encode('world-polar-secret');
const signed = async (payload: string, bytes = secretBytes) => {
  const id = crypto.randomUUID(); const ts = String(Math.floor(Date.now() / 1000));
  const key = await crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${payload}`)))));
  return fetch(`${platform}/webhooks/polar`, { method: 'POST', headers: { 'content-type': 'application/json', 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': `v1,${sig}` }, body: payload });
};
const renewal = JSON.stringify({ type: 'order.paid', data: { id: `ord_probe_${checkoutId}`, paid: true, total_amount: tier, checkout_id: checkoutId, billing_reason: 'subscription_cycle', customer: { email: 'pat@example.com', name: 'Pat Patron' } } });
for (let i = 0; i < 2; i++) { const r = await signed(renewal); if (r.status !== 200) fail(`renewal webhook → ${r.status} ${await r.text()}`); }
if (Math.round((await pub.get(`/v1/accounts/${ENC}`)).body.balance_usd_cents - booksAfter) !== tier) fail('the renewal did not mint the tier once');
if ((await signed(renewal, new TextEncoder().encode('forged'))).status !== 401) fail('a forged Polar event was accepted');
ok.push('a tier paid through the Polar twin landed on the books from the thanks page, a renewal from the signed event, each once; a forged event was refused');

// 9. The books can be exported and restored: an export of everything, a restore over the wiped worker, and every
//    balance, call record and session reads back the same.
const exported = await admin.get('/admin/export');
if (exported.status !== 200 || !Array.isArray(exported.body?.entries) || !exported.body.entries.length) fail(`export → ${exported.status} ${exported.text.slice(0, 200)}`);
const snapshot = async () => ({ funding: (await pub.get(`/v1/accounts/${ENC}`)).body, calls: (await pub.get(`/v1/accounts/${ENC}/calls`)).body, sessions: (await pub.get(`/v1/accounts/${ENC}/sessions`)).body, roadmap: (await pub.get(`/v1/accounts/${ENC}/roadmap`)).body });
const beforeRestore = await snapshot();
if ((await admin.post('/admin/import', { entries: exported.body.entries })).status !== 409) fail('an import over a non-empty worker was not refused without replace');
const restored = await admin.post('/admin/import', { entries: exported.body.entries, replace: true });
if (restored.status !== 200 || restored.body?.entries !== exported.body.entries.length) fail(`restore → ${restored.status} ${restored.text.slice(0, 200)}`);
const afterRestore = await snapshot();
for (const k of ['funding', 'calls', 'sessions', 'roadmap'] as const) if (JSON.stringify(beforeRestore[k]) !== JSON.stringify(afterRestore[k])) fail(`${k} reads back differently after the restore`);
ok.push(`the books exported (${exported.body.entries.length} entries) and restored over the wiped worker; every balance, call record, session and roadmap revision reads back the same`);

// Leave the books as the seed left them for what follows: the probe's session is dropped.
await admin.del(`/admin/accounts/${ENC}/sessions/probe-1`);
console.log(`probe: OK — ${ACCOUNT}\n  ${ok.join('\n  ')}`);
