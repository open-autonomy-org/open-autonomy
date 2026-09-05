// Smoke tests: one per surface, end to end through the worker with an in-memory Durable Object and fake
// vendors, plus one line for each security claim the working agreement holds to a higher bar. The world
// gate (`bun world/run.ts check`) is the proof; these say a change broke a surface, not why.
import { describe, expect, test } from 'bun:test';
import { admin, fund, github, mintKey, polar, request, requestJson, stripe, testEnv, useEnv } from './env.ts';

const ce = (type: string, subject: string, data: unknown) => ({ specversion: '1.0', id: crypto.randomUUID(), source: 'test', type: `org.open-autonomy.${type}`, subject, time: new Date().toISOString(), data });
const sign = async (secret: string, payload: string): Promise<string> => {
  const t = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `t=${t},v1=${sig}`;
};

describe('the platform, one smoke test per surface', () => {
  test('books and keys: money in, a key by claim file, a metered call on both wires, the audit trail; survives a redeploy; refusals', async () => {
    const env = useEnv(testEnv());
    await fund(env, 'root', 1000);
    expect((await requestJson(env, '/admin/accounts/root/grant', { headers: admin, body: { to: 'acme/app', amount_usd_cents: 400 } })).ok).toBe(true);
    const { token } = await mintKey(env);
    const auth = { authorization: `Bearer ${token}` };
    expect((await request(env, '/v1/chat/completions', { headers: auth, body: { model: 'zai/glm-5.3-flash', messages: [] } })).status).toBe(200);
    expect((await request(env, '/v1/messages', { headers: { 'x-api-key': token }, body: { model: 'zai/glm-5.3-flash', max_tokens: 10, messages: [] } })).status).toBe(200);
    env.ns.restart(); // a redeploy: same storage, fresh object
    expect((await request(env, '/v1/chat/completions', { headers: auth, body: { model: 'zai/glm-5.3-flash', messages: [] } })).status).toBe(200);
    const f = await requestJson(env, '/v1/accounts/acme%2Fapp');
    expect(f.calls_total).toBe(3);
    expect(f.balance_usd_cents).toBeCloseTo(400 - 0.21, 6);
    expect((await requestJson(env, '/v1/accounts/acme%2Fapp/calls')).calls[0]).toMatchObject({ rail: 'model', model: 'zai/glm-5.3-flash' });
    // Security: a forged key, a model outside the key, an unfunded account, admin without the token.
    expect((await request(env, '/v1/chat/completions', { headers: { authorization: `Bearer ${token.split('.')[0]}.AAAA` }, body: { model: 'zai/glm-5.3-flash', messages: [] } })).status).toBe(401);
    expect((await request(env, '/v1/chat/completions', { headers: auth, body: { model: 'gpt-4o', messages: [] } })).status).toBe(403);
    const poor = await request(env, '/v1/chat/completions', { headers: { authorization: `Bearer ${(await mintKey(env, 'poor/repo')).token}` }, body: { model: 'zai/glm-5.3-flash', messages: [] } });
    expect(poor.status).toBe(402);
    expect(((await poor.json()) as any).error.needed_usd_cents).toBeGreaterThan(0);
    expect((await request(env, '/admin/status')).status).toBe(401);
  });

  test('the stream: a session with turns and an update lands under its item with its cents, live then ended; secrets never reach the books', async () => {
    const env = useEnv(testEnv());
    await fund(env, 'acme/app', 100);
    const { token } = await mintKey(env);
    const post = (body: unknown) => request(env, '/v1/agent/events', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body });
    expect((await post(ce('session.started', 'run-1', { session_kind: 'run', source: 'board', item_id: 'add' }))).status).toBe(200);
    await request(env, '/v1/chat/completions', { headers: { authorization: `Bearer ${token}` }, body: { model: 'zai/glm-5.3-flash', messages: [] } });
    const bearer = ['eyJhbGciOiJIUzI1NiJ9', 'a'.repeat(42)].join('.');
    expect((await post([ce('session.turns', 'run-1', { seq: 0, turns: [{ role: 'assistant', tool: 'terminal', args: `curl -H "authorization: Bearer ${bearer}"` }, { role: 'tool', tool: 'terminal', result: 'ok' }] }), ce('item.update', 'add', { text: 'halfway', session: 'run-1' })])).status).toBe(200);
    expect((await requestJson(env, '/v1/accounts/acme%2Fapp/sessions')).live).toEqual(['run-1']);
    expect((await post(ce('session.ended', 'run-1', { outcome: 'done', report: 'Done.', commit_sha: 'abcdef1' }))).status).toBe(200);
    const item = await requestJson(env, '/v1/accounts/acme%2Fapp/items/add');
    expect(item.sessions[0]).toMatchObject({ key: 'run-1', status: 'ended', outcome: 'done', turn_count: 2 });
    expect(item.updates.length).toBe(1);
    expect(item.usd_cents).toBeGreaterThan(0);
    expect(JSON.stringify(await requestJson(env, '/v1/accounts/acme%2Fapp/sessions/run-1'))).not.toContain(bearer);
    expect((await request(env, '/v1/agent/events', { method: 'POST', body: ce('session.started', 'x', {}) })).status).toBe(401);
  });

  test('grant credits: a funder proves a login by the claim file, gets a give key, gives; the project shows the grant; over the credits refused; a give key cannot spend', async () => {
    const env = useEnv(testEnv());
    await fund(env, 'acme/app', 100);
    github.files['pat/notes:.open-autonomy-claim'] = (await requestJson(env, '/v1/keys/challenge?funder=pat')).claim;
    expect((await request(env, '/v1/keys/mint', { body: { funder: 'pat', repo: 'other/notes' } })).status).toBe(403);
    const give = (await requestJson(env, '/v1/keys/mint', { body: { funder: 'pat', repo: 'pat/notes' } })).token;
    await requestJson(env, '/admin/accounts/%40pat/mint', { headers: admin, method: 'POST', body: { amount_usd_cents: 500, key: 'credits-1', sponsor: { login: 'open-autonomy' } } });
    const given = await requestJson(env, '/v1/grants/give', { method: 'POST', headers: { authorization: `Bearer ${give}` }, body: { to: 'acme/app', usd_cents: 300, note: 'I believe in it', key: 'g1' } });
    expect(given).toMatchObject({ ok: true, from: '@pat', to_balance_usd_cents: 400 });
    expect((await request(env, '/v1/grants/give', { method: 'POST', headers: { authorization: `Bearer ${give}` }, body: { to: 'acme/app', usd_cents: 300 } })).status).toBe(402);
    expect((await request(env, '/v1/chat/completions', { headers: { authorization: `Bearer ${give}` }, body: { model: 'zai/glm-5.3-flash', messages: [] } })).status).toBe(403);
    expect((await requestJson(env, '/v1/funders/pat')).given_usd_cents).toBe(300);
    expect(await (await request(env, '/p/acme%2Fapp')).text()).toContain('Granted by @pat — I believe in it');
    expect(await (await request(env, '/p/%40pat')).text()).toContain('Granted to');
    // Self-funding: a credit pack bought through Polar lands on the funder's books; the org matches a tenth from its
    // grants account as bonus credits, which go only to projects the funder does not own.
    await requestJson(env, '/admin/accounts/open-autonomy-org%2Fgrants/mint', { headers: admin, method: 'POST', body: { amount_usd_cents: 1000, key: 'org-1' } });
    const opened = await requestJson(env, '/v1/patrons/checkout', { method: 'POST', body: { account: '@pat', tier: 0, interval: 'once' } });
    polar.checkouts[opened.checkout_id].status = 'confirmed';
    polar.orders.push({ id: 'ord_pat', paid: true, total_amount: 1000, checkout_id: opened.checkout_id, customer_id: 'cus_1', billing_reason: 'purchase' });
    expect((await request(env, `/p/%40pat/thanks?checkout_id=${opened.checkout_id}`)).status).toBe(200);
    const pat = await requestJson(env, '/v1/funders/pat');
    expect(pat).toMatchObject({ credits_usd_cents: 200 + 1000 + 100, bonus_usd_cents: 100 });
    github.repos['pat/app'] = { description: 'mine' };
    await fund(env, 'pat/app', 1);
    expect((await requestJson(env, '/v1/grants/give', { method: 'POST', headers: { authorization: `Bearer ${give}` }, body: { to: 'pat/app', usd_cents: 1250 } })).error).toBe('bonus_only_for_others');
    expect((await requestJson(env, '/v1/grants/give', { method: 'POST', headers: { authorization: `Bearer ${give}` }, body: { to: 'acme/app', usd_cents: 1300 } })).ok).toBe(true);
  });

  test('the board: a task published under its item shows on the item, lane, attempts and verdict', async () => {
    const env = useEnv(testEnv());
    await fund(env, 'acme/app', 100);
    const { token } = await mintKey(env);
    const auth = { authorization: `Bearer ${token}` };
    const ce = (data: unknown) => ({ specversion: '1.0', id: crypto.randomUUID(), source: 't', type: 'org.open-autonomy.item.task', subject: 'add', time: new Date().toISOString(), data });
    expect((await request(env, '/v1/agent/events', { method: 'POST', headers: auth, body: ce({ task_id: 't_1', lane: 'done', attempts: [{ id: '1', profile: 'default', status: 'review_requested', summary: 'pushed agent/add' }], reviews: [{ verdict: 'requested' }, { verdict: 'approved', by: 'default' }] }) })).status).toBe(200);
    const item = await requestJson(env, '/v1/accounts/acme%2Fapp/items/add');
    expect(item.task).toMatchObject({ lane: 'done', attempts: [{ id: '1', summary: 'pushed agent/add' }], reviews: [{ verdict: 'requested' }, { verdict: 'approved' }] });
    expect(await (await request(env, '/p/acme%2Fapp/items/add')).text()).toContain('review: requested → approved');
  });

  test('the roadmap: a substrate narrates its file through the key, the milestones driver on sync, an owner-side push on a steer key; scopes hold', async () => {
    const env = useEnv(testEnv());
    github.repos['acme/app'] = { description: 'x' };
    await fund(env, 'acme/app', 100);
    const narrate = (await mintKey(env)).token;
    expect((await request(env, '/v1/agent/roadmap', { method: 'POST', headers: { authorization: `Bearer ${narrate}` }, body: { source: 'file', roadmap: { schema: 'open-autonomy.roadmap.v3', items: [{ id: 'add', title: 'todo add', status: 'planned', acceptance: [] }] } } })).status).toBe(200);
    expect((await requestJson(env, '/v1/accounts/acme%2Fapp/roadmap')).revision).toMatchObject({ revision: 1, source: 'file' });
    github.files['acme/app:.open-autonomy/config.yaml'] = 'roadmap:\n  source: github-milestones\n';
    github.milestones['acme/app'] = [{ number: 1, title: 'Search', state: 'open', due_on: null, created_at: '2026-09-01T00:00:00Z' }];
    await requestJson(env, '/admin/accounts/acme%2Fapp/sync', { headers: admin, method: 'POST' });
    expect((await requestJson(env, '/v1/accounts/acme%2Fapp/roadmap')).revision).toMatchObject({ revision: 2, source: 'github-milestones' });
    github.files['acme/app:.open-autonomy-claim'] = (await requestJson(env, '/v1/keys/challenge?account=acme%2Fapp')).claim;
    const steer = (await requestJson(env, '/v1/keys/mint', { body: { account: 'acme/app', scopes: ['steer'] } })).token;
    const roadmap = { schema: 'open-autonomy.roadmap.v3', items: [{ id: 'TODO-1', title: 'Add', status: 'active', acceptance: [] }] };
    expect((await request(env, '/v1/agent/roadmap', { method: 'POST', headers: { authorization: `Bearer ${steer}` }, body: { source: 'jira', roadmap } })).status).toBe(200);
    expect((await requestJson(env, '/v1/accounts/acme%2Fapp/roadmap')).revision).toMatchObject({ revision: 3, source: 'jira' });
    // Security: a steer key spends nothing; a key that only spends cannot narrate or steer a roadmap.
    expect((await request(env, '/v1/chat/completions', { headers: { authorization: `Bearer ${steer}` }, body: { model: 'zai/glm-5.3-flash', messages: [] } })).status).toBe(403);
    expect((await request(env, '/v1/agent/roadmap', { method: 'POST', headers: { authorization: `Bearer ${(await requestJson(env, '/v1/keys/mint', { body: { account: 'acme/app', scopes: ['spend'] } })).token}` }, body: { source: 'jira', roadmap } })).status).toBe(403);
  });

  test('patronage: a tier checkout through Polar lands on the books from the thanks page once, a renewal from the signed webhook once, a forged webhook never', async () => {
    const env = useEnv(testEnv());
    await fund(env, 'acme/app', 100);
    const opened = await requestJson(env, '/v1/patrons/checkout', { method: 'POST', body: { account: 'acme/app', tier: 0, interval: 'once' } });
    expect(opened.url).toBe('https://polar.test/checkout/chk_1');
    expect(Object.keys(polar.products)).toHaveLength(6);
    // The patron pays at Polar.
    polar.checkouts.chk_1.status = 'confirmed';
    polar.orders.push({ id: 'ord_1', paid: true, total_amount: 500, checkout_id: 'chk_1', customer_id: 'cus_1', billing_reason: 'purchase' });
    for (let i = 0; i < 2; i++) expect((await request(env, '/p/acme%2Fapp/thanks?checkout_id=chk_1')).status).toBe(200);
    expect((await requestJson(env, '/v1/accounts/acme%2Fapp')).balance_usd_cents).toBe(600);
    expect((await request(env, '/p/acme%2Fapp')).text()).resolves.toContain('@pat');
    const hook = async (payload: string, secret = env.POLAR_WEBHOOK_SECRET!) => {
      const id = 'msg_1'; const ts = String(Math.floor(Date.now() / 1000));
      const key = await crypto.subtle.importKey('raw', Uint8Array.from(atob(secret.slice(6)), (c) => c.charCodeAt(0)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const sig = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${payload}`)))));
      return request(env, '/webhooks/polar', { method: 'POST', headers: { 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': `v1,${sig}` }, body: payload });
    };
    const renewal = JSON.stringify({ type: 'order.paid', data: { id: 'ord_2', paid: true, total_amount: 500, checkout_id: 'chk_1', billing_reason: 'subscription_cycle', customer: { email: 'pat@example.com', name: 'Pat Patron' } } });
    for (let i = 0; i < 2; i++) expect((await hook(renewal)).status).toBe(200);
    expect((await requestJson(env, '/v1/accounts/acme%2Fapp')).balance_usd_cents).toBe(1100);
    expect((await hook(renewal, 'whsec_' + btoa('forged'))).status).toBe(401);
  });

  test('the books: exported whole, restored over a wiped worker, the same', async () => {
    const env = useEnv(testEnv());
    await fund(env, 'acme/app', 700);
    const before = await requestJson(env, '/v1/accounts/acme%2Fapp');
    const books = await requestJson(env, '/admin/export', { headers: admin });
    expect((await request(env, '/admin/import', { headers: admin, method: 'POST', body: { entries: books.entries } })).status).toBe(409);
    expect((await requestJson(env, '/admin/import', { headers: admin, method: 'POST', body: { entries: books.entries, replace: true } })).entries).toBe(books.entries.length);
    expect(await requestJson(env, '/v1/accounts/acme%2Fapp')).toEqual(before);
  });

  test('the rails: a card minted within the bound, approved in real time, settled on capture and retired; a decline releases; a partner charge settles', async () => {
    const env = useEnv(testEnv());
    await fund(env, 'acme/app', 1000);
    github.repos['acme/app'] = { description: 'x' };
    github.files['acme/app:.open-autonomy/config.yaml'] = 'rails:\n  card:\n    max_usd_cents: 500\n    categories: [computer_software_stores]\n  partner:\n    max_usd_cents: 100\n    partners: [browserless]\n';
    await requestJson(env, '/admin/accounts/acme%2Fapp/sync', { headers: admin, method: 'POST' });
    const { token } = await mintKey(env);
    const auth = { authorization: `Bearer ${token}` };
    expect((await request(env, '/v1/rails/card', { headers: auth, body: { usd_cents: 900 } })).status).toBe(403);
    const card = (await requestJson(env, '/v1/rails/card', { headers: auth, body: { usd_cents: 250, purpose: 'a domain' } })).card;
    expect(card).toMatchObject({ last4: '4242', usd_cents: 250, single_use: true });
    const hook = async (event: unknown) => { const payload = JSON.stringify(event); return request(env, '/webhooks/stripe', { method: 'POST', headers: { 'stripe-signature': await sign('whsec_test', payload) }, body: payload }); };
    expect(await (await hook({ type: 'issuing_authorization.request', data: { object: { id: 'iauth_1', card: { id: card.id }, amount: 200, merchant_data: { name: 'Namecheap', category: 'computer_software_stores' } } } })).json()).toEqual({ approved: true });
    await hook({ type: 'issuing_transaction.created', data: { object: { id: 'ipi_1', type: 'capture', card: { id: card.id }, amount: -200, merchant_data: { name: 'Namecheap', category: 'computer_software_stores' } } } });
    expect((await requestJson(env, '/v1/accounts/acme%2Fapp/calls')).calls[0]).toMatchObject({ rail: 'card', merchant: 'Namecheap', usd_cents: 200 });
    expect(stripe.cards[card.id].status).toBe('canceled');
    const second = (await requestJson(env, '/v1/rails/card', { headers: auth, body: { usd_cents: 100 } })).card;
    expect(await (await hook({ type: 'issuing_authorization.request', data: { object: { id: 'iauth_2', card: { id: second.id }, amount: 50, merchant_data: { category: 'bakeries' } } } })).json()).toEqual({ approved: false });
    const f = await requestJson(env, '/v1/accounts/acme%2Fapp');
    expect(f.reserved_usd_cents).toBe(0);
    expect(f.consumed_usd_cents).toBe(200);
    expect((await requestJson(env, '/v1/rails/partner', { headers: auth, body: { partner: 'browserless', usd_cents: 30, unit: 'minute', quantity: 3 } })).balance_usd_cents).toBe(770);
    // Security: a forged webhook, an unlisted partner.
    expect((await request(env, '/webhooks/stripe', { method: 'POST', headers: { 'stripe-signature': 't=1,v1=00' }, body: '{}' })).status).toBe(401);
    expect((await request(env, '/v1/rails/partner', { headers: auth, body: { partner: 'nobody', usd_cents: 10 } })).status).toBe(403);
  });

  test('the site and the widgets render for a synced project', async () => {
    const env = useEnv(testEnv());
    await fund(env, 'acme/app', 500);
    github.repos['acme/app'] = { description: 'A todo list that builds itself', html_url: 'https://github.com/acme/app' };
    github.files['acme/app:docs/VISION.md'] = '# Vision\n\nA todo list built by its own agent.';
    await requestJson(env, '/admin/accounts/acme%2Fapp/sync', { headers: admin, method: 'POST' });
    const { token } = await mintKey(env);
    await request(env, '/v1/agent/roadmap', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: { source: 'file', roadmap: { schema: 'open-autonomy.roadmap.v3', items: [{ id: 'add', phase: '1', status: 'active', title: 'todo add appends an item', acceptance: ['It appends.'] }] } } });
    await request(env, '/v1/agent/events', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: ce('session.started', 'run-1', { session_kind: 'run', item_id: 'add' }) });
    for (const [path, expected] of [['/', 'A todo list that builds itself'], ['/p/acme%2Fapp', 'todo add appends an item'], ['/p/acme%2Fapp/sessions', '/sessions/run-1'], ['/p/acme%2Fapp/sessions/run-1', 'new EventSource('], ['/p/acme%2Fapp/items/add', 'It appends.']]) {
      const res = await request(env, path);
      expect(res.status).toBe(200);
      expect((await res.text()).includes(expected)).toBe(true);
    }
    for (const w of ['runway', 'roadmap', 'activity', 'now']) expect((await request(env, `/v1/accounts/acme%2Fapp/${w}.svg`)).headers.get('content-type')).toContain('image/svg+xml');
    expect((await request(env, '/p/nobody%2Fnothing')).status).toBe(404);
  });
});
