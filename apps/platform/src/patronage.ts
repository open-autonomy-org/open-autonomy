// Patronage on the books: what Open Autonomy adds to the backend for money in from the public. Sponsors and
// their monthly accrual, coupons, a project's tiers, the Polar products and checkouts behind them, and the
// patrons wall. Every operation runs inside the one Durable Object through the backend's extension registry,
// on the same accounts and flows; what it keeps on an account is its own (`sponsors`, `sponsors_active`,
// `tiers`, `polar_products`) and on the state (`coupons`), persisted beside the core's keys and opaque to it.
import { LedgerClient, LimitLedger, at, type Account, type AccountProfile, type EnvelopePurpose, type Flow, type LedgerCore, type Sponsor } from '@open-autonomy/backend';

export type { Sponsor };
export interface Tier { usd_cents: number; name: string }
export interface Coupon {
  code: string;
  amount_usd_cents: number;
  from?: string;
  sponsor?: Sponsor;
  expires_at?: string;
  redeemed_at?: string | null;
  redeemed_to?: string | null;
  created_at: string;
}
export interface PolarCheckout { id: string; account: string; tier: number; interval: 'month' | 'once'; usd_cents: number; purpose: EnvelopePurpose; created_at: string }
export interface Patron {
  kind: 'sponsor' | 'project' | 'funder';
  login: string;
  name?: string;
  avatar_url?: string;
  url?: string;
  tagline?: string;
  amount_label?: string;
}
// What the page shows of an account's patronage.
export interface PatronageView { tiers: Tier[]; patrons: Patron[]; patron_count: number; monthly_usd_cents: number; sponsors: Sponsor[]; polar_products: Record<string, string> }

// The sponsorship ladder shown on every project unless an operator sets its own. Each tier's promise is what the
// platform itself delivers: the patrons wall and the runway the money buys.
export const DEFAULT_TIERS: Tier[] = [
  { usd_cents: 500, name: 'Supporter' },
  { usd_cents: 2500, name: 'Sponsor' },
  { usd_cents: 10000, name: 'Backer' },
];

interface PatronAccount { sponsors?: Sponsor[]; sponsors_active?: Record<string, Sponsor>; tiers?: Tier[]; polar_products?: Record<string, string> }
const own = (a: Account): PatronAccount & Account => a as unknown as PatronAccount & Account;
const couponsOf = (core: LedgerCore): Record<string, Coupon> => ((core.state.coupons ??= {}) as Record<string, Coupon>);
const s = (body: Record<string, unknown>, k: string): string => String(body[k] ?? '');

function upsertSponsor(list: Sponsor[], sponsor: Sponsor): void {
  const i = list.findIndex((x) => x.login === sponsor.login);
  if (i >= 0) list[i] = sponsor; else list.push(sponsor);
}
const activeSponsors = (a: PatronAccount): Sponsor[] => [...Object.values(a.sponsors_active ?? {}), ...(a.sponsors ?? []).filter((x) => !(a.sponsors_active ?? {})[x.login])];
const patronCount = (a: PatronAccount): number => new Set<string>([...Object.keys(a.sponsors_active ?? {}), ...(a.sponsors ?? []).map((x) => x.login)]).size;
const monthlyTotal = (a: PatronAccount): number => Object.values(a.sponsors_active ?? {}).reduce((sum, x) => sum + (x.monthly_usd_cents ?? 0), 0);
function displayProfile(a: Account | undefined): AccountProfile {
  const p = a?.profile ?? {};
  return { ...p, tagline: p.tagline_override ?? p.tagline, cover_url: p.cover_override ?? p.cover_url };
}
// Projects and funders that have granted INTO this account are patrons: a project's avatar is its own, a funder's
// is their GitHub login's.
function projectPatronsOf(flows: Flow[], account: string, profileOf: (id: string) => AccountProfile): Patron[] {
  const byFrom = new Map<string, number>();
  for (const flow of flows) if (flow.kind === 'grant' && flow.to === account && flow.from && (flow.from.includes('/') || flow.from.startsWith('@'))) byFrom.set(flow.from, (byFrom.get(flow.from) ?? 0) + flow.amount_usd_cents);
  const out: Patron[] = [];
  for (const [from, total] of byFrom) {
    const label = `granted $${(total / 100).toFixed(2)}`;
    if (from.startsWith('@')) out.push({ kind: 'funder', login: from.slice(1), name: from, avatar_url: `https://github.com/${encodeURIComponent(from.slice(1))}.png?size=52`, url: at(from), amount_label: label });
    else out.push({ kind: 'project', login: from, name: from, avatar_url: profileOf(from).avatar_url, url: at(from), amount_label: label });
  }
  return out;
}
function generateCouponCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const chars = [...crypto.getRandomValues(new Uint8Array(12))].map((b) => alphabet[b % alphabet.length]);
  return `SPON-${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}`;
}

function view(core: LedgerCore, account: string): PatronageView {
  const a = core.acct(account);
  const p: PatronAccount = a ? own(a) : {};
  const sponsors = a ? activeSponsors(p) : [];
  const sponsorPatrons: Patron[] = sponsors.map((x) => ({ kind: 'sponsor', login: x.login, name: x.name, avatar_url: x.avatar_url, url: x.url, tagline: x.tagline, amount_label: x.monthly_usd_cents ? `$${(x.monthly_usd_cents / 100).toFixed(0)}/mo` : undefined }));
  const projectPatrons = projectPatronsOf(core.state.flows, account, (id) => displayProfile(core.acct(id)));
  return { tiers: p.tiers ?? DEFAULT_TIERS, patrons: [...projectPatrons, ...sponsorPatrons], patron_count: patronCount(p) + projectPatrons.length, monthly_usd_cents: monthlyTotal(p), sponsors, polar_products: { ...(p.polar_products ?? {}) } };
}

LimitLedger.extend({
  patronage: (core, body) => ({ ok: true, ...view(core, s(body, 'account')) }),
  sponsor_upsert: async (core, body) => {
    const account = s(body, 'account'); const sponsor = body.sponsor as Sponsor | undefined;
    if (!account || !sponsor?.login) return { ok: false, error: 'invalid_sponsor' };
    const a = own(core.ensureAcct(account));
    (a.sponsors_active ??= {})[sponsor.login] = { login: sponsor.login, name: sponsor.name, tagline: sponsor.tagline, url: sponsor.url, avatar_url: sponsor.avatar_url, monthly_usd_cents: Math.max(0, Math.floor(sponsor.monthly_usd_cents ?? 0)) };
    await core.save();
    return { ok: true, active_sponsors: Object.keys(a.sponsors_active).length };
  },
  sponsor_remove: async (core, body) => {
    const a = core.acct(s(body, 'account'));
    if (a) { delete (own(a).sponsors_active ?? {})[s(body, 'login')]; await core.save(); }
    return { ok: true };
  },
  // Mint an account with its active recurring sponsors' combined monthly amount, idempotent on the billing month:
  // the recurring path GitHub's webhook cannot provide.
  accrue: async (core, body) => {
    const account = s(body, 'account'); const key = s(body, 'key');
    const a = core.acct(account);
    const sponsors = a ? Object.values(own(a).sponsors_active ?? {}) : [];
    const total = sponsors.reduce((sum, x) => sum + (x.monthly_usd_cents ?? 0), 0);
    if (total <= 0) return { ok: true, credited: false, monthly_total_usd_cents: 0 };
    const result = await core.mint(account, total, key);
    if (!result.idempotent) { const acct = own(core.ensureAcct(account)); for (const x of sponsors) upsertSponsor(acct.sponsors ??= [], x); }
    await core.save();
    return { ...result, credited: !result.idempotent, monthly_total_usd_cents: total };
  },
  coupon_create: async (core, body) => {
    const input = body as Partial<Coupon>;
    if (!Number.isFinite(input.amount_usd_cents) || (input.amount_usd_cents as number) <= 0) return { ok: false, error: 'invalid_amount' };
    const code = (input.code && String(input.code).trim()) || generateCouponCode();
    const all = couponsOf(core);
    if (all[code]) return { ok: false, error: 'coupon_exists' };
    const coupon: Coupon = { code, amount_usd_cents: Math.floor(input.amount_usd_cents as number), from: input.from, sponsor: input.sponsor, expires_at: input.expires_at, redeemed_at: null, redeemed_to: null, created_at: new Date().toISOString() };
    all[code] = coupon;
    await core.save();
    return { ok: true, coupon };
  },
  coupon_list: (core) => ({ ok: true, coupons: Object.values(couponsOf(core)) }),
  coupon_redeem: async (core, body) => {
    const code = s(body, 'code'); const to = s(body, 'account');
    const coupon = couponsOf(core)[code];
    if (!to) return { ok: false, error: 'redeem_account_required' };
    if (!coupon) return { ok: false, error: 'coupon_not_found' };
    if (coupon.redeemed_at) return { ok: false, error: 'coupon_already_redeemed' };
    if (coupon.expires_at && Date.parse(coupon.expires_at) <= Date.now()) return { ok: false, error: 'coupon_expired' };
    if (coupon.from) {
      const result = await core.grant(coupon.from, to, coupon.amount_usd_cents, `coupon:${code}`);
      if (!result.ok) return result;
    } else {
      await core.mint(to, coupon.amount_usd_cents, `coupon:${code}`, coupon.sponsor);
    }
    coupon.redeemed_at = new Date().toISOString();
    coupon.redeemed_to = to;
    if (coupon.sponsor?.login) { const acct = own(core.ensureAcct(to)); upsertSponsor(acct.sponsors ??= [], coupon.sponsor); }
    await core.save();
    return { ok: true, amount_usd_cents: coupon.amount_usd_cents, account: to, sponsor: coupon.sponsor ?? null };
  },
  set_tiers: async (core, body) => {
    const tiers = body.tiers;
    if (!Array.isArray(tiers)) return { ok: false, error: 'invalid_tiers' };
    own(core.ensureAcct(s(body, 'account'))).tiers = tiers.filter((t) => t && typeof t.usd_cents === 'number' && typeof t.name === 'string').map((t) => ({ usd_cents: t.usd_cents, name: t.name }));
    await core.save();
    return { ok: true };
  },
  set_polar_products: async (core, body) => {
    const products = body.products;
    if (!products || typeof products !== 'object') return { ok: false, error: 'invalid_products' };
    own(core.ensureAcct(s(body, 'account'))).polar_products = Object.fromEntries(Object.entries(products as Record<string, unknown>).filter(([k, v]) => typeof k === 'string' && typeof v === 'string')) as Record<string, string>;
    await core.save();
    return { ok: true };
  },
  // `polar_checkout:<checkout id>`: the account and tier a checkout funds.
  polar_checkout_put: async (core, body) => {
    const checkout = body.checkout as PolarCheckout | undefined;
    if (!checkout || typeof checkout.id !== 'string' || !checkout.id || typeof checkout.account !== 'string') return { ok: false, error: 'invalid_checkout' };
    await core.storage.put(`polar_checkout:${checkout.id}`, checkout);
    return { ok: true };
  },
  polar_checkout: async (core, body) => {
    const checkout = await core.storage.get<PolarCheckout>(`polar_checkout:${s(body, 'id')}`);
    return checkout ? { ok: true, checkout } : { ok: false, error: 'checkout_not_found' };
  },
});

// The patronage operations from the worker's side, by name through the backend's client.
export class Patronage {
  constructor(private readonly ledger: LedgerClient) {}
  view(account: string) { return this.ledger.call<PatronageView & { ok: true }>('patronage', { account }); }
  sponsorUpsert(account: string, sponsor: Sponsor) { return this.ledger.call<{ ok: boolean; active_sponsors?: number; error?: string }>('sponsor_upsert', { account, sponsor }); }
  sponsorRemove(account: string, login: string) { return this.ledger.call<{ ok: boolean }>('sponsor_remove', { account, login }); }
  accrue(account: string, key: string) { return this.ledger.call<{ ok: boolean; credited?: boolean; idempotent?: boolean; monthly_total_usd_cents?: number }>('accrue', { account, key }); }
  couponCreate(input: { amount_usd_cents: number; from?: string; sponsor?: Sponsor; code?: string; expires_at?: string }) { return this.ledger.call<{ ok: boolean; coupon?: Coupon; error?: string }>('coupon_create', input); }
  couponList() { return this.ledger.call<{ ok: boolean; coupons: Coupon[] }>('coupon_list'); }
  couponRedeem(code: string, account: string) { return this.ledger.call<{ ok: boolean; amount_usd_cents?: number; account?: string; sponsor?: Sponsor | null; error?: string }>('coupon_redeem', { code, account }); }
  setTiers(account: string, tiers: Tier[]) { return this.ledger.call<{ ok: boolean; error?: string }>('set_tiers', { account, tiers }); }
  setPolarProducts(account: string, products: Record<string, string>) { return this.ledger.call<{ ok: boolean; error?: string }>('set_polar_products', { account, products }); }
  polarCheckoutPut(checkout: PolarCheckout) { return this.ledger.call<{ ok: boolean; error?: string }>('polar_checkout_put', { checkout }); }
  polarCheckout(id: string) { return this.ledger.call<{ ok: boolean; error?: string; checkout?: PolarCheckout }>('polar_checkout', { id }); }
}
