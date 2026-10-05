// OA-owned source associations and exact pending publications. Native IDs stay opaque;
// custody is an operator assertion, never an inferred native identity or execution grant.
import { createHash, randomUUID } from 'node:crypto';
import { chmodSync, closeSync, copyFileSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync, constants } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { OpenAutonomy, EVENT_TYPES, TIMELINE_EVENT_TYPE, updateEvent, type CloudEvent, type UpdateRecord } from './sdk/client.ts';
import { normalizeRoadmap, type Roadmap } from './sdk/roadmap.ts';
import { redactDeep, redactSecrets } from './sdk/redaction.ts';

export interface SourceCard { readonly publicationId: string; readonly sequence: number; readonly board: string; readonly card: Readonly<Record<string, any>> }
export interface SourceSnapshot { readonly sourceContextId: string; readonly cards: readonly SourceCard[]; readonly proposedCursor: string }
export interface NativeRuntimeSelection { kind: 'hermes' | 'orchestrator'; root: string }
interface StoreContext { context: string; backing_board: string }
export interface PublicationConfig { source_context: string; stores: StoreContext[]; custody: string; adoption?: string }
interface Custody { version: 1; generation: number; account: string; apiBase: string; sourceContext: string; stores: StoreContext[]; nativeRuntime: NativeRuntimeSelection; operator: string; statement: string; evidence: string; previous?: { custodyDigest: string; reporterDigest: string; cacheDigest: string } }
interface Association { key: string; tuple: [string, number, string, string, string]; itemId: string }
type NoteKind = 'review' | 'handoff';
interface NoteAlias { associationKey: string; kind: NoteKind; nativeEffectId: string; noteId: string; legacyKey?: string; effectDigest?: string; acknowledgement?: UpdateRecord | { kind: 'legacy-noted'; key: string } }
export interface SessionBinding { platformKey: string; nativeSessionId: string; associationKey?: string; itemId?: string; evidence: string }
interface Pending { obligationId: string; kind: 'note' | 'timeline'; associationKey?: string; wire: string; wireDigest: string; expected: any; sourceObservation?: SourceSnapshot }
interface Receipt extends Omit<Pending, 'sourceObservation'> { result: any }
interface PublicationData { enrollment: { version: 1; account: string; apiBase: string; sourceContext: string; stores: StoreContext[]; selectedRuntime: NativeRuntimeSelection; custody: Custody; custodyDigest: string; adoptionDigest?: string }; associations: Association[]; noteAliases: NoteAlias[]; sessionBindings: SessionBinding[]; pending: Pending[]; receipts: Receipt[]; requiresSnapshot?: boolean }
export interface PublicationOptions { configFile: string; stateFile: string; cacheFile: string; publication: unknown; account: string; apiBase: string; nativeRuntime: NativeRuntimeSelection }
export interface NoteInput { board: string; cardId: string; kind: NoteKind; effectId: string | number; text: string; at?: string; session?: string; legacyKey?: string }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const itemId = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const nonempty = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const eq = (a: unknown, b: unknown): boolean => canonical(a) === canonical(b);
// Comparison canonicalization is separate from the exact retained request bytes.
const canonical = (v: any): string => JSON.stringify(v, (_key, value) => value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value);
export const publicationHash = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
export const retainedDigest = (file: string): string => publicationHash(readFileSync(file));
export function savePublicationBytes(file: string, bytes: string | Buffer): void {
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  const fd = openSync(temporary, 'wx', 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temporary, file);
  const parent = openSync(dirname(file), 'r'); try { fsyncSync(parent); } finally { closeSync(parent); }
}
export function savePublicationFile(file: string, value: unknown): void { savePublicationBytes(file, JSON.stringify(value) + '\n'); }
function privateJSON(file: string): any {
  if (lstatSync(file).isSymbolicLink()) throw new Error(`Publication file must not be a symlink: ${file}`);
  return JSON.parse(readFileSync(file, 'utf8'));
}
function retainExactBytes(file: string, backup: string): void {
  if (existsSync(backup)) { if (retainedDigest(backup) !== retainedDigest(file)) throw new Error('Retained legacy backup differs from adoption input'); return; }
  copyFileSync(file, backup, constants.COPYFILE_EXCL); chmodSync(backup, 0o600);
  const fd = openSync(backup, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); }
  const parent = openSync(dirname(backup), 'r'); try { fsyncSync(parent); } finally { closeSync(parent); }
}
function localJSON(config: string, path: unknown): string {
  if (!nonempty(path) || isAbsolute(path) || !path.endsWith('.json')) throw new Error('Publication custody/adoption must name a relative JSON file');
  const base = dirname(config), file = resolve(base, path), rel = relative(base, file);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Publication custody/adoption must remain beside its configuration');
  let current = base;
  for (const part of rel.split('/')) { current = resolve(current, part); if (lstatSync(current).isSymbolicLink()) throw new Error(`Publication path must not traverse a symlink: ${current}`); }
  return file;
}
function checkConfig(value: any): PublicationConfig {
  if (!value || typeof value.source_context !== 'string' || !uuid.test(value.source_context) || !Array.isArray(value.stores) || !value.stores.length || !nonempty(value.custody)) throw new Error('Publication enrollment requires source_context, explicit stores and custody');
  const contexts = new Set<string>(), boards = new Set<string>();
  for (const store of value.stores) {
    if (!store || typeof store.context !== 'string' || !uuid.test(store.context) || !nonempty(store.backing_board) || contexts.has(store.context) || boards.has(store.backing_board)) throw new Error('Publication stores require unique UUID contexts and exact backing selectors');
    contexts.add(store.context); boards.add(store.backing_board);
  }
  return structuredClone(value);
}
function effectId(kind: NoteKind, value: string | number): string {
  if (kind === 'review' && typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('Native review identity is not a safe integer');
    return String(value);
  }
  if (!nonempty(value)) throw new Error(`Native ${kind} effect identity is missing`);
  return value;
}

export class PublicationStore {
  readonly sourceContextId: string;
  readonly runtime: Record<string, any>;
  private readonly config: PublicationConfig;
  private readonly data: PublicationData;
  private readonly lock: string;
  private readonly nonce = randomUUID();
  private tail: Promise<unknown> = Promise.resolve();
  private closed = false;
  private closing = false;
  private observation?: SourceSnapshot;
  constructor(private readonly options: PublicationOptions) {
    this.config = checkConfig(options.publication); this.sourceContextId = this.config.source_context;
    this.lock = `${options.stateFile}.lock`;
    try { mkdirSync(this.lock, { mode: 0o700 }); }
    catch { throw new Error(`Publication writer ownership is held/unknown at ${this.lock}; stop its owner and explicitly release it before starting`); }
    try {
      savePublicationFile(resolve(this.lock, 'owner.json'), { pid: process.pid, nonce: this.nonce, startedAt: new Date().toISOString() });
      const prior = existsSync(options.stateFile) ? privateJSON(options.stateFile) : undefined;
      const cache = existsSync(options.cacheFile) ? privateJSON(options.cacheFile) : undefined;
      const custodyFile = localJSON(options.configFile, this.config.custody);
      const custody = privateJSON(custodyFile) as Custody, custodyDigest = retainedDigest(custodyFile);
      this.checkCustody(custody);
      if (prior && prior.version !== 2 && prior.version !== 3) throw new Error(`Unsupported reporter state version ${prior.version}; retained state was not overwritten`);
      if (cache && cache.version !== 1 && cache.version !== 2) throw new Error(`Unsupported source cache version ${cache.version}; retained state was not overwritten`);
      this.runtime = prior ? { ...prior } : {};
      delete this.runtime.publication; delete this.runtime.version;
      if (prior?.version === 3) {
        this.data = prior.publication;
        this.checkData();
        this.checkContinuity(custody, custodyDigest);
        if (this.config.adoption && retainedDigest(localJSON(options.configFile, this.config.adoption)) !== this.data.enrollment.adoptionDigest) throw new Error('A changed/second adoption cannot replace retained source/effect aliases');
      } else {
        this.data = { enrollment: { version: 1, account: options.account, apiBase: options.apiBase, sourceContext: this.sourceContextId, stores: this.config.stores, selectedRuntime: options.nativeRuntime, custody, custodyDigest }, associations: [], noteAliases: [], sessionBindings: [], pending: [], receipts: [], requiresSnapshot: Boolean(prior || cache) };
        if (custody.generation !== 1 || custody.previous) throw new Error('Initial publication enrollment requires custody generation 1 without previous');
        if (prior || cache) this.adopt(prior, cache);
        else if (this.config.adoption) throw new Error('Legacy adoption was supplied without retained state');
      }
      this.save();
    } catch (error) { rmSync(this.lock, { recursive: true }); throw error; }
  }
  private checkCustody(c: Custody): void {
    if (!c || c.version !== 1 || !Number.isSafeInteger(c.generation) || c.generation < 1 || c.account !== this.options.account || c.apiBase !== this.options.apiBase || c.sourceContext !== this.sourceContextId || !eq(c.stores, this.config.stores) || !eq(c.nativeRuntime, this.options.nativeRuntime) || !nonempty(c.operator) || !nonempty(c.statement) || !nonempty(c.evidence)) throw new Error('Publication custody declaration does not match selected account/API/source/stores/runtime or lacks operator evidence');
  }
  private checkData(): void {
    const d = this.data;
    if (!d || d.enrollment?.version !== 1 || !Array.isArray(d.associations) || !Array.isArray(d.noteAliases) || !Array.isArray(d.sessionBindings) || !Array.isArray(d.pending) || !Array.isArray(d.receipts)) throw new Error('Malformed retained publication state');
    if (d.enrollment.account !== this.options.account || d.enrollment.apiBase !== this.options.apiBase || d.enrollment.sourceContext !== this.sourceContextId) throw new Error('Publication account/API/source context changed; destination reassignment is refused');
    const keys = new Set<string>(), items = new Set<string>();
    for (const a of d.associations) {
      if (!a || !Array.isArray(a.tuple) || a.tuple.length !== 5 || a.tuple[0] !== 'oa.native-item' || a.tuple[1] !== 1 || a.tuple[2] !== this.sourceContextId || !uuid.test(a.tuple[3]) || !nonempty(a.tuple[4]) || a.key !== publicationHash(JSON.stringify(a.tuple)) || !itemId.test(a.itemId) || keys.has(a.key) || items.has(a.itemId)) throw new Error('Retained item association is malformed or ambiguous');
      keys.add(a.key); items.add(a.itemId);
    }
    const notes = new Set<string>(), effects = new Set<string>();
    for (const a of d.noteAliases) {
      const effect = JSON.stringify([a.associationKey, a.kind, a.nativeEffectId]);
      if (!keys.has(a.associationKey) || !['review', 'handoff'].includes(a.kind) || !nonempty(a.nativeEffectId) || !nonempty(a.noteId) || a.noteId.length > 200 || notes.has(a.noteId) || effects.has(effect)) throw new Error('Retained note alias is malformed or ambiguous');
      if (a.effectDigest !== undefined && !/^[0-9a-f]{64}$/.test(a.effectDigest)) throw new Error('Retained native effect digest is malformed');
      if (a.acknowledgement) {
        const ack = a.acknowledgement, association = d.associations.find(item => item.key === a.associationKey)!;
        if ('kind' in ack) {
          if (ack.kind !== 'legacy-noted' || !nonempty(a.legacyKey) || ack.key !== a.legacyKey) throw new Error('Retained legacy suppression marker differs from its alias');
        } else if (ack.id !== a.noteId || ack.account !== this.options.account || ack.item_id !== association.itemId || !nonempty(ack.text) || ack.text.length > 2000 || redactSecrets(ack.text) !== ack.text || !nonempty(ack.ts) || !Number.isFinite(Date.parse(ack.ts)) || (ack.session !== undefined && (!nonempty(ack.session) || ack.session.length > 200 || redactSecrets(ack.session) !== ack.session))) throw new Error('Retained adopted note receipt differs from its identity/content binding');
      }
      notes.add(a.noteId); effects.add(effect);
    }
    const sessions = new Set<string>();
    for (const b of d.sessionBindings) {
      if (!nonempty(b.platformKey) || !nonempty(b.nativeSessionId) || !nonempty(b.evidence) || sessions.has(b.platformKey) || (b.associationKey && d.associations.find(a => a.key === b.associationKey)?.itemId !== b.itemId) || (b.itemId && !itemId.test(b.itemId))) throw new Error('Retained session binding is malformed or ambiguous');
      sessions.add(b.platformKey);
    }
    const obligations = new Set<string>();
    for (const p of d.pending) { this.checkedEvent(p); if (obligations.has(p.obligationId)) throw new Error('Duplicate pending publication obligation'); obligations.add(p.obligationId); }
    const receipts = new Set<string>();
    for (const receipt of d.receipts) {
      const event = this.checkedEvent(receipt); this.checkedResult(receipt, event, receipt.result);
      if (receipts.has(receipt.obligationId) || obligations.has(receipt.obligationId)) throw new Error('Duplicate/conflicting retained publication receipt');
      receipts.add(receipt.obligationId);
    }
  }
  private checkContinuity(custody: Custody, digest: string): void {
    const old = this.data.enrollment;
    if (old.custodyDigest === digest) {
      if (!eq(old.stores, this.config.stores) || !eq(old.selectedRuntime, this.options.nativeRuntime)) throw new Error('Retained publication runtime/store declaration changed without continuity');
      return;
    }
    const prev = custody.previous;
    if (custody.generation !== old.custody.generation + 1 || !prev || prev.custodyDigest !== old.custodyDigest || prev.reporterDigest !== retainedDigest(this.options.stateFile) || !existsSync(this.options.cacheFile) || prev.cacheDigest !== retainedDigest(this.options.cacheFile) || privateJSON(this.options.cacheFile).pending || this.data.pending.length || !eq(old.stores.map(s => s.context).sort(), this.config.stores.map(s => s.context).sort())) throw new Error('Publication continuity needs exact stopped prior digests, unchanged contexts and settled obligations');
    retainExactBytes(this.options.stateFile, `${this.options.stateFile}.custody-${old.custody.generation}.json`);
    retainExactBytes(this.options.cacheFile, `${this.options.cacheFile}.custody-${old.custody.generation}.json`);
    this.data.enrollment = { ...old, custody, custodyDigest: digest, stores: this.config.stores, selectedRuntime: this.options.nativeRuntime };
    this.data.requiresSnapshot = true;
  }
  private adopt(prior: any, cache: any): void {
    if (!prior || prior.version !== 2 || !cache || cache.version !== 1 || !this.config.adoption) throw new Error('Retained legacy source/reporter state needs explicit reviewed adoption of both files');
    const file = localJSON(this.options.configFile, this.config.adoption), adoption = privateJSON(file);
    if (adoption.version !== 1 || adoption.account !== this.options.account || adoption.apiBase !== this.options.apiBase || adoption.sourceContext !== this.sourceContextId || !eq(adoption.stores, this.config.stores) || !nonempty(adoption.operator) || !nonempty(adoption.statement) || !nonempty(adoption.evidence) || adoption.reporterDigest !== retainedDigest(this.options.stateFile) || adoption.cacheDigest !== retainedDigest(this.options.cacheFile) || !Array.isArray(adoption.items) || !Array.isArray(adoption.notes) || !Array.isArray(adoption.sessions)) throw new Error('Legacy adoption context/provenance/digests or exact alias inventory is missing');
    const cached = new Map((cache.cards ?? []).map((entry: any) => [JSON.stringify([entry[1]?.board, entry[1]?.id]), entry[1]]));
    for (const entry of adoption.items) {
      const store = this.config.stores.find(s => s.context === entry.storeContext);
      if (!store || !nonempty(entry.nativeCardId) || !cached.has(JSON.stringify([store.backing_board, entry.nativeCardId])) || !itemId.test(entry.itemId) || entry.itemId !== entry.nativeCardId) throw new Error('Legacy item adoption lacks exact retained raw-card destination association');
      const tuple: Association['tuple'] = ['oa.native-item', 1, this.sourceContextId, store.context, entry.nativeCardId];
      this.data.associations.push({ key: publicationHash(JSON.stringify(tuple)), tuple, itemId: entry.itemId });
    }
    for (const card of cached.values() as Iterable<any>) if (!this.data.associations.some(a => a.tuple[3] === this.storeContext(card.board) && a.tuple[4] === card.id)) throw new Error('Legacy cached item has no explicit destination adoption; it is not a new association');
    const markers = new Set<string>(prior.noted ?? []);
    for (const entry of adoption.notes) {
      if (!nonempty(entry.legacyKey) || !markers.has(entry.legacyKey)) throw new Error('Legacy note adoption must retain an exact acknowledged marker');
      const a = this.data.associations.find(a => a.key === entry.associationKey);
      if (!a) throw new Error('Legacy note adoption names an unknown item association');
      const store = this.config.stores.find(store => store.context === a.tuple[3])!;
      const card: any = cached.get(JSON.stringify([store.backing_board, a.tuple[4]]));
      const native = entry.kind === 'review' ? card?.reviews?.find((review: any) => review.id !== undefined && effectId('review', review.id) === entry.nativeEffectId) : card?.attempts?.find((attempt: any) => attempt.id === entry.nativeEffectId);
      if (!native) throw new Error('Legacy note alias lacks its stable native effect in retained evidence; identity must not be guessed from position/time/text');
      const ack = entry.acknowledgement;
      if (ack?.kind === 'legacy-noted') { if (ack.key !== entry.legacyKey) throw new Error('Legacy note marker acknowledgement differs'); }
      else if (!ack || ack.id !== entry.noteId || ack.account !== this.options.account || ack.item_id !== a.itemId || !nonempty(ack.text) || !nonempty(ack.ts)) throw new Error('Legacy note full receipt does not match its preserved binding');
      this.data.noteAliases.push(entry);
      markers.delete(entry.legacyKey);
    }
    if (markers.size) throw new Error('Legacy adoption leaves acknowledged note markers unmapped; unknown history is not fresh');
    for (const entry of adoption.sessions) {
      if (!Object.hasOwn(prior.published ?? {}, entry.platformKey)) throw new Error('Legacy session adoption lacks retained checkpoint evidence');
      const suffix = entry.platformKey === entry.nativeSessionId ? 0 : entry.platformKey.startsWith(`${entry.nativeSessionId}~`) ? Number(entry.platformKey.slice(entry.nativeSessionId.length + 1)) : NaN;
      if (!Number.isSafeInteger(suffix) || suffix < 0 || suffix > (prior.continuations?.[entry.nativeSessionId] ?? 0)) throw new Error('Legacy session alias differs from its retained continuation identity');
      this.data.sessionBindings.push({ ...entry, evidence: entry.evidence ?? adoption.evidence });
    }
    if (Object.keys(prior.published ?? {}).some(key => !this.data.sessionBindings.some(b => b.platformKey === key))) throw new Error('Legacy adoption leaves transcript checkpoints unmapped');
    this.checkData();
    retainExactBytes(this.options.stateFile, `${this.options.stateFile}.legacy.json`); retainExactBytes(this.options.cacheFile, `${this.options.cacheFile}.legacy.json`);
    this.data.enrollment.adoptionDigest = retainedDigest(file);
  }
  get requiresSnapshot(): boolean { return this.data.requiresSnapshot === true; }
  get legacyAdopted(): boolean { return Boolean(this.data.enrollment.adoptionDigest); }
  snapshotAcknowledged(): void { if (this.data.requiresSnapshot) { this.data.requiresSnapshot = false; this.save(); } }
  storeContext(board: string): string {
    const store = this.config.stores.find(s => s.backing_board === board);
    if (!store) throw new Error(`Unenrolled native backing store ${board}; publication remains pending`);
    return store.context;
  }
  run<T>(work: () => Promise<T>): Promise<T> {
    if (this.closed || this.closing) return Promise.reject(new Error('Publication writer closing/closed'));
    const result = this.tail.then(work); this.tail = result.catch(() => {}); return result;
  }
  saveRuntime(patch: Record<string, unknown>): void { Object.assign(this.runtime, patch); this.save(); }
  private save(): void { if (this.closed) throw new Error('Publication writer closed'); savePublicationFile(this.options.stateFile, { ...this.runtime, version: 3, publication: this.data }); }
  resolveCards(rows: readonly SourceCard[]): void {
    const additions: Association[] = [], seen = new Set<string>();
    for (const row of rows) {
      const store = this.storeContext(row.board), id = row.card.id;
      if (!nonempty(id)) throw new Error('Native card identity missing');
      const tuple: Association['tuple'] = ['oa.native-item', 1, this.sourceContextId, store, id], key = publicationHash(JSON.stringify(tuple));
      if (seen.has(key)) throw new Error('Duplicate native association in source inventory'); seen.add(key);
      const old = this.data.associations.find(a => a.key === key);
      if (old && !eq(old.tuple, tuple)) throw new Error('OA association hash collision');
      if (!old) additions.push({ key, tuple, itemId: `oa_${key}` });
    }
    for (const a of additions) if (this.data.associations.some(old => old.itemId === a.itemId && old.key !== a.key)) throw new Error('Conflicting destination item alias');
    if (additions.length) { this.data.associations.push(...additions); this.save(); }
  }
  association(board: string, cardId: string): Association {
    const tuple = ['oa.native-item', 1, this.sourceContextId, this.storeContext(board), cardId];
    const a = this.data.associations.find(a => a.key === publicationHash(JSON.stringify(tuple)));
    if (!a || !eq(a.tuple, tuple)) throw new Error('Item association must be preflighted before any effect');
    return a;
  }
  item(board: string, cardId: string): string { return this.association(board, cardId).itemId; }
  observe(snapshot: SourceSnapshot): void { if (snapshot.sourceContextId !== this.sourceContextId) throw new Error('Source snapshot enrollment mismatch'); this.resolveCards(snapshot.cards); this.observation = snapshot; }
  private checkedEvent(p: Pending): CloudEvent {
    if (!nonempty(p.obligationId) || !['note', 'timeline'].includes(p.kind) || !nonempty(p.wire) || publicationHash(p.wire) !== p.wireDigest) throw new Error('Retained publication request digest/identity is invalid');
    const events = JSON.parse(p.wire);
    if (!Array.isArray(events) || events.length !== 1 || JSON.stringify(events) !== p.wire || events[0]?.specversion !== '1.0' || !nonempty(events[0]?.id)) throw new Error('Retained publication bytes cannot be replayed identically');
    const e = events[0];
    if (p.kind === 'note') {
      const a = this.data.associations.find(a => a.key === p.associationKey);
      if (!a || e.type !== EVENT_TYPES.update || e.id !== p.obligationId || e.subject !== a.itemId || p.expected?.id !== e.id || p.expected?.account !== this.options.account || p.expected?.item_id !== e.subject || p.expected?.ts !== e.time || !eq(e.data, { text: p.expected?.text, ...(p.expected?.session ? { session: p.expected.session } : {}) }) || !eq(redactDeep(e.data), e.data)) throw new Error('Retained note request differs from its account/item/content binding');
    } else if (p.obligationId !== `oat_${publicationHash(p.wire)}` || e.type !== TIMELINE_EVENT_TYPE || e.subject !== 'project' || !eq(e.data, p.expected) || !eq(normalizeRoadmap(redactDeep(e.data.roadmap)), e.data.roadmap)) throw new Error('Retained timeline request differs from normalized expected document');
    return events[0];
  }
  private checkedResult(p: Pending, event: CloudEvent, result: any): void {
    if (result?.ok !== true || result.id !== event.id) throw new Error('Retained publication receipt is not a successful result for its prepared request');
    if (p.kind === 'note') {
      if (!result.update || !eq(result.update, p.expected)) throw new Error(`Publication ${p.obligationId} conflicts with stored note identity/content`);
      const alias = this.data.noteAliases.find(n => n.noteId === p.obligationId);
      if (!alias || alias.associationKey !== p.associationKey) throw new Error('Publication receipt has no matching native note association');
    } else {
      const r = result.revision;
      if (!r || !eq(r.roadmap, p.expected.roadmap) || r.source !== p.expected.source || (!result.unchanged && p.expected.by !== undefined && r.by !== p.expected.by)) throw new Error(`Publication ${p.obligationId} conflicts with normalized timeline receipt`);
    }
  }
  private async deliver(p: Pending, oa: OpenAutonomy): Promise<any> {
    const event = this.checkedEvent(p), result = await oa.send(event), first = result.results[0];
    if (!result.ok || result.results.length !== 1 || first?.ok !== true || first.id !== event.id) throw new Error(`Publication ${p.obligationId} pending: ${result.status} ${first?.error ?? result.error ?? 'missing successful receipt'}`);
    this.checkedResult(p, event, first);
    const { sourceObservation: _observation, ...prepared } = p;
    const receipt: Receipt = { ...prepared, result: first };
    const old = this.data.receipts.find(r => r.obligationId === p.obligationId);
    if (old && old.wireDigest !== p.wireDigest) throw new Error('Publication receipt request binding changed');
    if (!old) this.data.receipts.push(receipt);
    this.data.pending = this.data.pending.filter(other => other.obligationId !== p.obligationId);
    this.save(); return first;
  }
  async retry(oa: OpenAutonomy): Promise<void> { for (const pending of [...this.data.pending]) await this.deliver(pending, oa); }
  async note(input: NoteInput, oa: OpenAutonomy): Promise<void> {
    const association = this.association(input.board, input.cardId), nativeEffectId = effectId(input.kind, input.effectId);
    const alias = this.data.noteAliases.find(n => n.associationKey === association.key && n.kind === input.kind && n.nativeEffectId === nativeEffectId);
    const noteId = alias?.noteId ?? `oan_${publicationHash(JSON.stringify(['oa.native-note', 1, association.key, input.kind, nativeEffectId]))}`;
    const text = redactSecrets(input.text).slice(0, 2000);
    if (!text || (input.session && (redactSecrets(input.session) !== input.session || input.session.length > 200))) throw new Error('Note content/session reference cannot be safely published');
    const pending = this.data.pending.find(p => p.obligationId === noteId), receipt = this.data.receipts.find(r => r.obligationId === noteId);
    const existing = pending?.expected ?? receipt?.result?.update ?? (alias?.acknowledgement && !('kind' in alias.acknowledgement) ? alias.acknowledgement : undefined);
    if (existing && (existing.item_id !== association.itemId || existing.text !== text || existing.session !== input.session)) throw new Error('Native effect payload changed under an existing note identity');
    const supplied = Date.parse(input.at ?? ''), nativeAt = Number.isFinite(supplied) ? new Date(supplied).toISOString() : undefined;
    const effectDigest = publicationHash(canonical({ text, session: input.session, nativeAt }));
    if (alias?.effectDigest && alias.effectDigest !== effectDigest) throw new Error('Native effect content/time changed under its retained identity');
    if (receipt || alias?.acknowledgement) return;
    if (pending) { await this.deliver(pending, oa); return; }
    const ts = new Date(Number.isFinite(supplied) && supplied <= Date.now() ? supplied : Date.now()).toISOString();
    const event = updateEvent({ id: noteId, item: association.itemId, text, at: ts, ...(input.session ? { session: input.session } : {}) });
    const wire = JSON.stringify([event]);
    const p: Pending = { obligationId: noteId, kind: 'note', associationKey: association.key, wire, wireDigest: publicationHash(wire), expected: { id: noteId, account: this.options.account, item_id: association.itemId, ts, text, ...(input.session ? { session: input.session } : {}) }, sourceObservation: this.observation };
    this.data.pending.push(p);
    if (!alias) this.data.noteAliases.push({ associationKey: association.key, kind: input.kind, nativeEffectId, noteId, effectDigest });
    this.save(); await this.deliver(p, oa);
  }
  async timeline(roadmap: Roadmap, source: string, by: string | undefined, oa: OpenAutonomy): Promise<void> {
    await this.retry(oa);
    const model = normalizeRoadmap(redactDeep(roadmap));
    if (!model || model.items.length !== roadmap.items.length || model.items.some((item, i) => item.id !== roadmap.items[i]?.id) || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(source)) throw new Error('Timeline normalization omitted/transformed item identity or source');
    const normalizedBy = by ? redactSecrets(by).slice(0, 80) : undefined;
    const current = this.data.receipts.filter(r => r.result?.revision).at(-1)?.result.revision;
    if (current?.source === source && eq(current.roadmap, model)) return;
    const event: CloudEvent = { specversion: '1.0', id: randomUUID(), source: 'open-autonomy-sdk', type: TIMELINE_EVENT_TYPE, subject: 'project', time: new Date().toISOString(), datacontenttype: 'application/json', data: { source, roadmap: model, ...(normalizedBy ? { by: normalizedBy } : {}) } };
    const wire = JSON.stringify([event]), obligationId = `oat_${publicationHash(wire)}`;
    const p: Pending = { obligationId, kind: 'timeline', wire, wireDigest: publicationHash(wire), expected: { source, roadmap: model, ...(normalizedBy ? { by: normalizedBy } : {}) }, sourceObservation: this.observation };
    this.data.pending.push(p); this.save(); await this.deliver(p, oa);
  }
  async sessionItem(binding: SessionBinding, oa: OpenAutonomy): Promise<string | undefined> {
    if (!nonempty(binding.platformKey) || binding.platformKey.length > 200 || binding.platformKey.includes(':') || redactSecrets(binding.platformKey) !== binding.platformKey || !nonempty(binding.nativeSessionId) || !nonempty(binding.evidence)) throw new Error('Session binding needs valid unchanged platform/native identity and positive evidence');
    if (binding.itemId && (!itemId.test(binding.itemId) || redactSecrets(binding.itemId) !== binding.itemId)) throw new Error('Session item reference would be transformed');
    if (binding.associationKey && this.data.associations.find(a => a.key === binding.associationKey)?.itemId !== binding.itemId) throw new Error('Session item differs from its proven association');
    const old = this.data.sessionBindings.find(b => b.platformKey === binding.platformKey);
    const continuation = (key: string): number | undefined => {
      if (key === binding.nativeSessionId) return 0;
      const prefix = `${binding.nativeSessionId}~`, suffix = key.startsWith(prefix) ? key.slice(prefix.length) : '';
      if (!/^[1-9][0-9]*$/.test(suffix)) return undefined;
      const value = Number(suffix); return Number.isSafeInteger(value) ? value : undefined;
    };
    const currentContinuation = continuation(binding.platformKey);
    const priorBindings = currentContinuation === undefined ? [] : this.data.sessionBindings.filter(b => b.nativeSessionId === binding.nativeSessionId && b.itemId && continuation(b.platformKey) !== undefined && continuation(b.platformKey)! < currentContinuation);
    const inherited = priorBindings.at(-1);
    if (inherited && priorBindings.some(b => b.itemId !== inherited.itemId || (b.associationKey && inherited.associationKey && b.associationKey !== inherited.associationKey))) throw new Error('Retained native session continuations have conflicting frozen associations');
    if (inherited) {
      if ((binding.itemId && binding.itemId !== inherited.itemId) || (binding.associationKey && inherited.associationKey && binding.associationKey !== inherited.associationKey) || (old?.itemId && old.itemId !== inherited.itemId) || (old?.associationKey && inherited.associationKey && old.associationKey !== inherited.associationKey)) throw new Error('Native session continuation changed its frozen association');
      binding = { ...binding, itemId: inherited.itemId, associationKey: inherited.associationKey ?? binding.associationKey, evidence: inherited.evidence };
    }
    if (old && (old.nativeSessionId !== binding.nativeSessionId || (binding.itemId && old.itemId && old.itemId !== binding.itemId) || (binding.associationKey && old.associationKey && old.associationKey !== binding.associationKey))) throw new Error('Frozen session association changed');
    const remote = await oa.session(this.options.account, binding.platformKey);
    const proposed = binding.itemId ?? old?.itemId;
    if (remote?.item_id && remote.item_id !== proposed) throw new Error('Existing remote session item is not the proved frozen binding');
    if (remote && !old) throw new Error('Existing session without retained binding needs explicit adoption, not current uniqueness');
    if (remote && !remote.item_id && !old?.itemId && proposed && !inherited) {
      const a = this.data.associations.find(a => a.key === binding.associationKey);
      const proof = this.observation?.cards.find(row => a && this.storeContext(row.board) === a.tuple[3] && row.card.id === a.tuple[4]);
      const attemptId = binding.evidence.startsWith('native-attempt:') ? binding.evidence.slice('native-attempt:'.length) : undefined;
      const attempt = attemptId && proof?.card.attempts?.find((attempt: any) => String(attempt.id) === attemptId && (attempt.session?.session_id ?? attempt.session?.id) === binding.nativeSessionId);
      if (!attempt) throw new Error('Unknown historical session item requires positive retained native-attempt attribution; workspace/current uniqueness is insufficient');
    }
    const next = { ...old, ...binding, ...(proposed ? { itemId: proposed } : {}), ...(!binding.associationKey && old?.associationKey ? { associationKey: old.associationKey, evidence: old.evidence } : {}) };
    if (!eq(old, next)) { this.data.sessionBindings = [...this.data.sessionBindings.filter(b => b.platformKey !== binding.platformKey), next]; this.save(); }
    return proposed;
  }
  async close(): Promise<void> {
    this.closing = true;
    await this.tail;
    if (this.closed) return;
    const owner = privateJSON(resolve(this.lock, 'owner.json'));
    if (owner.nonce !== this.nonce) throw new Error('Publication lock ownership changed; cannot release it');
    this.closed = true; rmSync(this.lock, { recursive: true });
  }
}
