// Credential authority invariants, exercised through the worker and its real ledger implementation.
// These cases require no vendor calls; signatures and registry persistence are real, storage is in memory.
import { expect, test } from 'bun:test';
import { signKey } from '../src/keys.ts';
import { LedgerClient } from '../src/ledger.ts';
import type { KeyClaims } from '../src/types.ts';
import { request, requestJson, testEnv, useEnv } from './env.ts';

const claims = (account = 'acme/app'): KeyClaims => ({ kid: `key_${crypto.randomUUID()}`, account, models: ['allowed/model'], scopes: ['narrate'], iat: new Date().toISOString(), exp: new Date(Date.now() + 3600_000).toISOString() });
const auth = (token: string) => ({ authorization: `Bearer ${token}` });

test('rotation at capacity replaces one slot, preserves authority and grace, and cannot fork on concurrent retry', async () => {
  const env = useEnv(testEnv()); const ledger = new LedgerClient(env.LIMITS);
  const original = claims();
  const peers = [claims(), claims()];
  for (const key of [original, ...peers]) expect((await ledger.keyRegister(key)).ok).toBe(true);
  const token = await signKey(env, original);
  const responses = await Promise.all([0, 1].map(() => request(env, '/v1/keys/rotate', { headers: auth(token), body: { models: ['anything'], scopes: ['pay'] } })));
  expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
  const rotated = await responses.find((r) => r.status === 200)!.json() as any;
  expect(rotated.key).toMatchObject({ account: original.account, models: original.models, scopes: original.scopes });
  expect(rotated.previous.exp).toBe(original.exp); // default grace must not extend this shorter-lived key.
  expect((await ledger.keys(original.account)).keys).toHaveLength(4);
  for (const peer of peers) expect((await requestJson(env, '/v1/keys/rotate', { headers: auth(await signKey(env, peer)), body: {} })).ok).toBe(true);
  expect((await ledger.keys(original.account)).keys).toHaveLength(6); // one predecessor per slot, never another generation during grace.
  expect((await ledger.keyRegister(claims())).error).toBe('key_limit_reached');
  expect((await request(env, '/v1/keys', { headers: auth(token) })).status).toBe(200);
  expect((await requestJson(env, '/v1/keys/rotate', { headers: auth(rotated.token), body: {} })).error.code).toBe('rotation_grace_pending');
  env.ns.restart();
  expect((await request(env, '/v1/keys', { headers: auth(rotated.token) })).status).toBe(200);
  expect((await requestJson(env, '/v1/keys/rotate', { headers: auth(token), body: {} })).error.code).toBe('key_already_rotated');
  await ledger.keyExpire(original.kid, new Date(Date.now() - 1000).toISOString());
  expect((await request(env, '/v1/keys', { headers: auth(token) })).status).toBe(401);
  const next = await requestJson(env, '/v1/keys/rotate', { headers: auth(rotated.token), body: { grace_seconds: 0 } });
  expect(next.ok).toBe(true);
  expect((await request(env, '/v1/keys', { headers: auth(rotated.token) })).status).toBe(401);
  expect((await request(env, '/v1/keys', { headers: auth(next.token) })).status).toBe(200);
  expect((await ledger.keyRegister(claims())).error).toBe('key_limit_reached');
});

test('revoking a successor cannot free its still-live predecessor slot, and a revoked key cannot rotate', async () => {
  const env = useEnv(testEnv()); const ledger = new LedgerClient(env.LIMITS);
  const original = claims();
  for (const key of [original, claims(), claims()]) await ledger.keyRegister(key);
  const token = await signKey(env, original);
  const rotated = await requestJson(env, '/v1/keys/rotate', { headers: auth(token), body: {} });
  expect(rotated.ok).toBe(true);
  await ledger.keyRevoke(rotated.key.kid);
  expect((await request(env, '/v1/keys/rotate', { headers: auth(rotated.token), body: {} })).status).toBe(401);
  expect((await ledger.keyRegister(claims())).error).toBe('key_limit_reached');
  expect((await request(env, '/v1/keys', { headers: auth(token) })).status).toBe(200);
  // The ledger also refuses a caller authenticated just before revocation.
  await ledger.keyRevoke(original.kid);
  expect((await ledger.keyRotate(original, claims(), new Date().toISOString())).error).toBe('key_revoked');
  expect((await ledger.keys(original.account)).keys).toHaveLength(4);
  expect((await ledger.keyRegister(claims())).ok).toBe(true);
});

test('legacy signed keys rotate only into an available slot and gain an enforced expiry record', async () => {
  const env = useEnv(testEnv()); const ledger = new LedgerClient(env.LIMITS);
  const legacy = claims(); const token = await signKey(env, legacy);
  for (let i = 0; i < 3; i++) await ledger.keyRegister(claims());
  expect((await request(env, '/v1/keys/rotate', { headers: auth(token), body: {} })).status).toBe(429);
  expect((await ledger.keys(legacy.account)).keys).toHaveLength(3);
  const other = claims('other/app'); const otherToken = await signKey(env, other);
  const rotated = await requestJson(env, '/v1/keys/rotate', { headers: auth(otherToken), body: { grace_seconds: 0 } });
  expect(rotated.ok).toBe(true);
  expect((await request(env, '/v1/keys', { headers: auth(otherToken) })).status).toBe(401);
  expect((await request(env, '/v1/keys', { headers: auth(rotated.token) })).status).toBe(200);
});
