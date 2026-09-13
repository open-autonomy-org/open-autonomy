import { describe, expect, test } from 'bun:test';
import { base64url, hmac } from '@open-autonomy/backend';
import { admin, fund, github, mintKey, polar, request, requestJson, testEnv, useEnv } from './env.ts';

const ce = (type: string, subject: string, data: unknown) => ({ specversion: '1.0', id: crypto.randomUUID(), source: 'test', type: `org.open-autonomy.${type}`, subject, time: new Date().toISOString(), datacontenttype: 'application/json', data });
const sign = async (secret: string, payload: string): Promise<string> => {
  const [body] = payload.split('.');
  return `${body}.${await hmac(secret, body)}`;
};

describe('the open platform, one smoke test per door', () => {
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
    // Self-funding: a credit pack bought through Polar lands on the funder's books; the org matches a tenth from its
    // grants account as bonus credits, which go only to projects the funder does not own.
    await requestJson(env, '/admin/accounts/open-autonomy-org%2Fgrants/mint', { headers: admin, method: 'POST', body: { amount_usd_cents: 1000, key: 'org-1' } });
    const opened = await requestJson(env, '/v1/patrons/checkout', { method: 'POST', body: { account: '@pat', tier: 0, interval: 'once' } });
    polar.checkouts[opened.checkout_id].status = 'confirmed';
    polar.orders.push({ id: 'ord_pat', paid: true, total_amount: 1000, checkout_id: opened.checkout_id, customer_id: 'cus_1', billing_reason: 'purchase' });
    const pat = await requestJson(env, '/v1/funders/pat');
    expect(pat).toMatchObject({ credits_usd_cents: 200 + 1000 + 100, bonus_usd_cents: 100 });
    github.repos['pat/app'] = { description: 'mine' };
    await fund(env, 'pat/app', 1);
    expect((await requestJson(env, '/v1/grants/give', { method: 'POST', headers: { authorization: `Bearer ${give}` }, body: { to: 'pat/app', usd_cents: 1250 } })).error).toBe('bonus_only_for_others');
    expect((await requestJson(env, '/v1/grants/give', { method: 'POST', headers: { authorization: `Bearer ${give}` }, body: { to: 'acme/app', usd_cents: 1300 } })).ok).toBe(true);
  });


  test('the giving session checks OAuth state and its signature and can only give once', async () => {
    const env = useEnv(testEnv());
    await requestJson(env, '/admin/accounts/acme%2Fapp/profile', { headers: admin, body: { profile: { synced_at: new Date().toISOString() } } });
    await requestJson(env, '/admin/accounts/%40octocat/mint', { headers: admin, body: { amount_usd_cents: 500, key: 'oauth-credits' } });
    expect(await (await request(env, '/give')).text()).toContain('Sign in with GitHub');
    const login = await request(env, '/give/login');
    const stateCookie = login.headers.get('set-cookie')!.split(';')[0];
    const authorize = new URL(login.headers.get('location')!);
    expect(authorize.searchParams.has('scope')).toBe(false);
    expect((await request(env, '/give/callback?code=ok&state=wrong', { headers: { cookie: stateCookie } })).status).toBe(401);
    const callback = await request(env, `/give/callback?code=ok&state=${authorize.searchParams.get('state')}`, { headers: { cookie: stateCookie } });
    const sessionCookie = callback.headers.get('set-cookie')!.split(';')[0];
    const page = await (await request(env, '/give', { headers: { cookie: sessionCookie } })).text();
    const attempt = page.match(/name="key" value="([^"]+)"/)?.[1];
    expect(page).toContain('Signed in as @octocat');
    expect(attempt).toBeTruthy();
    const form = new URLSearchParams({ key: attempt!, source: '@octocat', to: 'acme/app', usd_cents: '300', for: 'model', note: 'OAuth gift' }).toString();
    const formHeaders = { cookie: sessionCookie, 'content-type': 'application/x-www-form-urlencoded' };
    expect((await request(env, '/give', { method: 'POST', headers: formHeaders, body: form })).status).toBe(200);
    expect((await request(env, '/give', { method: 'POST', headers: formHeaders, body: form })).status).toBe(200);
    expect((await requestJson(env, '/v1/accounts/acme%2Fapp')).balance_usd_cents).toBe(300);
    expect((await requestJson(env, '/v1/funders/octocat')).given).toHaveLength(1);
    await requestJson(env, '/admin/accounts/open-autonomy-org%2Fgrants/mint', { headers: admin, body: { amount_usd_cents: 100, key: 'sponsors-pool' } });
    const poolForm = new URLSearchParams({ key: crypto.randomUUID(), source: 'open-autonomy-org/grants', to: 'acme/app', usd_cents: '100', for: 'unrestricted' }).toString();
    expect((await request(env, '/give', { method: 'POST', headers: formHeaders, body: poolForm })).status).toBe(200);
    expect(await (await request(env, '/give', { headers: { cookie: sessionCookie } })).text()).toContain('passed on by @octocat');
    expect((await request(env, '/v1/chat/completions', { headers: { cookie: sessionCookie }, body: { model: 'zai/glm-5.3-flash', messages: [] } })).status).toBe(401);
    expect((await request(env, '/v1/agent/roadmap', { headers: { cookie: sessionCookie }, body: { source: 'file', roadmap: { schema: 'open-autonomy.timeline.v1', items: [] } } })).status).toBe(401);
    const [cookieName, signed] = sessionCookie.split('=');
    const forged = `${cookieName}=${signed.slice(0, -1)}${signed.endsWith('A') ? 'B' : 'A'}`;
    expect(await (await request(env, '/give', { headers: { cookie: forged } })).text()).toContain('Sign in with GitHub');
    const expiredBody = base64url(new TextEncoder().encode(JSON.stringify({ login: 'octocat', exp: 1, grants_admin: true })));
    const expired = `oa_give_session=${expiredBody}.${await hmac(env.GIVE_SESSION_HMAC_SECRET!, expiredBody)}`;
    expect((await request(env, '/give', { method: 'POST', headers: { cookie: expired, 'content-type': 'application/x-www-form-urlencoded' }, body: form })).status).toBe(401);
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
    expect((await requestJson(env, '/v1/accounts/acme%2Fapp')).balance_usd_cents).toBe(600);
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


  test('the explore page lists a synced project with its patrons, and the project page carries the tiers', async () => {
    const env = useEnv(testEnv());
    await fund(env, 'acme/app', 500);
    github.repos['acme/app'] = { description: 'A todo list that builds itself', html_url: 'https://github.com/acme/app' };
    await requestJson(env, '/admin/accounts/acme%2Fapp/sync', { headers: admin, method: 'POST' });
    await mintKey(env);
    expect(await (await request(env, '/')).text()).toContain('A todo list that builds itself');
    expect(page).toContain('Become a patron');
    expect(page).toContain('patrons');
  });
  test('a private repository never reaches a page here: sync refuses it, the backend alone admits it', async () => {
    const env = useEnv(testEnv());
    await fund(env, 'acme/secret', 100);
    github.repos['acme/secret'] = { description: 'Not for the public', html_url: 'https://github.com/acme/secret', private: true };
    expect((await requestJson(env, '/admin/accounts/acme%2Fsecret/sync', { headers: admin, method: 'POST' })).ok).toBe(false);
    expect(await (await request(env, '/')).text()).not.toContain('Not for the public');
  });
});
