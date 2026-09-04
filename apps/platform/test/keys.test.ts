import { describe, expect, test } from 'bun:test';
import { admin, fund, github, mintKey, request, requestJson, signKey, testEnv, useEnv } from './env.ts';

const call = (env: ReturnType<typeof testEnv>, token: string, model = 'zai/glm-5.3-flash') => request(env, '/v1/chat/completions', { headers: { authorization: `Bearer ${token}` }, body: { model, messages: [{ role: 'user', content: 'hi' }] } });

describe('keys: minted by claim file, verified by signature and expiry, revoked through the registry', () => {
  test('the claim file at HEAD mints; a wrong or missing claim refuses', async () => {
    const env = useEnv(testEnv());
    const challenge = await requestJson(env, '/v1/keys/challenge?account=acme%2Fapp');
    expect(challenge).toMatchObject({ ok: true, account: 'acme/app', file: '.open-autonomy-claim' });
    expect(challenge.claim.startsWith('oa-claim-')).toBe(true);
    expect((await request(env, '/v1/keys/mint', { body: { account: 'acme/app' } })).status).toBe(403); // no file yet
    github.files['acme/app:.open-autonomy-claim'] = 'oa-claim-wrong';
    expect((await request(env, '/v1/keys/mint', { body: { account: 'acme/app' } })).status).toBe(403);
    github.files['acme/app:.open-autonomy-claim'] = `${challenge.claim}\n`;
    const minted = await requestJson(env, '/v1/keys/mint', { body: { account: 'acme/app' } });
    expect(minted.ok).toBe(true);
    expect(minted.key).toMatchObject({ account: 'acme/app', models: ['zai/glm-5.3-flash'] });
    expect(minted.token.split('.').length).toBe(2);
    // Yesterday's claim still mints (a commit near midnight).
    expect((await request(env, '/v1/keys/challenge?account=nope')).status).toBe(400);
  });

  test('a key spends once the account is funded, and only its own models', async () => {
    const env = useEnv(testEnv());
    const { token } = await mintKey(env);
    expect((await call(env, token)).status).toBe(402); // unfunded
    await fund(env, 'acme/app', 100);
    expect((await call(env, token)).status).toBe(200);
    expect((await call(env, token, 'gpt-4o')).status).toBe(403);
    expect((await call(env, 'not.akey')).status).toBe(401);
    expect((await request(env, '/v1/chat/completions', { body: { model: 'x' } })).status).toBe(401);
  });

  test('a key survives a redeploy and a lost registry; it dies only by expiry, revocation or rotation grace', async () => {
    const env = useEnv(testEnv());
    await fund(env, 'acme/app', 100);
    const { token, claims } = await mintKey(env);
    env.ns.restart();
    expect((await call(env, token)).status).toBe(200);
    // The registry forgotten entirely (the books reset): signature + expiry still carry the key.
    const storage = env.ns.storages.get('global')!;
    const state = await storage.get<Record<string, unknown>>('state') as Record<string, unknown>;
    await storage.put('state', { ...state, keys: {} });
    env.ns.restart();
    expect((await call(env, token)).status).toBe(200);
    // Expired by its own claim.
    const expired = await signKey(env, { ...claims, kid: 'key_old', exp: new Date(Date.now() - 1000).toISOString() });
    expect((await call(env, expired)).status).toBe(401);
    // Forged: a different secret.
    const forged = await signKey({ ...env, AGENT_PROXY_HMAC_SECRET: 'other' }, claims);
    expect((await call(env, forged)).status).toBe(401);
    // Revoked through the registry.
    const again = await mintKey(env);
    expect((await requestJson(env, `/admin/keys/${again.claims.kid}/revoke`, { headers: admin, method: 'POST' })).ok).toBe(true);
    expect((await call(env, again.token)).status).toBe(401);
    expect((await request(env, '/admin/keys/nope/revoke', { headers: admin, method: 'POST' })).status).toBe(404);
  });

  test('rotate: a fresh key for the same account; the old one lives one more day; three active at most', async () => {
    const env = useEnv(testEnv());
    await fund(env, 'acme/app', 100);
    const first = await mintKey(env);
    const rotated = await requestJson(env, '/v1/keys/rotate', { method: 'POST', headers: { authorization: `Bearer ${first.token}` } });
    expect(rotated.ok).toBe(true);
    expect(rotated.key.account).toBe('acme/app');
    expect(rotated.previous.kid).toBe(first.claims.kid);
    expect(Date.parse(rotated.previous.exp) - Date.now()).toBeLessThan(25 * 3600 * 1000);
    expect((await call(env, first.token)).status).toBe(200); // still in grace
    expect((await call(env, rotated.token)).status).toBe(200);
    const listed = await requestJson(env, '/v1/keys', { headers: { authorization: `Bearer ${rotated.token}` } });
    expect(listed.keys.length).toBe(2);
    // The grace over: the registry's shortened expiry refuses the old key though its own claim is fine.
    const storage = env.ns.storages.get('global')!;
    const state = await storage.get<{ keys: Record<string, { exp: string }> }>('state')!;
    state!.keys[first.claims.kid].exp = new Date(Date.now() - 1000).toISOString();
    await storage.put('state', state);
    env.ns.restart();
    expect((await call(env, first.token)).status).toBe(401);
    // At most three active keys per account: the expired one no longer counts.
    await mintKey(env); await mintKey(env);
    expect((await request(env, '/v1/keys/mint', { body: { account: 'acme/app' } })).status).toBe(429);
  });
});
