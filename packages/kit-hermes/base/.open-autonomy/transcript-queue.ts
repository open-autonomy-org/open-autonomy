// Native-source affinity belongs to a reader generation, until its public close confirms retirement.
// A complete reconciliation owns one lane; board publication and the other readers remain independent.
import { recordWork } from './work-ledger.ts';

type Lane<Reader> = { reader: Reader; generation: number; keys: Set<string>; active?: string; retirement?: Promise<void> };
export class TranscriptQueue<Reader> {
  private readonly pending = new Set<string>();
  private readonly desired = new Map<string, string>();
  private readonly assigned = new Map<string, { source: string; lane: Lane<Reader> }>();
  private readonly running = new Map<string, Promise<void>>();
  private readonly lanes = new Set<Lane<Reader>>();
  private generation = 0;
  private stopped = false;
  private closing?: Promise<void>;

  constructor(private readonly limit: number, private readonly create: () => Reader,
    private readonly publish: (key: string, reader: Reader) => Promise<void>, private readonly failed: (key: string, error: unknown) => void,
    private readonly closeReader: (reader: Reader) => Promise<void>) {}

  enqueue(key: string, source = key): void {
    if (this.stopped) return;
    if (!this.pending.has(key)) recordWork('pass', 'publisher.transcript-queued');
    this.desired.set(key, source); this.pending.add(key);
    const held = this.assigned.get(key);
    if (held && held.source !== source) this.retireLane(held.lane);
    this.drain();
  }
  retire(key: string): void {
    this.desired.delete(key); this.pending.delete(key);
    const held = this.assigned.get(key);
    if (held) this.retireLane(held.lane);
  }
  lost(reader: Reader, error: unknown): void {
    const lane = [...this.lanes].find(lane => lane.reader === reader);
    if (!lane || lane.retirement) return;
    for (const key of lane.keys) this.failed(key, error);
    this.retireLane(lane);
  }
  private retireLane(lane: Lane<Reader>): Promise<void> {
    if (lane.retirement) return lane.retirement;
    // Mark retiring synchronously: no new reconciliation can enter this generation while its current one joins.
    const active = lane.active === undefined ? undefined : this.running.get(lane.active);
    lane.retirement = Promise.resolve().then(async () => {
      if (active) await Promise.allSettled([active]);
      await this.closeReader(lane.reader);
      // Close confirms retirement of every resource in this generation, including sources idle between passes.
      for (const key of lane.keys) if (this.assigned.get(key)?.lane === lane) this.assigned.delete(key);
      this.lanes.delete(lane); this.drain();
    });
    void lane.retirement.catch(error => { for (const key of lane.keys) this.failed(key, error); });
    return lane.retirement;
  }
  private laneFor(key: string, source: string): Lane<Reader> | undefined {
    const held = this.assigned.get(key);
    if (held) return held.source === source && !held.lane.retirement ? held.lane : undefined;
    let lane: Lane<Reader> | undefined;
    if (this.lanes.size < this.limit) {
      lane = { reader: this.create(), generation: ++this.generation, keys: new Set() }; this.lanes.add(lane);
    } else {
      lane = [...this.lanes].filter(lane => !lane.retirement).sort((a, b) => Number(!!a.active) - Number(!!b.active)
        || a.keys.size - b.keys.size || a.generation - b.generation)[0];
    }
    if (lane) { lane.keys.add(key); this.assigned.set(key, { source, lane }); }
    return lane;
  }
  private drain(): void {
    if (this.stopped) return;
    for (const key of this.pending) {
      if (this.running.has(key)) continue;
      const source = this.desired.get(key);
      if (source === undefined) continue;
      const lane = this.laneFor(key, source);
      // A busy/retiring assigned lane never prevents a later key on another lane from starting.
      if (!lane || lane.active !== undefined) continue;
      lane.active = key; this.pending.delete(key);
      const work = Promise.resolve().then(() => this.publish(key, lane.reader)).catch(error => this.failed(key, error)).finally(() => {
        this.running.delete(key); lane.active = undefined; this.drain();
      });
      this.running.set(key, work);
    }
  }
  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.stopped = true; this.pending.clear(); this.desired.clear();
    this.closing = (async () => {
      // Publisher aborts its native/network requests first. Every retirement joins its whole reconciliation.
      const results = await Promise.allSettled([...this.lanes].map(lane => this.retireLane(lane)));
      const failures = results.filter(result => result.status === 'rejected').map(result => result.reason);
      if (failures.length) throw new AggregateError(failures, 'Transcript reader retirement is uncertain; affinity retained');
    })();
    return this.closing;
  }
}
