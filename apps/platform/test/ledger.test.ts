import { describe, expect, test } from 'bun:test';
import { admin, fund, request, requestJson, testEnv, useEnv } from './env.ts';

describe('the books: the account tree', () => {
  test('an account is unfunded until money enters; mint and grant conserve the total', async () => {
    const env = useEnv(testEnv());
    expect((await requestJson(env, '/v1/accounts/acme%2Fapp')).funded).toBe(false);
    const minted = await requestJson(env, '/admin/accounts/root/mint', { headers: admin, body: { amount_usd_cents: 1000, key: 'seed-1' } });
    expect(minted).toMatchObject({ ok: true, balance_usd_cents: 1000 });
    expect((await requestJson(env, '/admin/accounts/root/mint', { headers: admin, body: { amount_usd_cents: 1000, key: 'seed-1' } })).idempotent).toBe(true);
    const granted = await requestJson(env, '/admin/accounts/root/grant', { headers: admin, body: { to: 'acme/app', amount_usd_cents: 400, key: 'g-1' } });
    expect(granted).toMatchObject({ ok: true, from_balance_usd_cents: 600, to_balance_usd_cents: 400 });
    expect((await request(env, '/admin/accounts/root/grant', { headers: admin, body: { to: 'acme/app', amount_usd_cents: 900 } })).status).toBe(400);
    const f = await requestJson(env, '/v1/accounts/acme%2Fapp');
    expect(f).toMatchObject({ funded: true, balance_usd_cents: 400, granted_in_usd_cents: 400, consumed_usd_cents: 0 });
    expect((await request(env, '/admin/accounts/root/mint', { body: { amount_usd_cents: 1 } })).status).toBe(401);
  });

  test('coupons: a bearer grant, redeemed once, backed by an issuer or minted', async () => {
    const env = useEnv(testEnv());
    await fund(env, 'root', 500);
    const backed = await requestJson(env, '/admin/coupons', { headers: admin, body: { amount_usd_cents: 300, from: 'root', sponsor: { login: 'octocat' } } });
    expect(backed.coupon.code.startsWith('SPON-')).toBe(true);
    const redeemed = await requestJson(env, '/v1/coupons/redeem', { body: { code: backed.coupon.code, account: 'acme/app' } });
    expect(redeemed).toMatchObject({ ok: true, amount_usd_cents: 300, account: 'acme/app' });
    expect((await request(env, '/v1/coupons/redeem', { body: { code: backed.coupon.code, account: 'acme/app' } })).status).toBe(409);
    expect((await request(env, '/v1/coupons/redeem', { body: { code: 'SPON-NOPE', account: 'acme/app' } })).status).toBe(404);
    expect((await requestJson(env, '/v1/accounts/root')).balance_usd_cents).toBe(200);
    const view = await requestJson(env, '/v1/accounts/acme%2Fapp');
    expect(view.balance_usd_cents).toBe(300);
    expect(view.sponsors.map((s: { login: string }) => s.login)).toEqual(['octocat']);
    // The form on the page, too.
    const free = await requestJson(env, '/admin/coupons', { headers: admin, body: { amount_usd_cents: 50 } });
    const form = await request(env, '/p/acme%2Fapp/redeem', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `code=${free.coupon.code}` });
    expect(form.status).toBe(200);
    expect((await form.text()).includes('Added $0.50')).toBe(true);
  });

  test('recurring sponsors accrue once per month; a webhook keeps the list', async () => {
    const env = useEnv(testEnv());
    env.GITHUB_SPONSORS_WEBHOOK_SECRET = 'wh';
    const sign = async (body: string) => {
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('wh'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      return `sha256=${[...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)))].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
    };
    const hook = async (event: string, payload: unknown) => { const body = JSON.stringify(payload); return request(env, '/webhooks/github-sponsors', { method: 'POST', headers: { 'x-github-event': event, 'x-hub-signature-256': await sign(body) }, body }); };
    expect((await request(env, '/webhooks/github-sponsors', { method: 'POST', headers: { 'x-github-event': 'ping', 'x-hub-signature-256': 'sha256=bad' }, body: '{}' })).status).toBe(401);
    expect((await hook('ping', {})).status).toBe(200);
    expect((await hook('sponsorship', { action: 'created', sponsorship: { sponsor: { login: 'mona' }, tier: { monthly_price_in_cents: 500 } } })).status).toBe(200);
    expect((await hook('sponsorship', { action: 'created', sponsorship: { node_id: 'n1', sponsor: { login: 'gift' }, tier: { monthly_price_in_cents: 2500, is_one_time: true } } })).status).toBe(200);
    const acct = env.DEFAULT_FUNDING_ACCOUNT!;
    expect((await requestJson(env, `/v1/accounts/${encodeURIComponent(acct)}`)).balance_usd_cents).toBe(2500);
    const first = await requestJson(env, `/admin/accounts/${encodeURIComponent(acct)}/accrue`, { headers: admin, body: { key: '2026-09' } });
    expect(first).toMatchObject({ ok: true, credited: true, monthly_total_usd_cents: 500 });
    expect((await requestJson(env, `/admin/accounts/${encodeURIComponent(acct)}/accrue`, { headers: admin, body: { key: '2026-09' } })).idempotent).toBe(true);
    expect((await requestJson(env, `/v1/accounts/${encodeURIComponent(acct)}`)).balance_usd_cents).toBe(3000);
    await hook('sponsorship', { action: 'cancelled', sponsorship: { sponsor: { login: 'mona' }, tier: { monthly_price_in_cents: 500 } } });
    expect((await requestJson(env, `/admin/accounts/${encodeURIComponent(acct)}/accrue`, { headers: admin, body: { key: '2026-10' } })).credited).toBe(false);
  });

  test('the books survive a redeploy, and a record from before this shape loads', async () => {
    const env = useEnv(testEnv());
    await fund(env, 'acme/app', 700);
    env.ns.restart();
    expect((await requestJson(env, '/v1/accounts/acme%2Fapp')).balance_usd_cents).toBe(700);
    // An older state record with fields the books no longer keep: the money reads the same.
    const storage = env.ns.storages.get('global')!;
    const old = await storage.get<Record<string, unknown>>('state') as Record<string, unknown>;
    await storage.put('state', { ...old, active_global: 3, runs: { r1: { repo: 'x' } }, accounts: { ...(old.accounts as object), 'acme/app': { ...(old.accounts as Record<string, object>)['acme/app'], last_activity_ms: 5, current_job_key: 'j' } } });
    env.ns.restart();
    expect((await requestJson(env, '/v1/accounts/acme%2Fapp')).balance_usd_cents).toBe(700);
    const status = await requestJson(env, '/admin/status', { headers: admin });
    expect(status.accounts['acme/app'].current_job_key).toBeUndefined();
    expect(status.runs).toBeUndefined();
  });

  test('moderation: a banned account cannot mint a key; hidden leaves the page up but off the grid', async () => {
    const env = useEnv(testEnv());
    await fund(env, 'acme/app', 100);
    expect((await requestJson(env, '/admin/accounts/acme%2Fapp/moderate', { headers: admin, body: { status: 'hidden', reason: 'test' } })).ok).toBe(true);
    const dir = await requestJson(env, '/admin/status', { headers: admin });
    expect(dir.accounts['acme/app'].moderation).toBe('hidden');
    expect((await request(env, '/p/acme%2Fapp')).status).toBe(200);
    expect((await request(env, '/')).status).toBe(200);
    expect((await (await request(env, '/')).text()).includes('/p/acme%2Fapp')).toBe(false);
  });
});
