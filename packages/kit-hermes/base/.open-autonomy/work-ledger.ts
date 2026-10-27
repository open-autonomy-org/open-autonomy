// Kit work observations use the selected machine SDK; the universal OA wire has no host dependency.
import { harnessSdkModule } from './machine-supercode.ts';

type Result = { ok?: boolean; ms?: number; units?: Record<string, number> };
type Operation = { kind: string; operation: string };
type Recorder = {
  registerWorkService(value: { role: string; scope: { kind: string; id: string }; build?: string }): unknown;
  registerWorkOperations(operations: Operation[]): unknown;
  startWork(kind: string, operation: string): (result?: Result) => void;
  recordWork(kind: string, operation: string, result?: Result): unknown;
  observeChild(child: unknown, operation: string, options?: { mechanism: string }): unknown;
  closeWorkLedger(): Promise<unknown>;
};
let recorder: Recorder | undefined;
let loading: Promise<void> | undefined;
let warned = false;
const operations: Operation[] = [
  ...['publisher.pass', 'publisher.wakeup', 'publisher.native-refresh', 'publisher.board-refresh',
    'publisher.transcript-reconcile', 'publisher.transcript-queued', 'publisher.transcript-unchanged',
    'publisher.delivery', 'owner-control.pass', 'keeper.restart-check', 'keeper.service-check',
    'supervisor.restart', 'hookline.event', 'hookline.attach'].map(operation => ({ kind: 'pass', operation })),
  ...['publisher.window', 'publisher.source-frame'].map(operation => ({ kind: 'load', operation })),
  ...['publisher.upstream', 'valve.upstream', 'codex.upstream'].map(operation => ({ kind: 'call', operation })),
  ...['valve.request', 'codex.request', 'keeper.request'].map(operation => ({ kind: 'door', operation })),
  ...['bun.start', 'bun.sync', 'node.start', 'node.sync'].map(operation => ({ kind: 'child', operation })),
];
function unavailable(): void {
  if (!warned) { warned = true; console.error('work-ledger: unsupported-sdk-export; kit work coverage unavailable'); }
}
/** Existing native identities are hashed by the recorder; never pass keys, argv or request content here. */
export async function initializeWorkLedger(role: string, scope: { kind: string; id: string }, build?: string): Promise<void> {
  loading ??= (async () => {
    try {
      const loaded = await import(harnessSdkModule('./work-ledger')) as Recorder;
      if (typeof loaded.registerWorkService !== 'function' || typeof loaded.registerWorkOperations !== 'function'
        || typeof loaded.startWork !== 'function' || typeof loaded.recordWork !== 'function'
        || typeof loaded.observeChild !== 'function' || typeof loaded.closeWorkLedger !== 'function') { unavailable(); return; }
      loaded.registerWorkOperations(operations);
      recorder = loaded;
    } catch { unavailable(); }
  })();
  await loading;
  try { recorder?.registerWorkService({ role, scope, build }); } catch { unavailable(); }
}
export function startWork(kind: string, operation: string): (result?: Result) => void {
  try { return recorder?.startWork(kind, operation) ?? (() => {}); } catch { unavailable(); return () => {}; }
}
export function recordWork(kind: string, operation: string, result?: Result): void {
  try { recorder?.recordWork(kind, operation, result); } catch { unavailable(); }
}
export async function measureWork<T>(kind: string, operation: string, work: () => T | Promise<T>): Promise<T> {
  const finish = startWork(kind, operation);
  try { const result = await work(); finish({ ok: true }); return result; }
  catch (error) { finish({ ok: false }); throw error; }
}
/** Duration ends at response headers; the original streaming body and cancellation remain with their owner. */
export async function responseWork(kind: 'door' | 'call', operation: string, work: () => Response | Promise<Response>, bytes = 0): Promise<Response> {
  const finish = startWork(kind, operation);
  try { const response = await work(); finish({ ok: response.ok, ...(bytes ? { units: { bytes } } : {}) }); return response; }
  catch (error) { finish({ ok: false }); throw error; }
}
/** Bun's spawn APIs need explicit observation; no monkey patch or launch arguments enter the recorder. */
export function spawnWork<T>(work: () => T, mechanism: 'bun' | 'node' = 'bun'): T {
  const operation = mechanism === 'bun' ? 'bun.start' : 'node.start';
  try {
    const child = work();
    try { recorder?.observeChild(child, operation, { mechanism }); } catch { unavailable(); }
    return child;
  } catch (error) { recordWork('child', operation, { ok: false }); throw error; }
}
export function spawnSyncWork<T extends { exitCode?: number | null; status?: number | null; pid?: number; error?: unknown }>(work: () => T, mechanism: 'bun' | 'node' = 'bun'): T {
  const finish = startWork('child', mechanism === 'bun' ? 'bun.sync' : 'node.sync');
  try {
    const result = work();
    const started = typeof result.pid === 'number' ? result.pid > 0 : !result.error;
    finish({ ok: (result.exitCode ?? result.status) === 0 && !result.error, ...(started ? { units: { children_started: 1 } } : {}) });
    return result;
  } catch (error) { finish({ ok: false }); throw error; }
}
/** Logging failure is observational: callers retain their original shutdown result. */
export async function closeWorkLedger(): Promise<void> {
  try { await recorder?.closeWorkLedger(); } catch { console.error('work-ledger: flush-failed; final coverage incomplete'); }
}
/** Services with default signal termination retain that termination after the observational flush. */
export function flushWorkOnSignals(): void {
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.once(signal, async () => {
    await closeWorkLedger(); process.kill(process.pid, signal);
  });
}
