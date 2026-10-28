// Kit work observations use the selected machine SDK; the universal OA wire has no host dependency.
import { harnessSdkModule } from './machine-supercode.ts';
import { readFileSync } from 'node:fs';

type Result = { ok?: boolean; ms?: number; units?: Record<string, number> };
type Operation = { kind: string; operation: string };
type Recorder = {
  registerWorkService(value: { role: string; scope: { kind: string; id: string }; build?: string }): unknown;
  registerWorkOperations(operations: Operation[]): unknown;
  startWork(kind: string, operation: string): (result?: Result) => void;
  recordWork(kind: string, operation: string, result?: Result): unknown;
  observeChild(child: unknown, operation: string, options?: { mechanism: string }): unknown;
  stopWorkChild?<T>(child: unknown, stop: () => T, options?: { signal?: string | number; exitCode?: number }): T;
  closeWorkLedger(): Promise<unknown>;
};
// Rendered host modules and the packaged keeper may import separate copies in one process.
// They share one selected recorder, just as the SDK shares its process-local counters.
type Diagnostic = 'sdk-selection-unavailable' | 'sdk-import-failed' | 'unsupported-sdk-export' | 'recorder-failed';
type State = { recorder?: Recorder; loading?: Promise<void>; diagnostics?: Set<Diagnostic> };
const state = ((globalThis as unknown as Record<symbol, State>)[Symbol.for('open-autonomy.work-ledger.v1')] ??= {});
const operations: Operation[] = [
  ...['publisher.pass', 'publisher.wakeup', 'publisher.native-refresh', 'publisher.board-refresh',
    'publisher.transcript-reconcile', 'publisher.transcript-queued', 'publisher.transcript-unchanged',
    'publisher.delivery', 'owner-control.pass', 'keeper.restart-check', 'keeper.service-check',
    'supervisor.restart', 'hookline.event', 'hookline.attach'].map(operation => ({ kind: 'pass', operation })),
  ...['publisher.window', 'publisher.source-frame'].map(operation => ({ kind: 'load', operation })),
  ...['publisher.upstream', 'valve.upstream', 'codex.upstream', 'keeper.health', 'keeper.board', 'keeper.registry-upstream'].map(operation => ({ kind: 'call', operation })),
  ...['valve.request', 'codex.request', 'keeper.request', 'keeper.registry-request'].map(operation => ({ kind: 'door', operation })),
  ...['bun.start', 'bun.sync', 'node.start', 'node.sync'].map(operation => ({ kind: 'child', operation })),
];
function unavailable(code: Diagnostic): void {
  state.diagnostics ??= new Set();
  if (!state.diagnostics.has(code)) { state.diagnostics.add(code); console.error(`work-ledger: ${code}; kit work coverage unavailable`); }
}
function kitBuild(): string {
  for (const path of ['./kit.json', '../../package.json']) {
    try {
      const version = JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')).version;
      if (typeof version === 'string' && /^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/.test(version)) return `oa-kit-${version}`;
    } catch { /* A rendered install and a packaged/retained host have different metadata doors. */ }
  }
  return 'oa-kit-unknown';
}
/** Existing native identities are hashed by the recorder; never pass keys, argv or request content here. */
export async function initializeWorkLedger(role: string, scope: { kind: string; id: string }, build?: string): Promise<void> {
  state.loading ??= (async () => {
    let selected: string;
    try { selected = harnessSdkModule('./work-ledger'); }
    catch (error) { unavailable(error instanceof Error && /exports no \.\/work-ledger$/.test(error.message) ? 'unsupported-sdk-export' : 'sdk-selection-unavailable'); return; }
    let loaded: Recorder;
    try { loaded = await import(selected) as Recorder; } catch { unavailable('sdk-import-failed'); return; }
    if (typeof loaded.registerWorkService !== 'function' || typeof loaded.registerWorkOperations !== 'function'
      || typeof loaded.startWork !== 'function' || typeof loaded.recordWork !== 'function'
      || typeof loaded.observeChild !== 'function' || typeof loaded.closeWorkLedger !== 'function') { unavailable('unsupported-sdk-export'); return; }
    try {
      loaded.registerWorkOperations(operations);
      state.recorder = loaded;
    } catch { unavailable('recorder-failed'); }
  })();
  await state.loading;
  try { state.recorder?.registerWorkService({ role, scope, build: build ?? kitBuild() }); } catch { unavailable('recorder-failed'); }
}
export function startWork(kind: string, operation: string): (result?: Result) => void {
  try {
    const finish = state.recorder?.startWork(kind, operation);
    let finished = false;
    return result => { if (finished) return; finished = true; try { finish?.(result); } catch { unavailable('recorder-failed'); } };
  } catch { unavailable('recorder-failed'); return () => {}; }
}
export function recordWork(kind: string, operation: string, result?: Result): void {
  try { state.recorder?.recordWork(kind, operation, result); } catch { unavailable('recorder-failed'); }
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
  catch (error) { finish({ ok: false, ...(bytes ? { units: { bytes } } : {}) }); throw error; }
}
/** Bun's spawn APIs need explicit observation; no monkey patch or launch arguments enter the recorder. */
export function spawnWork<T>(work: () => T, mechanism: 'bun' | 'node' = 'bun'): T {
  const operation = mechanism === 'bun' ? 'bun.start' : 'node.start';
  try {
    const child = work();
    try { state.recorder?.observeChild(child, operation, { mechanism }); } catch { unavailable('recorder-failed'); }
    return child;
  } catch (error) { recordWork('child', operation, { ok: false, units: { attempts: 1 } }); throw error; }
}
/** The owner requests a stop; the recorder completes its lifetime only when the child actually exits. */
export function stopWorkChild<T>(child: unknown, stop: () => T, options?: { signal?: string | number; exitCode?: number }): T {
  if (typeof state.recorder?.stopWorkChild === 'function') return state.recorder.stopWorkChild(child, stop, options);
  // An older recorder can still observe ordinary work, but cannot distinguish an intentional stop.
  if (state.recorder) unavailable('unsupported-sdk-export');
  return stop();
}
export function spawnSyncWork<T extends { exitCode?: number | null; status?: number | null; pid?: number; error?: unknown }>(work: () => T, mechanism: 'bun' | 'node' = 'bun'): T {
  const finish = startWork('child', mechanism === 'bun' ? 'bun.sync' : 'node.sync');
  try {
    const result = work();
    const started = typeof result.pid === 'number' ? result.pid > 0 : !result.error;
    finish({ ok: (result.exitCode ?? result.status) === 0 && !result.error, units: { attempts: 1, children_started: started ? 1 : 0 } });
    return result;
  } catch (error) { finish({ ok: false, units: { attempts: 1 } }); throw error; }
}
/** Logging failure is observational: callers retain their original shutdown result. */
export async function closeWorkLedger(): Promise<void> {
  try { await state.recorder?.closeWorkLedger(); } catch { console.error('work-ledger: flush-failed; final coverage incomplete'); }
}
/** Services with default signal termination retain that termination after the observational flush. */
export function flushWorkOnSignals(): void {
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.once(signal, async () => {
    await closeWorkLedger(); process.kill(process.pid, signal);
  });
}
