// Smoke tests: one per surface, end to end through the worker with an in-memory Durable Object and fake
// vendors, plus one line for each security claim the working agreement holds to a higher bar. The world
// gate (`bun world/run.ts check`) is the proof; these say a change broke a surface, not why.
import { describe, expect, test } from 'bun:test';
import { base64url, hmac } from '../src/http.ts';
import { admin, fund, github, mintKey, request, requestJson, stripe, testEnv, useEnv } from './env.ts';

const ce = (type: string, subject: string, data: unknown) => ({ specversion: '1.0', id: crypto.randomUUID(), source: 'test', type: `org.open-autonomy.${type}`, subject, time: new Date().toISOString(), data });
const sign = async (secret: string, payload: string): Promise<string> => {
  const t = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `t=${t},v1=${sig}`;
};

describe('the backend, one smoke test per surface', () => {
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

  test('earmarked gifts pay only qualifying spends, name their envelope, and release when an item is done', async () => {
    const env = useEnv(testEnv());
    await fund(env, 'root', 2000);
    await requestJson(env, '/admin/accounts/acme%2Fapp/profile', { headers: admin, body: { profile: {} } });
    const { token } = await mintKey(env, 'acme/app', ['zai/glm-5.3-flash', 'other/model']);
    const auth = { authorization: `Bearer ${token}` };
    const roadmap = (status: string) => ({ source: 'file', roadmap: { schema: 'open-autonomy.timeline.v1', items: [{ id: 'add', title: 'todo add', status, acceptance: [] }, { id: 'other', title: 'other work', status: 'planned', acceptance: [] }] } });
    expect((await request(env, '/v1/agent/events', { method: 'POST', headers: auth, body: ce('timeline', 'project', roadmap('active')) })).status).toBe(200);
    expect((await requestJson(env, '/admin/accounts/root/grant', { headers: admin, body: { to: 'acme/app', amount_usd_cents: 500, for: { item: 'missing' } } })).error).toBe('no_such_item');
    expect((await requestJson(env, '/admin/accounts/root/grant', { headers: admin, body: { to: 'acme/app', amount_usd_cents: 500, key: 'item-gift', for: { item: 'add' } } })).ok).toBe(true);
    const post = (subject: string, item_id: string) => request(env, '/v1/agent/events', { method: 'POST', headers: auth, body: ce('session.started', subject, { session_kind: 'run', item_id }) });
    await post('wrong-item', 'other');
    const refused = await requestJson(env, '/v1/chat/completions', { headers: auth, body: { model: 'zai/glm-5.3-flash', session_id: 'wrong-item', messages: [] } });
    expect(refused.error).toMatchObject({ code: 'insufficient_funds', earmarked_usd_cents: 500 });
    expect(refused.error.message).toContain('$5.00 for roadmap item add');
    expect(env.gateway.calls).toHaveLength(0);
    await post('right-item', 'add');
    expect((await request(env, '/v1/chat/completions', { headers: auth, body: { model: 'zai/glm-5.3-flash', session_id: 'right-item', messages: [] } })).status).toBe(200);
    expect((await requestJson(env, '/v1/accounts/acme%2Fapp/calls')).calls[0].envelope).toEqual({ type: 'item', item: 'add' });
    expect((await requestJson(env, '/admin/accounts/root/grant', { headers: admin, body: { to: 'acme/app', amount_usd_cents: 500, key: 'models-gift', for: { models: ['other/model'] } } })).ok).toBe(true);
    const wrongModel = await requestJson(env, '/v1/chat/completions', { headers: auth, body: { model: 'zai/glm-5.3-flash', messages: [] } });
    expect(wrongModel.error.code).toBe('insufficient_funds');
    expect((await request(env, '/v1/chat/completions', { headers: auth, body: { model: 'other/model', messages: [] } })).status).toBe(200);
    expect((await requestJson(env, '/v1/accounts/acme%2Fapp/calls')).calls[0].envelope).toEqual({ type: 'models', models: ['other/model'] });
    const before = await requestJson(env, '/v1/accounts/acme%2Fapp');
    expect(before.envelopes.map((e: any) => e.purpose)).toEqual(expect.arrayContaining([{ type: 'item', item: 'add' }, { type: 'models', models: ['other/model'] }]));
    expect(before.usable_usd_cents).toBe(0);
    expect((await request(env, '/v1/agent/events', { method: 'POST', headers: auth, body: ce('timeline', 'project', roadmap('done')) })).status).toBe(200);
    const after = await requestJson(env, '/v1/accounts/acme%2Fapp');
    expect(after.balance_usd_cents).toBeCloseTo(before.balance_usd_cents, 6);
    expect(after.usable_usd_cents).toBeGreaterThan(0);
    expect((await requestJson(env, '/v1/accounts/acme%2Fapp/roadmap')).revision.roadmap.items[0].status).toBe('done');
    expect((await requestJson(env, '/v1/accounts/acme%2Fapp')).envelopes.some((e: any) => e.purpose.type === 'unrestricted')).toBe(true);
    const exported = await requestJson(env, '/admin/export', { headers: admin });
    const state = exported.entries.find(([key]: [string, unknown]) => key === 'state')[1];
    expect(state.flows.find((f: any) => f.kind === 'release')).toMatchObject({ item: 'add', amount_usd_cents: expect.any(Number) });
    expect((await requestJson(env, '/v1/accounts/acme%2Fapp')).balance_usd_cents).toBeCloseTo(after.envelopes.reduce((sum: number, e: any) => sum + e.balance_usd_cents, 0), 6);
  });

  test('a reservation from before envelope migration keeps its claim while a new reservation settles beside it', async () => {
    const env = useEnv(testEnv());
    const expires = Date.now() + 60_000;
    const state = {
      day_key: new Date().toISOString().slice(0, 10), consumed_usd_cents: 0, reserved_usd_cents: 60,
      reservations: { old: { amount: 60, expires_at_ms: expires, account: 'acme/app', kid: '' } },
      accounts: { 'acme/app': { granted_in_usd_cents: 100, granted_out_usd_cents: 0, consumed_usd_cents: 0 } },
    };
    expect((await requestJson(env, '/admin/import', { headers: admin, body: { entries: [['state', state]] } })).ok).toBe(true);
    const ledger = env.LIMITS.get(env.LIMITS.idFromName('global'));
    const rpc = (body: Record<string, unknown>) => ledger.fetch('https://ledger.local/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    expect(await (await rpc({ op: 'reserve', request_id: 'too-big', account: 'acme/app', kid: '', amount_usd_cents: 50, daily_cap_usd_cents: 5000 })).json()).toMatchObject({ ok: false, error: 'insufficient_funds', available_usd_cents: 40 });
    expect(await (await rpc({ op: 'reserve', request_id: 'new', account: 'acme/app', kid: '', amount_usd_cents: 40, daily_cap_usd_cents: 5000 })).json()).toMatchObject({ ok: true });
    await rpc({ op: 'consume', request_id: 'old', actual_usd_cents: 60, event: { rail: 'model', model: 'legacy/model' } });
    await rpc({ op: 'consume', request_id: 'new', actual_usd_cents: 40, event: { rail: 'model', model: 'new/model' } });
    const account = await requestJson(env, '/v1/accounts/acme%2Fapp');
    expect(account.balance_usd_cents).toBe(0);
    expect(account.envelopes.reduce((sum: number, envelope: any) => sum + envelope.balance_usd_cents, 0)).toBe(0);
    expect((await requestJson(env, '/v1/accounts/acme%2Fapp/calls')).calls.map((call: any) => call.envelope)).toEqual([{ type: 'unrestricted' }, { type: 'unrestricted' }]);
  });

  test('the stream: overlapping named sessions each hold their calls and settled cents; secrets never reach the books', async () => {
    const env = useEnv(testEnv());
    await fund(env, 'acme/app', 100);
    const { token } = await mintKey(env);
    const post = (body: unknown) => request(env, '/v1/agent/events', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body });
    expect((await post(ce('session.started', 'run-1', { session_kind: 'run', source: 'board', item_id: 'add' }))).status).toBe(200);
    expect((await post(ce('session.started', 'run-2', { session_kind: 'run', source: 'review', item_id: 'add' }))).status).toBe(200);
    await request(env, '/v1/chat/completions', { headers: { authorization: `Bearer ${token}` }, body: { model: 'zai/glm-5.3-flash', session_id: 'run-1', messages: [] } });
    await request(env, '/v1/chat/completions', { headers: { authorization: `Bearer ${token}` }, body: { model: 'zai/glm-5.3-flash', session_id: 'run-2', messages: [] } });
    // Hermes can finish its first call before the reporter has observed and announced the transcript.
    await request(env, '/v1/chat/completions', { headers: { authorization: `Bearer ${token}` }, body: { model: 'zai/glm-5.3-flash', session_id: 'run-3', messages: [] } });
    expect((await post(ce('session.started', 'run-3', { session_kind: 'run', source: 'pm', item_id: 'add' }))).status).toBe(200);
    expect(env.gateway.calls.every((call) => !Object.hasOwn(call.body, 'session_id'))).toBe(true);
    const bearer = ['eyJhbGciOiJIUzI1NiJ9', 'a'.repeat(42)].join('.');
    expect((await post([ce('session.turns', 'run-1', { seq: 0, turns: [{ role: 'assistant', tool: 'terminal', args: `curl -H "authorization: Bearer ${bearer}"` }, { role: 'tool', tool: 'terminal', result: 'ok' }] }), ce('item.update', 'add', { text: 'halfway', session: 'run-1' })])).status).toBe(200);
    expect((await requestJson(env, '/v1/accounts/acme%2Fapp/sessions')).live).toEqual(['run-1', 'run-2', 'run-3']);
    expect((await post(ce('session.ended', 'run-1', { outcome: 'done', report: 'Done.', commit_sha: 'abcdef1' }))).status).toBe(200);
    expect((await post(ce('session.ended', 'run-2', { outcome: 'done' }))).status).toBe(200);
    expect((await post(ce('session.ended', 'run-3', { outcome: 'done' }))).status).toBe(200);
    const item = await requestJson(env, '/v1/accounts/acme%2Fapp/items/add');
    expect(item.sessions.find((session: any) => session.key === 'run-1')).toMatchObject({ status: 'ended', outcome: 'done', turn_count: 2, calls: 1 });
    expect(item.sessions.map((session: any) => session.calls)).toEqual([1, 1, 1]);
    expect(item.sessions.reduce((sum: number, session: any) => sum + session.usd_cents, 0)).toBe((await requestJson(env, '/v1/accounts/acme%2Fapp')).consumed_usd_cents);
    expect((await requestJson(env, '/v1/accounts/acme%2Fapp/calls')).calls.every((call: any) => call.session)).toBe(true);
    expect(item.updates.length).toBe(1);
    expect(item.usd_cents).toBeGreaterThan(0);
    expect(JSON.stringify(await requestJson(env, '/v1/accounts/acme%2Fapp/sessions/run-1'))).not.toContain(bearer);
    expect((await request(env, '/v1/agent/events', { method: 'POST', body: ce('session.started', 'x', {}) })).status).toBe(401);
  });

  test('the roadmap: a substrate narrates its timeline through the events door, the milestones driver on sync, an owner-side push on a steer key alone; scopes hold', async () => {
    const env = useEnv(testEnv());
    github.repos['acme/app'] = { description: 'x' };
    await fund(env, 'acme/app', 100);
    const narrate = (await mintKey(env)).token;
    expect((await request(env, '/v1/agent/events', { method: 'POST', headers: { authorization: `Bearer ${narrate}` }, body: ce('timeline', 'project', { source: 'file', roadmap: { schema: 'open-autonomy.timeline.v1', items: [{ id: 'add', title: 'todo add', status: 'planned', acceptance: [] }] } }) })).status).toBe(200);
    expect((await request(env, '/v1/agent/roadmap', { method: 'POST', headers: { authorization: `Bearer ${narrate}` }, body: { source: 'file', roadmap: { schema: 'open-autonomy.timeline.v1', items: [] } } })).status).toBe(403);
    expect((await requestJson(env, '/v1/accounts/acme%2Fapp/roadmap')).revision).toMatchObject({ revision: 1, source: 'file' });
    github.files['acme/app:.open-autonomy/config.yaml'] = 'roadmap:\n  source: github-milestones\n';
    github.milestones['acme/app'] = [{ number: 1, title: 'Search', state: 'open', due_on: null, created_at: '2026-09-01T00:00:00Z' }];
    await requestJson(env, '/admin/accounts/acme%2Fapp/sync', { headers: admin, method: 'POST' });
    expect((await requestJson(env, '/v1/accounts/acme%2Fapp/roadmap')).revision).toMatchObject({ revision: 2, source: 'github-milestones' });
    github.files['acme/app:.open-autonomy-claim'] = (await requestJson(env, '/v1/keys/challenge?account=acme%2Fapp')).claim;
    const steer = (await requestJson(env, '/v1/keys/mint', { body: { account: 'acme/app', scopes: ['steer'] } })).token;
    const roadmap = { schema: 'open-autonomy.timeline.v1', items: [{ id: 'TODO-1', title: 'Add', status: 'active', acceptance: [] }] };
    expect((await request(env, '/v1/agent/roadmap', { method: 'POST', headers: { authorization: `Bearer ${steer}` }, body: { source: 'jira', roadmap } })).status).toBe(200);
    expect((await requestJson(env, '/v1/accounts/acme%2Fapp/roadmap')).revision).toMatchObject({ revision: 3, source: 'jira' });
    // Security: a steer key spends nothing; a key that only spends cannot narrate or steer a roadmap.
    expect((await request(env, '/v1/chat/completions', { headers: { authorization: `Bearer ${steer}` }, body: { model: 'zai/glm-5.3-flash', messages: [] } })).status).toBe(403);
    expect((await request(env, '/v1/agent/roadmap', { method: 'POST', headers: { authorization: `Bearer ${(await requestJson(env, '/v1/keys/mint', { body: { account: 'acme/app', scopes: ['spend'] } })).token}` }, body: { source: 'jira', roadmap } })).status).toBe(403);
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
    // The developer's key (spend) cannot reach the rails; the treasurer's (pay) can, within the owner's bound.
    expect((await request(env, '/v1/rails/card', { headers: { authorization: `Bearer ${(await mintKey(env)).token}` }, body: { usd_cents: 100 } })).status).toBe(403);
    const { token } = await mintKey(env, 'acme/app', ['zai/glm-5.3-flash'], ['spend', 'narrate', 'pay']);
    const auth = { authorization: `Bearer ${token}` };
    expect((await request(env, '/v1/rails/card', { headers: auth, body: { usd_cents: 900 } })).status).toBe(403);
    const card = (await requestJson(env, '/v1/rails/card', { headers: auth, body: { usd_cents: 250, purpose: 'a domain', item: 'domain' } })).card;
    expect(card).toMatchObject({ last4: '4242', usd_cents: 250, single_use: true });
    const hook = async (event: unknown) => { const payload = JSON.stringify(event); return request(env, '/webhooks/stripe', { method: 'POST', headers: { 'stripe-signature': await sign('whsec_test', payload) }, body: payload }); };
    expect(await (await hook({ type: 'issuing_authorization.request', data: { object: { id: 'iauth_1', card: { id: card.id }, amount: 200, merchant_data: { name: 'Namecheap', category: 'computer_software_stores' } } } })).json()).toEqual({ approved: true });
    await hook({ type: 'issuing_transaction.created', data: { object: { id: 'ipi_1', type: 'capture', card: { id: card.id }, amount: -200, merchant_data: { name: 'Namecheap', category: 'computer_software_stores' } } } });
    expect((await requestJson(env, '/v1/accounts/acme%2Fapp/calls')).calls[0]).toMatchObject({ rail: 'card', merchant: 'Namecheap', usd_cents: 200, item: 'domain' });
    expect((await requestJson(env, '/v1/accounts/acme%2Fapp/items/domain')).purchases[0]).toMatchObject({ rail: 'card', merchant: 'Namecheap' });
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
    await requestJson(env, '/admin/accounts/acme%2Fapp/sync', { headers: admin, method: 'POST' });
    const { token } = await mintKey(env);
    await request(env, '/v1/agent/events', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: ce('timeline', 'project', { source: 'file', roadmap: { schema: 'open-autonomy.timeline.v1', items: [{ id: 'add', phase: '1', status: 'active', title: 'todo add appends an item', acceptance: ['It appends.'] }, { id: 'shipped-1', tense: 'past', status: 'done', title: 'todo init makes a store', release: 'v0.1.0', done_at: '2026-09-01T00:00:00Z', commit: 'abcdef1234567', home: 'changelog', links: [{ kind: 'github-pr', url: 'https://github.com/acme/app/pull/7', label: '#7' }, { kind: 'jira', url: 'https://acme.atlassian.net/browse/ACME-12', label: 'ACME-12' }], acceptance: [] }] } }) });
    await request(env, '/v1/agent/events', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: ce('session.started', 'run-1', { session_kind: 'run', item_id: 'add' }) });
    await request(env, '/v1/agent/events', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: ce('project.docs', 'project', { about_md: '# acme\n\nA todo list built by its own agent.' }) });
    expect(await (await request(env, '/')).text()).toContain('acme/app');
    for (const [path, expected] of [['/p/acme%2Fapp', 'todo add appends an item'], ['/p/acme%2Fapp', 'built by its own agent'], ['/p/acme%2Fapp/about', 'built by its own agent'], ['/p/acme%2Fapp', 'todo init makes a store'], ['/p/acme%2Fapp?view=list&sort=title', 'abcdef1'], ['/p/acme%2Fapp/items/shipped-1', 'acme.atlassian.net/browse/ACME-12'], ['/p/acme%2Fapp?view=releases', 'v0.1.0'], ['/p/acme%2Fapp?view=timeline', 'September 2026'], ['/p/acme%2Fapp/sessions', '/sessions/run-1'], ['/p/acme%2Fapp/sessions/run-1', 'new EventSource('], ['/p/acme%2Fapp/items/add', 'It appends.']]) {
      const res = await request(env, path);
      expect(res.status).toBe(200);
      expect((await res.text()).includes(expected)).toBe(true);
    }
    for (const w of ['runway', 'roadmap', 'activity', 'now']) expect((await request(env, `/v1/accounts/acme%2Fapp/${w}.svg`)).headers.get('content-type')).toContain('image/svg+xml');
    expect((await request(env, '/p/nobody%2Fnothing')).status).toBe(404);
  });
  test("an app's state on the books survives the core's loader: what the backend does not own it keeps, across a restart and an export", async () => {
    const env = useEnv(testEnv());
    const { LimitLedger } = require('../src/ledger.ts') as typeof import('../src/ledger.ts');
    LimitLedger.extend({
      test_mark: async (core, body) => { core.ensureAcct(String(body.account)).sponsors_active = { pat: { login: 'pat', monthly_usd_cents: 500 } }; core.state.coupons = { 'SPON-TEST': { code: 'SPON-TEST', amount_usd_cents: 100 } }; await core.save(); return { ok: true }; },
      test_read: (core, body) => ({ ok: true, account: core.acct(String(body.account))?.sponsors_active, state: core.state.coupons }),
    });
    await fund(env, 'acme/app', 100);
    const ledger = new (require('../src/ledger.ts') as typeof import('../src/ledger.ts')).LedgerClient(env.LIMITS);
    expect((await ledger.call<{ ok: boolean }>('test_mark', { account: 'acme/app' })).ok).toBe(true);
    env.ns.restart();
    const after = await ledger.call<{ account: unknown; state: unknown }>('test_read', { account: 'acme/app' });
    expect(after.account).toEqual({ pat: { login: 'pat', monthly_usd_cents: 500 } });
    expect(after.state).toEqual({ 'SPON-TEST': { code: 'SPON-TEST', amount_usd_cents: 100 } });
    const exported = await requestJson(env, '/admin/export', { headers: admin });
    const state = exported.entries.find(([key]: [string, unknown]) => key === 'state')[1];
    expect(state.coupons['SPON-TEST'].amount_usd_cents).toBe(100);
    expect(state.accounts['acme/app'].sponsors_active.pat.login).toBe('pat');
    expect((await requestJson(env, '/v1/accounts/acme%2Fapp')).balance_usd_cents).toBe(100);
  });
  test('the backend admits a private repository it can read; its page is the deployment\'s to guard', async () => {
    const env = useEnv(testEnv());
    await fund(env, 'acme/secret', 100);
    github.repos['acme/secret'] = { description: 'Ours alone', html_url: 'https://github.com/acme/secret', private: true };
    expect((await requestJson(env, '/admin/accounts/acme%2Fsecret/sync', { headers: admin, method: 'POST' })).ok).toBe(true);
    expect(await (await request(env, '/')).text()).toContain('Ours alone');
  });
});
