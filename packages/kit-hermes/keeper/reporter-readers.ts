// Bounded exact publisher/host custody. Uncertainty is never evicted; joined private receipts fold into a durable
// count/hash carried by the stack's ready/retirement record, with the most recent 64 exact receipts retained.
import { emptyRetirementSummary, extendRetirementSummary, sameScanResourceContract, validNativeReaderHost,
  validRetirementSummary, type NativeReaderHost, type ReaderProcess } from '../base/.open-autonomy/reader-retirement.ts';

const MAX_UNRESOLVED = 4096, RECENT = 64;
type Held = ReaderProcess & { revision: number; acknowledged: boolean; exited: boolean; failed: boolean };
const sameHost = (a: NativeReaderHost, b: NativeReaderHost): boolean => a.generation === b.generation
  && a.pid === b.pid && a.entry === b.entry && a.implementation_entry === b.implementation_entry;
const hosts = (value: any, retired: boolean, limit: number): value is NativeReaderHost[] => Array.isArray(value)
  && value.length <= limit && value.every(host => validNativeReaderHost(host, retired))
  && new Set(value.map(host => host.generation)).size === value.length;
export class ReporterReaders {
  private readonly held = new Map<string, Held>();
  private retired = emptyRetirementSummary();
  private recent: ReaderProcess[] = [];
  private failed = false;
  constructor(private readonly stack: string) {}
  atCapacity(): boolean { return this.held.size >= MAX_UNRESOLVED; }
  register(generation: string, pid: number, entry: string): void {
    if (this.atCapacity() || this.held.has(generation)) throw new Error('Publisher reader inventory is full/already held; no new publisher admitted');
    this.held.set(generation, { generation, pid, entry, retired: false, hosts: [], hosts_complete: false,
      retired_hosts: emptyRetirementSummary(), revision: 0, acknowledged: false, exited: false, failed: false });
  }
  observe(generation: string, message: unknown): boolean {
    const proof = message as any, held = this.held.get(generation);
    if (!held || !['reporter-readers', 'reporter-retired'].includes(proof?.type)) return false;
    if (held.acknowledged) return false;
    const retiring = proof.type === 'reporter-retired';
    const removed = held.hosts.filter(prior => !Array.isArray(proof.hosts) || !proof.hosts.some((host: NativeReaderHost) => sameHost(prior, host)));
    const recent = retiring ? proof.hosts : proof.retired_recent;
    if (proof.version !== 1 || !sameScanResourceContract(proof.contract) || proof.generation !== generation
      || proof.stack !== this.stack || proof.pid !== held.pid || !Number.isSafeInteger(proof.revision) || proof.revision <= held.revision
      || typeof proof.hosts_complete !== 'boolean' || !hosts(proof.hosts, retiring, retiring ? RECENT : 5)
      || !hosts(recent, true, RECENT) || !validRetirementSummary(proof.retired_hosts)
      || proof.retired_hosts.count < recent.length
      || proof.retired_hosts.count < held.retired_hosts.count
      || proof.retired_hosts.count === held.retired_hosts.count && proof.retired_hosts.digest !== held.retired_hosts.digest
      || removed.some(prior => !recent.some((host: NativeReaderHost) => sameHost(prior, host)))
      || retiring && (proof.retired !== true || proof.hosts_complete !== true)) {
      this.failed = true; held.failed = true; held.hosts_complete = false; return true;
    }
    held.revision = proof.revision; held.hosts = proof.hosts; held.hosts_complete = proof.hosts_complete;
    held.retired_hosts = proof.retired_hosts;
    if (retiring) held.acknowledged = true;
    this.settle(held); return true;
  }
  exited(generation: string): void {
    const held = this.held.get(generation); if (!held) return;
    held.exited = true; this.settle(held);
  }
  private settle(held: Held): void {
    if (held.failed || !held.acknowledged || !held.exited) return;
    const receipt: ReaderProcess = { generation: held.generation, pid: held.pid, entry: held.entry, retired: true,
      hosts: held.hosts, hosts_complete: true, retired_hosts: held.retired_hosts };
    this.retired = extendRetirementSummary(this.retired, receipt);
    this.recent.push(receipt); if (this.recent.length > RECENT) this.recent.shift();
    this.held.delete(held.generation);
  }
  inventory() { return { readers: [...this.held.values()].map(({ revision: _revision, acknowledged: _ack, exited: _exit, failed: _failed, ...reader }) => reader),
    retired_readers: this.retired, complete: !this.failed && [...this.held.values()]
      .every(reader => reader.hosts_complete && !reader.exited && !reader.acknowledged && !reader.failed) }; }
  retirement() {
    if (this.failed || this.held.size) throw new Error(`Publisher reader retirement is incomplete; ${this.held.size} unresolved generation(s) remain`);
    return { readers: this.recent, retired_readers: this.retired };
  }
}
