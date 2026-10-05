// Durable app-owned observations of the public native workflow stream. The cursor
// stays opaque; OA enrollment supplies adapter context, never native home/log identity.
// Pending complete inventory precedes effects; committed cursors follow durable receipts.
// Transcript checkpoints remain a separate obligation.
import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { savePublicationFile, type SourceCard, type SourceSnapshot } from './publication.ts';
export type { SourceCard, SourceSnapshot } from './publication.ts';
interface SourceOptions {
  command: string[]; stateFile: string; env: Record<string, string>;
  sourceContextId: string; storeContext: (board: string) => string;
  allowLegacyUpgrade?: boolean; forceSnapshot?: boolean;
  changed: (snapshot: SourceSnapshot) => Promise<void>; log: (message: string) => void;
}
interface CacheState { version: 2; sourceContextId: string; cursor?: string; cards: SourceCard[]; pending?: SourceSnapshot; legacyCursor?: string }
interface StreamChild { child: ChildProcess; retire: (destroyPipe?: boolean) => Promise<void> }
// The public native CLI can launch a Node stream reader. Retire that private
// command group, rather than treating the wrapper's exit as reader completion.
function streamChild(command: string[], env: Record<string, string>, log: (message: string) => void): StreamChild {
  const grouped = process.platform !== 'win32';
  const child = spawn(command[0], command.slice(1), { env, detached: grouped, stdio: ['ignore', 'pipe', 'inherit'] });
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
    settled = true; if (timer) clearInterval(timer); child.stdout?.destroy();
    if (error) rejectRetired(error); else resolveRetired();
  };
  const check = (): void => {
    if (settled) return;
    try {
      if (closed && !alive()) { finish(); return; }
      if (Date.now() >= deadline) {
        if (!escalated) {
          escalated = true; signal('SIGKILL'); child.stdout?.destroy(); deadline = Date.now() + 1000;
        } else finish(new Error('Native stream retirement could not be confirmed; stop/reconnect refused'));
      }
    } catch (error) { finish(new Error(`Native stream retirement failed: ${(error as Error).message}`)); }
  };
  const retire = (destroyPipe = false): Promise<void> => {
    if (destroyPipe) child.stdout?.destroy();
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
  private closed = false;
  private started = false;
  private followTask?: Promise<void>;
  private ready!: () => void;
  private refuseReady!: (error: Error) => void;
  private wake?: () => void;
  constructor(private readonly options: SourceOptions) {
    if (!options.sourceContextId || !options.command.length) throw new Error('Native stream needs explicit OA source context and command');
    if (existsSync(options.stateFile)) {
      if (lstatSync(options.stateFile).isSymbolicLink()) throw new Error('Source cache must not be a symlink');
      const saved = JSON.parse(readFileSync(options.stateFile, 'utf8'));
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
    }
    if (options.forceSnapshot && !this.pending) { this.legacyCursor ??= this.cursor; this.cursor = undefined; }
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
  private save(): void { savePublicationFile(this.options.stateFile, this.state()); }
  start(): Promise<void> {
    if (this.started) throw new Error('Native source already started'); this.started = true;
    const ready = new Promise<void>((resolve, reject) => { this.ready = resolve; this.refuseReady = reject; });
    this.followTask = this.follow();
    void this.followTask.catch(error => { this.options.log(`native source stopped: ${(error as Error).message}`); this.refuseReady(error); });
    return ready;
  }
  close(): void { this.closed = true; void this.child?.retire(true); this.wake?.(); }
  async stop(): Promise<void> { this.close(); await this.followTask; }
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
        this.save(); // also retries uncertain pending-state persistence before any effect
        await this.options.changed(observation);
        const state: CacheState = { version: 2, sourceContextId: this.options.sourceContextId, cards: [...observation.cards], cursor: observation.proposedCursor, ...(this.legacyCursor ? { legacyCursor: this.legacyCursor } : {}) };
        savePublicationFile(this.options.stateFile, state);
        this.rows = this.inventory(observation.cards); this.cursor = observation.proposedCursor; this.pending = undefined;
        this.ready(); return;
      } catch (error) { this.options.log(`native event delivery pending: ${(error as Error).message}`); await this.delay(); }
    }
    throw new Error('Publisher stopped before acknowledgement; pending observation retained');
  }
  private async stage(rows: Map<string, SourceCard>, cursor: unknown): Promise<void> {
    this.pending = this.snapshot([...rows.values()], cursor); await this.publish();
  }
  private async follow(): Promise<void> {
    while (!this.closed) {
      // Recovery does not depend on native log retention: pending observation is local.
      if (this.pending) await this.publish();
      this.save();
      const command = [...this.options.command, ...(this.cursor ? ['--after', this.cursor] : [])];
      const stream = streamChild(command, this.options.env, this.options.log); this.child = stream;
      const lines = createInterface({ input: stream.child.stdout! });
      let staged: Map<string, SourceCard> | undefined, snapshotKeys: Set<string> | undefined;
      try {
        for await (const line of lines) {
          if (this.closed) break;
          lines.pause(); const frame = JSON.parse(line);
          if (frame.type === 'resync_required') { this.legacyCursor ??= this.cursor; this.cursor = undefined; this.save(); this.options.log(`native source requests full snapshot: ${frame.reason}`); break; }
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
      finally { lines.close(); await stream.retire(true); this.child = undefined; }
      if (!this.closed) await this.delay();
    }
    this.refuseReady(new Error('Native source stopped before readiness'));
  }
}
