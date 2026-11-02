// Latest work per native session, with one independent native reader per active lane. A large source holds only
// its own lane; its network delivery and reconstruction never own the board publication writer or another reader.
import { recordWork } from './work-ledger.ts';
import { randomUUID } from 'node:crypto';
export class TranscriptQueue<Reader> {
  private readonly pending = new Set<string>();
  private readonly running = new Map<string, Promise<void>>();
  private readonly lanes: Array<{ reader: Reader; id: string; key?: string; retirement?: Promise<void>; heldKey?: string }> = [];
  private stopped = false;

  constructor(private readonly limit: number, private readonly create: () => Reader,
    private readonly publish: (key: string, reader: Reader) => Promise<void>, private readonly failed: (key: string, error: unknown) => void,
    private readonly closeReader: (reader: Reader) => Promise<void>) {}

  enqueue(key: string): void {
    if (this.stopped) return;
    if (!this.pending.has(key)) recordWork('pass', 'publisher.transcript-queued');
    this.pending.add(key); this.drain();
  }
  private drain(): void {
    if (this.stopped) return;
    for (const key of this.pending) {
      if (this.running.has(key)) continue;
      // An unknown retirement holds only its canonical family. It cannot escape onto another free lane.
      if (this.lanes.some(lane => lane.heldKey === key)) continue;
      let lane = this.lanes.find(lane => lane.key === undefined && !lane.heldKey && !lane.retirement);
      if (!lane && this.lanes.length < this.limit) { lane = { reader: this.create(),id:randomUUID() }; this.lanes.push(lane); }
      if (!lane) break;
      const active = lane; active.key = key; this.pending.delete(key);
      // Start after registering the run: a synchronous refusal cannot leave a key marked running forever.
      const work = Promise.resolve().then(() => this.publish(key, active.reader)).catch(error => this.failed(key, error)).finally(() => {
        this.running.delete(key); active.key = undefined; this.drain();
      });
      this.running.set(key, work);
    }
  }
  readerIdentity(key: string,reader: Reader): string {
    const lane = this.lanes.find(lane => lane.key === key && lane.reader === reader);
    if (!lane) throw new Error('Reader identity needs its exact running canonical lane');
    return lane.id;
  }
  // Replacing a canonical family's instance retires the exact old SDK reader before constructing its successor.
  // A failed close leaves that reader and its key held; shutdown retries/join it and retains ownership on failure.
  async replaceReader(key: string, reader: Reader): Promise<Reader> {
    if (this.stopped) throw new Error('Transcript queue stopping; reader replacement held');
    const lane = this.lanes.find(lane => lane.key === key && lane.reader === reader);
    if (!lane || lane.heldKey || lane.retirement) throw new Error('Reader replacement needs its exact running canonical lane');
    lane.heldKey = key;
    const retirement = this.closeReader(reader); lane.retirement = retirement;
    try {
      await retirement;
      if (this.stopped) throw new Error('Transcript queue stopped after old-reader retirement');
      lane.reader = this.create(); lane.id = randomUUID(); lane.heldKey = undefined;
      return lane.reader;
    } finally { lane.retirement = undefined; }
  }
  async close(): Promise<void> {
    this.stopped = true; this.pending.clear();
    // The publisher aborts its native/network requests before joining here. No checkpoint writer survives close.
    await Promise.allSettled(this.running.values());
    const closed = await Promise.allSettled(this.lanes.map(lane => this.closeReader(lane.reader)));
    const failure = closed.find(result => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
  }
}
