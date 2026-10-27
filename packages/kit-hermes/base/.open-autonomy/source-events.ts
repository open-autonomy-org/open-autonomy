// Durable app-owned observations of the public native workflow stream. The cursor
// stays opaque; OA enrollment supplies adapter context, never native home/log identity.
// Pending complete inventory precedes effects; committed cursors follow durable receipts.
// Transcript checkpoints remain a separate obligation.
// Durability costs what changed, not the board: the cache file holds the whole inventory as of its generation, and
// each delivery appends only its changed cards (pending) and then its cursor (commit) to the cache's journal. The
// cache is rewritten whole only when the journal outgrows it, at a resync, and when the source stops. A running
// card's liveness re-publishes the whole card about once a minute, so a whole-cache write per delivery rewrote a
// 44 MB cache several times a minute.
import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { closeSync, existsSync, fstatSync, fsyncSync, ftruncateSync, lstatSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { savePublicationBytes, sourceJournalFile, type SourceCard, type SourceSnapshot } from './publication.ts';
import { startWork, spawnWork } from './work-ledger.ts';
export type { SourceCard, SourceSnapshot } from './publication.ts';
interface SourceOptions {
  command: string[]; stateFile: string; env: Record<string, string>;
  sourceContextId: string; storeContext: (board: string) => string;
  allowLegacyUpgrade?: boolean; forceSnapshot?: boolean;
  changed: (snapshot: SourceSnapshot) => Promise<void>; log: (message: string) => void;
}
interface CacheState { version: 2; sourceContextId: string; cursor?: string; cards: SourceCard[]; pending?: SourceSnapshot; legacyCursor?: string; generation?: number }
// A journal entry belongs to the cache generation it names; entries of an older generation are already in the cache.
// A removed card is named by its board and card id, as written, so a replay needs no store context.
type JournalRecord = { kind: 'pending'; cursor: string; rows: SourceCard[]; removed: Array<[string, string]> } | { kind: 'commit'; cursor: string | null };
const rawKey = (row: any): string => JSON.stringify([row?.board, row?.card?.id]);
type JournalEntry = JournalRecord & { generation: number };
// The journal is folded into the cache once it is larger than the cache and than this many bytes.
const JOURNAL_FLOOR = 8 * 1024 * 1024;
interface StreamChild { child: ChildProcess; retire: () => Promise<void> }
// The public native CLI can launch a Node stream reader. Retire that private
// command group, rather than treating the wrapper's exit as reader completion.
function streamChild(command: string[], env: Record<string, string>, log: (message: string) => void, closeReader: () => void): StreamChild {
  const grouped = process.platform !== 'win32';
  const child = spawnWork(() => spawn(command[0], command.slice(1), { env, detached: grouped, stdio: ['ignore', 'pipe', 'inherit'] }), 'node');
  let closed = false, stopping = false, escalated = false, settled = false;
  let deadline = 0, timer: ReturnType<typeof setInterval> | undefined;
  let resolveRetired!: () => void, rejectRetired!: (error: Error) => void;
  const retired = new Promise<void>((resolve, reject) => { resolveRetired = resolve; rejectRetired = reject; });
  void retired.catch(() => {}); // follow()/stop() owns the eventual refusal
  const alive = (): boolean => {
    if (!child.pid) return false;
    if (!grouped) return !closed;
    try { process.kill(-child.pid, 0); return true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false; throw error; }
  };
  const signal = (value: NodeJS.Signals): void => {
    if (!child.pid) return;
    try { if (grouped) process.kill(-child.pid, value); else child.kill(value); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
  };
  const finish = (error?: Error): void => {
    settled = true; if (timer) clearInterval(timer);
    if (error) closeReader(); child.stdout?.destroy();
    if (error) rejectRetired(error); else resolveRetired();
  };
  const check = (): void => {
    if (settled) return;
    try {
      if (closed && !alive()) { finish(); return; }
      if (Date.now() >= deadline) {
        if (!escalated) {
          escalated = true; signal('SIGKILL'); closeReader(); child.stdout?.destroy(); deadline = Date.now() + 1000;
        } else finish(new Error('Native stream retirement could not be confirmed; stop/reconnect refused'));
      }
    } catch (error) { finish(new Error(`Native stream retirement failed: ${(error as Error).message}`)); }
  };
  const retire = (): Promise<void> => {
    if (!stopping && !settled) {
      stopping = true; deadline = Date.now() + 5000;
      try { signal('SIGTERM'); } catch (error) { finish(new Error(`Native stream retirement failed: ${(error as Error).message}`)); }
      if (!settled) { timer = setInterval(check, 25); check(); }
    }
    return retired;
  };
  child.once('error', error => { log(`event source unavailable: ${error.message}`); void retire(); });
  // Keep the fallback armed even after the direct wrapper has exited. Do not
  // destroy buffered output on natural exit before readline has consumed it.
  child.once('exit', () => { void retire(); });
  child.once('close', () => { closed = true; if (stopping) check(); });
  return { child, retire };
}
const freeze = <T>(value: T): T => {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
};
export class BoardEventSource {
  private rows = new Map<string, SourceCard>();
  private cursor?: string;
  private legacyCursor?: string;
  private pending?: SourceSnapshot;
  private child?: StreamChild;
  private lines?: ReturnType<typeof createInterface>;
  private closed = false;
  private started = false;
  private followTask?: Promise<void>;
  // The cache generation the journal extends; whether disk holds exactly the committed rows, cursor and pending in
  // memory (else the next persistence writes the cache whole); the pending observation the journal already holds.
  private generation = 0;
  private durable = false;
  private journaled?: SourceSnapshot;
  private journalBytes = 0;
  private cacheBytes = 0;
  // The journal ends in bytes an unfinished append left (no closing newline): nothing is appended after them, so the
  // first persistence writes the cache whole and removes the journal.
  private torn = false;
  private readonly journalFile: string;
  private ready!: () => void;
  private refuseReady!: (error: Error) => void;
  private wake?: () => void;
  constructor(private readonly options: SourceOptions) {
    if (!options.sourceContextId || !options.command.length) throw new Error('Native stream needs explicit OA source context and command');
    this.journalFile = sourceJournalFile(options.stateFile);
    if (existsSync(options.stateFile)) {
      if (lstatSync(options.stateFile).isSymbolicLink()) throw new Error('Source cache must not be a symlink');
      const saved = this.replay(JSON.parse(readFileSync(options.stateFile, 'utf8')));
      if (saved.version === 1) {
        if (!options.allowLegacyUpgrade) throw new Error('Legacy source cache needs explicit publication adoption');
        this.legacyCursor = saved.cursor;
      } else if (saved.version === 2 && saved.sourceContextId === options.sourceContextId) {
        if (options.forceSnapshot && !saved.pending) {
          if (!Array.isArray(saved.cards)) throw new Error('Retained source inventory malformed');
          for (const row of saved.cards) this.row(row, false);
          this.legacyCursor = saved.cursor ?? saved.legacyCursor;
        } else { this.rows = this.inventory(saved.cards); this.cursor = saved.cursor; this.legacyCursor = saved.legacyCursor; }
        if (saved.pending) {
          if (saved.pending.sourceContextId !== options.sourceContextId) throw new Error('Pending source context mismatch');
          this.pending = this.snapshot(saved.pending.cards, saved.pending.proposedCursor);
        }
      } else throw new Error('Unsupported/mismatched native source cache; retained state was not overwritten');
      // Only an unmodified version 2 reading is what disk holds; any other start writes the cache whole first.
      this.durable = saved.version === 2 && !options.forceSnapshot && !this.torn;
    }
    if (options.forceSnapshot && !this.pending) { this.legacyCursor ??= this.cursor; this.cursor = undefined; }
  }
  // The cache as last written whole, with its generation's journal applied: a pending entry is the next observation
  // (its changed cards over the committed ones), a commit makes the latest pending committed at the cursor it names.
  // Bytes after the last newline are an append the process did not finish, so its delivery never began; they are
  // left as they are until the cache is next written whole, which removes the journal.
  private replay(saved: any): any {
    this.cacheBytes = lstatSync(this.options.stateFile).size;
    if (saved?.version !== 2 || saved.sourceContextId !== this.options.sourceContextId) return saved;
    this.generation = Number.isSafeInteger(saved.generation) ? saved.generation : 0;
    if (!existsSync(this.journalFile)) return saved;
    if (lstatSync(this.journalFile).isSymbolicLink()) throw new Error('Source journal must not be a symlink');
    const text = readFileSync(this.journalFile, 'utf8');
    this.journalBytes = Buffer.byteLength(text);
    const end = text.lastIndexOf('\n') + 1;
    this.torn = end < text.length;
    const lines = text.slice(0, end).split('\n');
    // Raw rows by card association; the constructor validates what results exactly as it validates the cache.
    const byKey = (values: unknown): Map<string, any> => {
      if (!Array.isArray(values)) throw new Error('Native source inventory is malformed');
      const rows = new Map<string, any>();
      for (const value of values) { const key = rawKey(value); if (rows.has(key)) throw new Error('Duplicate native card association in complete inventory'); rows.set(key, value); }
      return rows;
    };
    let cards = byKey(saved.cards), cursor: string | undefined = saved.cursor;
    let pending: Map<string, any> | undefined = saved.pending ? byKey(saved.pending.cards) : undefined, proposed: string | undefined = saved.pending?.proposedCursor;
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i]) continue;
      let entry: JournalEntry;
      try { entry = JSON.parse(lines[i]); }
      catch { throw new Error('Source journal malformed; retained state was not overwritten'); }
      if (entry.generation !== this.generation) continue;
      if (entry.kind === 'pending') {
        if (!Array.isArray(entry.rows) || !Array.isArray(entry.removed) || typeof entry.cursor !== 'string') throw new Error('Source journal pending entry malformed');
        pending = new Map(cards); proposed = entry.cursor;
        for (const named of entry.removed) pending.delete(JSON.stringify(named));
        for (const row of entry.rows) pending.set(rawKey(row), row);
      } else if (entry.kind === 'commit') {
        if (!pending) throw new Error('Source journal commits an observation it does not hold');
        cards = pending; cursor = entry.cursor ?? undefined; pending = undefined; proposed = undefined;
      } else throw new Error('Source journal entry kind unsupported');
    }
    const { pending: _pending, cursor: _cursor, ...rest } = saved;
    return { ...rest, cards: [...cards.values()], ...(cursor ? { cursor } : {}),
      ...(pending ? { pending: { sourceContextId: this.options.sourceContextId, cards: [...pending.values()], proposedCursor: proposed } } : {}) };
  }
  // Native controls retain raw card identity; publication uses attributed snapshots.
  get cards(): ReadonlyMap<string, Readonly<Record<string, any>>> {
    const rows = this.pending?.cards ?? [...this.rows.values()];
    return new Map(rows.map(row => [this.key(row), Object.freeze({ ...row.card, board: row.board })]));
  }
  private key(row: SourceCard): string { return JSON.stringify([this.options.storeContext(row.board), row.card.id]); }
  private row(value: any, checkStore = true): SourceCard {
    if (!value || typeof value.publicationId !== 'string' || !value.publicationId || !Number.isSafeInteger(value.sequence) || value.sequence < 0 || typeof value.board !== 'string' || !value.board || !value.card || typeof value.card !== 'object' || Array.isArray(value.card) || typeof value.card.id !== 'string' || !value.card.id) throw new Error('Native publication attribution/card identity is missing or malformed');
    if (checkStore) this.options.storeContext(value.board);
    return freeze(structuredClone(value));
  }
  private inventory(values: unknown): Map<string, SourceCard> {
    if (!Array.isArray(values)) throw new Error('Native source inventory is malformed');
    const inventory = new Map<string, SourceCard>();
    for (const value of values) { const row = this.row(value), key = this.key(row); if (inventory.has(key)) throw new Error('Duplicate native card association in complete inventory'); inventory.set(key, row); }
    return inventory;
  }
  private snapshot(values: unknown, cursor: unknown): SourceSnapshot {
    if (typeof cursor !== 'string' || !cursor) throw new Error('Native source cursor is missing');
    return freeze({ sourceContextId: this.options.sourceContextId, cards: [...this.inventory(values).values()], proposedCursor: cursor });
  }
  private state(): CacheState { return { version: 2, sourceContextId: this.options.sourceContextId, cards: [...this.rows.values()], ...(this.cursor ? { cursor: this.cursor } : {}), ...(this.pending ? { pending: this.pending } : {}), ...(this.legacyCursor ? { legacyCursor: this.legacyCursor } : {}) }; }
  // The whole cache, as the next generation; the older generation's journal entries are then inert, and removed.
  private compact(state: CacheState = this.state()): void {
    const generation = this.generation + 1, bytes = JSON.stringify({ ...state, generation }) + '\n';
    // A whole write that failed at any step (even after its rename) leaves disk unknown: nothing is appended until a
    // later whole write succeeds, so no entry can name a generation the cache on disk does not hold.
    try {
      savePublicationBytes(this.options.stateFile, bytes);
      this.generation = generation; this.cacheBytes = Buffer.byteLength(bytes); this.journaled = state.pending;
      rmSync(this.journalFile, { force: true }); this.journalBytes = 0; this.torn = false;
    } catch (error) { this.durable = false; throw error; }
    this.durable = true;
  }
  private append(entry: JournalRecord): void {
    const line = JSON.stringify({ generation: this.generation, ...entry }) + '\n';
    const created = !existsSync(this.journalFile);
    const fd = openSync(this.journalFile, 'a', 0o600);
    try {
      const before = fstatSync(fd).size;
      // An append the disk refused is cut back off, so the journal never holds a torn line before a whole one.
      try { writeFileSync(fd, line); fsyncSync(fd); } catch (error) { try { ftruncateSync(fd, before); } catch {} throw error; }
    } finally { closeSync(fd); }
    if (created) { const parent = openSync(dirname(this.journalFile), 'r'); try { fsyncSync(parent); } finally { closeSync(parent); } }
    this.journalBytes += Buffer.byteLength(line);
  }
  // Before any effect: the observation's changed and removed cards against the committed ones (a card's native
  // publication id and sequence are its exact bytes), once per observation.
  private persistPending(observation: SourceSnapshot): void {
    if (this.journaled === observation) return;
    if (!this.durable) { this.compact(); return; }
    const next = new Map(observation.cards.map(row => [this.key(row), row]));
    const rows: SourceCard[] = [], removed: Array<[string, string]> = [];
    for (const [key, row] of next) { const prior = this.rows.get(key); if (!prior || prior.publicationId !== row.publicationId || prior.sequence !== row.sequence) rows.push(row); }
    for (const [key, row] of this.rows) if (!next.has(key)) removed.push([row.board, row.card.id]);
    this.append({ kind: 'pending', cursor: observation.proposedCursor, rows, removed });
    this.journaled = observation;
  }
  // After its receipts: the observation is committed at the cursor.
  private persistCommit(observation: SourceSnapshot, cursor: string | undefined): void {
    if (this.durable && this.journaled === observation) this.append({ kind: 'commit', cursor: cursor ?? null });
    else this.compact({ version: 2, sourceContextId: this.options.sourceContextId, cards: [...observation.cards], ...(cursor ? { cursor } : {}), ...(this.legacyCursor ? { legacyCursor: this.legacyCursor } : {}) });
  }
  private fold(): void {
    if (this.journalBytes <= Math.max(this.cacheBytes, JOURNAL_FLOOR)) return;
    try { this.compact(); } catch (error) { this.options.log(`source cache fold pending: ${(error as Error).message}; the journal still holds every change`); }
  }
  start(): Promise<void> {
    if (this.started) throw new Error('Native source already started'); this.started = true;
    const ready = new Promise<void>((resolve, reject) => { this.ready = resolve; this.refuseReady = reject; });
    this.followTask = this.follow();
    void this.followTask.catch(error => { this.options.log(`native source stopped: ${(error as Error).message}`); this.refuseReady(error); });
    return ready;
  }
  close(): void {
    this.closed = true; this.lines?.close();
    // Closing readline releases an idle async iterator. Drain discarded output
    // while TERM runs; destroying the pipe first races a child's final write.
    this.child?.child.stdout?.resume(); void this.child?.retire(); this.wake?.();
  }
  async stop(): Promise<void> {
    this.close(); await this.followTask;
    // A stopped source leaves its whole state in the cache file, which is what custody continuity digests.
    if (this.durable && this.journalBytes > 0) try { this.compact(); } catch (error) { this.options.log(`source cache fold at stop pending: ${(error as Error).message}; the journal still holds every change`); }
  }
  private delay(): Promise<void> {
    return new Promise(resolve => {
      const done = () => { clearTimeout(timer); this.wake = undefined; resolve(); };
      const timer = setTimeout(done, 5000); this.wake = done; if (this.closed) done();
    });
  }
  private async publish(): Promise<void> {
    if (!this.pending) throw new Error('Native delivery has no retained observation');
    const observation = this.pending;
    while (!this.closed) {
      try {
        this.persistPending(observation); // also retries uncertain pending-state persistence before any effect
        await this.options.changed(observation);
        if (this.closed) return;
        this.persistCommit(observation, observation.proposedCursor);
        this.rows = this.inventory(observation.cards); this.cursor = observation.proposedCursor; this.pending = undefined; this.journaled = undefined;
        this.fold();
        this.ready(); return;
      } catch (error) {
        // A delivery its source's close cut short is not pending on this process: the pending bytes are kept for the next.
        if (this.closed) { this.options.log('native event delivery not finished: its source closed; pending bytes kept'); return; }
        this.options.log(`native event delivery pending: ${(error as Error).message}`); await this.delay();
      }
    }
    // Intentional close cancels delivery, preserving pending bytes. Readiness is
    // still refused by follow(); stop() separately proves reader retirement.
  }
  private async stage(rows: Map<string, SourceCard>, cursor: unknown): Promise<void> {
    this.pending = this.snapshot([...rows.values()], cursor); await this.publish();
  }
  private async follow(): Promise<void> {
    while (!this.closed) {
      // Recovery does not depend on native log retention: pending observation is local.
      if (this.pending) await this.publish();
      if (this.closed) break;
      if (!this.durable) this.compact();
      const command = [...this.options.command, ...(this.cursor ? ['--after', this.cursor] : [])];
      let reader: ReturnType<typeof createInterface> | undefined;
      const stream = streamChild(command, this.options.env, this.options.log, () => reader?.close()); this.child = stream;
      const lines = createInterface({ input: stream.child.stdout! }); reader = lines; this.lines = lines;
      let staged: Map<string, SourceCard> | undefined, snapshotKeys: Set<string> | undefined;
      try {
        for await (const line of lines) {
          if (this.closed) break;
          lines.pause();
          const finish = startWork('load', 'publisher.source-frame');
          let frame: any;
          try { frame = JSON.parse(line); finish({ ok: true, units: { events: 1, bytes: Buffer.byteLength(line) } }); }
          catch (error) { finish({ ok: false, units: { bytes: Buffer.byteLength(line) } }); throw error; }
          if (frame.type === 'resync_required') { this.legacyCursor ??= this.cursor; this.cursor = undefined; this.compact(); this.options.log(`native source requests full snapshot: ${frame.reason}`); break; }
          if (frame.type === 'snapshot_begin') { if (staged) throw new Error('Nested native snapshot'); staged = new Map(); snapshotKeys = new Set(); }
          else if (frame.type === 'snapshot_item' || frame.type === 'event') {
            if (frame.type === 'snapshot_item' && !staged) throw new Error('Native snapshot item outside snapshot');
            if (frame.type === 'event' && staged) throw new Error('Native live event inside snapshot');
            const row = this.row({ publicationId: frame.id, sequence: frame.sequence, board: frame.data?.board, card: frame.data?.card }), key = this.key(row);
            if (snapshotKeys?.has(key)) throw new Error('Duplicate card in native snapshot'); snapshotKeys?.add(key);
            const next = staged ?? new Map(this.rows);
            if (row.card.removed) next.delete(key); else next.set(key, row);
            if (frame.type === 'event') await this.stage(next, frame.cursor);
          } else if (frame.type === 'snapshot_end') {
            if (!staged) throw new Error('Snapshot ended without its inventory');
            await this.stage(staged, frame.cursor); staged = undefined; snapshotKeys = undefined;
          } else if (frame.type === 'checkpoint') {
            if (staged) throw new Error('Checkpoint inside native snapshot');
            await this.stage(this.rows, frame.cursor);
          } else if (frame.type !== 'snapshot_begin') throw new Error(`Unsupported native stream frame ${frame.type}`);
          lines.resume();
        }
      } catch (error) { if (!this.closed) this.options.log(`native source interrupted: ${(error as Error).message}`); }
      finally { lines.close(); this.lines = undefined; stream.child.stdout?.resume(); await stream.retire(); this.child = undefined; }
      if (!this.closed) await this.delay();
    }
    this.refuseReady(new Error('Native source stopped before readiness'));
  }
}
