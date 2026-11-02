// The private keeper/publisher receipt contract. Process exit alone supplies no native-reader retirement evidence.
import type { SupercodeHarnessClient } from '@volter/supercode-harness-sdk';
import { createHash, randomUUID } from 'node:crypto';
import { isAbsolute } from 'node:path';
export const SCAN_RESOURCE_CONTRACT = Object.freeze({ id: 'session-scan-resources', version: 1,
  storage: 'mail-records-v1', writer: 'durable-fenced-v1', allocation: 'sqlite-main-no-temp-v1' });
export const sameScanResourceContract = (value: unknown): boolean => !!value && typeof value === 'object'
  && Object.keys(value).length === Object.keys(SCAN_RESOURCE_CONTRACT).length
  && Object.entries(SCAN_RESOURCE_CONTRACT).every(([key, expected]) => (value as Record<string, unknown>)[key] === expected);
export const readerGeneration = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export type NativeReaderHost = { generation: string; pid: number; entry: string; implementation_entry: string; retired: boolean };
export type RetirementSummary = { count: number; digest: string };
export type ReaderProcess = { generation: string; pid: number; entry: string; retired: boolean;
  hosts: NativeReaderHost[]; hosts_complete: boolean; retired_hosts: RetirementSummary };
export type ReaderInventory = { version: 1; contract: typeof SCAN_RESOURCE_CONTRACT; install: string;
  source: string | null; release: string | null; owner: { pid: number; entry: string };
  stack: { generation: string; pid: number; entry: string }; readers: ReaderProcess[]; retired_readers: RetirementSummary; complete: boolean };
export type ReaderRetirement = Omit<ReaderInventory, 'complete'> & { transaction: string | null; retired: true };
export type ReaderRetirementUnavailable = { version: 1; transaction: string | null; install: string; source: string | null;
  release: string | null; stack: { generation: string; pid: number; entry: string }; retired: false; reason: string };

export const emptyRetirementSummary = (): RetirementSummary => ({ count: 0, digest: createHash('sha256').digest('hex') });
export const validRetirementSummary = (value: any): value is RetirementSummary => Number.isSafeInteger(value?.count)
  && value.count >= 0 && typeof value.digest === 'string' && /^[0-9a-f]{64}$/.test(value.digest);
export function extendRetirementSummary(before: RetirementSummary, receipt: unknown): RetirementSummary {
  if (!validRetirementSummary(before) || !Number.isSafeInteger(before.count + 1)) throw new Error('Retirement evidence count is full/unreadable');
  return { count: before.count + 1, digest: createHash('sha256').update(before.digest).update('\n').update(JSON.stringify(receipt)).digest('hex') };
}
export const validNativeReaderHost = (host: any, retired: boolean): host is NativeReaderHost => readerGeneration(host?.generation)
  && Number.isSafeInteger(host.pid) && host.pid > 0 && typeof host.entry === 'string' && isAbsolute(host.entry)
  && typeof host.implementation_entry === 'string' && isAbsolute(host.implementation_entry) && host.retired === retired;
const sameHost = (a: NativeReaderHost, b: NativeReaderHost): boolean => a.pid === b.pid && a.entry === b.entry && a.implementation_entry === b.implementation_entry;

/** Transport close may force the child to exit. Only the serve's joined public reply attests resource retirement. */
export async function retireHarnessReader(reader: SupercodeHarnessClient, expected?: NativeReaderHost): Promise<Omit<NativeReaderHost, 'generation'>> {
  const failures: unknown[] = [];
  let owner: Omit<NativeReaderHost, 'generation'> | undefined;
  try {
    const proof = await reader.request('harness.v1.sessions.scan_resources.retire_readers', {}, { timeoutMs: 0 }) as Record<string, unknown>;
    const host = { ...proof, generation: expected?.generation ?? randomUUID() };
    if (proof?.version !== 1 || !sameScanResourceContract(proof.contract) || !validNativeReaderHost(host, true)
      || expected && !sameHost(expected, host))
      throw new Error('Native reader returned no complete joined scan-resource retirement acknowledgement');
    owner = { pid: host.pid, entry: host.entry, implementation_entry: host.implementation_entry, retired: true };
  } catch (error) { failures.push(error); }
  try { await reader.close(); } catch (error) { failures.push(error); }
  if (failures.length) throw new AggregateError(failures, `Native reader retirement is uncertain: ${failures.map(error => (error as Error).message).join('; ')}`);
  return owner!;
}

async function sendOwner(message: Record<string, unknown>): Promise<void> {
  const generation = process.env.OPEN_AUTONOMY_READER_GENERATION, stack = process.env.OPEN_AUTONOMY_STACK_GENERATION;
  if (generation === undefined && stack === undefined) return; // standalone publisher, without an owner channel
  if (!readerGeneration(generation) || !readerGeneration(stack) || !process.send)
    throw new Error('Reader retirement has no exact private keeper generation/channel');
  await new Promise<void>((resolve, reject) => {
    const bound = setTimeout(() => reject(new Error('Private reader retirement acknowledgement was not delivered')), 2000);
    process.send!({ ...message, version: 1, contract: SCAN_RESOURCE_CONTRACT,
      generation, stack, pid: process.pid }, error => { clearTimeout(bound); error ? reject(error) : resolve(); });
  });
}

// All native allocation hosts owned by one publisher, including its shared control/index reader. Complete snapshots
// travel only on the exact private launch channel; a missing/older capability leaves the inventory incomplete.
export class PublisherReaders {
  private readonly held = new Map<SupercodeHarnessClient, { generation: string; owner?: NativeReaderHost; ready: Promise<void> }>();
  private retired = emptyRetirementSummary();
  private recent: NativeReaderHost[] = [];
  private revision = 0;
  private delivery = Promise.resolve();
  private snapshot() { return { hosts: [...this.held.values()].flatMap(held => held.owner ? [held.owner] : []),
    hosts_complete: [...this.held.values()].every(held => !!held.owner), retired_hosts: { ...this.retired }, retired_recent: this.recent.map(host => ({ ...host })) }; }
  private publish(): Promise<void> {
    const message = { type: 'reporter-readers', revision: ++this.revision, ...this.snapshot() };
    const work = this.delivery.then(() => sendOwner(message));
    this.delivery = work.catch(() => {}); return work;
  }
  open(reader: SupercodeHarnessClient): Promise<void> {
    const prior = this.held.get(reader); if (prior) return prior.ready;
    const held = { generation: randomUUID(), owner: undefined as NativeReaderHost | undefined, ready: Promise.resolve() };
    this.held.set(reader, held);
    held.ready = Promise.resolve().then(async () => {
      await this.publish(); // pending host admission is visible before starting the native subprocess
      await reader.start();
      const capabilities = await reader.request<{ scan_resources?: { contract?: unknown; owner?: Record<string, unknown> } }>('harness.v1.capabilities', {}, { timeoutMs: 0 });
      const host = { ...capabilities.scan_resources?.owner, generation: held.generation, retired: false };
      if (sameScanResourceContract(capabilities.scan_resources?.contract) && validNativeReaderHost(host, false)) held.owner = host;
      await this.publish();
    });
    void held.ready.catch(() => {});
    return held.ready;
  }
  async retire(reader: SupercodeHarnessClient): Promise<void> {
    const held = this.held.get(reader); if (!held) throw new Error('Native reader has no tracked publisher generation');
    await held.ready.catch(() => {}); // join the exact capability/open request before asking its serve to retire
    const owner = await retireHarnessReader(reader, held.owner);
    const receipt = { ...owner, generation: held.generation };
    this.retired = extendRetirementSummary(this.retired, receipt);
    this.recent.push(receipt); if (this.recent.length > 64) this.recent.shift();
    this.held.delete(reader);
    await this.publish();
  }
  /** Called only after ordinary shutdown has joined Source, deliveries and every registered SDK reader. */
  async acknowledge(): Promise<void> {
    if (this.held.size) throw new Error('Publisher retains native reader generations without joined retirement');
    await this.delivery;
    await sendOwner({ type: 'reporter-retired', revision: ++this.revision, hosts_complete: true,
      hosts: this.recent, retired_hosts: this.retired, retired: true });
  }
}
