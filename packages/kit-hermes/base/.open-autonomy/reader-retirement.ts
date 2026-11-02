// The private keeper/publisher receipt contract. Process exit alone supplies no native-reader retirement evidence.
import type { SupercodeHarnessClient } from '@volter/supercode-harness-sdk';
export const SCAN_RESOURCE_CONTRACT = Object.freeze({ id: 'session-scan-resources', version: 1,
  storage: 'mail-records-v1', writer: 'durable-fenced-v1', allocation: 'sqlite-main-no-temp-v1' });
export const sameScanResourceContract = (value: unknown): boolean => !!value && typeof value === 'object'
  && Object.keys(value).length === Object.keys(SCAN_RESOURCE_CONTRACT).length
  && Object.entries(SCAN_RESOURCE_CONTRACT).every(([key, expected]) => (value as Record<string, unknown>)[key] === expected);
export const readerGeneration = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export type ReaderProcess = { generation: string; pid: number; entry: string; retired: boolean };
export type ReaderInventory = { version: 1; contract: typeof SCAN_RESOURCE_CONTRACT; install: string;
  source: string | null; release: string | null; owner: { pid: number; entry: string };
  stack: { generation: string; pid: number; entry: string }; readers: ReaderProcess[]; complete: true };
export type ReaderRetirement = Omit<ReaderInventory, 'complete'> & { transaction: string | null; retired: true };
export type ReaderRetirementUnavailable = { version: 1; transaction: string | null; install: string; source: string | null;
  release: string | null; stack: { generation: string; pid: number; entry: string }; retired: false; reason: string };

/** Transport close may force the child to exit. Only the serve's joined public reply attests resource retirement. */
export async function retireHarnessReader(reader: SupercodeHarnessClient): Promise<void> {
  const failures: unknown[] = [];
  try {
    const proof = await reader.request('harness.v1.sessions.scan_resources.retire_readers', {}, { timeoutMs: 0 }) as Record<string, unknown>;
    if (proof?.version !== 1 || !sameScanResourceContract(proof.contract) || proof.retired !== true
      || !Number.isSafeInteger(proof.pid) || (proof.pid as number) <= 0)
      throw new Error('Native reader returned no complete joined scan-resource retirement acknowledgement');
  } catch (error) { failures.push(error); }
  try { await reader.close(); } catch (error) { failures.push(error); }
  if (failures.length) throw new AggregateError(failures, `Native reader retirement is uncertain: ${failures.map(error => (error as Error).message).join('; ')}`);
}

/** Called only after ordinary shutdown has joined Source, deliveries and every SDK reader. */
export async function acknowledgeReaderRetirement(): Promise<void> {
  const generation = process.env.OPEN_AUTONOMY_READER_GENERATION, stack = process.env.OPEN_AUTONOMY_STACK_GENERATION;
  if (generation === undefined && stack === undefined) return; // standalone publisher, without an owner channel
  if (!readerGeneration(generation) || !readerGeneration(stack) || !process.send)
    throw new Error('Reader retirement has no exact private keeper generation/channel');
  await new Promise<void>((resolve, reject) => {
    const bound = setTimeout(() => reject(new Error('Private reader retirement acknowledgement was not delivered')), 2000);
    process.send!({ type: 'reporter-retired', version: 1, contract: SCAN_RESOURCE_CONTRACT,
      generation, stack, pid: process.pid, retired: true }, error => { clearTimeout(bound); error ? reject(error) : resolve(); });
  });
}
