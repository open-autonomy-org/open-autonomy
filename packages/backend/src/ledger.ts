import { parseModelsBound, parseSpendLimits, type SpendLimit } from '@open-autonomy/sdk/rails';
import { CONFORMANCE, diffRoadmaps, sameRoadmap, type RoadmapChange, type RoadmapSource } from '@open-autonomy/sdk/drivers';
import { LINK_KINDS, ROADMAP_SCHEMA, ROADMAP_STATUSES, tenseOf, type LinkKind, type Roadmap, type RoadmapItem } from '@open-autonomy/sdk/roadmap';
import { json } from './http.js';
import { estimateRunway } from './runway.js';
import type { KeyClaims, UsageEvent } from './types.js';

// The books: one Durable Object holding every account's funds, every settled spend, the audit trail, the
// key registry and the development stream. Money enters by mint (a sponsor, a coupon, an admin), moves by
// grant (down the account tree), and leaves only through a metered rail: today the model rail, settled to
// the gateway's reported cost. The balance is the hard-stop; a global daily rail bounds a runaway.
//
// Storage: the account tree and everything small lives in one `state` record; the audit trail, sessions and
// updates are appended as their own keys (`call:`, `session:`, `update:`), never evicted. `sesscall:` and
// `itemcall:` index each call under its session and explicit item while the call record itself remains stored once.

const MAX_FLOWS = 200;
const FEED_LIMIT = 24;
const MAX_KEY_SLOTS_PER_ACCOUNT = 3;
const MAX_TURNS = 400;
const MAX_TURNS_PER_EVENT = 100;
const MAX_TURN_TEXT = 2000;
const MAX_UPDATE_TEXT = 2000;
const DEFAULT_GOAL_DAYS = 30;

export interface LedgerState {
  day_key: string;
  // Today's settled spend across every account, and outstanding reservations: the global daily rail.
  consumed_usd_cents: number;
  reserved_usd_cents: number;
  reservations: Record<string, Reservation>;
  // The account tree. Every project (owner/repo) and named root is an account:
  // balance = granted_in - granted_out - consumed.
  accounts: Record<string, Account>;
  // Idempotency keys already applied by mint or grant, so a retry never double-applies.
  applied_keys: string[];
  // Append-only money-movement log (capped trailing window): the funding feed.
  flows: Flow[];
  // The key registry: listing, revocation, rotation grace. A key verifies by signature and expiry without
  // it; an entry here can only shorten a key's life.
  keys: Record<string, KeyEntry>;
  // Keys an app's extension owns (Open Autonomy's coupons, for one), persisted beside the books and opaque here:
  // the loader keeps them verbatim, the export carries them, nothing in the core reads them.
  [extension: string]: unknown;
}
const CORE_STATE_KEYS = new Set(['day_key', 'consumed_usd_cents', 'reserved_usd_cents', 'reservations', 'accounts', 'applied_keys', 'flows', 'keys']);

export type Tally = { u: number; c: number; t: number; m?: Record<string, [number, number, number]> };
export interface Usage { minutes: Record<string, Tally>; hours: Record<string, Tally>; days: Record<string, Tally> }
const emptyUsage = (): Usage => ({ minutes: {}, hours: {}, days: {} });
const KEEP = { minutes: 60, hours: 24, days: 31 } as const;
const bucketKey = (grain: keyof Usage, ms: number): string => (grain === 'minutes' ? String(Math.floor(ms / 60_000)) : grain === 'hours' ? String(Math.floor(ms / 3_600_000)) : new Date(ms).toISOString().slice(0, 10));
function recordUsage(a: Account, add: { usd?: number; calls?: number; tokens?: number; model?: string }, now = Date.now()): void {
  a.usage ??= emptyUsage();
  for (const grain of ['minutes', 'hours', 'days'] as const) {
    const key = bucketKey(grain, now);
    const b = (a.usage[grain][key] ??= { u: 0, c: 0, t: 0 });
    b.u += add.usd ?? 0; b.c += add.calls ?? 0; b.t += add.tokens ?? 0;
    if (add.model) { const m = ((b.m ??= {})[add.model] ??= [0, 0, 0]); m[0] += add.usd ?? 0; m[1] += add.calls ?? 0; m[2] += add.tokens ?? 0; }
    const keys = Object.keys(a.usage[grain]).sort();
    while (keys.length > KEEP[grain]) delete a.usage[grain][keys.shift() as string];
  }
}
// What was used over a limit's window: the newest buckets of the window's grain, the current one partial.
function usedOver(a: Account | undefined, limit: SpendLimit, now = Date.now()): { u: number; c: number; t: number } {
  const grain: keyof Usage = limit.window_seconds <= 3600 ? 'minutes' : limit.window_seconds <= 86400 ? 'hours' : 'days';
  const size = grain === 'minutes' ? 60_000 : grain === 'hours' ? 3_600_000 : 86_400_000;
  const n = Math.max(1, Math.round(limit.window_seconds * 1000 / size));
  const sum = { u: 0, c: 0, t: 0 };
  for (let i = 0; i < n; i++) {
    const b = a?.usage?.[grain]?.[bucketKey(grain, now - i * size)];
    if (!b) continue;
    if (limit.model) { const m = b.m?.[limit.model]; if (m) { sum.u += m[0]; sum.c += m[1]; sum.t += m[2]; } }
    else { sum.u += b.u; sum.c += b.c; sum.t += b.t; }
  }
  return sum;
}
const secondsToNextBucket = (limit: SpendLimit, now = Date.now()): number => { const size = limit.window_seconds <= 3600 ? 60_000 : limit.window_seconds <= 86400 ? 3_600_000 : 86_400_000; return Math.ceil((size - (now % size)) / 1000); };

export interface Account {
  granted_in_usd_cents: number;
  granted_out_usd_cents: number;
  consumed_usd_cents: number;
  // Every gift is an envelope. Older balances load into one legacy unrestricted envelope without
  // changing their amount; new gifts retain their own purpose and giver.
  envelopes: Envelope[];
  calls_total?: number;
  last_call_ms?: number;
  // The sessions live right now: the reporter said they started and has not said they ended.
  live_sessions?: string[];
  // The roadmap's current revision number (the records live in storage, see roadmapSet).
  roadmap_revision?: number;
  // The card rail: the account's cardholder at the issuer, created on its first card.
  stripe_cardholder?: string;
  // Bonus credits: the part of a giver's balance that may only be granted to accounts the giver does not own.
  bonus_usd_cents?: number;
  // What the account's calls used, by the minute (the last hour), the hour (the last day) and the day (the last month):
  // money, calls and tokens, and each model's share — what the project's spend limits are held against.
  usage: Usage;
  profile?: AccountProfile;
  goal_days?: number;
  moderation?: Moderation;
  moderation_reason?: string;
  // Read with the owner's config: what the deployed service reports against the repository's default branch.
  deployment?: LiveDeployment;
  // The agent's operating state: the owner's word (a steer key's request) and the automation's answer (what it
  // reported true of itself), kept apart. The platform records both and applies neither.
  control?: AgentControl;
  // Keys an app's extension owns on the account (Open Autonomy's sponsors and tiers, for two): kept verbatim, opaque here.
  [extension: string]: unknown;
}
const CORE_ACCOUNT_KEYS = new Set(['granted_in_usd_cents', 'granted_out_usd_cents', 'consumed_usd_cents', 'envelopes', 'calls_total', 'last_call_ms', 'live_sessions', 'roadmap_revision', 'stripe_cardholder', 'bonus_usd_cents', 'usage', 'profile', 'goal_days', 'moderation', 'moderation_reason', 'deployment', 'daily_spend', 'control']);

export type OperatingState = 'running' | 'paused';
export interface AgentControl {
  desired?: { state: OperatingState; at: string; by: string; reason?: string };
  observed?: { state: OperatingState; at: string; note?: string };
}
const OPERATING_STATES: OperatingState[] = ['running', 'paused'];
// The stored record, each half kept only when well-formed; a malformed half is dropped, never guessed.
function normalizeControl(raw: unknown): AgentControl | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as { desired?: Record<string, unknown>; observed?: Record<string, unknown> };
  const half = (h: Record<string, unknown> | undefined) => h && typeof h === 'object' && OPERATING_STATES.includes(h.state as OperatingState) && typeof h.at === 'string' ? h : undefined;
  const desired = half(r.desired), observed = half(r.observed);
  const out: AgentControl = {};
  if (desired && typeof desired.by === 'string') out.desired = { state: desired.state as OperatingState, at: desired.at as string, by: desired.by, ...(typeof desired.reason === 'string' ? { reason: desired.reason } : {}) };
  if (observed) out.observed = { state: observed.state as OperatingState, at: observed.at as string, ...(typeof observed.note === 'string' ? { note: observed.note } : {}) };
  return out.desired || out.observed ? out : undefined;
}

export interface LiveDeployment {
  commit: string | null;
  head: string | null;
  ahead: number | null;
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
  // What the substrate publishes about the project (`org.open-autonomy.project.docs`): what it is, what shipped.
  about_md?: string;
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
const PROFILE_KEYS = ['tagline', 'avatar_url', 'cover_url', 'homepage', 'synced_at', 'tagline_override', 'cover_override', 'about_md', 'schedule_json', 'setup_md', 'soul_md', 'agent_harness', 'agent_model', 'agent_provider', 'agent_skills', 'config_yaml'] as const;

export interface Flow {
  kind: 'mint' | 'grant' | 'consume' | 'release';
  id?: string;
  to: string;
  from?: string;
  amount_usd_cents: number;
  sponsor_login?: string;
  coupon?: boolean;
  rail?: Rail;
  // A grant's word from the funder: what they believe in.
  note?: string;
  // When an organization grants pool gives, the signed-in admin who passed it on.
  by?: string;
  purpose?: EnvelopePurpose;
  envelope_id?: string;
  item?: string;
  ts: string;
}

export type EnvelopePurpose =
  | { type: 'unrestricted' }
  | { type: 'any' }
  | { type: 'model' }
  | { type: 'models'; models: string[] }
  | { type: 'item'; item: string };

export interface Envelope {
  id: string;
  purpose: EnvelopePurpose;
  balance_usd_cents: number;
  from?: string;
  gift_id?: string;
  created_at: string;
}

interface ReservationAllocation { envelope_id: string; amount: number }
interface Reservation {
  amount: number;
  expires_at_ms: number;
  account: string;
  kid: string;
  allocations: ReservationAllocation[];
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
  item?: string;
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
// Who gave: a giver's identity as a door reports it (a sponsor, a patron), recorded on the flow and the envelope.
export interface Sponsor {
  login: string;
  name?: string;
  tagline?: string;
  url?: string;
  avatar_url?: string;
  monthly_usd_cents?: number;
}

export interface KeyEntry {
  kid: string;
  account: string;
  models: string[];
  created_at: string;
  exp: string;
  revoked_at?: string;
  replaced_by?: string;
}

// One metered spend, as appended to the account's audit trail.
export interface CallRecord {
  ts: string;
  request_id: string;
  rail: Rail;
  // The session the caller named, absent only when the calling client supplied none.
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
  item?: string;
  usd_cents: number;
  outcome?: string;
  // Usually one envelope pays a call; a larger charge may span gifts, in draw order.
  envelope?: EnvelopePurpose;
  envelopes?: Array<{ id: string; purpose: EnvelopePurpose; usd_cents: number; from?: string; gift_id?: string }>;
}

// ---- the development stream ------------------------------------------------------------------------
// A session is one agent conversation as the project's reporter narrates it. `kind` names what kind
// (`run`: a scheduled run, the funded work; `chat`; anything short), `item_id` the roadmap item it serves,
// `source` what started it (the schedule job's name, a channel). It ends with an optional outcome: a run
// has a verdict, a chat does not. Several can be live at once.
export type SessionEvent =
  | { kind: 'started'; key: string; session_kind?: string; title?: string; item_id?: string; source?: string; model_provider?: string; started_at?: string }
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
  // The non-secret provider id observed for this session. `open-autonomy` means the project's metered rail;
  // another value means the owner's provider account funded it.
  model_provider?: string;
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
  // Joined through the session's durable call index when a session is read; never stored twice.
  receipts?: CallRecord[];
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

// An app's operation on the books: registered by name before the worker serves, run inside the one Durable
// Object with the core's own methods and storage. Open Autonomy's patronage (sponsors, coupons, tiers, Polar)
// is such an extension; a private deployment registers none.
export type LedgerOp = (ledger: LedgerCore, body: Record<string, unknown>) => Promise<unknown> | unknown;
export interface LedgerCore {
  readonly state: LedgerState;
  readonly storage: DurableObjectState['storage'];
  acct(id: string): Account | undefined;
  ensureAcct(id: string): Account;
  balanceOf(id: string): number;
  applyKey(key?: string): boolean;
  recordFlow(flow: Omit<Flow, 'ts'>): Flow;
  addEnvelope(account: string, amount: number, purpose: EnvelopePurpose, from?: string, giftId?: string): Envelope;
  mint(account: string, amount: number, key?: string, sponsor?: Sponsor, rawFor?: unknown): Promise<Record<string, unknown>>;
  grant(from: string, to: string, amount: number, key?: string, note?: string, rawFor?: unknown, by?: string): Promise<Record<string, unknown>>;
  fundingSnapshot(account: string): FundingSnapshot;
  entryFor(account: string): DirectoryEntry;
  save(): Promise<void>;
}
const extensions = new Map<string, LedgerOp>();

export class LimitLedger implements DurableObject, LedgerCore {
  private loaded = false;
  state: LedgerState = emptyState();
  // Register an app's operations, once, at module load: a name the core does not serve, its handler.
  static extend(ops: Record<string, LedgerOp>): void { for (const [name, op] of Object.entries(ops)) extensions.set(name, op); }

  constructor(private readonly ctx: DurableObjectState) {}
  get storage(): DurableObjectState['storage'] { return this.ctx.storage; }

  async fetch(req: Request): Promise<Response> {
    await this.load();
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const s = (k: string) => String(body[k] ?? '');
    const op = typeof body.op === 'string' ? body.op : '';
    const extension = extensions.get(op);
    if (extension) return json(await extension(this, body));
    switch (body.op) {
      case 'reserve': return json(await this.reserve(s('request_id'), s('account'), s('kid'), Number(body.amount_usd_cents), Number(body.daily_cap_usd_cents), typeof body.model === 'string' ? body.model : '', Number(body.estimated_tokens) || 0, typeof body.rail === 'string' ? body.rail as Rail : 'model', typeof body.item === 'string' ? body.item : undefined, typeof body.session === 'string' ? body.session : undefined));
      case 'consume': await this.consume(s('request_id'), Number(body.actual_usd_cents), body.event as UsageEvent | undefined); return json({ ok: true });
      case 'release': await this.release(s('request_id')); return json({ ok: true });
      case 'mint': return json(await this.mint(s('account'), Number(body.amount_usd_cents), body.key ? s('key') : undefined, body.sponsor as Sponsor | undefined, body.for));
      case 'grant': return json(await this.grant(s('from'), s('to'), Number(body.amount_usd_cents), body.key ? s('key') : undefined, typeof body.note === 'string' ? body.note : undefined, body.for, typeof body.by === 'string' ? body.by : undefined));
      case 'earmark': return json(await this.earmark(s('account'), body.for));
      case 'funder': return json(await this.funderView(s('account')));
      case 'bonus_add': return json(await this.bonusAdd(s('account'), Number(body.amount_usd_cents)));
      case 'key_register': return json(await this.keyRegister(body.claims as KeyClaims));
      case 'key_rotate': return json(await this.keyRotate(body.previous as KeyClaims, body.claims as KeyClaims, s('grace_until')));
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
      case 'state': return json(this.stateView(s('account')));
      case 'state_request': return json(await this.stateRequest(s('account'), body.state, s('by'), body.reason));
      case 'state_report': return json(await this.stateReport(s('account'), body.state, body.note));
      case 'docs_put': return json(await this.docsPut(s('account'), body.docs as Record<string, unknown>));
      case 'item': return json(await this.itemView(s('account'), s('item_id')));
      case 'roadmap_set': return json(await this.roadmapSet(s('account'), body.roadmap as Roadmap, s('source'), body.by ? s('by') : undefined));
      case 'roadmap': return json(await this.roadmapCurrent(s('account')));
      case 'roadmap_revisions': return json(await this.roadmapRevisions(s('account'), Number(body.limit)));
      case 'card_put': return json(await this.cardPut(body.card as CardRecord));
      case 'card': return json(await this.cardGet(s('id')));
      case 'set_cardholder': return json(await this.setCardholder(s('account'), s('cardholder')));
      case 'set_profile': return json(await this.setProfile(s('account'), body.profile as Partial<AccountProfile>, body.goal_days as number | undefined));
      case 'set_deployment': return json(await this.setDeployment(s('account'), body.deployment as LiveDeployment | undefined));
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

  async save(): Promise<void> {
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

  acct(id: string): Account | undefined { return this.state.accounts[id]; }
  ensureAcct(id: string): Account { return (this.state.accounts[id] ??= emptyAccount()); }
  balanceOf(id: string): number {
    const a = this.acct(id);
    return a ? a.granted_in_usd_cents - a.granted_out_usd_cents - a.consumed_usd_cents : 0;
  }
  private reservedFor(id: string): number {
    let total = 0;
    for (const r of Object.values(this.state.reservations)) if (r.account === id) total += r.amount;
    return total;
  }
  private reservedFrom(id: string, envelopeId: string): number {
    let total = 0;
    for (const r of Object.values(this.state.reservations)) if (r.account === id) for (const part of r.allocations) if (part.envelope_id === envelopeId) total += part.amount;
    return total;
  }
  applyKey(key?: string): boolean {
    if (!key) return false;
    if (this.state.applied_keys.includes(key)) return true;
    this.state.applied_keys.push(key);
    this.state.applied_keys = this.state.applied_keys.slice(-500);
    return false;
  }
  recordFlow(flow: Omit<Flow, 'ts'>): Flow {
    const recorded = { ...flow, ts: new Date().toISOString() };
    this.state.flows.push(recorded);
    if (this.state.flows.length > MAX_FLOWS) this.state.flows = this.state.flows.slice(-MAX_FLOWS);
    return recorded;
  }

  private async earmark(account: string, raw: unknown): Promise<{ ok: boolean; error?: string; purpose?: EnvelopePurpose }> {
    const purpose = normalizePurpose(raw);
    if (!purpose) return { ok: false, error: 'invalid_earmark' };
    if (purpose.type === 'item') {
      const current = await this.roadmapCurrent(account);
      if (!current.revision?.roadmap.items.some((item) => item.id === purpose.item && item.status !== 'done')) return { ok: false, error: 'no_such_item' };
    }
    return { ok: true, purpose };
  }

  addEnvelope(account: string, amount: number, purpose: EnvelopePurpose, from?: string, giftId?: string): Envelope {
    const envelope: Envelope = { id: crypto.randomUUID(), purpose, balance_usd_cents: amount, ...(from ? { from } : {}), ...(giftId ? { gift_id: giftId } : {}), created_at: new Date().toISOString() };
    this.ensureAcct(account).envelopes.push(envelope);
    return envelope;
  }

  // Money enters: the only operation that increases the total.
  async mint(account: string, amount: number, key?: string, sponsor?: Sponsor, rawFor?: unknown): Promise<Record<string, unknown>> {
    if (!account || !Number.isFinite(amount) || amount <= 0) return { ok: false, error: 'invalid_amount' };
    const marked = await this.earmark(account, rawFor);
    if (!marked.ok || !marked.purpose) return marked;
    if (key && this.applyKey(key)) return { ok: true, idempotent: true, account, balance_usd_cents: this.balanceOf(account) };
    const a = this.ensureAcct(account);
    a.granted_in_usd_cents += Math.floor(amount);
    const envelope = this.addEnvelope(account, Math.floor(amount), marked.purpose, sponsor?.login, key);
    this.recordFlow({ kind: 'mint', id: key ?? envelope.id, to: account, amount_usd_cents: Math.floor(amount), sponsor_login: sponsor?.login, purpose: marked.purpose, envelope_id: envelope.id });
    await this.save();
    return { ok: true, account, balance_usd_cents: this.balanceOf(account) };
  }

  // Money moves down the tree: conserves the total, refused if the source lacks the balance.
  async grant(from: string, to: string, amount: number, key?: string, note?: string, rawFor?: unknown, by?: string): Promise<Record<string, unknown>> {
    if (!from || !to || from === to || !Number.isFinite(amount) || amount <= 0) return { ok: false, error: 'invalid_grant' };
    const marked = await this.earmark(to, rawFor);
    if (!marked.ok || !marked.purpose) return marked;
    if (key && this.applyKey(key)) return { ok: true, idempotent: true, from_balance_usd_cents: this.balanceOf(from), to_balance_usd_cents: this.balanceOf(to) };
    // A funder's bonus credits go only to other people's projects: giving to their own draws on what they hold
    // beyond the bonus; giving to another's draws on the bonus first.
    if (from.startsWith('@')) {
      const bonus = this.acct(from)?.bonus_usd_cents ?? 0;
      const own = to.split('/')[0].toLowerCase() === from.slice(1).toLowerCase();
      if (own && this.balanceOf(from) - bonus < amount) return { ok: false, error: 'bonus_only_for_others', bonus_usd_cents: bonus };
    }
    if (this.balanceOf(from) < amount) return { ok: false, error: 'insufficient_balance', from_balance_usd_cents: this.balanceOf(from) };
    const source = this.ensureAcct(from).envelopes.filter((e) => e.purpose.type === 'unrestricted' && e.balance_usd_cents > 0);
    if (source.reduce((sum, e) => sum + e.balance_usd_cents, 0) < amount) return { ok: false, error: 'insufficient_balance', from_balance_usd_cents: this.balanceOf(from) };
    let debit = Math.floor(amount);
    for (const envelope of source) { const take = Math.min(debit, envelope.balance_usd_cents); envelope.balance_usd_cents -= take; debit -= take; if (!debit) break; }
    this.ensureAcct(from).granted_out_usd_cents += Math.floor(amount);
    this.ensureAcct(to).granted_in_usd_cents += Math.floor(amount);
    const envelope = this.addEnvelope(to, Math.floor(amount), marked.purpose, from, key);
    const gift = this.recordFlow({ kind: 'grant', id: key ?? envelope.id, from, to, amount_usd_cents: Math.floor(amount), purpose: marked.purpose, envelope_id: envelope.id, ...(note ? { note: note.slice(0, 280) } : {}), ...(by ? { by } : {}) });
    if (from.startsWith('@') && to.split('/')[0].toLowerCase() !== from.slice(1).toLowerCase()) { const acct = this.ensureAcct(from); acct.bonus_usd_cents = Math.max(0, (acct.bonus_usd_cents ?? 0) - Math.floor(amount)); }
    // The state feed is a quick trailing window; each gift also has one durable record so giver and
    // organization-pool pages can show their complete flow history.
    await this.ctx.storage.put({ state: this.state, [`gift:${gift.ts}:${crypto.randomUUID()}`]: gift });
    return { ok: true, from, to, amount_usd_cents: Math.floor(amount), from_balance_usd_cents: this.balanceOf(from), to_balance_usd_cents: this.balanceOf(to) };
  }






  // ---- keys ------------------------------------------------------------------------------------------

  private activeKeys(account: string): KeyEntry[] {
    const now = Date.now();
    return Object.values(this.state.keys).filter((k) => k.account === account && !k.revoked_at && Date.parse(k.exp) > now);
  }

  // A retiring key and its live successor occupy one slot. If the successor is revoked or expires,
  // the still-live predecessor keeps that slot until its grace ends; revocation cannot free extra slots.
  private keySlots(account: string): number {
    const active = this.activeKeys(account);
    const ids = new Set(active.map((k) => k.kid));
    return active.filter((k) => !k.replaced_by || !ids.has(k.replaced_by)).length;
  }

  private async keyRegister(claims: KeyClaims): Promise<Record<string, unknown>> {
    if (!claims?.kid || !claims.account) return { ok: false, error: 'invalid_key' };
    if (this.acct(claims.account)?.moderation === 'banned') return { ok: false, error: 'account_banned' };
    if (this.keySlots(claims.account) >= MAX_KEY_SLOTS_PER_ACCOUNT) return { ok: false, error: 'key_limit_reached' };
    this.state.keys[claims.kid] = { kid: claims.kid, account: claims.account, models: claims.models, created_at: claims.iat, exp: claims.exp };
    // The account exists from its first key, so its page and funding gate work before any money arrives.
    this.ensureAcct(claims.account);
    await this.save();
    return { ok: true };
  }

  private async keyRotate(previous: KeyClaims, claims: KeyClaims, graceUntil: string): Promise<{ ok: boolean; error?: string; exp?: string }> {
    if (!previous?.kid || !claims?.kid || previous.kid === claims.kid || !previous.account || previous.account !== claims.account || this.state.keys[claims.kid] || !Number.isFinite(Date.parse(graceUntil))) return { ok: false, error: 'invalid_key' };
    // Recheck in the same ledger operation as replacement: authentication may have raced revocation.
    const allowed = this.keyCheck(previous.kid);
    if (!allowed.ok) return allowed;
    if (Date.parse(previous.exp) <= Date.now()) return { ok: false, error: 'key_expired' };
    if (this.acct(previous.account)?.moderation === 'banned') return { ok: false, error: 'account_banned' };
    const old = this.state.keys[previous.kid];
    if (old && old.account !== previous.account) return { ok: false, error: 'invalid_key' };
    if (old?.replaced_by) return { ok: false, error: 'key_already_rotated' };
    if (this.activeKeys(previous.account).some((k) => k.replaced_by === previous.kid)) return { ok: false, error: 'rotation_grace_pending' };
    // A legacy signed key absent from the registry has no reserved slot. Preserve its supported
    // rotation path only when a slot is available, and register its shortened life as well.
    if (!old && this.keySlots(previous.account) >= MAX_KEY_SLOTS_PER_ACCOUNT) return { ok: false, error: 'key_limit_reached' };
    const exp = new Date(Math.min(Date.parse(previous.exp), old ? Date.parse(old.exp) : Infinity, Date.parse(graceUntil))).toISOString();
    this.state.keys[previous.kid] = { ...(old ?? { kid: previous.kid, account: previous.account, models: previous.models, created_at: previous.iat }), exp, replaced_by: claims.kid };
    this.state.keys[claims.kid] = { kid: claims.kid, account: claims.account, models: claims.models, created_at: claims.iat, exp: claims.exp };
    this.ensureAcct(claims.account);
    await this.save();
    return { ok: true, exp };
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

  private async reserve(requestId: string, account: string, kid: string, amount: number, dailyCap: number, model = '', estimatedTokens = 0, rail: Rail = 'model', item?: string, session?: string): Promise<Record<string, unknown>> {
    this.rolloverIfNeeded();
    this.gcReservations();
    if (!Number.isFinite(amount) || amount < 0) return { ok: false, error: 'invalid_amount' };
    const key = this.keyCheck(kid);
    if (!key.ok) return { ok: false, error: key.error === 'account_banned' ? 'account_banned' : 'auth_failed' };
    if (this.acct(account)?.moderation === 'banned') return { ok: false, error: 'account_banned', account };
    let spendItem = itemId(item);
    if (!spendItem && session) {
      const storageKey = await this.ctx.storage.get<string>(`sessionidx:${account}:${session}`);
      spendItem = itemId(storageKey ? (await this.ctx.storage.get<SessionRecord>(storageKey))?.item_id : undefined);
    }
    const context = { rail, model, item: spendItem };
    // The funding hard-stop stands above the envelopes: settled spend plus in-flight reservations may never exceed
    // the balance the totals say, whatever the envelopes add up to (they can only drift by rounding or an overage).
    const ceiling = this.balanceOf(account) - this.reservedFor(account);
    if (amount > ceiling) return { ok: false, error: 'insufficient_funds', message: `This account has ${formatCents(Math.max(0, ceiling))} available and this ${rail} spend needs ${formatCents(amount)}.`, account, balance_usd_cents: this.balanceOf(account), earmarked_usd_cents: 0, reserved_usd_cents: this.reservedFor(account), available_usd_cents: Math.max(0, ceiling), needed_usd_cents: amount };
    const candidates = [...(this.acct(account)?.envelopes ?? [])].filter((e) => qualifies(e.purpose, context)).sort((a, b) => specificity(b.purpose) - specificity(a.purpose));
    const allocations: ReservationAllocation[] = [];
    let remainder = amount;
    for (const envelope of candidates) {
      const free = Math.max(0, envelope.balance_usd_cents - this.reservedFrom(account, envelope.id));
      const take = Math.min(remainder, free);
      if (take > 0) allocations.push({ envelope_id: envelope.id, amount: take });
      remainder -= take;
      if (remainder <= 0) break;
    }
    const available = amount - Math.max(0, remainder);
    if (remainder > 0) {
      const remaining = (this.acct(account)?.envelopes ?? []).filter((e) => e.balance_usd_cents - this.reservedFrom(account, e.id) > 0 && !qualifies(e.purpose, context));
      const earmarked = remaining.reduce((sum, e) => sum + e.balance_usd_cents - this.reservedFrom(account, e.id), 0);
      const detail = remaining.map((e) => `${formatCents(e.balance_usd_cents - this.reservedFrom(account, e.id))} for ${purposeWords(e.purpose)}`).join(', ');
      const message = detail ? `${detail} remains earmarked and cannot pay for this ${rail} spend.` : `This account has ${formatCents(available)} available for this ${rail} spend and needs ${formatCents(amount)}.`;
      return { ok: false, error: 'insufficient_funds', message, account, balance_usd_cents: this.balanceOf(account), earmarked_usd_cents: earmarked, reserved_usd_cents: this.reservedFor(account), available_usd_cents: available, needed_usd_cents: amount };
    }
    // The global daily rail: runaway safety, independent of any balance.
    const cap = Number.isFinite(dailyCap) && dailyCap > 0 ? dailyCap : 5000;
    if (amount > cap - this.state.consumed_usd_cents - this.state.reserved_usd_cents) {
      return { ok: false, error: 'global_daily_spend_limit_reached', consumed_usd_cents: this.state.consumed_usd_cents, reserved_usd_cents: this.state.reserved_usd_cents, max_global_daily_usd_cents: cap };
    }
    // The project's own limits, from its .open-autonomy/config.yaml (spend.limits): each holds over its window, on the
    // money (settled plus in flight plus this call), the calls (this one counted) and the tokens (this call's estimate).
    for (const limit of parseSpendLimits(this.acct(account)?.profile?.config_yaml ?? '')) {
      if (limit.model && limit.model !== model) continue;
      const used = usedOver(this.acct(account), limit);
      const refusal = (kind: 'usd_cents' | 'calls' | 'tokens', bound: number, current: number) => ({ ok: false, error: kind === 'usd_cents' ? 'spend_limit_reached' : 'rate_limit_reached', account, limit: { window: limit.window, [kind]: bound, ...(limit.model ? { model: limit.model } : {}) }, used: { usd_cents: used.u, calls: used.c, tokens: used.t }, needed: kind === 'usd_cents' ? amount : kind === 'calls' ? 1 : estimatedTokens, current, retry_after_seconds: secondsToNextBucket(limit), how: "the project's .open-autonomy/config.yaml sets spend.limits" });
      if (limit.usd_cents !== undefined && used.u + this.reservedFor(account) + amount > limit.usd_cents) return refusal('usd_cents', limit.usd_cents, used.u + this.reservedFor(account));
      if (limit.calls !== undefined && used.c + 1 > limit.calls) return refusal('calls', limit.calls, used.c);
      if (limit.tokens !== undefined && used.t + estimatedTokens > limit.tokens) return refusal('tokens', limit.tokens, used.t);
    }
    recordUsage(this.ensureAcct(account), { calls: 1, model: model || undefined });
    this.state.reserved_usd_cents += amount;
    this.state.reservations[requestId] = { amount, expires_at_ms: Date.now() + 10 * 60_000, account, kid, allocations };
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
    // A reservation made by the previous worker shape survives a deploy; its money was unrestricted.
    if (!reservation.allocations.length) {
      let amount = reservation.amount;
      for (const envelope of a.envelopes.filter((e) => e.purpose.type === 'unrestricted')) { const take = Math.min(amount, envelope.balance_usd_cents); if (take > 0) reservation.allocations.push({ envelope_id: envelope.id, amount: take }); amount -= take; if (amount <= 0) break; }
    }
    let left = spent;
    const drawn: Array<{ id: string; purpose: EnvelopePurpose; usd_cents: number; from?: string; gift_id?: string }> = [];
    for (const allocation of reservation.allocations) {
      const envelope = a.envelopes.find((e) => e.id === allocation.envelope_id);
      if (!envelope || left <= 0) continue;
      const take = Math.min(left, allocation.amount, envelope.balance_usd_cents);
      envelope.balance_usd_cents = Number((envelope.balance_usd_cents - take).toFixed(6));
      left -= take;
      if (take > 0) drawn.push({ id: envelope.id, purpose: envelope.purpose, usd_cents: take, ...(envelope.from ? { from: envelope.from } : {}), ...(envelope.gift_id ? { gift_id: envelope.gift_id } : {}) });
    }
    // A call can cost more than it reserved (the reserve is an estimate, the charge is the gateway's truth). The
    // overage is drawn from whatever still holds money, unrestricted first, so the envelopes never add up to more
    // than the balance; the totals above already carry the full spend.
    if (left > 0) {
      for (const envelope of [...a.envelopes].filter((e) => e.balance_usd_cents > 0).sort((x, y) => specificity(x.purpose) - specificity(y.purpose))) {
        const take = Math.min(left, envelope.balance_usd_cents);
        if (take <= 0) continue;
        envelope.balance_usd_cents = Number((envelope.balance_usd_cents - take).toFixed(6));
        left -= take;
        drawn.push({ id: envelope.id, purpose: envelope.purpose, usd_cents: take });
        if (left <= 0) break;
      }
    }
    recordUsage(a, { usd: spent, tokens: (event?.input_tokens ?? 0) + (event?.output_tokens ?? 0), model: event?.model });
    const rail: Rail = event?.rail ?? 'model';
    if (spent > 0) this.recordFlow({ kind: 'consume', to: reservation.account, amount_usd_cents: spent, rail });
    a.calls_total = (a.calls_total ?? 0) + 1;
    a.last_call_ms = Date.now();
    const session = await this.attributeSpend(reservation.account, spent, event?.session);
    // The audit trail: every metered spend, appended durably under the account, never evicted. The running
    // count breaks ties within one millisecond, so the trail's order is the settle order.
    const record: CallRecord = { ts: new Date().toISOString(), request_id: requestId, rail, ...(session ? { session } : {}), usd_cents: spent, outcome: event?.outcome };
    if (drawn.length) Object.assign(record, { envelope: drawn[0].purpose, envelopes: drawn });
    if (rail === 'model') Object.assign(record, { model: event?.model, route: event?.route, input_tokens: event?.input_tokens, output_tokens: event?.output_tokens });
    if (rail === 'card') Object.assign(record, { merchant: event?.merchant, category: event?.category, card_last4: event?.card_last4, reference: event?.reference, ...(event?.item ? { item: event.item } : {}) });
    if (rail === 'partner') Object.assign(record, { partner: event?.partner, unit: event?.unit, quantity: event?.quantity, reference: event?.reference, ...(event?.item ? { item: event.item } : {}) });
    const callKey = `call:${reservation.account}:${String(Date.now()).padStart(13, '0')}:${String(a.calls_total).padStart(9, '0')}:${requestId}`;
    const writes: Record<string, CallRecord | string> = { [callKey]: record };
    if (session) writes[this.sessionCallKey(reservation.account, session, callKey)] = callKey;
    if (record.item) writes[this.itemCallKey(reservation.account, record.item, callKey)] = callKey;
    await this.ctx.storage.put(writes);
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

  private sessionCallKey(account: string, session: string, callKey: string): string {
    return `sesscall:${account}:${session}:${callKey.slice(`call:${account}:`.length)}`;
  }

  private itemCallKey(account: string, item: string, callKey: string): string {
    return `itemcall:${account}:${item}:${callKey.slice(`call:${account}:`.length)}`;
  }

  private async putCallIndexes(writes: Record<string, string>): Promise<void> {
    const entries = Object.entries(writes);
    for (let i = 0; i < entries.length; i += 100) await this.ctx.storage.put(Object.fromEntries(entries.slice(i, i + 100)));
  }

  private async callsFromIndex(prefix: string): Promise<CallRecord[]> {
    const calls: CallRecord[] = [];
    let end: string | undefined;
    while (true) {
      const page = await this.ctx.storage.list<string>({ prefix, reverse: true, limit: 200, ...(end ? { end } : {}) });
      const entries = [...page.entries()];
      const records = await Promise.all(entries.map(([, callKey]) => this.ctx.storage.get<CallRecord>(callKey)));
      calls.push(...records.filter((call): call is CallRecord => !!call));
      if (entries.length < 200) return calls;
      end = entries[entries.length - 1][0];
    }
  }

  // Calls settled before this index existed are indexed on the first session read. The marker is written only
  // after the complete account trail has been scanned, so a deploy or interrupted migration cannot hide calls.
  private async callsForSessions(account: string, sessionKeys: string[]): Promise<Map<string, CallRecord[]>> {
    const keys = [...new Set(sessionKeys)];
    const result = new Map(keys.map((key) => [key, [] as CallRecord[]]));
    const missing = (await Promise.all(keys.map(async (key) => ({ key, indexed: await this.ctx.storage.get<boolean>(`sesscallidx:${account}:${key}`) })))).filter(({ indexed }) => !indexed).map(({ key }) => key);
    if (missing.length) {
      const wanted = new Set(missing);
      const prefix = `call:${account}:`;
      let end: string | undefined;
      while (true) {
        const page = await this.ctx.storage.list<CallRecord>({ prefix, reverse: true, limit: 200, ...(end ? { end } : {}) });
        const entries = [...page.entries()];
        const writes: Record<string, string> = {};
        for (const [callKey, call] of entries) if (call.session && wanted.has(call.session)) writes[this.sessionCallKey(account, call.session, callKey)] = callKey;
        await this.putCallIndexes(writes);
        if (entries.length < 200) break;
        end = entries[entries.length - 1][0];
      }
      await this.ctx.storage.put(Object.fromEntries(missing.map((key) => [`sesscallidx:${account}:${key}`, true])));
    }
    await Promise.all(keys.map(async (key) => result.set(key, await this.callsFromIndex(`sesscall:${account}:${key}:`))));
    return result;
  }

  private async callsForItem(account: string, item: string): Promise<CallRecord[]> {
    const marker = `itemcallidx:${account}:${item}`;
    if (!await this.ctx.storage.get<boolean>(marker)) {
      const prefix = `call:${account}:`;
      let end: string | undefined;
      while (true) {
        const page = await this.ctx.storage.list<CallRecord>({ prefix, reverse: true, limit: 200, ...(end ? { end } : {}) });
        const entries = [...page.entries()];
        const writes: Record<string, string> = {};
        for (const [callKey, call] of entries) if (call.item === item) writes[this.itemCallKey(account, item, callKey)] = callKey;
        await this.putCallIndexes(writes);
        if (entries.length < 200) break;
        end = entries[entries.length - 1][0];
      }
      await this.ctx.storage.put(marker, true);
    }
    return this.callsFromIndex(`itemcall:${account}:${item}:`);
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
      const pendingKey = `sessionspend:${account}:${ev.key}`;
      const pending = await this.ctx.storage.get<{ usd_cents: number; calls: number }>(pendingKey);
      session = {
        key: ev.key, account, kind: sessionKind(ev.session_kind), status: 'live',
        title: clipText(ev.title, 200), item_id: itemId(ev.item_id), source: clipText(ev.source, 80), model_provider: clipText(ev.model_provider, 80),
        started_at: new Date(startedMs).toISOString(), turns: [], turn_count: 0, next_seq: 0,
        usd_cents: pending?.usd_cents ?? 0, calls: pending?.calls ?? 0, updated_at: new Date(now).toISOString(),
      };
      storageKey = `session:${account}:${String(startedMs).padStart(13, '0')}:${ev.key}`;
      await this.ctx.storage.put(idxKey, storageKey);
      if (pending) await this.ctx.storage.delete(pendingKey);
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
    const sessions = [...page.values()];
    const calls = await this.callsForSessions(account, sessions.map((session) => session.key));
    return { ok: true, account, live: [...(this.acct(account)?.live_sessions ?? [])], sessions: sessions.map((session) => sessionSummary(session, calls.get(session.key))) };
  }

  private async getSession(account: string, key: string): Promise<{ ok: boolean; error?: string; session?: SessionRecord }> {
    const storageKey = await this.ctx.storage.get<string>(`sessionidx:${account}:${key}`);
    const session = storageKey ? await this.ctx.storage.get<SessionRecord>(storageKey) : undefined;
    if (!session) return { ok: false, error: 'session_not_found' };
    const receipts = (await this.callsForSessions(account, [key])).get(key) ?? [];
    return { ok: true, session: { ...session, ...(receipts.length ? { receipts } : {}) } };
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
    const storedSessions = records.filter((s): s is SessionRecord => !!s);
    const calls = await this.callsForSessions(account, storedSessions.map((session) => session.key));
    const sessions = storedSessions.map((session) => sessionSummary(session, calls.get(session.key)));
    const updates = [...(await this.ctx.storage.list<UpdateRecord>({ prefix: `update:${account}:${item_id}:`, reverse: true, limit: 100 })).values()];
    const usd_cents = Number(sessions.reduce((sum, s) => sum + (s.usd_cents ?? 0), 0).toFixed(6));
    const keys = new Set(sessions.map((s) => s.key));
    // A purchase belongs to the item it names (the payer's word), else to the item of the session it was made in.
    const candidates = [[...calls.values()].flat(), await this.callsForItem(account, item_id)].flat();
    const purchases = [...new Map(candidates.filter((c) => c.rail !== 'model' && (c.item === item_id || (c.session && keys.has(c.session)))).map((c) => [c.request_id, c])).values()];
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

  // ---- the operating state: the owner's word and the automation's answer -----------------------------------
  // `POST /v1/agent/state` on a steer key records what the owner wants (running or paused); the automation reads it,
  // applies it through its own machinery, and reports what is true of itself as `org.open-autonomy.agent.state`.
  // The two never merge: the page shows a request beside its answer. Unrequested means running; unreported means unknown.
  private stateView(account: string): { ok: true; account: string } & AgentControl {
    const c = this.acct(account)?.control ?? {};
    return { ok: true, account, ...(c.desired ? { desired: c.desired } : {}), ...(c.observed ? { observed: c.observed } : {}) };
  }
  private async stateRequest(account: string, state: unknown, by: string, reason: unknown): Promise<{ ok: boolean; error?: string; unchanged?: boolean } & AgentControl> {
    if (!OPERATING_STATES.includes(state as OperatingState)) return { ok: false, error: 'invalid_state' };
    const a = this.ensureAcct(account);
    const current = a.control?.desired?.state ?? 'running';
    if (current === state && a.control?.desired) return { ok: true, unchanged: true, ...a.control };
    a.control = { ...(a.control ?? {}), desired: { state: state as OperatingState, at: new Date().toISOString(), by: clipText(by, 80) ?? '', ...(typeof reason === 'string' && reason.trim() ? { reason: reason.slice(0, 400) } : {}) } };
    await this.save();
    return { ok: true, ...a.control };
  }
  private async stateReport(account: string, state: unknown, note: unknown): Promise<{ ok: boolean; error?: string } & AgentControl> {
    if (!OPERATING_STATES.includes(state as OperatingState)) return { ok: false, error: 'invalid_state' };
    const a = this.ensureAcct(account);
    a.control = { ...(a.control ?? {}), observed: { state: state as OperatingState, at: new Date().toISOString(), ...(typeof note === 'string' && note.trim() ? { note: note.slice(0, 400) } : {}) } };
    await this.save();
    return { ok: true, ...a.control };
  }

  // The project's document, as its substrate publishes it: what the project is (the page's lead is its first
  // paragraph). What shipped is the timeline's past, never a document.
  private async docsPut(account: string, docs: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
    if (!docs || typeof docs !== 'object') return { ok: false, error: 'invalid_docs' };
    const profile: Partial<AccountProfile> = {};
    if (typeof docs.about_md === 'string') profile.about_md = docs.about_md.slice(0, 40_000);
    if (!Object.keys(profile).length) return { ok: false, error: 'invalid_docs' };
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

  // Spend lands only on the session the caller named. A call can settle before the reporter announces that
  // session, so its counters wait under the same key and are folded in when the started event arrives.
  private async attributeSpend(account: string, cents: number, key?: string): Promise<string | undefined> {
    if (!key) return undefined;
    const storageKey = await this.ctx.storage.get<string>(`sessionidx:${account}:${key}`);
    const session = storageKey ? await this.ctx.storage.get<SessionRecord>(storageKey) : undefined;
    if (!session || !storageKey) {
      const pendingKey = `sessionspend:${account}:${key}`;
      const pending = await this.ctx.storage.get<{ usd_cents: number; calls: number }>(pendingKey);
      await this.ctx.storage.put(pendingKey, {
        usd_cents: Number(((pending?.usd_cents ?? 0) + cents).toFixed(6)),
        calls: (pending?.calls ?? 0) + 1,
      });
      return key;
    }
    session.usd_cents = Number(((session.usd_cents ?? 0) + cents).toFixed(6));
    session.calls = (session.calls ?? 0) + 1;
    session.updated_at = new Date().toISOString();
    await this.ctx.storage.put(storageKey, session);
    return key;
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
    const done = new Set(model.items.filter((item) => item.status === 'done' && current?.roadmap.items.find((old) => old.id === item.id)?.status !== 'done').map((item) => item.id));
    for (const item of done) this.releaseItemEnvelopes(account, item);
    await this.ctx.storage.put(`roadmap:${account}:${String(revision.revision).padStart(9, '0')}`, revision);
    a.roadmap_revision = revision.revision;
    await this.save();
    return { ok: true, revision };
  }

  private releaseItemEnvelopes(account: string, item: string): void {
    const a = this.ensureAcct(account);
    for (const envelope of a.envelopes.filter((e) => e.purpose.type === 'item' && e.purpose.item === item && e.balance_usd_cents > 0)) {
      const amount = envelope.balance_usd_cents;
      envelope.balance_usd_cents = 0;
      const released = this.addEnvelope(account, amount, { type: 'unrestricted' }, envelope.from, envelope.gift_id);
      for (const reservation of Object.values(this.state.reservations)) for (const part of reservation.allocations) if (part.envelope_id === envelope.id) part.envelope_id = released.id;
      this.recordFlow({ kind: 'release', id: `release:${envelope.id}`, to: account, amount_usd_cents: amount, item, purpose: released.purpose, envelope_id: released.id });
    }
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
    return { balance_usd_cents: f.balance_usd_cents, consumed_usd_cents: f.consumed_usd_cents, granted_in_usd_cents: f.granted_in_usd_cents, live: [...(a?.live_sessions ?? [])], roadmap_revision: a?.roadmap_revision ?? 0, state: `${a?.control?.desired?.state ?? 'running'}/${a?.control?.observed?.state ?? ''}` };
  }

  fundingSnapshot(account: string): FundingSnapshot {
    const a = this.acct(account);
    const grantedIn = a?.granted_in_usd_cents ?? 0;
    const grantedOut = a?.granted_out_usd_cents ?? 0;
    const consumed = a?.consumed_usd_cents ?? 0;
    const balance = grantedIn - grantedOut - consumed;
    const reserved = this.reservedFor(account);
    const funded = grantedIn > 0;
    const daily = a ? dailySpendSeries(a.usage?.days ?? {}) : [];
    const next = { rail: 'model' as Rail, model: a?.profile?.agent_model ?? '', item: undefined };
    const usable = (a?.envelopes ?? []).filter((e) => qualifies(e.purpose, next)).reduce((sum, e) => sum + e.balance_usd_cents, 0);
    const est = estimateRunway(Math.max(0, usable), daily.slice(0, -1));
    return {
      account, funded, paused: funded && balance <= 0,
      balance_usd_cents: balance, granted_in_usd_cents: grantedIn, granted_out_usd_cents: grantedOut, consumed_usd_cents: consumed,
      reserved_usd_cents: reserved, spendable_usd_cents: balance - reserved,
      usable_usd_cents: usable, envelopes: (a?.envelopes ?? []).filter((e) => e.balance_usd_cents > 0).map((e) => ({ ...e, purpose: clonePurpose(e.purpose) })),
      burn_per_day_usd_cents: est.burn_per_day_usd_cents,
      runway_days: funded ? est.runway_days : null, runway_lo_days: funded ? est.runway_lo_days : null, runway_hi_days: funded ? est.runway_hi_days : null,
      days_observed: est.days_observed, runway_confident: funded && est.confident,
      calls_total: a?.calls_total ?? 0,
      last_call_at: a?.last_call_ms ? new Date(a.last_call_ms).toISOString() : null,
      daily_spend_usd_cents: daily,
      // The owner's bounds on the model rail, from the repository's .open-autonomy/config.yaml: what the funds may buy, and how much a day.
      bounds: { models: parseModelsBound(a?.profile?.config_yaml ?? ''), limits: parseSpendLimits(a?.profile?.config_yaml ?? '').map((l) => { const used = usedOver(a, l); return { window: l.window, ...(l.usd_cents !== undefined ? { usd_cents: l.usd_cents } : {}), ...(l.calls !== undefined ? { calls: l.calls } : {}), ...(l.tokens !== undefined ? { tokens: l.tokens } : {}), ...(l.model ? { model: l.model } : {}), used: { usd_cents: used.u, calls: used.c, tokens: used.t } }; }) },
      ...(a?.deployment ? { live: { ...a.deployment } } : {}),
    };
  }

  private async setDeployment(account: string, deployment?: LiveDeployment): Promise<{ ok: true }> {
    const a = this.ensureAcct(account);
    if (deployment) a.deployment = { ...deployment };
    else delete a.deployment;
    await this.save();
    return { ok: true };
  }

  private async setProfile(account: string, profile: Partial<AccountProfile> = {}, goalDays?: number): Promise<Record<string, unknown>> {
    if (!account) return { ok: false, error: 'invalid_account' };
    const a = this.ensureAcct(account);
    const p = (a.profile ??= {});
    for (const k of PROFILE_KEYS) if (profile[k] !== undefined) p[k] = profile[k];
    if (typeof goalDays === 'number' && goalDays > 0) a.goal_days = Math.floor(goalDays);
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

  entryFor(account: string): DirectoryEntry {
    const a = this.acct(account);
    const f = this.fundingSnapshot(account);
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
      live_sessions: [...(a?.live_sessions ?? [])],
      ...(a?.deployment ? { live: { ...a.deployment } } : {}),
      ...(a?.control ? { control: { ...a.control } } : {}),
      ...(a?.stripe_cardholder ? { stripe_cardholder: a.stripe_cardholder } : {}),
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
  private async funderView(account: string): Promise<FunderView> {
    const a = this.acct(account);
    const f = this.fundingSnapshot(account);
    const durable: Flow[] = [];
    let end: string | undefined;
    while (true) {
      const page = await this.ctx.storage.list<Flow>({ prefix: 'gift:', reverse: true, limit: 200, ...(end ? { end } : {}) });
      const entries = [...page.entries()];
      durable.push(...entries.map(([, gift]) => gift));
      if (entries.length < 200) break;
      end = entries.at(-1)![0];
    }
    const flows = [...durable, ...this.state.flows.filter((x) => x.kind === 'grant')]
      .filter((x, index, all) => all.findIndex((candidate) => candidate.id === x.id && candidate.from === x.from && candidate.to === x.to) === index)
      .filter((x) => x.to === account || x.from === account)
      .sort((left, right) => right.ts.localeCompare(left.ts));
    return {
      ok: true, found: Boolean(a), account, login: account.replace(/^@/, ''),
      credits_usd_cents: f.balance_usd_cents, bonus_usd_cents: a?.bonus_usd_cents ?? 0, received_usd_cents: f.granted_in_usd_cents, given_usd_cents: f.granted_out_usd_cents,
      given: flows.filter((x) => x.from === account),
      received: flows.filter((x) => x.to === account),
    };
  }

  private projectView(account: string): ProjectView {
    const a = this.acct(account);
    const entry = this.entryFor(account);
    const funding = this.fundingSnapshot(account);
    const flows = this.state.flows.filter((flow) => (flow.to === account || flow.from === account) && flow.kind !== 'consume');
    const giftIds = new Set(funding.envelopes.map((envelope) => envelope.gift_id).filter((id): id is string => !!id));
    const feed = flows.filter((flow, index) => index >= flows.length - FEED_LIMIT || (flow.id && giftIds.has(flow.id))).reverse();
    return { found: Boolean(a), ...entry, bounds: funding.bounds, usable_usd_cents: funding.usable_usd_cents, envelopes: funding.envelopes, feed };
  }

  private snapshot() {
    // What the org owes in spend: every account's balance summed. Real money must cover it (the Issuing balance for
    // cards, the gateway account for model calls); whoever tops those up reads this number.
    const owed = Number(Object.keys(this.state.accounts).reduce((sum, id) => sum + this.balanceOf(id), 0).toFixed(6));
    return {
      day_key: this.state.day_key,
      owed_usd_cents: owed,
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
  for (const [id, r] of Object.entries(stored.reservations ?? {})) if (r && typeof r.amount === 'number' && typeof r.account === 'string') state.reservations[id] = { amount: r.amount, expires_at_ms: r.expires_at_ms ?? 0, account: r.account, kid: r.kid ?? '', allocations: Array.isArray(r.allocations) ? r.allocations.filter((p) => p && typeof p.envelope_id === 'string' && typeof p.amount === 'number') : [] };
  for (const [id, a] of Object.entries(stored.accounts ?? {})) {
    if (!a || typeof a !== 'object') continue;
    const acct = emptyAccount();
    acct.granted_in_usd_cents = num(a.granted_in_usd_cents);
    acct.granted_out_usd_cents = num(a.granted_out_usd_cents);
    acct.consumed_usd_cents = num(a.consumed_usd_cents);
    acct.envelopes = Array.isArray(a.envelopes) ? a.envelopes.filter(validEnvelope).map((e) => ({ ...e, purpose: clonePurpose(e.purpose) })) : [];
    if (typeof a.calls_total === 'number') acct.calls_total = a.calls_total;
    if (typeof a.last_call_ms === 'number') acct.last_call_ms = a.last_call_ms;
    if (Array.isArray(a.live_sessions) && a.live_sessions.length) acct.live_sessions = a.live_sessions.filter((k) => typeof k === 'string');
    if (typeof a.roadmap_revision === 'number') acct.roadmap_revision = a.roadmap_revision;
    if (typeof a.stripe_cardholder === 'string') acct.stripe_cardholder = a.stripe_cardholder;
    if (typeof a.bonus_usd_cents === 'number') acct.bonus_usd_cents = a.bonus_usd_cents;
    acct.usage = emptyUsage();
    const u = (a as { usage?: Partial<Usage> }).usage;
    for (const grain of ['minutes', 'hours', 'days'] as const) if (u?.[grain] && typeof u[grain] === 'object') acct.usage[grain] = u[grain] as Record<string, Tally>;
    const old = (a as { daily_spend?: Record<string, number> }).daily_spend;
    if (old && typeof old === 'object') for (const [day, usd] of Object.entries(old)) if (!acct.usage.days[day] && typeof usd === 'number') acct.usage.days[day] = { u: usd, c: 0, t: 0 };
    if (a.profile && typeof a.profile === 'object') { acct.profile = {}; for (const k of PROFILE_KEYS) if (typeof a.profile[k] === 'string') acct.profile[k] = a.profile[k]; }
    if (typeof a.goal_days === 'number') acct.goal_days = a.goal_days;
    if (a.moderation === 'listed' || a.moderation === 'hidden' || a.moderation === 'banned') acct.moderation = a.moderation;
    if (typeof a.moderation_reason === 'string') acct.moderation_reason = a.moderation_reason;
    const deployment = normalizeDeployment(a.deployment);
    if (deployment) acct.deployment = deployment;
    const control = normalizeControl(a.control);
    if (control) acct.control = control;
    if (!acct.envelopes.length) {
      const legacy = acct.granted_in_usd_cents - acct.granted_out_usd_cents - acct.consumed_usd_cents;
      if (legacy > 0) acct.envelopes.push({ id: `legacy:${id}`, purpose: { type: 'unrestricted' }, balance_usd_cents: legacy, created_at: new Date(0).toISOString() });
    }
    // What an app's extension keeps on the account is not the core's to read, and never its to drop.
    for (const [k, v] of Object.entries(a as Record<string, unknown>)) if (!CORE_ACCOUNT_KEYS.has(k) && v !== undefined) (acct as Record<string, unknown>)[k] = v;
    state.accounts[id] = acct;
  }
  // Reservations written by the previous worker shape did not name their source. Give those existing
  // claims allocations before a new reserve can draw from the migrated unrestricted envelope.
  const claimed = new Map<string, number>();
  const claimKey = (account: string, envelope: string) => `${account}\0${envelope}`;
  for (const r of Object.values(state.reservations)) for (const part of r.allocations) {
    const key = claimKey(r.account, part.envelope_id);
    claimed.set(key, (claimed.get(key) ?? 0) + part.amount);
  }
  for (const r of Object.values(state.reservations)) {
    if (r.allocations.length) continue;
    let remainder = r.amount;
    for (const envelope of (state.accounts[r.account]?.envelopes ?? []).filter((e) => e.purpose.type === 'unrestricted')) {
      const key = claimKey(r.account, envelope.id);
      const take = Math.min(remainder, Math.max(0, envelope.balance_usd_cents - (claimed.get(key) ?? 0)));
      if (take > 0) { r.allocations.push({ envelope_id: envelope.id, amount: take }); claimed.set(key, (claimed.get(key) ?? 0) + take); }
      remainder -= take;
      if (remainder <= 0) break;
    }
  }
  state.applied_keys = Array.isArray(stored.applied_keys) ? stored.applied_keys.filter((k) => typeof k === 'string') : [];
  state.flows = Array.isArray(stored.flows) ? stored.flows.filter((f) => f && (f.kind === 'mint' || f.kind === 'grant' || f.kind === 'consume' || f.kind === 'release')) : [];
  state.keys = stored.keys && typeof stored.keys === 'object' ? stored.keys : {};
  for (const [k, v] of Object.entries(stored as Record<string, unknown>)) if (!CORE_STATE_KEYS.has(k) && v !== undefined) state[k] = v;
  return state;
}
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
function normalizeDeployment(value: unknown): LiveDeployment | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const deployment = value as Record<string, unknown>;
  const sha = (v: unknown): v is string | null => v === null || (typeof v === 'string' && /^[0-9a-f]{7}$/i.test(v));
  if (!sha(deployment.commit) || !sha(deployment.head) || !(deployment.ahead === null || (Number.isInteger(deployment.ahead) && (deployment.ahead as number) >= 0))) return undefined;
  return { commit: deployment.commit, head: deployment.head, ahead: deployment.ahead as number | null };
}

function emptyState(): LedgerState {
  return { day_key: dayKey(), consumed_usd_cents: 0, reserved_usd_cents: 0, reservations: {}, accounts: {}, applied_keys: [], flows: [], keys: {} };
}
function emptyAccount(): Account {
  return { granted_in_usd_cents: 0, granted_out_usd_cents: 0, consumed_usd_cents: 0, envelopes: [], usage: emptyUsage() };
}
function normalizePurpose(raw: unknown): EnvelopePurpose | undefined {
  if (raw === undefined || raw === null || raw === '' || raw === 'unrestricted') return { type: 'unrestricted' };
  if (raw === 'any') return { type: 'any' };
  if (raw === 'model') return { type: 'model' };
  if (typeof raw === 'string' && raw.startsWith('item:') && itemId(raw.slice(5))) return { type: 'item', item: raw.slice(5) };
  if (!raw || typeof raw !== 'object') return undefined;
  const value = raw as Record<string, unknown>;
  const type = value.type ?? value.purpose;
  if (type === 'unrestricted' || type === 'any' || type === 'model') return { type };
  if ((type === 'item' || value.item !== undefined) && itemId(value.item)) return { type: 'item', item: String(value.item) };
  const models = value.models;
  if ((type === 'models' || models !== undefined) && Array.isArray(models) && models.length > 0 && models.length <= 50 && models.every((m) => typeof m === 'string' && m.length > 0 && m.length <= 120)) return { type: 'models', models: [...new Set(models as string[])] };
  return undefined;
}
function validEnvelope(value: unknown): value is Envelope { const e = value as Envelope; return !!e && typeof e.id === 'string' && typeof e.balance_usd_cents === 'number' && !!normalizePurpose(e.purpose); }
function clonePurpose(purpose: EnvelopePurpose): EnvelopePurpose { return purpose.type === 'models' ? { type: 'models', models: [...purpose.models] } : { ...purpose }; }
function specificity(purpose: EnvelopePurpose): number { return purpose.type === 'item' ? 4 : purpose.type === 'models' ? 3 : purpose.type === 'model' ? 2 : purpose.type === 'any' ? 1 : 0; }
function qualifies(purpose: EnvelopePurpose, spend: { rail: Rail; model?: string; item?: string }): boolean {
  if (purpose.type === 'unrestricted' || purpose.type === 'any') return true;
  if (purpose.type === 'item') return purpose.item === spend.item;
  if (purpose.type === 'model') return spend.rail === 'model';
  return spend.rail === 'model' && !!spend.model && purpose.models.includes(spend.model);
}
function purposeWords(purpose: EnvelopePurpose): string { return purpose.type === 'item' ? `roadmap item ${purpose.item}` : purpose.type === 'models' ? `model calls on ${purpose.models.join(', ')}` : purpose.type === 'model' ? 'model calls only' : purpose.type === 'any' ? 'any spend' : 'whatever the project needs'; }
function formatCents(cents: number): string { return `$${(cents / 100).toFixed(2)}`; }
// Daily spend (idle days as 0), oldest to today, over the trailing 14 days: the evidence for the runway estimate.
function dailySpendSeries(days: Record<string, Tally>): number[] {
  const daily: Record<string, number> = Object.fromEntries(Object.entries(days).map(([d, t]) => [d, t.u]));
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
function displayProfile(a: Account | undefined): AccountProfile {
  const p = a?.profile ?? {};
  return { ...p, tagline: p.tagline_override ?? p.tagline, cover_url: p.cover_override ?? p.cover_url };
}
function fundingStatus(f: FundingSnapshot): 'funded' | 'low' | 'unfunded' {
  if (!f.funded || f.balance_usd_cents <= 0) return 'unfunded';
  if (f.runway_confident && f.runway_days !== null && f.runway_days < 7) return 'low';
  return 'funded';
}
function dayKey(): string {
  return new Date().toISOString().slice(0, 10);
}
export function sessionSummary(s: SessionRecord, receipts?: CallRecord[]): SessionSummary {
  const { turns, ...rest } = s;
  return { ...rest, tool_calls: turns.filter((t) => t.role === 'assistant' && t.tool).length, ...(receipts?.length ? { receipts } : {}) };
}
function clipText(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string' || !v) return undefined;
  return v.length > max ? `${v.slice(0, max - 1)}…` : v;
}
// A work item id as the substrate names it (a file's slug, a board's task id): short, and never a storage-key separator.
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
// A timeline as pushed or pulled, checked to the model's shape: short ids, known statuses and tenses, real
// timestamps, bounded text. A tense the substrate did not name follows from the status.
const isoOrNone = (v: unknown): string | undefined => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : undefined);
const shortOrNone = (v: unknown, n: number): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : undefined);
function normalizeRoadmap(r: unknown): Roadmap | undefined {
  if (!r || typeof r !== 'object' || !Array.isArray((r as Roadmap).items)) return undefined;
  const items: RoadmapItem[] = [];
  const seen = new Set<string>();
  for (const it of (r as Roadmap).items.slice(0, 2000)) {
    if (!it || typeof it !== 'object' || typeof it.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(it.id) || seen.has(it.id) || typeof it.title !== 'string') return undefined;
    seen.add(it.id);
    const status = (ROADMAP_STATUSES as readonly string[]).includes(it.status) ? it.status : 'planned';
    const optional: Partial<RoadmapItem> = {
      home: shortOrNone(it.home, 40), phase: shortOrNone(it.phase, 20), priority: shortOrNone(it.priority, 20), release: shortOrNone(it.release, 80),
      proposed_at: isoOrNone(it.proposed_at), started_at: isoOrNone(it.started_at), done_at: isoOrNone(it.done_at),
      by: shortOrNone(it.by, 80), commit: typeof it.commit === 'string' && /^[0-9a-f]{7,40}$/.test(it.commit) ? it.commit : undefined,
      links: Array.isArray(it.links) ? (it.links as unknown[]).filter((l): l is { kind?: unknown; url: string; label?: unknown } => !!l && typeof l === 'object' && typeof (l as { url?: unknown }).url === 'string' && /^https:\/\/[^\s]{1,400}$/.test((l as { url: string }).url)).slice(0, 20).map((l) => ({ kind: (typeof l.kind === 'string' && (LINK_KINDS as readonly string[]).includes(l.kind) ? l.kind : 'other') as LinkKind, url: l.url, ...(typeof l.label === 'string' && l.label.trim() ? { label: l.label.trim().slice(0, 120) } : {}) })) : undefined,
    };
    items.push({
      id: it.id, title: it.title.slice(0, 200), tense: tenseOf({ status, tense: it.tense }), status,
      ...Object.fromEntries(Object.entries(optional).filter(([, v]) => v !== undefined)),
      acceptance: Array.isArray(it.acceptance) ? it.acceptance.filter((l): l is string => typeof l === 'string').slice(0, 40).map((l) => l.slice(0, 1000)) : [],
    });
  }
  return { schema: typeof (r as Roadmap).schema === 'string' ? (r as Roadmap).schema : ROADMAP_SCHEMA, items };
}

// `state` is `<desired>/<observed>`, the observed half empty until the automation has reported.
export interface Pulse { balance_usd_cents: number; consumed_usd_cents: number; granted_in_usd_cents: number; live: string[]; roadmap_revision: number; state: string }
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
  usable_usd_cents: number;
  envelopes: Envelope[];
  burn_per_day_usd_cents: number;
  runway_days: number | null;
  runway_lo_days: number | null;
  runway_hi_days: number | null;
  days_observed: number;
  runway_confident: boolean;
  calls_total: number;
  last_call_at: string | null;
  daily_spend_usd_cents: number[];
  bounds: { models: string[]; limits: Array<{ window: string; usd_cents?: number; calls?: number; tokens?: number; model?: string; used: { usd_cents: number; calls: number; tokens: number } }> };
  live?: LiveDeployment;
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
  live_sessions: string[];
  live?: LiveDeployment;
  control?: AgentControl;
  stripe_cardholder?: string;
  status: 'funded' | 'low' | 'unfunded';
}

export interface FunderView {
  ok: true;
  found: boolean;
  account: string;
  login: string;
  credits_usd_cents: number;
  // Of the credits, the org's matching bonus: for other people's projects only.
  bonus_usd_cents: number;
  received_usd_cents: number;
  given_usd_cents: number;
  given: Flow[];
  received: Flow[];
}

export interface ProjectView extends DirectoryEntry {
  found: boolean;
  bounds: FundingSnapshot['bounds'];
  usable_usd_cents: number;
  envelopes: Envelope[];
  feed: Flow[];
}

export class LedgerClient {
  constructor(private readonly ns: DurableObjectNamespace) {}
  // Any operation by name: the core's below, or one an app registered with `LimitLedger.extend`.
  async call<T>(op: string, args: Record<string, unknown> = {}): Promise<T> {
    const res = await this.ns.get(this.ns.idFromName('global')).fetch('https://ledger.local/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op, ...args }) });
    return await res.json() as T;
  }
  reserve(requestId: string, account: string, kid: string, amountUsdCents: number, dailyCapUsdCents: number, model = '', estimatedTokens = 0, rail: Rail = 'model', item?: string, session?: string) {
    return this.call<{ ok: true; balance_usd_cents: number } | { ok: false; error: string; message?: string; balance_usd_cents?: number; earmarked_usd_cents?: number; reserved_usd_cents?: number; available_usd_cents?: number; needed_usd_cents?: number; limit?: Record<string, unknown>; used?: Record<string, number>; needed?: number; current?: number; retry_after_seconds?: number; how?: string }>('reserve', { request_id: requestId, account, kid, amount_usd_cents: amountUsdCents, daily_cap_usd_cents: dailyCapUsdCents, model, estimated_tokens: estimatedTokens, rail, item, session });
  }
  consume(requestId: string, actualUsdCents: number, event?: UsageEvent) { return this.call<{ ok: true }>('consume', { request_id: requestId, actual_usd_cents: actualUsdCents, event }); }
  release(requestId: string) { return this.call<{ ok: true }>('release', { request_id: requestId }); }
  mint(account: string, amountUsdCents: number, key?: string, sponsor?: Sponsor, purpose?: unknown) {
    return this.call<{ ok: boolean; idempotent?: boolean; account?: string; balance_usd_cents?: number; error?: string }>('mint', { account, amount_usd_cents: amountUsdCents, key, sponsor, for: purpose });
  }
  grant(from: string, to: string, amountUsdCents: number, key?: string, note?: string, purpose?: unknown, by?: string) {
    return this.call<{ ok: boolean; idempotent?: boolean; from_balance_usd_cents?: number; to_balance_usd_cents?: number; error?: string }>('grant', { from, to, amount_usd_cents: amountUsdCents, key, note, for: purpose, by });
  }
  earmark(account: string, purpose?: unknown) { return this.call<{ ok: boolean; error?: string; purpose?: EnvelopePurpose }>('earmark', { account, for: purpose }); }
  funder(account: string) { return this.call<FunderView>('funder', { account }); }
  bonusAdd(account: string, amountUsdCents: number) { return this.call<{ ok: boolean; bonus_usd_cents?: number; error?: string }>('bonus_add', { account, amount_usd_cents: amountUsdCents }); }
  keyRegister(claims: KeyClaims) { return this.call<{ ok: boolean; error?: string }>('key_register', { claims }); }
  keyRotate(previous: KeyClaims, claims: KeyClaims, graceUntil: string) { return this.call<{ ok: boolean; error?: string; exp?: string }>('key_rotate', { previous, claims, grace_until: graceUntil }); }
  keyCheck(kid: string) { return this.call<{ ok: boolean; error?: string }>('key_check', { kid }); }
  keyExpire(kid: string, exp: string) { return this.call<{ ok: boolean; error?: string; exp?: string }>('key_expire', { kid, exp }); }
  keyRevoke(kid: string) { return this.call<{ ok: boolean; error?: string }>('key_revoke', { kid }); }
  keys(account: string) { return this.call<{ ok: true; account: string; keys: KeyEntry[] }>('keys', { account }); }
  funding(account: string) { return this.call<FundingSnapshot>('funding', { account }); }
  pulse(account: string) { return this.call<Pulse>('pulse', { account }); }
  calls(account: string, limit?: number, before?: string) { return this.call<{ ok: true; account: string; calls_total: number; calls: CallRecord[]; next?: string }>('calls', { account, limit, before }); }
  sessionEvent(account: string, event: SessionEvent) { return this.call<{ ok: boolean; error?: string; session?: SessionSummary; idempotent?: boolean }>('session_event', { account, event }); }
  sessions(account: string, limit?: number) { return this.call<{ ok: true; account: string; live: string[]; sessions: SessionSummary[] }>('sessions', { account, limit }); }
  session(account: string, key: string) { return this.call<{ ok: boolean; error?: string; session?: SessionRecord }>('session', { account, key }); }
  sessionDelete(account: string, key: string) { return this.call<{ ok: boolean; error?: string }>('session_delete', { account, key }); }
  setupPut(account: string, setup: Record<string, unknown>) { return this.call<{ ok: boolean; error?: string }>('setup_put', { account, setup }); }
  state(account: string) { return this.call<{ ok: true; account: string } & AgentControl>('state', { account }); }
  stateRequest(account: string, state: unknown, by: string, reason?: unknown) { return this.call<{ ok: boolean; error?: string; unchanged?: boolean } & AgentControl>('state_request', { account, state, by, reason }); }
  stateReport(account: string, state: unknown, note?: unknown) { return this.call<{ ok: boolean; error?: string } & AgentControl>('state_report', { account, state, note }); }
  docsPut(account: string, docs: Record<string, unknown>) { return this.call<{ ok: boolean; error?: string }>('docs_put', { account, docs }); }
  taskPut(account: string, itemId: string, task: Record<string, unknown>) { return this.call<{ ok: boolean; error?: string; task?: TaskRecord }>('task_put', { account, item_id: itemId, task }); }
  postUpdate(account: string, itemId: string, text: string, session?: string, at?: string) { return this.call<{ ok: boolean; error?: string; update?: UpdateRecord }>('update_post', { account, item_id: itemId, text, session, at }); }
  item(account: string, itemId: string) { return this.call<ItemView>('item', { account, item_id: itemId }); }
  roadmapSet(account: string, roadmap: Roadmap, source: string, by?: string) { return this.call<{ ok: boolean; error?: string; unchanged?: boolean; revision?: RoadmapRevision }>('roadmap_set', { account, roadmap, source, by }); }
  roadmap(account: string) { return this.call<{ ok: boolean; error?: string; revision?: RoadmapRevision }>('roadmap', { account }); }
  roadmapRevisions(account: string, limit?: number) { return this.call<{ ok: true; account: string; revisions: RoadmapRevision[] }>('roadmap_revisions', { account, limit }); }
  cardPut(card: CardRecord) { return this.call<{ ok: boolean; error?: string }>('card_put', { card }); }
  card(id: string) { return this.call<{ ok: boolean; error?: string; card?: CardRecord }>('card', { id }); }
  setCardholder(account: string, cardholder: string) { return this.call<{ ok: true }>('set_cardholder', { account, cardholder }); }
  setProfile(account: string, profile: Partial<AccountProfile>, goalDays?: number) { return this.call<Record<string, unknown>>('set_profile', { account, profile, goal_days: goalDays }); }
  setDeployment(account: string, deployment?: LiveDeployment) { return this.call<{ ok: true }>('set_deployment', { account, deployment }); }
  moderate(account: string, status: Moderation, reason?: string, overrides: Partial<AccountProfile> = {}) { return this.call<{ ok: boolean; moderation?: Moderation; error?: string }>('moderate', { account, status, reason, ...overrides }); }
  exportAll() { return this.call<{ ok: true; exported_at: string; entries: Array<[string, unknown]> }>('export_all'); }
  importAll(entries: Array<[string, unknown]>, replace = false) { return this.call<{ ok: boolean; error?: string; entries?: number }>('import_all', { entries, replace }); }
  directory() { return this.call<{ ok: boolean; entries: DirectoryEntry[] }>('directory'); }
  project(account: string) { return this.call<ProjectView>('project', { account }); }
  status() { return this.call<unknown>('status'); }
  resetDaily() { return this.call<{ ok: true; day_key: string; cleared_consumed_usd_cents: number; consumed_usd_cents: number }>('reset_daily'); }
}
