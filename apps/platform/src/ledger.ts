import { CONFORMANCE, diffRoadmaps, sameRoadmap, type RoadmapChange, type RoadmapSource } from '@open-autonomy/sdk/drivers';
import { ROADMAP_SCHEMA, ROADMAP_STATUSES, type Roadmap, type RoadmapItem } from '@open-autonomy/sdk/roadmap';
import { json } from './http.js';
import { estimateRunway } from './runway.js';
import type { KeyClaims, UsageEvent } from './types.js';

// The books: one Durable Object holding every account's funds, every settled spend, the audit trail, the
// key registry and the development stream. Money enters by mint (a sponsor, a coupon, an admin), moves by
// grant (down the account tree), and leaves only through a metered rail: today the model rail, settled to
// the gateway's reported cost. The balance is the hard-stop; a global daily rail bounds a runaway.
//
// Storage: the account tree and everything small lives in one `state` record; the audit trail, sessions and
// updates are appended as their own keys (`call:`, `session:`, `update:`), never evicted.

const MAX_FLOWS = 200;
const FEED_LIMIT = 24;
const MAX_ACTIVE_KEYS_PER_ACCOUNT = 3;
const MAX_TURNS = 400;
const MAX_TURNS_PER_EVENT = 100;
const MAX_TURN_TEXT = 2000;
const MAX_UPDATE_TEXT = 2000;
const DEFAULT_GOAL_DAYS = 30;
// The sponsorship ladder shown on every project unless an operator sets its own. Each tier's promise is
// what the platform itself delivers: the patrons wall and the runway the money buys.
const DEFAULT_TIERS: Tier[] = [
  { usd_cents: 500, name: 'Supporter' },
  { usd_cents: 2500, name: 'Sponsor' },
  { usd_cents: 10000, name: 'Backer' },
];

interface LedgerState {
  day_key: string;
  // Today's settled spend across every account, and outstanding reservations: the global daily rail.
  consumed_usd_cents: number;
  reserved_usd_cents: number;
  reservations: Record<string, { amount: number; expires_at_ms: number; account: string; kid: string }>;
  // The account tree. Every project (owner/repo) and named root is an account:
  // balance = granted_in - granted_out - consumed.
  accounts: Record<string, Account>;
  // Idempotency keys already applied by mint/grant/coupon, so a retry never double-applies.
  applied_keys: string[];
  coupons: Record<string, Coupon>;
  // Append-only money-movement log (capped trailing window): the funding feed.
  flows: Flow[];
  // The key registry: listing, revocation, rotation grace. A key verifies by signature and expiry without
  // it; an entry here can only shorten a key's life.
  keys: Record<string, KeyEntry>;
}

export interface Account {
  granted_in_usd_cents: number;
  granted_out_usd_cents: number;
  consumed_usd_cents: number;
  calls_total?: number;
  last_call_ms?: number;
  // The sessions live right now: the reporter said they started and has not said they ended.
  live_sessions?: string[];
  // The roadmap's current revision number (the records live in storage, see roadmapSet).
  roadmap_revision?: number;
  // The card rail: the account's cardholder at the issuer, created on its first card.
  stripe_cardholder?: string;
  // Money in: the Polar products behind the account's tiers (`<tier index>:<month|once>` → product id).
  polar_products?: Record<string, string>;
  // A funder's bonus credits (the org's match on what they bought): given only to projects they do not own.
  bonus_usd_cents?: number;
  daily_spend: Record<string, number>;
  sponsors: Sponsor[];
  sponsors_active: Record<string, Sponsor>;
  profile?: AccountProfile;
  goal_days?: number;
  tiers?: Tier[];
  moderation?: Moderation;
  moderation_reason?: string;
}

export type Moderation = 'listed' | 'hidden' | 'banned';

// The project's identity as synced from its repository (see sync.ts), plus operator overrides.
export interface AccountProfile {
  tagline?: string;
  avatar_url?: string;
  cover_url?: string;
  homepage?: string;
  synced_at?: string;
  tagline_override?: string;
  cover_override?: string;
  vision_md?: string;
  changelog_md?: string;
  // The agent's setup, as its substrate publishes it through the SDK (never read from a harness's files).
  schedule_json?: string;
  setup_md?: string;
  soul_md?: string;
  agent_harness?: string;
  agent_model?: string;
  agent_provider?: string;
  agent_skills?: string;
  // The project's `.open-autonomy/config.yaml`: its rails bounds and roadmap source, as the owner set them.
  config_yaml?: string;
}
const PROFILE_KEYS = ['tagline', 'avatar_url', 'cover_url', 'homepage', 'synced_at', 'tagline_override', 'cover_override', 'vision_md', 'changelog_md', 'schedule_json', 'setup_md', 'soul_md', 'agent_harness', 'agent_model', 'agent_provider', 'agent_skills', 'config_yaml'] as const;

export interface Tier { usd_cents: number; name: string }

export interface Flow {
  kind: 'mint' | 'grant' | 'consume';
  to: string;
  from?: string;
  amount_usd_cents: number;
  sponsor_login?: string;
  coupon?: boolean;
  rail?: Rail;
  // A grant's word from the funder: what they believe in.
  note?: string;
  ts: string;
}

// The rails money leaves through: a model call, a card captured, a partner's charge. Each names itself
// on the audit trail.
export type Rail = 'model' | 'card' | 'partner';

// A card the card rail minted: single use, bounded to its amount and the owner's merchant categories,
// holding a reservation until it is settled or declined.
export interface CardRecord {
  id: string;
  account: string;
  request_id: string;
  usd_cents: number;
  categories: string[];
  purpose: string;
  last4: string;
  status: 'minted' | 'authorized' | 'declined' | 'settled';
  authorization?: string;
  merchant?: string;
  category?: string;
  settled_usd_cents?: number;
  created_at: string;
}

// A Polar checkout the platform opened for a patron: which account and tier it funds, so a paid order is
// attributed even when Polar's order carries no metadata.
export interface PolarCheckout { id: string; account: string; tier: number; interval: 'month' | 'once'; usd_cents: number; created_at: string }

export interface Sponsor {
  login: string;
  name?: string;
  tagline?: string;
  url?: string;
  avatar_url?: string;
  monthly_usd_cents?: number;
}

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

export interface KeyEntry {
  kid: string;
  account: string;
  models: string[];
  created_at: string;
  exp: string;
  revoked_at?: string;
}

// One metered spend, as appended to the account's audit trail.
export interface CallRecord {
  ts: string;
  request_id: string;
  rail: Rail;
  // The session live when this settled (exact when one was live; absent otherwise).
  session?: string;
  model?: string;
  route?: string;
  input_tokens?: number;
  output_tokens?: number;
  // The card rail: who was paid, in which category, on which card. The partner rail: which partner, for
  // what unit and quantity. `reference` is the vendor's own id for the settlement.
  merchant?: string;
  category?: string;
  card_last4?: string;
  partner?: string;
  unit?: string;
  quantity?: number;
  reference?: string;
  usd_cents: number;
  outcome?: string;
}

// ---- the development stream ------------------------------------------------------------------------
// A session is one agent conversation as the project's reporter narrates it. `kind` names what kind
// (`run`: a scheduled run, the funded work; `chat`; anything short), `item_id` the roadmap item it serves,
// `source` what started it (the schedule job's name, a channel). It ends with an optional outcome: a run
// has a verdict, a chat does not. Several can be live at once.
export type SessionEvent =
  | { kind: 'started'; key: string; session_kind?: string; title?: string; item_id?: string; source?: string; started_at?: string }
  | { kind: 'turns'; key: string; turns: unknown[]; item_id?: string; seq?: number }
  | { kind: 'ended'; key: string; outcome?: 'done' | 'failed'; report?: string; commit_sha?: string; item_id?: string; ended_at?: string };
export interface Turn {
  seq?: number;
  ts?: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  text?: string;
  tool?: string;
  args?: string;
  result?: string;
}
export interface SessionRecord {
  key: string;
  account: string;
  kind: string;
  status: 'live' | 'ended';
  outcome?: 'done' | 'failed';
  title?: string;
  item_id?: string;
  source?: string;
  started_at: string;
  ended_at?: string;
  report?: string;
  commit_sha?: string;
  turns: Turn[];
  turn_count: number;
  // The next turn offset the session expects (turns below it were already applied).
  next_seq: number;
  // Settled cents and metered calls attributed to this session (see attributeSpend).
  usd_cents: number;
  calls: number;
  updated_at: string;
}
export type SessionSummary = Omit<SessionRecord, 'turns'> & { tool_calls: number };
export interface UpdateRecord {
  id: string;
  account: string;
  item_id: string;
  ts: string;
  text: string;
  session?: string;
}
// The board's state for an item, as the project's reporter publishes it from the agent's harness: the task's
// lane, every attempt, the handoff, the review verdicts. Replaced whole on each publish.
export interface TaskRecord {
  account: string;
  item_id: string;
  task_id: string;
  lane: string;
  title?: string;
  assignee?: string;
  attempts: Array<{ id: string; profile?: string; status: string; started_at?: string; ended_at?: string; outcome?: string; summary?: string }>;
  reviews: Array<{ verdict: string; by?: string; reason?: string; at?: string }>;
  handoff?: { summary?: string; metadata?: unknown };
  updated_at: string;
}
export interface ItemView {
  ok: true;
  account: string;
  item_id: string;
  live: string[];
  sessions: SessionSummary[];
  updates: UpdateRecord[];
  // The card and partner settlements attributed to this item's sessions: what the agent bought for it.
  purchases: CallRecord[];
  // The board's state for the item, when the reporter has published one.
  task?: TaskRecord;
  usd_cents: number;
}

export class LimitLedger implements DurableObject {
  private loaded = false;
  private state: LedgerState = emptyState();

  constructor(private readonly ctx: DurableObjectState) {}

  async fetch(req: Request): Promise<Response> {
    await this.load();
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const s = (k: string) => String(body[k] ?? '');
    switch (body.op) {
      case 'reserve': return json(await this.reserve(s('request_id'), s('account'), s('kid'), Number(body.amount_usd_cents), Number(body.daily_cap_usd_cents)));
      case 'consume': await this.consume(s('request_id'), Number(body.actual_usd_cents), body.event as UsageEvent | undefined); return json({ ok: true });
      case 'release': await this.release(s('request_id')); return json({ ok: true });
      case 'mint': return json(await this.mint(s('account'), Number(body.amount_usd_cents), body.key ? s('key') : undefined, body.sponsor as Sponsor | undefined));
      case 'grant': return json(await this.grant(s('from'), s('to'), Number(body.amount_usd_cents), body.key ? s('key') : undefined, typeof body.note === 'string' ? body.note : undefined));
      case 'funder': return json(this.funderView(s('account')));
      case 'bonus_add': return json(await this.bonusAdd(s('account'), Number(body.amount_usd_cents)));
      case 'sponsor_upsert': return json(await this.sponsorUpsert(s('account'), body.sponsor as Sponsor));
      case 'sponsor_remove': return json(await this.sponsorRemove(s('account'), s('login')));
      case 'accrue': return json(await this.accrue(s('account'), s('key')));
      case 'coupon_create': return json(await this.couponCreate(body as Partial<Coupon>));
      case 'coupon_list': return json({ ok: true, coupons: Object.values(this.state.coupons) });
      case 'coupon_redeem': return json(await this.couponRedeem(s('code'), s('account')));
      case 'key_register': return json(await this.keyRegister(body.claims as KeyClaims));
      case 'key_check': return json(this.keyCheck(s('kid')));
      case 'key_expire': return json(await this.keyExpire(s('kid'), s('exp')));
      case 'key_revoke': return json(await this.keyRevoke(s('kid')));
      case 'keys': return json(this.keysOf(s('account')));
      case 'funding': return json(this.fundingSnapshot(s('account')));
      case 'pulse': return json(this.pulse(s('account')));
      case 'calls': return json(await this.listCalls(s('account'), Number(body.limit), typeof body.before === 'string' ? body.before : undefined));
      case 'session_event': return json(await this.sessionEvent(s('account'), body.event as SessionEvent));
      case 'sessions': return json(await this.listSessions(s('account'), Number(body.limit)));
      case 'session': return json(await this.getSession(s('account'), s('key')));
      case 'session_delete': return json(await this.deleteSession(s('account'), s('key')));
      case 'update_post': return json(await this.postUpdate(s('account'), s('item_id'), body.text, body.session, body.at));
      case 'task_put': return json(await this.taskPut(s('account'), s('item_id'), body.task as Record<string, unknown>));
      case 'setup_put': return json(await this.setupPut(s('account'), body.setup as Record<string, unknown>));
      case 'item': return json(await this.itemView(s('account'), s('item_id')));
      case 'roadmap_set': return json(await this.roadmapSet(s('account'), body.roadmap as Roadmap, s('source'), body.by ? s('by') : undefined));
      case 'roadmap': return json(await this.roadmapCurrent(s('account')));
      case 'roadmap_revisions': return json(await this.roadmapRevisions(s('account'), Number(body.limit)));
      case 'card_put': return json(await this.cardPut(body.card as CardRecord));
      case 'card': return json(await this.cardGet(s('id')));
      case 'set_cardholder': return json(await this.setCardholder(s('account'), s('cardholder')));
      case 'set_polar_products': return json(await this.setPolarProducts(s('account'), body.products as Record<string, string>));
      case 'polar_checkout_put': return json(await this.polarCheckoutPut(body.checkout as PolarCheckout));
      case 'polar_checkout': return json(await this.polarCheckoutGet(s('id')));
      case 'set_profile': return json(await this.setProfile(s('account'), body.profile as Partial<AccountProfile>, body.goal_days as number | undefined, body.tiers as Tier[] | undefined));
      case 'moderate': return json(await this.moderate(s('account'), s('status') as Moderation, body.reason ? s('reason') : undefined, body as Partial<AccountProfile>));
      case 'export_all': return json(await this.exportAll());
      case 'import_all': return json(await this.importAll(body.entries as Array<[string, unknown]>, body.replace === true));
      case 'directory': return json({ ok: true, entries: this.directory() });
      case 'project': return json(this.projectView(s('account')));
      case 'status': return json(this.snapshot());
      case 'reset_daily': return json(await this.resetDaily());
      default: return json({ ok: false, error: 'unknown_op' }, { status: 400 });
    }
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    const stored = await this.ctx.storage.get<Partial<LedgerState>>('state');
    if (stored) this.state = normalizeState(stored);
    this.rolloverIfNeeded();
    this.gcReservations();
    this.loaded = true;
  }

  private async save(): Promise<void> {
    await this.ctx.storage.put('state', this.state);
  }

  // ---- the books as a whole: export and restore -------------------------------------------------------
  // Everything the platform holds is this object's storage: the state (accounts, flows, coupons, the key
  // registry), the audit trail, sessions and their item pointers, updates, roadmap revisions, cards,
  // checkouts. An export is every entry; a restore puts every entry back, into an empty worker unless the
  // caller says replace.
  private async exportAll(): Promise<{ ok: true; exported_at: string; entries: Array<[string, unknown]> }> {
    const all = await this.ctx.storage.list();
    return { ok: true, exported_at: new Date().toISOString(), entries: [...all.entries()] };
  }
  private async importAll(entries: Array<[string, unknown]>, replace: boolean): Promise<{ ok: boolean; error?: string; entries?: number }> {
    if (!Array.isArray(entries) || !entries.every((e) => Array.isArray(e) && typeof e[0] === 'string')) return { ok: false, error: 'invalid_export' };
    const existing = await this.ctx.storage.list({ limit: 1 });
    if (existing.size && !replace) return { ok: false, error: 'not_empty' };
    if (replace) await this.ctx.storage.deleteAll();
    for (let i = 0; i < entries.length; i += 128) await this.ctx.storage.put(Object.fromEntries(entries.slice(i, i + 128)));
    this.loaded = false;
    await this.load();
    return { ok: true, entries: entries.length };
  }

  // ---- accounts --------------------------------------------------------------------------------------

  private acct(id: string): Account | undefined { return this.state.accounts[id]; }
  private ensureAcct(id: string): Account { return (this.state.accounts[id] ??= emptyAccount()); }
  private balanceOf(id: string): number {
    const a = this.acct(id);
    return a ? a.granted_in_usd_cents - a.granted_out_usd_cents - a.consumed_usd_cents : 0;
  }
  private reservedFor(id: string): number {
    let total = 0;
    for (const r of Object.values(this.state.reservations)) if (r.account === id) total += r.amount;
    return total;
  }
  private applyKey(key?: string): boolean {
    if (!key) return false;
    if (this.state.applied_keys.includes(key)) return true;
    this.state.applied_keys.push(key);
    this.state.applied_keys = this.state.applied_keys.slice(-500);
    return false;
  }
  private recordFlow(flow: Omit<Flow, 'ts'>): void {
    this.state.flows.push({ ...flow, ts: new Date().toISOString() });
    if (this.state.flows.length > MAX_FLOWS) this.state.flows = this.state.flows.slice(-MAX_FLOWS);
  }

  // Money enters: the only operation that increases the total.
  private async mint(account: string, amount: number, key?: string, sponsor?: Sponsor): Promise<Record<string, unknown>> {
    if (!account || !Number.isFinite(amount) || amount <= 0) return { ok: false, error: 'invalid_amount' };
    if (key && this.applyKey(key)) return { ok: true, idempotent: true, account, balance_usd_cents: this.balanceOf(account) };
    const a = this.ensureAcct(account);
    a.granted_in_usd_cents += Math.floor(amount);
    if (sponsor?.login) upsertSponsor(a.sponsors, sponsor);
    this.recordFlow({ kind: 'mint', to: account, amount_usd_cents: Math.floor(amount), sponsor_login: sponsor?.login });
    await this.save();
    return { ok: true, account, balance_usd_cents: this.balanceOf(account) };
  }

  // Money moves down the tree: conserves the total, refused if the source lacks the balance.
  private async grant(from: string, to: string, amount: number, key?: string, note?: string): Promise<Record<string, unknown>> {
    if (!from || !to || from === to || !Number.isFinite(amount) || amount <= 0) return { ok: false, error: 'invalid_grant' };
    if (key && this.applyKey(key)) return { ok: true, idempotent: true, from_balance_usd_cents: this.balanceOf(from), to_balance_usd_cents: this.balanceOf(to) };
    // A funder's bonus credits go only to other people's projects: giving to their own draws on what they hold
    // beyond the bonus; giving to another's draws on the bonus first.
    if (from.startsWith('@')) {
      const bonus = this.acct(from)?.bonus_usd_cents ?? 0;
      const own = to.split('/')[0].toLowerCase() === from.slice(1).toLowerCase();
      if (own && this.balanceOf(from) - bonus < amount) return { ok: false, error: 'bonus_only_for_others', bonus_usd_cents: bonus };
    }
    if (this.balanceOf(from) < amount) return { ok: false, error: 'insufficient_balance', from_balance_usd_cents: this.balanceOf(from) };
    this.ensureAcct(from).granted_out_usd_cents += Math.floor(amount);
    this.ensureAcct(to).granted_in_usd_cents += Math.floor(amount);
    this.recordFlow({ kind: 'grant', from, to, amount_usd_cents: Math.floor(amount), ...(note ? { note: note.slice(0, 280) } : {}) });
    if (from.startsWith('@') && to.split('/')[0].toLowerCase() !== from.slice(1).toLowerCase()) { const acct = this.ensureAcct(from); acct.bonus_usd_cents = Math.max(0, (acct.bonus_usd_cents ?? 0) - Math.floor(amount)); }
    await this.save();
    return { ok: true, from, to, amount_usd_cents: Math.floor(amount), from_balance_usd_cents: this.balanceOf(from), to_balance_usd_cents: this.balanceOf(to) };
  }

  private async sponsorUpsert(account: string, sponsor: Sponsor): Promise<Record<string, unknown>> {
    if (!account || !sponsor?.login) return { ok: false, error: 'invalid_sponsor' };
    const a = this.ensureAcct(account);
    a.sponsors_active[sponsor.login] = { login: sponsor.login, name: sponsor.name, tagline: sponsor.tagline, url: sponsor.url, avatar_url: sponsor.avatar_url, monthly_usd_cents: Math.max(0, Math.floor(sponsor.monthly_usd_cents ?? 0)) };
    await this.save();
    return { ok: true, active_sponsors: Object.keys(a.sponsors_active).length };
  }

  private async sponsorRemove(account: string, login: string): Promise<Record<string, unknown>> {
    const a = this.acct(account);
    if (a) { delete a.sponsors_active[login]; await this.save(); }
    return { ok: true };
  }

  // Mint an account with its active recurring sponsors' combined monthly amount, idempotent on the
  // billing month: the recurring path GitHub's webhook cannot provide.
  private async accrue(account: string, key: string): Promise<Record<string, unknown>> {
    const a = this.acct(account);
    const sponsors = a ? Object.values(a.sponsors_active) : [];
    const total = sponsors.reduce((sum, s) => sum + (s.monthly_usd_cents ?? 0), 0);
    if (total <= 0) return { ok: true, credited: false, monthly_total_usd_cents: 0 };
    const result = await this.mint(account, total, key);
    if (!result.idempotent) for (const s of sponsors) upsertSponsor(this.ensureAcct(account).sponsors, s);
    await this.save();
    return { ...result, credited: !result.idempotent, monthly_total_usd_cents: total };
  }

  // ---- coupons ---------------------------------------------------------------------------------------

  private async couponCreate(input: Partial<Coupon>): Promise<Record<string, unknown>> {
    if (!Number.isFinite(input.amount_usd_cents) || (input.amount_usd_cents as number) <= 0) return { ok: false, error: 'invalid_amount' };
    const code = (input.code && String(input.code).trim()) || generateCouponCode();
    if (this.state.coupons[code]) return { ok: false, error: 'coupon_exists' };
    const coupon: Coupon = { code, amount_usd_cents: Math.floor(input.amount_usd_cents as number), from: input.from, sponsor: input.sponsor, expires_at: input.expires_at, redeemed_at: null, redeemed_to: null, created_at: new Date().toISOString() };
    this.state.coupons[code] = coupon;
    await this.save();
    return { ok: true, coupon };
  }

  private async couponRedeem(code: string, to: string): Promise<Record<string, unknown>> {
    const coupon = this.state.coupons[code];
    if (!to) return { ok: false, error: 'redeem_account_required' };
    if (!coupon) return { ok: false, error: 'coupon_not_found' };
    if (coupon.redeemed_at) return { ok: false, error: 'coupon_already_redeemed' };
    if (coupon.expires_at && Date.parse(coupon.expires_at) <= Date.now()) return { ok: false, error: 'coupon_expired' };
    if (coupon.from) {
      const result = await this.grant(coupon.from, to, coupon.amount_usd_cents, `coupon:${code}`);
      if (!result.ok) return result;
    } else {
      await this.mint(to, coupon.amount_usd_cents, `coupon:${code}`, coupon.sponsor);
    }
    coupon.redeemed_at = new Date().toISOString();
    coupon.redeemed_to = to;
    if (coupon.sponsor?.login) upsertSponsor(this.ensureAcct(to).sponsors, coupon.sponsor);
    await this.save();
    return { ok: true, amount_usd_cents: coupon.amount_usd_cents, account: to, sponsor: coupon.sponsor ?? null };
  }

  // ---- keys ------------------------------------------------------------------------------------------

  private activeKeys(account: string): KeyEntry[] {
    const now = Date.now();
    return Object.values(this.state.keys).filter((k) => k.account === account && !k.revoked_at && Date.parse(k.exp) > now);
  }

  private async keyRegister(claims: KeyClaims): Promise<Record<string, unknown>> {
    if (!claims?.kid || !claims.account) return { ok: false, error: 'invalid_key' };
    if (this.acct(claims.account)?.moderation === 'banned') return { ok: false, error: 'account_banned' };
    if (this.activeKeys(claims.account).length >= MAX_ACTIVE_KEYS_PER_ACCOUNT) return { ok: false, error: 'key_limit_reached' };
    this.state.keys[claims.kid] = { kid: claims.kid, account: claims.account, models: claims.models, created_at: claims.iat, exp: claims.exp };
    // The account exists from its first key, so its page and funding gate work before any money arrives.
    this.ensureAcct(claims.account);
    await this.save();
    return { ok: true };
  }

  // A key the registry knows must not be revoked or past its (possibly shortened) expiry. A key the
  // registry does not know is fine: the signature and the token's own expiry already verified it.
  private keyCheck(kid: string): { ok: boolean; error?: string } {
    const k = this.state.keys[kid];
    if (!k) return { ok: true };
    if (k.revoked_at) return { ok: false, error: 'key_revoked' };
    if (Date.parse(k.exp) <= Date.now()) return { ok: false, error: 'key_expired' };
    if (this.acct(k.account)?.moderation === 'banned') return { ok: false, error: 'account_banned' };
    return { ok: true };
  }

  private async keyExpire(kid: string, exp: string): Promise<Record<string, unknown>> {
    const k = this.state.keys[kid];
    if (!k) return { ok: false, error: 'key_not_found' };
    if (!Number.isFinite(Date.parse(exp))) return { ok: false, error: 'invalid_exp' };
    if (Date.parse(exp) < Date.parse(k.exp)) k.exp = exp; // never extend
    await this.save();
    return { ok: true, kid, exp: k.exp };
  }

  private async keyRevoke(kid: string): Promise<Record<string, unknown>> {
    const k = this.state.keys[kid];
    if (!k) return { ok: false, error: 'key_not_found' };
    k.revoked_at = new Date().toISOString();
    await this.save();
    return { ok: true, kid };
  }

  private keysOf(account: string): { ok: true; account: string; keys: KeyEntry[] } {
    return { ok: true, account, keys: Object.values(this.state.keys).filter((k) => k.account === account).sort((a, b) => b.created_at.localeCompare(a.created_at)) };
  }

  // ---- the model rail: reserve, settle, release ------------------------------------------------------

  private async reserve(requestId: string, account: string, kid: string, amount: number, dailyCap: number): Promise<Record<string, unknown>> {
    this.rolloverIfNeeded();
    this.gcReservations();
    if (!Number.isFinite(amount) || amount < 0) return { ok: false, error: 'invalid_amount' };
    const key = this.keyCheck(kid);
    if (!key.ok) return { ok: false, error: key.error === 'account_banned' ? 'account_banned' : 'auth_failed' };
    if (this.acct(account)?.moderation === 'banned') return { ok: false, error: 'account_banned', account };
    // The funding hard-stop: settled spend plus in-flight reservations may not exceed the balance.
    const available = this.balanceOf(account) - this.reservedFor(account);
    // The refusal says what the call needed against what was free: the balance less what other calls in flight hold.
    if (amount > available) return { ok: false, error: 'account_balance_exhausted', account, balance_usd_cents: this.balanceOf(account), reserved_usd_cents: this.reservedFor(account), available_usd_cents: available, needed_usd_cents: amount };
    // The global daily rail: runaway safety, independent of any balance.
    const cap = Number.isFinite(dailyCap) && dailyCap > 0 ? dailyCap : 5000;
    if (amount > cap - this.state.consumed_usd_cents - this.state.reserved_usd_cents) {
      return { ok: false, error: 'global_daily_spend_limit_reached', consumed_usd_cents: this.state.consumed_usd_cents, reserved_usd_cents: this.state.reserved_usd_cents, max_global_daily_usd_cents: cap };
    }
    this.state.reserved_usd_cents += amount;
    this.state.reservations[requestId] = { amount, expires_at_ms: Date.now() + 10 * 60_000, account, kid };
    this.ensureAcct(account);
    await this.save();
    return { ok: true, balance_usd_cents: this.balanceOf(account) - this.reservedFor(account) };
  }

  private async consume(requestId: string, actual: number, event?: UsageEvent): Promise<void> {
    const reservation = this.state.reservations[requestId];
    if (!reservation) return;
    const spent = Number.isFinite(actual) ? Math.max(0, actual) : 0;
    this.state.reserved_usd_cents = Math.max(0, this.state.reserved_usd_cents - reservation.amount);
    delete this.state.reservations[requestId];
    this.state.consumed_usd_cents += spent;
    const a = this.ensureAcct(reservation.account);
    a.consumed_usd_cents += spent;
    recordDailySpend(a, spent);
    const rail: Rail = event?.rail ?? 'model';
    if (spent > 0) this.recordFlow({ kind: 'consume', to: reservation.account, amount_usd_cents: spent, rail });
    a.calls_total = (a.calls_total ?? 0) + 1;
    a.last_call_ms = Date.now();
    const session = await this.attributeSpend(reservation.account, spent);
    // The audit trail: every metered spend, appended durably under the account, never evicted. The running
    // count breaks ties within one millisecond, so the trail's order is the settle order.
    const record: CallRecord = { ts: new Date().toISOString(), request_id: requestId, rail, ...(session ? { session } : {}), usd_cents: spent, outcome: event?.outcome };
    if (rail === 'model') Object.assign(record, { model: event?.model, route: event?.route, input_tokens: event?.input_tokens, output_tokens: event?.output_tokens });
    if (rail === 'card') Object.assign(record, { merchant: event?.merchant, category: event?.category, card_last4: event?.card_last4, reference: event?.reference });
    if (rail === 'partner') Object.assign(record, { partner: event?.partner, unit: event?.unit, quantity: event?.quantity, reference: event?.reference });
    await this.ctx.storage.put(`call:${reservation.account}:${String(Date.now()).padStart(13, '0')}:${String(a.calls_total).padStart(9, '0')}:${requestId}`, record);
    await this.save();
  }

  private async release(requestId: string): Promise<void> {
    const reservation = this.state.reservations[requestId];
    if (!reservation) return;
    this.state.reserved_usd_cents = Math.max(0, this.state.reserved_usd_cents - reservation.amount);
    delete this.state.reservations[requestId];
    await this.save();
  }

  // Storage key: `call:<account>:<ms, zero-padded>:<request id>`; lexicographic order is time order, so a
  // reverse prefix list is newest first and a key doubles as the pagination cursor.
  private async listCalls(account: string, limit: number, before?: string): Promise<{ ok: true; account: string; calls_total: number; calls: CallRecord[]; next?: string }> {
    const n = Number.isFinite(limit) && limit > 0 ? Math.min(200, Math.floor(limit)) : 50;
    const prefix = `call:${account}:`;
    const opts: { prefix: string; reverse: boolean; limit: number; end?: string } = { prefix, reverse: true, limit: n };
    if (before && before.startsWith(prefix)) opts.end = before;
    const page = await this.ctx.storage.list<CallRecord>(opts);
    const keys = [...page.keys()];
    const next = keys.length === n ? keys[keys.length - 1] : undefined;
    return { ok: true, account, calls_total: this.acct(account)?.calls_total ?? 0, calls: keys.map((k) => page.get(k) as CallRecord), ...(next ? { next } : {}) };
  }

  // ---- the development stream ------------------------------------------------------------------------
  // Durable under `session:<account>:<start ms>:<key>`; `sessionidx:<account>:<key>` maps a key to its
  // record; `sessitem:<account>:<item>:<start ms>:<key>` files it under the item it serves.
  private async sessionEvent(account: string, ev: SessionEvent): Promise<Record<string, unknown>> {
    if (!ev || typeof ev !== 'object' || typeof ev.key !== 'string' || !ev.key || ev.key.length > 200 || ev.key.includes(':')) return { ok: false, error: 'invalid_event' };
    const idxKey = `sessionidx:${account}:${ev.key}`;
    let storageKey = await this.ctx.storage.get<string>(idxKey);
    let session = storageKey ? await this.ctx.storage.get<SessionRecord>(storageKey) : undefined;
    const now = Date.now();
    const a = this.ensureAcct(account);
    const before = session?.item_id;
    if (ev.kind === 'started') {
      if (session) return { ok: true, session: sessionSummary(session), idempotent: true };
      const startedMs = Number.isFinite(Date.parse(ev.started_at ?? '')) ? Date.parse(ev.started_at as string) : now;
      session = {
        key: ev.key, account, kind: sessionKind(ev.session_kind), status: 'live',
        title: clipText(ev.title, 200), item_id: itemId(ev.item_id), source: clipText(ev.source, 80),
        started_at: new Date(startedMs).toISOString(), turns: [], turn_count: 0, next_seq: 0, usd_cents: 0, calls: 0, updated_at: new Date(now).toISOString(),
      };
      storageKey = `session:${account}:${String(startedMs).padStart(13, '0')}:${ev.key}`;
      await this.ctx.storage.put(idxKey, storageKey);
      a.live_sessions = [...(a.live_sessions ?? []).filter((k) => k !== ev.key), ev.key];
    } else if (!session || !storageKey) {
      return { ok: false, error: 'session_not_started' };
    } else if (ev.kind === 'turns') {
      // Offset idempotency: `seq` is the index of the first turn in the session's own order. A retry or a
      // reconnect replays offsets already applied and is ignored; a gap is accepted (the tail is kept).
      const seq = Number.isInteger(ev.seq) && (ev.seq as number) >= 0 ? (ev.seq as number) : session.next_seq;
      if (seq < session.next_seq) return { ok: true, session: sessionSummary(session), idempotent: true };
      const incoming = Array.isArray(ev.turns) ? ev.turns.slice(0, MAX_TURNS_PER_EVENT).map(normalizeTurn).filter((t): t is Turn => t !== null) : [];
      session.turns = [...session.turns, ...incoming.map((t, i) => ({ ...t, seq: seq + i }))].slice(-MAX_TURNS);
      session.turn_count += incoming.length;
      session.next_seq = seq + incoming.length;
      if (ev.item_id && !session.item_id) session.item_id = itemId(ev.item_id);
      session.updated_at = new Date(now).toISOString();
    } else if (ev.kind === 'ended') {
      session.status = 'ended';
      if (ev.outcome === 'done' || ev.outcome === 'failed') session.outcome = ev.outcome;
      const endedMs = Date.parse(ev.ended_at ?? '');
      const startedMs = Date.parse(session.started_at);
      session.ended_at = new Date(Number.isFinite(endedMs) && endedMs >= startedMs && endedMs <= now + 60_000 ? endedMs : now).toISOString();
      session.report = clipText(ev.report, 4000);
      if (ev.commit_sha && /^[0-9a-f]{7,40}$/.test(ev.commit_sha)) session.commit_sha = ev.commit_sha;
      if (ev.item_id) session.item_id = itemId(ev.item_id);
      session.updated_at = new Date(now).toISOString();
      a.live_sessions = (a.live_sessions ?? []).filter((k) => k !== ev.key);
      if (!a.live_sessions.length) delete a.live_sessions;
    } else {
      return { ok: false, error: 'invalid_event_kind' };
    }
    await this.ctx.storage.put(storageKey, session);
    if (session.item_id && session.item_id !== before) {
      const suffix = storageKey.slice(`session:${account}:`.length);
      if (before) await this.ctx.storage.delete(`sessitem:${account}:${before}:${suffix}`);
      await this.ctx.storage.put(`sessitem:${account}:${session.item_id}:${suffix}`, storageKey);
    }
    await this.save();
    return { ok: true, session: sessionSummary(session) };
  }

  private async listSessions(account: string, limit: number): Promise<{ ok: true; account: string; live: string[]; sessions: SessionSummary[] }> {
    const n = Number.isFinite(limit) && limit > 0 ? Math.min(100, Math.floor(limit)) : 30;
    const page = await this.ctx.storage.list<SessionRecord>({ prefix: `session:${account}:`, reverse: true, limit: n });
    return { ok: true, account, live: [...(this.acct(account)?.live_sessions ?? [])], sessions: [...page.values()].map(sessionSummary) };
  }

  private async getSession(account: string, key: string): Promise<{ ok: boolean; error?: string; session?: SessionRecord }> {
    const storageKey = await this.ctx.storage.get<string>(`sessionidx:${account}:${key}`);
    const session = storageKey ? await this.ctx.storage.get<SessionRecord>(storageKey) : undefined;
    return session ? { ok: true, session } : { ok: false, error: 'session_not_found' };
  }

  // Operator repair: drop one session (a reporter that narrated the wrong transcript). The meter is untouched.
  private async deleteSession(account: string, key: string): Promise<{ ok: boolean; error?: string }> {
    const idxKey = `sessionidx:${account}:${key}`;
    const storageKey = await this.ctx.storage.get<string>(idxKey);
    if (!storageKey) return { ok: false, error: 'session_not_found' };
    const session = await this.ctx.storage.get<SessionRecord>(storageKey);
    await this.ctx.storage.delete(storageKey);
    await this.ctx.storage.delete(idxKey);
    if (session?.item_id) await this.ctx.storage.delete(`sessitem:${account}:${session.item_id}:${storageKey.slice(`session:${account}:`.length)}`);
    const a = this.acct(account);
    if (a?.live_sessions?.includes(key)) {
      a.live_sessions = a.live_sessions.filter((k) => k !== key);
      if (!a.live_sessions.length) delete a.live_sessions;
      await this.save();
    }
    return { ok: true };
  }

  // A short progress update on a work item. `update:<account>:<item>:<ms>:<id>`: one prefix lists an
  // item's updates newest first, the account prefix lists them all.
  private async postUpdate(account: string, item: string, text: unknown, session?: unknown, at?: unknown): Promise<{ ok: boolean; error?: string; update?: UpdateRecord }> {
    const item_id = itemId(item);
    const body = clipText(text, MAX_UPDATE_TEXT);
    if (!item_id || !body) return { ok: false, error: 'invalid_update' };
    const now = Date.now();
    const tsMs = typeof at === 'string' && Number.isFinite(Date.parse(at)) && Date.parse(at) <= now + 60_000 ? Date.parse(at) : now;
    const update: UpdateRecord = { id: crypto.randomUUID(), account, item_id, ts: new Date(tsMs).toISOString(), text: body, ...(typeof session === 'string' && session && session.length <= 200 ? { session } : {}) };
    await this.ctx.storage.put(`update:${account}:${item_id}:${String(tsMs).padStart(13, '0')}:${update.id}`, update);
    this.ensureAcct(account);
    await this.save();
    return { ok: true, update };
  }

  // The item view: every session that served the item, every update posted to it, and the cents those
  // sessions settled, read from the item index.
  private async itemView(account: string, item: string): Promise<ItemView> {
    const item_id = itemId(item) ?? '';
    const pointers = await this.ctx.storage.list<string>({ prefix: `sessitem:${account}:${item_id}:`, reverse: true, limit: 100 });
    const records = await Promise.all([...pointers.values()].map((k) => this.ctx.storage.get<SessionRecord>(k)));
    const sessions = records.filter((s): s is SessionRecord => !!s).map(sessionSummary);
    const updates = [...(await this.ctx.storage.list<UpdateRecord>({ prefix: `update:${account}:${item_id}:`, reverse: true, limit: 100 })).values()];
    const usd_cents = Number(sessions.reduce((sum, s) => sum + (s.usd_cents ?? 0), 0).toFixed(6));
    const keys = new Set(sessions.map((s) => s.key));
    const purchases = (await this.listCalls(account, 300)).calls.filter((c) => c.rail !== 'model' && c.session && keys.has(c.session));
    const task = await this.ctx.storage.get<TaskRecord>(`task:${account}:${item_id}`);
    return { ok: true, account, item_id, live: sessions.filter((s) => s.status === 'live').map((s) => s.key), sessions, updates, purchases, ...(task ? { task } : {}), usd_cents };
  }

  // The agent's setup replaces what was there: its substrate publishes the whole record each time.
  private async setupPut(account: string, setup: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
    if (!setup || typeof setup !== 'object') return { ok: false, error: 'invalid_setup' };
    const text = (v: unknown, max: number): string | undefined => (typeof v === 'string' ? v.slice(0, max) : undefined);
    const schedule = Array.isArray(setup.schedule) ? setup.schedule.slice(0, 20).filter((j: unknown) => j && typeof j === 'object').map((j: Record<string, unknown>) => ({ name: text(j.name, 80), schedule: text(j.schedule, 80), prompt: text(j.description, 400) })) : [];
    const skills = Array.isArray(setup.skills) ? setup.skills.filter((k: unknown) => typeof k === 'string').slice(0, 50).map((k: string) => k.slice(0, 80)) : [];
    const profile: Partial<AccountProfile> = { soul_md: text(setup.persona, 20_000) ?? '', setup_md: text(setup.setup_md, 20_000) ?? '', schedule_json: JSON.stringify({ jobs: schedule }), agent_harness: text(setup.harness, 40) ?? '', agent_model: text(setup.model, 120) ?? '', agent_provider: text(setup.provider, 40) ?? '', agent_skills: skills.join(',') };
    await this.setProfile(account, profile);
    return { ok: true };
  }

  // The board's state for an item replaces what was there: the reporter publishes the whole task each time.
  private async taskPut(account: string, item: string, task: Record<string, unknown>): Promise<{ ok: boolean; error?: string; task?: TaskRecord }> {
    const item_id = itemId(item);
    if (!item_id || !task || typeof task.task_id !== 'string' || typeof task.lane !== 'string') return { ok: false, error: 'invalid_task' };
    const text = (v: unknown, max = 400): string | undefined => (typeof v === 'string' && v.trim() ? v.slice(0, max) : undefined);
    const attempts = (Array.isArray(task.attempts) ? task.attempts : []).slice(-50).map((a: Record<string, unknown>) => ({ id: String(a.id ?? ''), profile: text(a.profile, 80), status: text(a.status, 40) ?? '', started_at: text(a.started_at, 40), ended_at: text(a.ended_at, 40), outcome: text(a.outcome, 40), summary: text(a.summary, 2000) }));
    const reviews = (Array.isArray(task.reviews) ? task.reviews : []).slice(-50).map((r: Record<string, unknown>) => ({ verdict: text(r.verdict, 40) ?? 'requested', by: text(r.by, 80), reason: text(r.reason, 2000), at: text(r.at, 40) }));
    const handoff = task.handoff && typeof task.handoff === 'object' ? { summary: text((task.handoff as Record<string, unknown>).summary, 4000), metadata: (task.handoff as Record<string, unknown>).metadata } : undefined;
    const record: TaskRecord = { account, item_id, task_id: task.task_id.slice(0, 80), lane: task.lane.slice(0, 40), title: text(task.title, 200), assignee: text(task.assignee, 80), attempts, reviews, ...(handoff ? { handoff } : {}), updated_at: new Date().toISOString() };
    await this.ctx.storage.put(`task:${account}:${item_id}`, record);
    return { ok: true, task: record };
  }

  // Spend lands on the session that was live when it settled. With one live session the attribution is
  // exact; with none or several it is left unattributed rather than guessed.
  private async attributeSpend(account: string, cents: number): Promise<string | undefined> {
    const live = this.acct(account)?.live_sessions ?? [];
    if (live.length !== 1) return undefined;
    const storageKey = await this.ctx.storage.get<string>(`sessionidx:${account}:${live[0]}`);
    const session = storageKey ? await this.ctx.storage.get<SessionRecord>(storageKey) : undefined;
    if (!session || !storageKey) return undefined;
    session.usd_cents = Number(((session.usd_cents ?? 0) + cents).toFixed(6));
    session.calls = (session.calls ?? 0) + 1;
    session.updated_at = new Date().toISOString();
    await this.ctx.storage.put(storageKey, session);
    return live[0];
  }

  // ---- the card rail's cards ---------------------------------------------------------------------------
  // `card:<stripe card id>`: a card minted against the balance, its reservation, and where it stands.
  private async cardPut(card: CardRecord): Promise<{ ok: boolean; error?: string }> {
    if (!card || typeof card.id !== 'string' || !card.id || typeof card.account !== 'string') return { ok: false, error: 'invalid_card' };
    await this.ctx.storage.put(`card:${card.id}`, card);
    return { ok: true };
  }
  private async cardGet(id: string): Promise<{ ok: boolean; error?: string; card?: CardRecord }> {
    const card = await this.ctx.storage.get<CardRecord>(`card:${id}`);
    return card ? { ok: true, card } : { ok: false, error: 'card_not_found' };
  }
  private async setCardholder(account: string, cardholder: string): Promise<{ ok: true }> {
    this.ensureAcct(account).stripe_cardholder = cardholder;
    await this.save();
    return { ok: true };
  }

  // ---- money in: Polar's products and checkouts ---------------------------------------------------------
  private async setPolarProducts(account: string, products: Record<string, string>): Promise<{ ok: boolean; error?: string }> {
    if (!products || typeof products !== 'object') return { ok: false, error: 'invalid_products' };
    this.ensureAcct(account).polar_products = Object.fromEntries(Object.entries(products).filter(([k, v]) => typeof k === 'string' && typeof v === 'string'));
    await this.save();
    return { ok: true };
  }
  // `polar_checkout:<checkout id>`: the account and tier a checkout funds.
  private async polarCheckoutPut(checkout: PolarCheckout): Promise<{ ok: boolean; error?: string }> {
    if (!checkout || typeof checkout.id !== 'string' || !checkout.id || typeof checkout.account !== 'string') return { ok: false, error: 'invalid_checkout' };
    await this.ctx.storage.put(`polar_checkout:${checkout.id}`, checkout);
    return { ok: true };
  }
  private async polarCheckoutGet(id: string): Promise<{ ok: boolean; error?: string; checkout?: PolarCheckout }> {
    const checkout = await this.ctx.storage.get<PolarCheckout>(`polar_checkout:${id}`);
    return checkout ? { ok: true, checkout } : { ok: false, error: 'checkout_not_found' };
  }

  // ---- the roadmap: one normalized model, revisioned ---------------------------------------------------
  // Every driver lands here: the file driver on sync, the milestones driver on sync, an owner-side driver
  // through the steer-scoped push. A revision records who, when, from which source, and what changed; an
  // unchanged roadmap is not a revision. `roadmap:<account>:<revision, zero-padded>`.
  private async roadmapSet(account: string, roadmap: Roadmap, source: string, by?: string): Promise<{ ok: boolean; error?: string; unchanged?: boolean; revision?: RoadmapRevision }> {
    const model = normalizeRoadmap(roadmap);
    if (!model) return { ok: false, error: 'invalid_roadmap' };
    // The source is the substrate's own label: a file, a tracker, a board, whatever reads its roadmap onto the model.
    if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(source)) return { ok: false, error: 'invalid_source' };
    const a = this.ensureAcct(account);
    const current = a.roadmap_revision ? await this.ctx.storage.get<RoadmapRevision>(`roadmap:${account}:${String(a.roadmap_revision).padStart(9, '0')}`) : undefined;
    if (current && sameRoadmap(current.roadmap, model) && current.source === source) return { ok: true, unchanged: true, revision: current };
    const revision: RoadmapRevision = {
      revision: (a.roadmap_revision ?? 0) + 1, ts: new Date().toISOString(), source, by: clipText(by, 80), roadmap: model,
      changes: diffRoadmaps(current?.roadmap, model), conformance: CONFORMANCE[source as RoadmapSource] ?? [],
    };
    await this.ctx.storage.put(`roadmap:${account}:${String(revision.revision).padStart(9, '0')}`, revision);
    a.roadmap_revision = revision.revision;
    await this.save();
    return { ok: true, revision };
  }

  private async roadmapCurrent(account: string): Promise<{ ok: boolean; error?: string; revision?: RoadmapRevision }> {
    const n = this.acct(account)?.roadmap_revision;
    const revision = n ? await this.ctx.storage.get<RoadmapRevision>(`roadmap:${account}:${String(n).padStart(9, '0')}`) : undefined;
    return revision ? { ok: true, revision } : { ok: false, error: 'no_roadmap' };
  }

  private async roadmapRevisions(account: string, limit: number): Promise<{ ok: true; account: string; revisions: RoadmapRevision[] }> {
    const n = Number.isFinite(limit) && limit > 0 ? Math.min(100, Math.floor(limit)) : 20;
    const page = await this.ctx.storage.list<RoadmapRevision>({ prefix: `roadmap:${account}:`, reverse: true, limit: n });
    return { ok: true, account, revisions: [...page.values()] };
  }

  // ---- read models -----------------------------------------------------------------------------------

  // What a project page watches between reloads: the books' three numbers, what is live, the roadmap's revision.
  // All in memory, so a page can ask every couple of seconds.
  private pulse(account: string): Pulse {
    const f = this.fundingSnapshot(account);
    const a = this.acct(account);
    return { balance_usd_cents: f.balance_usd_cents, consumed_usd_cents: f.consumed_usd_cents, granted_in_usd_cents: f.granted_in_usd_cents, live: [...(a?.live_sessions ?? [])], roadmap_revision: a?.roadmap_revision ?? 0 };
  }

  fundingSnapshot(account: string): FundingSnapshot {
    const a = this.acct(account);
    const grantedIn = a?.granted_in_usd_cents ?? 0;
    const grantedOut = a?.granted_out_usd_cents ?? 0;
    const consumed = a?.consumed_usd_cents ?? 0;
    const balance = grantedIn - grantedOut - consumed;
    const reserved = this.reservedFor(account);
    const funded = grantedIn > 0;
    const daily = a ? dailySpendSeries(a.daily_spend) : [];
    const est = estimateRunway(Math.max(0, balance), daily.slice(0, -1));
    return {
      account, funded, paused: funded && balance <= 0,
      balance_usd_cents: balance, granted_in_usd_cents: grantedIn, granted_out_usd_cents: grantedOut, consumed_usd_cents: consumed,
      reserved_usd_cents: reserved, spendable_usd_cents: balance - reserved,
      burn_per_day_usd_cents: est.burn_per_day_usd_cents,
      runway_days: funded ? est.runway_days : null, runway_lo_days: funded ? est.runway_lo_days : null, runway_hi_days: funded ? est.runway_hi_days : null,
      days_observed: est.days_observed, runway_confident: funded && est.confident,
      sponsors: a ? activeSponsors(a) : [],
      calls_total: a?.calls_total ?? 0,
      last_call_at: a?.last_call_ms ? new Date(a.last_call_ms).toISOString() : null,
      daily_spend_usd_cents: daily,
    };
  }

  private async setProfile(account: string, profile: Partial<AccountProfile> = {}, goalDays?: number, tiers?: Tier[]): Promise<Record<string, unknown>> {
    if (!account) return { ok: false, error: 'invalid_account' };
    const a = this.ensureAcct(account);
    const p = (a.profile ??= {});
    for (const k of PROFILE_KEYS) if (profile[k] !== undefined) p[k] = profile[k];
    if (typeof goalDays === 'number' && goalDays > 0) a.goal_days = Math.floor(goalDays);
    if (Array.isArray(tiers)) a.tiers = tiers.filter((t) => t && typeof t.usd_cents === 'number' && typeof t.name === 'string').map((t) => ({ usd_cents: t.usd_cents, name: t.name }));
    await this.save();
    return { ok: true, account, profile: p };
  }

  private async moderate(account: string, status: Moderation, reason?: string, overrides: Partial<AccountProfile> = {}): Promise<Record<string, unknown>> {
    if (!account || !['listed', 'hidden', 'banned'].includes(status)) return { ok: false, error: 'invalid_moderation' };
    const a = this.ensureAcct(account);
    a.moderation = status;
    a.moderation_reason = reason;
    const p = (a.profile ??= {});
    if (overrides.tagline_override !== undefined) p.tagline_override = overrides.tagline_override || undefined;
    if (overrides.cover_override !== undefined) p.cover_override = overrides.cover_override || undefined;
    await this.save();
    return { ok: true, account, moderation: status };
  }

  private directory(): DirectoryEntry[] {
    return Object.keys(this.state.accounts).map((id) => this.entryFor(id)).sort((a, b) => b.balance_usd_cents - a.balance_usd_cents);
  }

  private entryFor(account: string): DirectoryEntry {
    const a = this.acct(account);
    const f = this.fundingSnapshot(account);
    const projectPatrons = projectPatronsOf(this.state.flows, account, () => ({})).length;
    return {
      account,
      is_project: account.includes('/'),
      listed: account.includes('/') && (a?.moderation ?? 'listed') === 'listed' && Boolean(a?.profile?.synced_at),
      moderation: a?.moderation ?? 'listed',
      profile: displayProfile(a),
      goal_days: a?.goal_days ?? DEFAULT_GOAL_DAYS,
      funded: f.funded, paused: f.paused,
      balance_usd_cents: f.balance_usd_cents, granted_in_usd_cents: f.granted_in_usd_cents, granted_out_usd_cents: f.granted_out_usd_cents, consumed_usd_cents: f.consumed_usd_cents,
      burn_per_day_usd_cents: f.burn_per_day_usd_cents, runway_days: f.runway_days, runway_confident: f.runway_confident,
      patron_count: patronCount(a) + projectPatrons,
      monthly_usd_cents: monthlyTotal(a),
      live_sessions: [...(a?.live_sessions ?? [])],
      ...(a?.stripe_cardholder ? { stripe_cardholder: a.stripe_cardholder } : {}),
      ...(a?.polar_products ? { polar_products: { ...a.polar_products } } : {}),
      status: fundingStatus(f),
    };
  }

  private async bonusAdd(account: string, amount: number): Promise<{ ok: boolean; bonus_usd_cents?: number; error?: string }> {
    if (!account.startsWith('@') || !(amount > 0)) return { ok: false, error: 'invalid_bonus' };
    const acct = this.ensureAcct(account);
    acct.bonus_usd_cents = (acct.bonus_usd_cents ?? 0) + Math.floor(amount);
    await this.save();
    return { ok: true, bonus_usd_cents: acct.bonus_usd_cents };
  }

  // A funder on the books: the credits they hold, what they were given, what they gave and to whom.
  private funderView(account: string): FunderView {
    const a = this.acct(account);
    const f = this.fundingSnapshot(account);
    const flows = this.state.flows.filter((x) => x.to === account || x.from === account);
    return {
      ok: true, found: Boolean(a), account, login: account.replace(/^@/, ''),
      credits_usd_cents: f.balance_usd_cents, bonus_usd_cents: a?.bonus_usd_cents ?? 0, received_usd_cents: f.granted_in_usd_cents, given_usd_cents: f.granted_out_usd_cents,
      ...(a?.polar_products ? { polar_products: { ...a.polar_products } } : {}),
      given: flows.filter((x) => x.kind === 'grant' && x.from === account).slice(-50).reverse(),
      received: flows.filter((x) => x.to === account && x.kind !== 'consume').slice(-50).reverse(),
    };
  }

  private projectView(account: string): ProjectView {
    const a = this.acct(account);
    const entry = this.entryFor(account);
    const feed = this.state.flows.filter((flow) => (flow.to === account || flow.from === account) && flow.kind !== 'consume').slice(-FEED_LIMIT).reverse();
    const sponsorPatrons: Patron[] = (a ? activeSponsors(a) : []).map((s) => ({ kind: 'sponsor', login: s.login, name: s.name, avatar_url: s.avatar_url, url: s.url, tagline: s.tagline, amount_label: s.monthly_usd_cents ? `$${(s.monthly_usd_cents / 100).toFixed(0)}/mo` : undefined }));
    const projectPatrons = projectPatronsOf(this.state.flows, account, (id) => displayProfile(this.acct(id)));
    return { found: Boolean(a), ...entry, tiers: a?.tiers ?? DEFAULT_TIERS, feed, patrons: [...projectPatrons, ...sponsorPatrons] };
  }

  private snapshot() {
    return {
      day_key: this.state.day_key,
      consumed_usd_cents: this.state.consumed_usd_cents,
      reserved_usd_cents: this.state.reserved_usd_cents,
      reservations: Object.keys(this.state.reservations).length,
      keys: Object.values(this.state.keys).map((k) => ({ kid: k.kid, account: k.account, exp: k.exp, revoked_at: k.revoked_at ?? null })),
      accounts: Object.fromEntries(Object.keys(this.state.accounts).map((id) => [id, { ...this.state.accounts[id], profile: undefined, balance_usd_cents: this.balanceOf(id) }])),
    };
  }

  // Operator escape hatch: zero today's daily rail without waiting for the UTC rollover. Balances and
  // in-flight reservations are untouched.
  private async resetDaily(): Promise<Record<string, unknown>> {
    const before = this.state.consumed_usd_cents;
    this.state.consumed_usd_cents = 0;
    await this.save();
    return { ok: true, day_key: this.state.day_key, cleared_consumed_usd_cents: before, consumed_usd_cents: 0, reserved_usd_cents: this.state.reserved_usd_cents };
  }

  private rolloverIfNeeded(): void {
    const today = dayKey();
    if (this.state.day_key === today) return;
    this.state.day_key = today;
    this.state.consumed_usd_cents = 0;
    this.state.reserved_usd_cents = 0;
    this.state.reservations = {};
  }

  private gcReservations(): void {
    const now = Date.now();
    for (const [id, r] of Object.entries(this.state.reservations)) {
      if (r.expires_at_ms < now) { this.state.reserved_usd_cents = Math.max(0, this.state.reserved_usd_cents - r.amount); delete this.state.reservations[id]; }
    }
  }
}

// The stored record may predate this shape; only the fields the books use survive a load.
function normalizeState(stored: Partial<LedgerState>): LedgerState {
  const state = emptyState();
  if (typeof stored.day_key === 'string') state.day_key = stored.day_key;
  if (typeof stored.consumed_usd_cents === 'number') state.consumed_usd_cents = stored.consumed_usd_cents;
  if (typeof stored.reserved_usd_cents === 'number') state.reserved_usd_cents = stored.reserved_usd_cents;
  for (const [id, r] of Object.entries(stored.reservations ?? {})) if (r && typeof r.amount === 'number' && typeof r.account === 'string') state.reservations[id] = { amount: r.amount, expires_at_ms: r.expires_at_ms ?? 0, account: r.account, kid: r.kid ?? '' };
  for (const [id, a] of Object.entries(stored.accounts ?? {})) {
    if (!a || typeof a !== 'object') continue;
    const acct = emptyAccount();
    acct.granted_in_usd_cents = num(a.granted_in_usd_cents);
    acct.granted_out_usd_cents = num(a.granted_out_usd_cents);
    acct.consumed_usd_cents = num(a.consumed_usd_cents);
    if (typeof a.calls_total === 'number') acct.calls_total = a.calls_total;
    if (typeof a.last_call_ms === 'number') acct.last_call_ms = a.last_call_ms;
    if (Array.isArray(a.live_sessions) && a.live_sessions.length) acct.live_sessions = a.live_sessions.filter((k) => typeof k === 'string');
    if (typeof a.roadmap_revision === 'number') acct.roadmap_revision = a.roadmap_revision;
    if (typeof a.stripe_cardholder === 'string') acct.stripe_cardholder = a.stripe_cardholder;
    if (typeof a.bonus_usd_cents === 'number') acct.bonus_usd_cents = a.bonus_usd_cents;
    if (a.polar_products && typeof a.polar_products === 'object') acct.polar_products = Object.fromEntries(Object.entries(a.polar_products).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
    acct.daily_spend = a.daily_spend && typeof a.daily_spend === 'object' ? a.daily_spend : {};
    acct.sponsors = Array.isArray(a.sponsors) ? a.sponsors : [];
    acct.sponsors_active = a.sponsors_active && typeof a.sponsors_active === 'object' ? a.sponsors_active : {};
    if (a.profile && typeof a.profile === 'object') { acct.profile = {}; for (const k of PROFILE_KEYS) if (typeof a.profile[k] === 'string') acct.profile[k] = a.profile[k]; }
    if (typeof a.goal_days === 'number') acct.goal_days = a.goal_days;
    if (Array.isArray(a.tiers)) acct.tiers = a.tiers.filter((t) => t && typeof t.usd_cents === 'number' && typeof t.name === 'string').map((t) => ({ usd_cents: t.usd_cents, name: t.name }));
    if (a.moderation === 'listed' || a.moderation === 'hidden' || a.moderation === 'banned') acct.moderation = a.moderation;
    if (typeof a.moderation_reason === 'string') acct.moderation_reason = a.moderation_reason;
    state.accounts[id] = acct;
  }
  state.applied_keys = Array.isArray(stored.applied_keys) ? stored.applied_keys.filter((k) => typeof k === 'string') : [];
  state.coupons = stored.coupons && typeof stored.coupons === 'object' ? stored.coupons : {};
  state.flows = Array.isArray(stored.flows) ? stored.flows.filter((f) => f && (f.kind === 'mint' || f.kind === 'grant' || f.kind === 'consume')) : [];
  state.keys = stored.keys && typeof stored.keys === 'object' ? stored.keys : {};
  return state;
}
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function emptyState(): LedgerState {
  return { day_key: dayKey(), consumed_usd_cents: 0, reserved_usd_cents: 0, reservations: {}, accounts: {}, applied_keys: [], coupons: {}, flows: [], keys: {} };
}
function emptyAccount(): Account {
  return { granted_in_usd_cents: 0, granted_out_usd_cents: 0, consumed_usd_cents: 0, daily_spend: {}, sponsors: [], sponsors_active: {} };
}
function upsertSponsor(list: Sponsor[], sponsor: Sponsor): void {
  const i = list.findIndex((s) => s.login === sponsor.login);
  if (i >= 0) list[i] = sponsor; else list.push(sponsor);
}
function recordDailySpend(a: Account, amount: number): void {
  const today = dayKey();
  a.daily_spend[today] = (a.daily_spend[today] ?? 0) + amount;
  const days = Object.keys(a.daily_spend).sort();
  while (days.length > 14) delete a.daily_spend[days.shift() as string];
}
// Daily spend (idle days as 0), oldest to today, over the trailing 14 days: the evidence for the runway estimate.
function dailySpendSeries(daily: Record<string, number>): number[] {
  const keys = Object.keys(daily).sort();
  if (!keys.length) return [];
  const today = dayKey();
  const series: number[] = [];
  for (let d = keys[0]; d <= today; d = nextDay(d)) { series.push(daily[d] ?? 0); if (series.length > 14) series.shift(); }
  return series;
}
function nextDay(key: string): string {
  const dt = new Date(`${key}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}
function activeSponsors(a: Account): Sponsor[] {
  return [...Object.values(a.sponsors_active), ...a.sponsors.filter((s) => !a.sponsors_active[s.login])];
}
function displayProfile(a: Account | undefined): AccountProfile {
  const p = a?.profile ?? {};
  return { ...p, tagline: p.tagline_override ?? p.tagline, cover_url: p.cover_override ?? p.cover_url };
}
function patronCount(a: Account | undefined): number {
  if (!a) return 0;
  return new Set<string>([...Object.keys(a.sponsors_active), ...a.sponsors.map((s) => s.login)]).size;
}
function monthlyTotal(a: Account | undefined): number {
  return a ? Object.values(a.sponsors_active).reduce((sum, s) => sum + (s.monthly_usd_cents ?? 0), 0) : 0;
}
function fundingStatus(f: FundingSnapshot): 'funded' | 'low' | 'unfunded' {
  if (!f.funded || f.balance_usd_cents <= 0) return 'unfunded';
  if (f.runway_confident && f.runway_days !== null && f.runway_days < 7) return 'low';
  return 'funded';
}
// Projects and funders that have granted INTO this account are patrons: a project's avatar is its own, a
// funder's is their GitHub login's.
function projectPatronsOf(flows: Flow[], account: string, profileOf: (id: string) => AccountProfile): Patron[] {
  const byFrom = new Map<string, number>();
  for (const flow of flows) if (flow.kind === 'grant' && flow.to === account && flow.from && (flow.from.includes('/') || flow.from.startsWith('@'))) byFrom.set(flow.from, (byFrom.get(flow.from) ?? 0) + flow.amount_usd_cents);
  const funders: Patron[] = [...byFrom.entries()].filter(([from]) => from.startsWith('@')).map(([from, total]) => ({ kind: 'funder', login: from.slice(1), name: from, avatar_url: `https://github.com/${encodeURIComponent(from.slice(1))}.png?size=64`, url: `/p/${encodeURIComponent(from)}`, amount_label: `granted ${(total / 100).toFixed(2)}` }));
  byFrom.forEach((_, from) => { if (from.startsWith('@')) byFrom.delete(from); });
  return projectPatronsOfProjects(byFrom, profileOf);
}
function projectPatronsOfProjects(byFrom: Map<string, number>, profileOf: (id: string) => AccountProfile): Patron[] {
  return [...byFrom.entries()].map(([from, total]) => ({ kind: 'project', login: from, name: from, avatar_url: profileOf(from).avatar_url, url: `/p/${encodeURIComponent(from)}`, amount_label: `granted $${(total / 100).toFixed(0)}` }));
}
function generateCouponCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const chars = [...crypto.getRandomValues(new Uint8Array(12))].map((b) => alphabet[b % alphabet.length]);
  return `SPON-${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}`;
}
function dayKey(): string {
  return new Date().toISOString().slice(0, 10);
}
export function sessionSummary(s: SessionRecord): SessionSummary {
  const { turns, ...rest } = s;
  return { ...rest, tool_calls: turns.filter((t) => t.role === 'assistant' && t.tool).length };
}
function clipText(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string' || !v) return undefined;
  return v.length > max ? `${v.slice(0, max - 1)}…` : v;
}
// A work item id as ROADMAP.yml names it: short, and never a storage-key separator.
function itemId(v: unknown): string | undefined {
  return typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(v) ? v : undefined;
}
function sessionKind(v: unknown): string {
  return typeof v === 'string' && /^[a-z][a-z0-9-]{0,39}$/.test(v) ? v : 'run';
}
function normalizeTurn(v: unknown): Turn | null {
  if (!v || typeof v !== 'object') return null;
  const t = v as Record<string, unknown>;
  const role = t.role;
  if (role !== 'user' && role !== 'assistant' && role !== 'tool' && role !== 'system') return null;
  const out: Turn = { role };
  if (typeof t.ts === 'string' && Number.isFinite(Date.parse(t.ts))) out.ts = t.ts;
  const text = clipText(t.text, MAX_TURN_TEXT); if (text) out.text = text;
  const tool = clipText(t.tool, 80); if (tool) out.tool = tool;
  const args = clipText(t.args, 600); if (args) out.args = args;
  const result = clipText(t.result, 600); if (result) out.result = result;
  return out;
}

// One revision of a project's roadmap: the normalized model, its source, who pushed it and what changed.
export interface RoadmapRevision {
  revision: number;
  ts: string;
  source: string;
  by?: string;
  roadmap: Roadmap;
  changes: RoadmapChange[];
  conformance: string[];
}
// A roadmap as pushed or pulled, checked to the model's shape: short ids, known statuses, bounded text.
function normalizeRoadmap(r: unknown): Roadmap | undefined {
  if (!r || typeof r !== 'object' || !Array.isArray((r as Roadmap).items)) return undefined;
  const items: RoadmapItem[] = [];
  const seen = new Set<string>();
  for (const it of (r as Roadmap).items.slice(0, 500)) {
    if (!it || typeof it !== 'object' || typeof it.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(it.id) || seen.has(it.id) || typeof it.title !== 'string') return undefined;
    seen.add(it.id);
    items.push({
      id: it.id, title: it.title.slice(0, 200), status: (ROADMAP_STATUSES as readonly string[]).includes(it.status) ? it.status : 'planned',
      ...(typeof it.phase === 'string' ? { phase: it.phase.slice(0, 20) } : {}), ...(typeof it.priority === 'string' ? { priority: it.priority.slice(0, 20) } : {}),
      acceptance: Array.isArray(it.acceptance) ? it.acceptance.filter((l): l is string => typeof l === 'string').slice(0, 40).map((l) => l.slice(0, 1000)) : [],
    });
  }
  return { schema: typeof (r as Roadmap).schema === 'string' ? (r as Roadmap).schema : ROADMAP_SCHEMA, items };
}

export interface Pulse { balance_usd_cents: number; consumed_usd_cents: number; granted_in_usd_cents: number; live: string[]; roadmap_revision: number }
export interface FundingSnapshot {
  account: string;
  funded: boolean;
  paused: boolean;
  balance_usd_cents: number;
  granted_in_usd_cents: number;
  granted_out_usd_cents: number;
  consumed_usd_cents: number;
  reserved_usd_cents: number;
  spendable_usd_cents: number;
  burn_per_day_usd_cents: number;
  runway_days: number | null;
  runway_lo_days: number | null;
  runway_hi_days: number | null;
  days_observed: number;
  runway_confident: boolean;
  sponsors: Sponsor[];
  calls_total: number;
  last_call_at: string | null;
  daily_spend_usd_cents: number[];
}

export interface DirectoryEntry {
  account: string;
  is_project: boolean;
  listed: boolean;
  moderation: Moderation;
  profile: AccountProfile;
  goal_days: number;
  funded: boolean;
  paused: boolean;
  balance_usd_cents: number;
  granted_in_usd_cents: number;
  granted_out_usd_cents: number;
  consumed_usd_cents: number;
  burn_per_day_usd_cents: number;
  runway_days: number | null;
  runway_confident: boolean;
  patron_count: number;
  monthly_usd_cents: number;
  live_sessions: string[];
  stripe_cardholder?: string;
  polar_products?: Record<string, string>;
  status: 'funded' | 'low' | 'unfunded';
}

export interface Patron {
  kind: 'sponsor' | 'project' | 'funder';
  login: string;
  name?: string;
  avatar_url?: string;
  url?: string;
  tagline?: string;
  amount_label?: string;
}

export interface FunderView {
  ok: true;
  found: boolean;
  account: string;
  login: string;
  credits_usd_cents: number;
  // Of the credits, the org's matching bonus: for other people's projects only.
  bonus_usd_cents: number;
  polar_products?: Record<string, string>;
  received_usd_cents: number;
  given_usd_cents: number;
  given: Flow[];
  received: Flow[];
}

export interface ProjectView extends DirectoryEntry {
  found: boolean;
  tiers: Tier[];
  feed: Flow[];
  patrons: Patron[];
}

export class LedgerClient {
  constructor(private readonly ns: DurableObjectNamespace) {}
  private async rpc<T>(op: string, args: Record<string, unknown> = {}): Promise<T> {
    const res = await this.ns.get(this.ns.idFromName('global')).fetch('https://ledger.local/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op, ...args }) });
    return await res.json() as T;
  }
  reserve(requestId: string, account: string, kid: string, amountUsdCents: number, dailyCapUsdCents: number) {
    return this.rpc<{ ok: true; balance_usd_cents: number } | { ok: false; error: string; balance_usd_cents?: number; reserved_usd_cents?: number; available_usd_cents?: number; needed_usd_cents?: number }>('reserve', { request_id: requestId, account, kid, amount_usd_cents: amountUsdCents, daily_cap_usd_cents: dailyCapUsdCents });
  }
  consume(requestId: string, actualUsdCents: number, event?: UsageEvent) { return this.rpc<{ ok: true }>('consume', { request_id: requestId, actual_usd_cents: actualUsdCents, event }); }
  release(requestId: string) { return this.rpc<{ ok: true }>('release', { request_id: requestId }); }
  mint(account: string, amountUsdCents: number, key?: string, sponsor?: Sponsor) {
    return this.rpc<{ ok: boolean; idempotent?: boolean; account?: string; balance_usd_cents?: number; error?: string }>('mint', { account, amount_usd_cents: amountUsdCents, key, sponsor });
  }
  grant(from: string, to: string, amountUsdCents: number, key?: string, note?: string) {
    return this.rpc<{ ok: boolean; idempotent?: boolean; from_balance_usd_cents?: number; to_balance_usd_cents?: number; error?: string }>('grant', { from, to, amount_usd_cents: amountUsdCents, key, note });
  }
  funder(account: string) { return this.rpc<FunderView>('funder', { account }); }
  bonusAdd(account: string, amountUsdCents: number) { return this.rpc<{ ok: boolean; bonus_usd_cents?: number; error?: string }>('bonus_add', { account, amount_usd_cents: amountUsdCents }); }
  sponsorUpsert(account: string, sponsor: Sponsor) { return this.rpc<{ ok: boolean; active_sponsors?: number; error?: string }>('sponsor_upsert', { account, sponsor }); }
  sponsorRemove(account: string, login: string) { return this.rpc<{ ok: boolean }>('sponsor_remove', { account, login }); }
  accrue(account: string, key: string) { return this.rpc<{ ok: boolean; credited?: boolean; idempotent?: boolean; balance_usd_cents?: number; monthly_total_usd_cents?: number }>('accrue', { account, key }); }
  couponCreate(input: { amount_usd_cents: number; from?: string; sponsor?: Sponsor; code?: string; expires_at?: string }) { return this.rpc<{ ok: boolean; coupon?: Coupon; error?: string }>('coupon_create', input); }
  couponList() { return this.rpc<{ ok: boolean; coupons: Coupon[] }>('coupon_list'); }
  couponRedeem(code: string, account: string) { return this.rpc<{ ok: boolean; amount_usd_cents?: number; account?: string; sponsor?: Sponsor | null; error?: string }>('coupon_redeem', { code, account }); }
  keyRegister(claims: KeyClaims) { return this.rpc<{ ok: boolean; error?: string }>('key_register', { claims }); }
  keyCheck(kid: string) { return this.rpc<{ ok: boolean; error?: string }>('key_check', { kid }); }
  keyExpire(kid: string, exp: string) { return this.rpc<{ ok: boolean; error?: string; exp?: string }>('key_expire', { kid, exp }); }
  keyRevoke(kid: string) { return this.rpc<{ ok: boolean; error?: string }>('key_revoke', { kid }); }
  keys(account: string) { return this.rpc<{ ok: true; account: string; keys: KeyEntry[] }>('keys', { account }); }
  funding(account: string) { return this.rpc<FundingSnapshot>('funding', { account }); }
  pulse(account: string) { return this.rpc<Pulse>('pulse', { account }); }
  calls(account: string, limit?: number, before?: string) { return this.rpc<{ ok: true; account: string; calls_total: number; calls: CallRecord[]; next?: string }>('calls', { account, limit, before }); }
  sessionEvent(account: string, event: SessionEvent) { return this.rpc<{ ok: boolean; error?: string; session?: SessionSummary; idempotent?: boolean }>('session_event', { account, event }); }
  sessions(account: string, limit?: number) { return this.rpc<{ ok: true; account: string; live: string[]; sessions: SessionSummary[] }>('sessions', { account, limit }); }
  session(account: string, key: string) { return this.rpc<{ ok: boolean; error?: string; session?: SessionRecord }>('session', { account, key }); }
  sessionDelete(account: string, key: string) { return this.rpc<{ ok: boolean; error?: string }>('session_delete', { account, key }); }
  setupPut(account: string, setup: Record<string, unknown>) { return this.rpc<{ ok: boolean; error?: string }>('setup_put', { account, setup }); }
  taskPut(account: string, itemId: string, task: Record<string, unknown>) { return this.rpc<{ ok: boolean; error?: string; task?: TaskRecord }>('task_put', { account, item_id: itemId, task }); }
  postUpdate(account: string, itemId: string, text: string, session?: string, at?: string) { return this.rpc<{ ok: boolean; error?: string; update?: UpdateRecord }>('update_post', { account, item_id: itemId, text, session, at }); }
  item(account: string, itemId: string) { return this.rpc<ItemView>('item', { account, item_id: itemId }); }
  roadmapSet(account: string, roadmap: Roadmap, source: string, by?: string) { return this.rpc<{ ok: boolean; error?: string; unchanged?: boolean; revision?: RoadmapRevision }>('roadmap_set', { account, roadmap, source, by }); }
  roadmap(account: string) { return this.rpc<{ ok: boolean; error?: string; revision?: RoadmapRevision }>('roadmap', { account }); }
  roadmapRevisions(account: string, limit?: number) { return this.rpc<{ ok: true; account: string; revisions: RoadmapRevision[] }>('roadmap_revisions', { account, limit }); }
  cardPut(card: CardRecord) { return this.rpc<{ ok: boolean; error?: string }>('card_put', { card }); }
  card(id: string) { return this.rpc<{ ok: boolean; error?: string; card?: CardRecord }>('card', { id }); }
  setCardholder(account: string, cardholder: string) { return this.rpc<{ ok: true }>('set_cardholder', { account, cardholder }); }
  setPolarProducts(account: string, products: Record<string, string>) { return this.rpc<{ ok: boolean; error?: string }>('set_polar_products', { account, products }); }
  polarCheckoutPut(checkout: PolarCheckout) { return this.rpc<{ ok: boolean; error?: string }>('polar_checkout_put', { checkout }); }
  polarCheckout(id: string) { return this.rpc<{ ok: boolean; error?: string; checkout?: PolarCheckout }>('polar_checkout', { id }); }
  setProfile(account: string, profile: Partial<AccountProfile>, goalDays?: number, tiers?: Tier[]) { return this.rpc<{ ok: boolean; profile?: AccountProfile; error?: string }>('set_profile', { account, profile, goal_days: goalDays, tiers }); }
  moderate(account: string, status: Moderation, reason?: string, overrides: Partial<AccountProfile> = {}) { return this.rpc<{ ok: boolean; moderation?: Moderation; error?: string }>('moderate', { account, status, reason, ...overrides }); }
  exportAll() { return this.rpc<{ ok: true; exported_at: string; entries: Array<[string, unknown]> }>('export_all'); }
  importAll(entries: Array<[string, unknown]>, replace = false) { return this.rpc<{ ok: boolean; error?: string; entries?: number }>('import_all', { entries, replace }); }
  directory() { return this.rpc<{ ok: boolean; entries: DirectoryEntry[] }>('directory'); }
  project(account: string) { return this.rpc<ProjectView>('project', { account }); }
  status() { return this.rpc<unknown>('status'); }
  resetDaily() { return this.rpc<{ ok: true; day_key: string; cleared_consumed_usd_cents: number; consumed_usd_cents: number }>('reset_daily'); }
}
