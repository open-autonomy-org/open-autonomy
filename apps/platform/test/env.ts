// The open platform under test: the treasury's harness with this app mounted, plus a tiny Polar and the GitHub
// login the giving page uses. Everything the treasury's harness exports is re-exported, so a test reads as one.
import { fakes, testEnv as treasuryEnv, useEnv as treasuryUseEnv, type FakeGateway, type TestEnv } from '@open-autonomy/treasury/testing';
import '../src/patronage.ts';
import { app } from '../src/app.tsx';
import type { Env } from '../src/types.ts';

export { admin, ctx, fund, github, mintKey, request, requestJson, settle, signKey, stripe } from '@open-autonomy/treasury/testing';
export const useEnv = (env: PlatformTestEnv): PlatformTestEnv => treasuryUseEnv(env) as PlatformTestEnv;

export type PlatformTestEnv = TestEnv & Env;
export function testEnv(gateway?: Partial<FakeGateway>): PlatformTestEnv {
  polar.products = {}; polar.checkouts = {}; polar.orders = [];
  return {
    ...treasuryEnv(gateway, app),
    GITHUB_OAUTH_BASE: 'https://github.test',
    GITHUB_OAUTH_CLIENT_ID: 'test-client',
    GITHUB_OAUTH_CLIENT_SECRET: 'test-client-secret',
    GIVE_SESSION_HMAC_SECRET: 'test-give-session-secret',
    POLAR_API_BASE: 'https://polar.test',
    POLAR_ACCESS_TOKEN: 'polar_at_test',
    POLAR_WEBHOOK_SECRET: 'whsec_' + btoa('polar-test'),
  };
}

// A tiny Polar: products, checkouts, orders, customers. The test pays a checkout by confirming it here.
export const polar: { products: Record<string, Record<string, any>>; checkouts: Record<string, Record<string, any>>; orders: Record<string, any>[] } = { products: {}, checkouts: {}, orders: [] };
fakes.set('https://polar.test', async (req, url) => {
  // A tiny Polar: products, checkouts, orders, customers. The test pays a checkout by confirming it here.
  const body = req.method === 'POST' ? JSON.parse(await req.text() || '{}') as Record<string, any> : {};
  if (req.method === 'POST' && url.pathname === '/v1/products/') { const id = `prod_${Object.keys(polar.products).length + 1}`; polar.products[id] = { id, ...body }; return Response.json(polar.products[id], { status: 201 }); }
  if (req.method === 'POST' && url.pathname === '/v1/checkouts/') { const id = `chk_${Object.keys(polar.checkouts).length + 1}`; const product = polar.products[body.products?.[0]]; polar.checkouts[id] = { id, status: 'open', url: `https://polar.test/checkout/${id}`, product_id: product?.id, amount: product?.prices?.[0]?.price_amount ?? 0, metadata: body.metadata ?? {} }; return Response.json(polar.checkouts[id], { status: 201 }); }
  let m = url.pathname.match(/^\/v1\/checkouts\/([^/]+)$/);
  if (m && req.method === 'GET') return polar.checkouts[m[1]] ? Response.json(polar.checkouts[m[1]]) : new Response('{}', { status: 404 });
  if (url.pathname === '/v1/orders/' && req.method === 'GET') return Response.json({ items: polar.orders.filter((o) => !url.searchParams.get('checkout_id') || o.checkout_id === url.searchParams.get('checkout_id')) });
  if ((m = url.pathname.match(/^\/v1\/customers\/([^/]+)$/)) && req.method === 'GET') return Response.json({ id: m[1], email: 'pat@example.com', name: 'Pat Patron' });
  return new Response('{}', { status: 404 });

});
// The GitHub login: the OAuth exchange, the signed-in user, the org membership the pool admin check reads.
fakes.set('https://github.test', async (req, url) => {
  if (url.pathname === '/login/oauth/access_token' && req.method === 'POST') return Response.json({ access_token: 'gho_test', token_type: 'bearer', scope: '' });
  if (url.pathname === '/user') return Response.json({ login: 'octocat', id: 1 });
  if (url.pathname === '/orgs/open-autonomy-org/memberships/octocat') return req.headers.get('authorization') === 'Bearer test-github-org-token'
    ? Response.json({ role: 'admin', state: 'active' })
    : Response.json({ message: 'Resource not accessible by integration' }, { status: 403 });
  return undefined;
});
