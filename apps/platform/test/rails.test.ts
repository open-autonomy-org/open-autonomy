import { describe, expect, test } from 'bun:test';
import { admin, fund, github, mintKey, request, requestJson, stripe, testEnv, useEnv } from './env.ts';

const CONFIG = 'account: acme/app\nrails:\n  card:\n    max_usd_cents: 500\n    categories: [computer_software_stores]\n  partner:\n    max_usd_cents: 100\n    partners: [browserless]\n';
async function withRails(env: ReturnType<typeof testEnv>, config = CONFIG) {
  github.repos['acme/app'] = { description: 'x' };
  github.files['acme/app:.open-autonomy/config.yaml'] = config;
  await requestJson(env, '/admin/accounts/acme%2Fapp/sync', { headers: admin, method: 'POST' });
}
async function signed(env: ReturnType<typeof testEnv>, event: unknown): Promise<Response> {
  const payload = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('whsec_test'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  return request(env, '/webhooks/stripe', { method: 'POST', headers: { 'stripe-signature': `t=${t},v1=${sig}` }, body: payload });
}

describe('the rails beyond the model: a minted card and a partner charge', () => {
  test('a card is minted against the balance within the owner\'s bound; a real-time authorization within amount and category is approved; the capture settles as a card record and retires the card', async () => {
    const env = useEnv(testEnv());
    await fund(env, 'acme/app', 1000);
    await withRails(env);
    const { token } = await mintKey(env);
    const over = await request(env, '/v1/rails/card', { headers: { authorization: `Bearer ${token}` }, body: { usd_cents: 900 } });
    expect(over.status).toBe(403);
    const minted = await requestJson(env, '/v1/rails/card', { headers: { authorization: `Bearer ${token}` }, body: { usd_cents: 250, purpose: 'a domain' } });
    expect(minted.ok).toBe(true);
    expect(minted.card).toMatchObject({ last4: '4242', number: '4000000000004242', usd_cents: 250, single_use: true, categories: ['computer_software_stores'] });
    const create = stripe.requests.find((r) => r.path === '/v1/issuing/cards')!;
    expect(create.body['spending_controls[spending_limits][0][amount]']).toBe('250');
    expect(create.body['spending_controls[spending_limits][0][interval]']).toBe('per_authorization');
    expect(create.body['spending_controls[allowed_categories][0]']).toBe('computer_software_stores');
    expect((await requestJson(env, '/v1/accounts/acme%2Fapp')).reserved_usd_cents).toBe(250);
    // The issuer asks in real time.
    const ask = await signed(env, { type: 'issuing_authorization.request', data: { object: { id: 'iauth_1', card: { id: minted.card.id }, amount: 200, merchant_data: { name: 'Namecheap', category: 'computer_software_stores' } } } });
    expect(await ask.json()).toEqual({ approved: true });
    // The capture settles the books.
    const cap = await signed(env, { type: 'issuing_transaction.created', data: { object: { id: 'ipi_1', type: 'capture', card: { id: minted.card.id }, amount: -200, merchant_data: { name: 'Namecheap', category: 'computer_software_stores' } } } });
    expect(await cap.json()).toEqual({ ok: true, settled_usd_cents: 200 });
    const f = await requestJson(env, '/v1/accounts/acme%2Fapp');
    expect(f.consumed_usd_cents).toBe(200);
    expect(f.reserved_usd_cents).toBe(0);
    expect(f.balance_usd_cents).toBe(800);
    const trail = await requestJson(env, '/v1/accounts/acme%2Fapp/calls');
    expect(trail.calls[0]).toMatchObject({ rail: 'card', merchant: 'Namecheap', category: 'computer_software_stores', card_last4: '4242', usd_cents: 200, reference: 'ipi_1' });
    expect(stripe.cards[minted.card.id].status).toBe('canceled');
    // Single use: a second authorization on the same card is refused; a repeated capture is ignored.
    expect(await (await signed(env, { type: 'issuing_authorization.request', data: { object: { id: 'iauth_2', card: { id: minted.card.id }, amount: 10, merchant_data: { category: 'computer_software_stores' } } } })).json()).toEqual({ approved: false });
    expect(((await (await signed(env, { type: 'issuing_transaction.created', data: { object: { id: 'ipi_1', type: 'capture', card: { id: minted.card.id }, amount: -200 } } })).json()) as { ignored?: string }).ignored).toBe('already settled');
    expect((await requestJson(env, '/v1/accounts/acme%2Fapp')).consumed_usd_cents).toBe(200);
  });

  test('a declined authorization spends nothing and releases the reservation; a pending one is decided through the API; bad signatures and an off rail are refused', async () => {
    const env = useEnv(testEnv());
    await fund(env, 'acme/app', 1000);
    await withRails(env);
    const { token } = await mintKey(env);
    const minted = await requestJson(env, '/v1/rails/card', { headers: { authorization: `Bearer ${token}` }, body: { usd_cents: 100 } });
    // Wrong category: declined in real time, reservation released, card canceled.
    expect(await (await signed(env, { type: 'issuing_authorization.request', data: { object: { id: 'iauth_3', card: { id: minted.card.id }, amount: 50, merchant_data: { category: 'bakeries' } } } })).json()).toEqual({ approved: false });
    expect((await requestJson(env, '/v1/accounts/acme%2Fapp')).reserved_usd_cents).toBe(0);
    expect(stripe.cards[minted.card.id].status).toBe('canceled');
    // Over the amount, on a fresh card, arriving as a pending `created` (no real-time enrolment): declined via the API.
    const second = await requestJson(env, '/v1/rails/card', { headers: { authorization: `Bearer ${token}` }, body: { usd_cents: 100 } });
    await signed(env, { type: 'issuing_authorization.created', data: { object: { id: 'iauth_4', status: 'pending', card: { id: second.card.id }, amount: 150, merchant_data: { category: 'computer_software_stores' } } } });
    expect(stripe.decisions).toContain('iauth_4:decline');
    const third = await requestJson(env, '/v1/rails/card', { headers: { authorization: `Bearer ${token}` }, body: { usd_cents: 100 } });
    await signed(env, { type: 'issuing_authorization.created', data: { object: { id: 'iauth_5', status: 'pending', card: { id: third.card.id }, amount: 90, merchant_data: { category: 'computer_software_stores' } } } });
    expect(stripe.decisions).toContain('iauth_5:approve');
    // The issuer's own controls declined before asking: a closed, unapproved `created` on an unused card
    // releases its reservation and retires it.
    const fourth = await requestJson(env, '/v1/rails/card', { headers: { authorization: `Bearer ${token}` }, body: { usd_cents: 100 } });
    expect((await requestJson(env, '/v1/accounts/acme%2Fapp')).reserved_usd_cents).toBe(100 + 100); // the approved pending third, and this one
    expect(await (await signed(env, { type: 'issuing_authorization.created', data: { object: { id: 'iauth_6', status: 'closed', approved: false, card: { id: fourth.card.id }, amount: 40, merchant_data: { category: 'bakeries' } } } })).json()).toEqual({ ok: true, declined: 'by the issuer' });
    expect((await requestJson(env, '/v1/accounts/acme%2Fapp')).reserved_usd_cents).toBe(100);
    expect(stripe.cards[fourth.card.id].status).toBe('canceled');
    expect((await request(env, '/webhooks/stripe', { method: 'POST', headers: { 'stripe-signature': 't=1,v1=00' }, body: '{}' })).status).toBe(401);
    // The rail off by config, and no issuer configured.
    await withRails(env, 'rails:\n  card:\n    max_usd_cents: 0\n');
    expect((await request(env, '/v1/rails/card', { headers: { authorization: `Bearer ${token}` }, body: { usd_cents: 10 } })).status).toBe(403);
    env.STRIPE_SECRET_KEY = undefined;
    expect((await request(env, '/v1/rails/card', { headers: { authorization: `Bearer ${token}` }, body: { usd_cents: 10 } })).status).toBe(503);
  });

  test('a partner charge settles now within the owner\'s bounds, as a partner record; the balance and the daily rail still bind', async () => {
    const env = useEnv(testEnv());
    await fund(env, 'acme/app', 100);
    await withRails(env);
    const { token } = await mintKey(env);
    const charge = (body: unknown) => request(env, '/v1/rails/partner', { headers: { authorization: `Bearer ${token}` }, body });
    expect((await charge({ partner: 'nobody', usd_cents: 10 })).status).toBe(403);
    expect((await charge({ partner: 'browserless', usd_cents: 500 })).status).toBe(403);
    const ok = await charge({ partner: 'browserless', usd_cents: 30, unit: 'minute', quantity: 3, reference: 'sess-1' });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, rail: 'partner', partner: 'browserless', usd_cents: 30, balance_usd_cents: 70 });
    const trail = await requestJson(env, '/v1/accounts/acme%2Fapp/calls');
    expect(trail.calls[0]).toMatchObject({ rail: 'partner', partner: 'browserless', unit: 'minute', quantity: 3, reference: 'sess-1', usd_cents: 30 });
    await charge({ partner: 'browserless', usd_cents: 60 });
    expect((await charge({ partner: 'browserless', usd_cents: 60 })).status).toBe(402); // the balance
    expect((await requestJson(env, '/v1/accounts/acme%2Fapp')).balance_usd_cents).toBe(10);
  });
});
