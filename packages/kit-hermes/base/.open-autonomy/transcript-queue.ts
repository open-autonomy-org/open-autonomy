// Latest work per native session, with one independent native reader per active lane. A large source holds only
// its own lane; its network delivery and reconstruction never own the board publication writer or another reader.
import { recordWork } from './work-ledger.ts';
export class TranscriptQueue<Reader> {
  private readonly pending = new Set<string>();
  private readonly running = new Map<string, Promise<void>>();
  private readonly lanes: Array<{ reader: Reader; key?: string }> = [];
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
      let lane = this.lanes.find(lane => lane.key === undefined);
      if (!lane && this.lanes.length < this.limit) { lane = { reader: this.create() }; this.lanes.push(lane); }
      if (!lane) break;
      const active = lane; active.key = key; this.pending.delete(key);
      // Start after registering the run: a synchronous refusal cannot leave a key marked running forever.
      const work = Promise.resolve().then(() => this.publish(key, active.reader)).catch(error => this.failed(key, error)).finally(() => {
        this.running.delete(key); active.key = undefined; this.drain();
      });
      this.running.set(key, work);
    }
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
