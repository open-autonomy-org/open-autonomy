import { describe, expect, test } from 'bun:test';
import worker from '../src/index.js';
import { LimitLedger, LimitLedgerClient, type LimitConfig, type SupplierAuth } from '../src/limit-ledger.js';
import { RunBudget } from '../src/run-budget.js';
import { hashSupplierSecret, parseSupplierToken } from '../src/supplier.js';
import type { Env } from '../src/types.js';
import { MemoryDurableObjectNamespace } from './memory-do.js';

const ctx: ExecutionContext = { waitUntil() {} };

function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    AGENT_PROXY_ADMIN_TOKEN: 'admin',
    AGENT_PROXY_HMAC_SECRET: 'secret',
    DEFAULT_FUNDING_ACCOUNT: 'volter/twin',
    DEFAULT_SPONSOR_ACCOUNT: 'volter/twin',
    DEFAULT_MAX_USD_CENTS: '500',
    DEFAULT_MAX_REQUESTS: '200',
    DEFAULT_EXPIRES_SECONDS: '7200',
    MAX_BODY_BYTES: '1048576',
    MODEL_PRICES_JSON: '{}',
    RUNS: new MemoryDurableObjectNamespace((state) => new RunBudget(state)),
    LIMITS: new MemoryDurableObjectNamespace((state) => new LimitLedger(state)),
    ...overrides,
  };
}

async function request(env: Env, path: string, init: { method?: string; headers?: Record<string, string>; body?: unknown } = {}) {
  return worker.fetch(
    new Request(`https://proxy.test${path}`, {
      method: init.method ?? 'GET',
      headers: { 'content-type': 'application/json', ...init.headers },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }),
    env,
    ctx,
  );
}

async function requestJson(env: Env, path: string, init: { method?: string; headers?: Record<string, string>; body?: unknown } = {}) {
  const res = await request(env, path, init);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await res.json() as any;
}

const admin = { 'x-admin-token': 'admin' };

async function createSupplier(env: Env, over: { id?: string; name?: string; categories?: string[] } = {}): Promise<{ id: string; token: string }> {
  const created = await requestJson(env, '/admin/suppliers', {
    method: 'POST',
    headers: admin,
    body: { id: over.id, name: over.name ?? 'Machine Host Co', categories: over.categories ?? ['machine-seconds', 'procurement'] },
  });
  expect(created.ok).toBe(true);
  return { id: created.supplier.id, token: created.token };
}

async function fund(env: Env, account: string, cents: number): Promise<void> {
  const res = await requestJson(env, `/admin/accounts/${encodeURIComponent(account)}/mint`, {
    method: 'POST',
    headers: admin,
    body: { amount_usd_cents: cents },
  });
  expect(res.ok).toBe(true);
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

describe('supplier registry (admin)', () => {
  test('create returns the token exactly once; list never exposes secrets', async () => {
    const env = testEnv();
    const created = await requestJson(env, '/admin/suppliers', {
      method: 'POST',
      headers: admin,
      body: { id: 'acme-machines', name: 'ACME Machines', url: 'https://acme.example', categories: ['machine-seconds'] },
    });
    expect(created.ok).toBe(true);
    expect(created.token.startsWith('sup.acme-machines.')).toBe(true);
    expect(created.supplier.secret_hash).toBeUndefined();

    const list = await requestJson(env, '/admin/suppliers', { headers: admin });
    expect(list.ok).toBe(true);
    expect(list.suppliers.length).toBe(1);
    expect(list.suppliers[0].id).toBe('acme-machines');
    expect(list.suppliers[0].secret_hash).toBeUndefined();
    expect(JSON.stringify(list)).not.toContain(created.token.split('.')[2]);
  });

  test('registry admin routes refuse without the admin token', async () => {
    const env = testEnv();
    expect((await request(env, '/admin/suppliers')).status).toBe(401);
    expect((await request(env, '/admin/suppliers', { method: 'POST', body: { name: 'x', categories: ['other'] } })).status).toBe(401);
  });

  test('duplicate ids, bad ids, and unknown categories are refused', async () => {
    const env = testEnv();
    await createSupplier(env, { id: 'acme-machines' });
    const dup = await request(env, '/admin/suppliers', { method: 'POST', headers: admin, body: { id: 'acme-machines', name: 'x', categories: ['other'] } });
    expect(dup.status).toBe(409);
    const badId = await request(env, '/admin/suppliers', { method: 'POST', headers: admin, body: { id: 'Not A Slug!', name: 'x', categories: ['other'] } });
    expect(badId.status).toBe(400);
    const reserved = await request(env, '/admin/suppliers', { method: 'POST', headers: admin, body: { id: 'model-proxy', name: 'imposter', categories: ['model'] } });
    expect(reserved.status).toBe(400);
    const badCat = await request(env, '/admin/suppliers', { method: 'POST', headers: admin, body: { name: 'x', categories: ['bribes'] } });
    expect(badCat.status).toBe(400);
  });

  test('rotate invalidates the old token; revoke invalidates the supplier', async () => {
    const env = testEnv();
    const { id, token } = await createSupplier(env, { id: 'acme-machines' });
    await fund(env, 'acme/app', 10000);

    const rotated = await requestJson(env, `/admin/suppliers/${id}/rotate`, { method: 'POST', headers: admin });
    expect(rotated.ok).toBe(true);
    expect(rotated.token).not.toBe(token);

    const oldRes = await request(env, '/v1/supplier/consume', {
      method: 'POST', headers: bearer(token),
      body: { account: 'acme/app', amount_usd_cents: 100, category: 'machine-seconds', item: 'vm', key: 'k1' },
    });
    expect(oldRes.status).toBe(401);

    const newRes = await request(env, '/v1/supplier/consume', {
      method: 'POST', headers: bearer(rotated.token),
      body: { account: 'acme/app', amount_usd_cents: 100, category: 'machine-seconds', item: 'vm', key: 'k1' },
    });
    expect(newRes.status).toBe(200);

    const revoked = await requestJson(env, `/admin/suppliers/${id}/revoke`, { method: 'POST', headers: admin });
    expect(revoked.ok).toBe(true);
    const afterRevoke = await request(env, '/v1/supplier/consume', {
      method: 'POST', headers: bearer(rotated.token),
      body: { account: 'acme/app', amount_usd_cents: 100, category: 'machine-seconds', item: 'vm', key: 'k2' },
    });
    expect(afterRevoke.status).toBe(401);
  });
});

describe('supplier auth', () => {
  test('a garbage token, a wrong secret, and an unknown supplier are all 401', async () => {
    const env = testEnv();
    const { token } = await createSupplier(env, { id: 'acme-machines' });
    const body = { account: 'acme/app', amount_usd_cents: 100, category: 'machine-seconds', item: 'vm', key: 'k1' };

    expect((await request(env, '/v1/supplier/consume', { method: 'POST', body })).status).toBe(401); // no token
    expect((await request(env, '/v1/supplier/consume', { method: 'POST', headers: bearer('not-a-supplier-token'), body })).status).toBe(401);
    expect((await request(env, '/v1/supplier/consume', { method: 'POST', headers: bearer('sup.acme-machines.wrongsecret'), body })).status).toBe(401);
    expect((await request(env, '/v1/supplier/consume', { method: 'POST', headers: bearer(token.replace('acme-machines', 'ghost-supplier')), body })).status).toBe(401);
    // a run-model token is not a supplier token
    expect((await request(env, '/v1/supplier/reserve', { method: 'POST', headers: bearer('abc.def'), body })).status).toBe(401);
  });
});

describe('itemized consume', () => {
  test('debits the account, itemizes the flow, and is idempotent on key', async () => {
    const env = testEnv();
    const { token } = await createSupplier(env, { id: 'acme-machines' });
    await fund(env, 'acme/app', 10000);

    const body = {
      account: 'acme/app', amount_usd_cents: 750, category: 'machine-seconds',
      item: 'vm-large × 512s', job_ref: 'job-42', receipt_ref: 'rcpt-9', key: 'debit-1',
    };
    const first = await requestJson(env, '/v1/supplier/consume', { method: 'POST', headers: bearer(token), body });
    expect(first.ok).toBe(true);
    expect(first.balance_usd_cents).toBe(9250);

    const replay = await requestJson(env, '/v1/supplier/consume', { method: 'POST', headers: bearer(token), body });
    expect(replay.ok).toBe(true);
    expect(replay.idempotent).toBe(true);
    expect(replay.balance_usd_cents).toBe(9250); // not double-debited

    const snap = await requestJson(env, '/v1/accounts/acme%2Fapp');
    expect(snap.balance_usd_cents).toBe(9250);
    expect(snap.consumed_usd_cents).toBe(750);
    expect(snap.consumed_by_category['machine-seconds']).toBe(750);

    const status = await requestJson(env, '/admin/limits/status', { headers: admin });
    expect(status.accounts['acme/app'].consumed_by_category['machine-seconds']).toBe(750);
  });

  test('a category outside the supplier grant is refused (403)', async () => {
    const env = testEnv();
    const { token } = await createSupplier(env, { id: 'acme-machines', categories: ['machine-seconds'] });
    await fund(env, 'acme/app', 10000);
    const res = await request(env, '/v1/supplier/consume', {
      method: 'POST', headers: bearer(token),
      body: { account: 'acme/app', amount_usd_cents: 100, category: 'labor', item: 'review', key: 'k1' },
    });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe('category_not_allowed');
  });

  test('with enforcement on, an unfunded account refuses the debit (402); with it off, the rollout semantics allow it', async () => {
    const enforced = testEnv({ ENFORCE_ACCOUNT_BALANCE: 'true' });
    const { token } = await createSupplier(enforced, { id: 'acme-machines' });
    await fund(enforced, 'acme/app', 500);
    const refused = await request(enforced, '/v1/supplier/consume', {
      method: 'POST', headers: bearer(token),
      body: { account: 'acme/app', amount_usd_cents: 600, category: 'machine-seconds', item: 'vm', key: 'k1' },
    });
    expect(refused.status).toBe(402);
    expect(((await refused.json()) as { error: string }).error).toBe('account_balance_exhausted');
    // a refused attempt does not burn the idempotency key — a retry after funding succeeds
    await fund(enforced, 'acme/app', 500);
    const retry = await requestJson(enforced, '/v1/supplier/consume', {
      method: 'POST', headers: bearer(token),
      body: { account: 'acme/app', amount_usd_cents: 600, category: 'machine-seconds', item: 'vm', key: 'k1' },
    });
    expect(retry.ok).toBe(true);
    expect(retry.idempotent).toBeUndefined();

    const relaxed = testEnv();
    const s2 = await createSupplier(relaxed, { id: 'acme-machines' });
    const allowed = await requestJson(relaxed, '/v1/supplier/consume', {
      method: 'POST', headers: bearer(s2.token),
      body: { account: 'acme/app', amount_usd_cents: 600, category: 'machine-seconds', item: 'vm', key: 'k1' },
    });
    expect(allowed.ok).toBe(true); // ENFORCE_ACCOUNT_BALANCE=false: bootstrap-phase semantics
  });

  test('a banned account is a hard stop regardless of balance', async () => {
    const env = testEnv();
    const { token } = await createSupplier(env, { id: 'acme-machines' });
    await fund(env, 'acme/app', 10000);
    await requestJson(env, '/admin/accounts/acme%2Fapp/moderate', { method: 'POST', headers: admin, body: { status: 'banned' } });
    const res = await request(env, '/v1/supplier/consume', {
      method: 'POST', headers: bearer(token),
      body: { account: 'acme/app', amount_usd_cents: 100, category: 'machine-seconds', item: 'vm', key: 'k1' },
    });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe('account_banned');
  });
});

describe('reserve → settle / release / expire (two-phase)', () => {
  test('settle ≤ reserve consumes the settled amount and releases the remainder', async () => {
    const env = testEnv({ ENFORCE_ACCOUNT_BALANCE: 'true' });
    const { token } = await createSupplier(env, { id: 'acme-machines' });
    await fund(env, 'acme/app', 1000);

    const held = await requestJson(env, '/v1/supplier/reserve', {
      method: 'POST', headers: bearer(token),
      body: { account: 'acme/app', amount_usd_cents: 800, category: 'machine-seconds', item: 'spawn', job_ref: 'job-7' },
    });
    expect(held.ok).toBe(true);
    expect(held.status).toBe('held');

    // The hold counts against spendable balance for every path.
    const during = await requestJson(env, '/v1/accounts/acme%2Fapp');
    expect(during.balance_usd_cents).toBe(1000);
    expect(during.reserved_usd_cents).toBe(800);
    expect(during.spendable_usd_cents).toBe(200);
    const overspend = await request(env, '/v1/supplier/consume', {
      method: 'POST', headers: bearer(token),
      body: { account: 'acme/app', amount_usd_cents: 300, category: 'machine-seconds', item: 'vm', key: 'k-over' },
    });
    expect(overspend.status).toBe(402);

    const settled = await requestJson(env, '/v1/supplier/settle', {
      method: 'POST', headers: bearer(token),
      body: { reserve_id: held.reserve_id, amount_usd_cents: 500, receipt_ref: 'rcpt-7' },
    });
    expect(settled.ok).toBe(true);
    expect(settled.settled_usd_cents).toBe(500);
    expect(settled.released_usd_cents).toBe(300);
    expect(settled.balance_usd_cents).toBe(500);

    const after = await requestJson(env, '/v1/accounts/acme%2Fapp');
    expect(after.balance_usd_cents).toBe(500);
    expect(after.reserved_usd_cents).toBe(0); // remainder released
    expect(after.spendable_usd_cents).toBe(500);
    expect(after.consumed_by_category['machine-seconds']).toBe(500);

    // settle is idempotent — a retried settle reports, never double-debits
    const again = await requestJson(env, '/v1/supplier/settle', {
      method: 'POST', headers: bearer(token),
      body: { reserve_id: held.reserve_id, amount_usd_cents: 500 },
    });
    expect(again.idempotent).toBe(true);
    expect((await requestJson(env, '/v1/accounts/acme%2Fapp')).balance_usd_cents).toBe(500);
  });

  test('settle above the held amount is refused', async () => {
    const env = testEnv();
    const { token } = await createSupplier(env, { id: 'acme-machines' });
    await fund(env, 'acme/app', 1000);
    const held = await requestJson(env, '/v1/supplier/reserve', {
      method: 'POST', headers: bearer(token),
      body: { account: 'acme/app', amount_usd_cents: 200, category: 'machine-seconds', item: 'spawn' },
    });
    const res = await request(env, '/v1/supplier/settle', {
      method: 'POST', headers: bearer(token),
      body: { reserve_id: held.reserve_id, amount_usd_cents: 201 },
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('settle_exceeds_reserve');
  });

  test('release frees the full hold without consuming; keyed reserves are idempotent', async () => {
    const env = testEnv({ ENFORCE_ACCOUNT_BALANCE: 'true' });
    const { token } = await createSupplier(env, { id: 'acme-machines' });
    await fund(env, 'acme/app', 1000);

    const held = await requestJson(env, '/v1/supplier/reserve', {
      method: 'POST', headers: bearer(token),
      body: { account: 'acme/app', amount_usd_cents: 900, category: 'machine-seconds', item: 'spawn', key: 'spawn-1' },
    });
    expect(held.ok).toBe(true);
    // a retried keyed reserve returns the SAME hold, never double-holds
    const replay = await requestJson(env, '/v1/supplier/reserve', {
      method: 'POST', headers: bearer(token),
      body: { account: 'acme/app', amount_usd_cents: 900, category: 'machine-seconds', item: 'spawn', key: 'spawn-1' },
    });
    expect(replay.idempotent).toBe(true);
    expect(replay.reserve_id).toBe(held.reserve_id);
    expect((await requestJson(env, '/v1/accounts/acme%2Fapp')).reserved_usd_cents).toBe(900);

    const released = await requestJson(env, '/v1/supplier/release', {
      method: 'POST', headers: bearer(token), body: { reserve_id: held.reserve_id },
    });
    expect(released.ok).toBe(true);
    const after = await requestJson(env, '/v1/accounts/acme%2Fapp');
    expect(after.balance_usd_cents).toBe(1000); // nothing consumed
    expect(after.reserved_usd_cents).toBe(0);
    // releasing again is a no-op, and settling a released reserve is refused
    expect((await requestJson(env, '/v1/supplier/release', { method: 'POST', headers: bearer(token), body: { reserve_id: held.reserve_id } })).idempotent).toBe(true);
    const settleClosed = await request(env, '/v1/supplier/settle', {
      method: 'POST', headers: bearer(token), body: { reserve_id: held.reserve_id, amount_usd_cents: 100 },
    });
    expect(settleClosed.status).toBe(409);
  });

  test('an expired reserve releases its hold and can no longer settle', async () => {
    const env = testEnv({ ENFORCE_ACCOUNT_BALANCE: 'true' });
    const { token } = await createSupplier(env, { id: 'acme-machines' });
    await fund(env, 'acme/app', 1000);

    const held = await requestJson(env, '/v1/supplier/reserve', {
      method: 'POST', headers: bearer(token),
      body: { account: 'acme/app', amount_usd_cents: 800, category: 'machine-seconds', item: 'spawn', ttl_seconds: 1 },
    });
    expect(held.ok).toBe(true);
    // while held, a second big hold is refused (spendable = 200)
    const blocked = await request(env, '/v1/supplier/reserve', {
      method: 'POST', headers: bearer(token),
      body: { account: 'acme/app', amount_usd_cents: 800, category: 'machine-seconds', item: 'spawn-2' },
    });
    expect(blocked.status).toBe(402);

    await new Promise((resolve) => setTimeout(resolve, 1100));

    // the TTL expired: the funds are spendable again…
    const retry = await requestJson(env, '/v1/supplier/reserve', {
      method: 'POST', headers: bearer(token),
      body: { account: 'acme/app', amount_usd_cents: 800, category: 'machine-seconds', item: 'spawn-2' },
    });
    expect(retry.ok).toBe(true);
    // …and the expired hold no longer secures a settle
    const late = await request(env, '/v1/supplier/settle', {
      method: 'POST', headers: bearer(token), body: { reserve_id: held.reserve_id, amount_usd_cents: 800 },
    });
    expect(late.status).toBe(409);
    const view = await requestJson(env, `/v1/supplier/reserves/${held.reserve_id}`, { headers: bearer(token) });
    expect(view.status).toBe('expired');
  });
});

describe('per-supplier exposure caps', () => {
  test('in-flight reserves + rolling spend are capped together; clearing the cap lifts it', async () => {
    const env = testEnv();
    const { token } = await createSupplier(env, { id: 'acme-machines' });
    await fund(env, 'acme/app', 100000);
    const capSet = await requestJson(env, '/admin/accounts/acme%2Fapp/supplier-cap', {
      method: 'POST', headers: admin, body: { supplier: 'acme-machines', max_usd_cents: 1000 },
    });
    expect(capSet.ok).toBe(true);

    // spend 400 (rolling), hold 400 (in-flight) → exposure 800 of 1000
    await requestJson(env, '/v1/supplier/consume', {
      method: 'POST', headers: bearer(token),
      body: { account: 'acme/app', amount_usd_cents: 400, category: 'machine-seconds', item: 'vm', key: 'k1' },
    });
    const held = await requestJson(env, '/v1/supplier/reserve', {
      method: 'POST', headers: bearer(token),
      body: { account: 'acme/app', amount_usd_cents: 400, category: 'machine-seconds', item: 'spawn' },
    });
    expect(held.ok).toBe(true);

    const over = await request(env, '/v1/supplier/consume', {
      method: 'POST', headers: bearer(token),
      body: { account: 'acme/app', amount_usd_cents: 300, category: 'machine-seconds', item: 'vm', key: 'k2' },
    });
    expect(over.status).toBe(402);
    const overBody = await over.json() as { error: string; in_flight_usd_cents: number; rolling_spend_usd_cents: number };
    expect(overBody.error).toBe('supplier_cap_exceeded');
    expect(overBody.in_flight_usd_cents).toBe(400);
    expect(overBody.rolling_spend_usd_cents).toBe(400);

    // within the cap still passes
    const within = await requestJson(env, '/v1/supplier/consume', {
      method: 'POST', headers: bearer(token),
      body: { account: 'acme/app', amount_usd_cents: 200, category: 'machine-seconds', item: 'vm', key: 'k3' },
    });
    expect(within.ok).toBe(true);

    // the cap binds this supplier only — another supplier is not affected
    const other = await createSupplier(env, { id: 'labor-market', categories: ['labor'] });
    const otherRes = await requestJson(env, '/v1/supplier/consume', {
      method: 'POST', headers: bearer(other.token),
      body: { account: 'acme/app', amount_usd_cents: 5000, category: 'labor', item: 'review', key: 'k1' },
    });
    expect(otherRes.ok).toBe(true);

    // clearing the cap lifts the limit
    await requestJson(env, '/admin/accounts/acme%2Fapp/supplier-cap', {
      method: 'POST', headers: admin, body: { supplier: 'acme-machines', max_usd_cents: null },
    });
    const freed = await requestJson(env, '/v1/supplier/consume', {
      method: 'POST', headers: bearer(token),
      body: { account: 'acme/app', amount_usd_cents: 300, category: 'machine-seconds', item: 'vm', key: 'k4' },
    });
    expect(freed.ok).toBe(true);
  });

  test('a settle never trips the cap (exposure can only shrink), and the released remainder frees exposure', async () => {
    const env = testEnv();
    const { token } = await createSupplier(env, { id: 'acme-machines' });
    await fund(env, 'acme/app', 100000);
    await requestJson(env, '/admin/accounts/acme%2Fapp/supplier-cap', {
      method: 'POST', headers: admin, body: { supplier: 'acme-machines', max_usd_cents: 1000 },
    });
    const held = await requestJson(env, '/v1/supplier/reserve', {
      method: 'POST', headers: bearer(token),
      body: { account: 'acme/app', amount_usd_cents: 1000, category: 'machine-seconds', item: 'spawn' },
    });
    expect(held.ok).toBe(true); // at the cap exactly
    const settled = await requestJson(env, '/v1/supplier/settle', {
      method: 'POST', headers: bearer(token), body: { reserve_id: held.reserve_id, amount_usd_cents: 300 },
    });
    expect(settled.ok).toBe(true);
    // exposure is now 300 rolling + 0 in-flight → a 700 hold fits again
    const next = await requestJson(env, '/v1/supplier/reserve', {
      method: 'POST', headers: bearer(token),
      body: { account: 'acme/app', amount_usd_cents: 700, category: 'machine-seconds', item: 'spawn-2' },
    });
    expect(next.ok).toBe(true);
  });
});

describe('category breakdown (public snapshot)', () => {
  test('supplier debits and the proxy’s own model settlements (supplier #0) share one breakdown', async () => {
    const l = new LimitLedgerClient(new MemoryDurableObjectNamespace((state) => new LimitLedger(state)));
    const config: LimitConfig = {
      max_active_runs_global: 10, max_active_runs_per_repo: 10, max_active_runs_per_actor: 10,
      max_active_runs_system: 4, max_runs_per_repo_per_day: 100, max_runs_per_actor_per_day: 100,
      max_runs_per_issue_per_day: 100, max_global_daily_usd_cents: 100000, enforce_account_balance: false,
    };
    await l.mint('acme/app', 10000);

    // the model path: register a run + settle a metered request — supplier #0 (`model-proxy`)
    await l.register({
      run_id: 'run_1', repo: 'acme/app', issue: 7, actor: 'octocat', max_usd_cents: 500,
      max_requests: 10, models: ['claude-sonnet-4-6'], expires_at: new Date(Date.now() + 3600_000).toISOString(), purpose: 'agent',
    }, config);
    await l.reserve('req-1', 300, config, 'run_1');
    await l.consume('req-1', 40);

    // a supplier path debit in two other categories
    const created = await l.supplierCreate({ id: 'labor-market', name: 'Labor Market', categories: ['labor', 'media'] });
    const parts = parseSupplierToken(created.token ?? null);
    expect(parts).not.toBeNull();
    const auth: SupplierAuth = { id: parts!.id, secret_hash: await hashSupplierSecret(parts!.secret) };
    await l.supplierConsume(auth, { account: 'acme/app', amount_usd_cents: 250, category: 'labor', item: 'code review', key: 'k1' }, config);
    await l.supplierConsume(auth, { account: 'acme/app', amount_usd_cents: 60, category: 'media', item: 'voiceover minutes', key: 'k2' }, config);

    const snap = await l.funding('acme/app');
    expect(snap.consumed_by_category).toEqual({ model: 40, labor: 250, media: 60 });
    expect(snap.consumed_usd_cents).toBe(350);
    expect(snap.balance_usd_cents).toBe(10000 - 350);

    // the flow ledger itemizes both paths with their supplier identity
    const view = await l.project('acme/app');
    const consumes = view.feed.filter((f) => f.kind === 'consume');
    expect(consumes.find((f) => f.supplier === 'model-proxy')?.category).toBe('model');
    expect(consumes.find((f) => f.supplier === 'labor-market' && f.category === 'labor')?.item).toBe('code review');
  });
});

describe('conservation invariant', () => {
  // Property-style: a seeded pseudo-random walk over every money-moving operation the treasury
  // exposes (mint, grant, supplier consume, reserve, settle, release) must conserve
  // total minted == total consumed + total still held, with reserves never counted as consumed.
  test('total minted == total consumed + total held across a random walk of all operations', async () => {
    const l = new LimitLedgerClient(new MemoryDurableObjectNamespace((state) => new LimitLedger(state)));
    const config: LimitConfig = {
      max_active_runs_global: 10, max_active_runs_per_repo: 10, max_active_runs_per_actor: 10,
      max_active_runs_system: 4, max_runs_per_repo_per_day: 1000, max_runs_per_actor_per_day: 1000,
      max_runs_per_issue_per_day: 1000, max_global_daily_usd_cents: 10_000_000, enforce_account_balance: true,
    };
    const accounts = ['root', 'acme/app', 'acme/site', 'beta/tool'];
    const created = await l.supplierCreate({ id: 'walk-supplier', name: 'Walk Supplier', categories: ['machine-seconds', 'labor', 'other'] });
    const parts = parseSupplierToken(created.token ?? null)!;
    const auth: SupplierAuth = { id: parts.id, secret_hash: await hashSupplierSecret(parts.secret) };

    // deterministic LCG so failures reproduce
    let seed = 42;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const pick = <T,>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];

    let minted = 0;
    const heldIds: string[] = [];
    const assertInvariant = async () => {
      const status = await l.status() as { accounts: Record<string, { balance_usd_cents: number; consumed_usd_cents: number }> };
      let consumed = 0;
      let held = 0;
      for (const a of Object.values(status.accounts)) {
        consumed += a.consumed_usd_cents;
        held += a.balance_usd_cents;
      }
      expect(consumed + held).toBe(minted);
    };

    for (let i = 0; i < 200; i++) {
      const account = pick(accounts);
      const amount = 1 + Math.floor(rand() * 500);
      const op = Math.floor(rand() * 6);
      if (op === 0) {
        const res = await l.mint(account, amount);
        if (res.ok) minted += amount;
      } else if (op === 1) {
        await l.grant(pick(accounts), pick(accounts), amount); // may refuse; either way conserves
      } else if (op === 2) {
        await l.supplierConsume(auth, { account, amount_usd_cents: amount, category: 'labor', item: `item-${i}`, key: `walk-${i}` }, config);
      } else if (op === 3) {
        const res = await l.supplierReserve(auth, { account, amount_usd_cents: amount, category: 'machine-seconds', item: `hold-${i}` }, config);
        if (res.ok && typeof res.reserve_id === 'string') heldIds.push(res.reserve_id);
      } else if (op === 4 && heldIds.length) {
        const id = heldIds.splice(Math.floor(rand() * heldIds.length), 1)[0];
        const view = await l.supplierReserveGet(auth, id) as { amount_usd_cents?: number };
        const max = view.amount_usd_cents ?? 0;
        await l.supplierSettle(auth, { reserve_id: id, amount_usd_cents: Math.floor(rand() * (max + 1)) });
      } else if (op === 5 && heldIds.length) {
        const id = heldIds.splice(Math.floor(rand() * heldIds.length), 1)[0];
        await l.supplierRelease(auth, id);
      }
      if (i % 25 === 0) await assertInvariant();
    }
    // settle or release every outstanding hold, then the books must balance exactly
    for (const id of heldIds) {
      const view = await l.supplierReserveGet(auth, id) as { amount_usd_cents?: number };
      await l.supplierSettle(auth, { reserve_id: id, amount_usd_cents: view.amount_usd_cents ?? 0 });
    }
    await assertInvariant();
  });
});
