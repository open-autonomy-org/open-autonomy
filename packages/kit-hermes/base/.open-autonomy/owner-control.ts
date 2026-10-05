// Durable owner pause ownership and its independent execution-control loop.
// Narrative enrollment and delivery never supply authority for this controller.
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import type { OpenAutonomy } from './sdk/client.ts';
import type { SupercodeHarnessClient } from '@volter/supercode-harness-sdk';
import { savePublicationFile, type PublicationOwnerLease } from './publication.ts';
import { NativeRuntime } from './native-runtime.ts';

type Scope = { account: string; apiBase: string; nativeRuntime: { kind: string; root: string } };
type ControlData = Scope & { version: 1; paused_jobs: string[]; paused_tasks: string[]; seed: { kind: string; reporterDigest?: string; basis: string } };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function read(file: string): any {
  if (lstatSync(file).isSymbolicLink()) throw new Error(`Owner control file must not be a symlink: ${file}`);
  const value = JSON.parse(readFileSync(file, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Owner control state must be an object');
  return value;
}
function ids(value: unknown): string[] {
  if (!Array.isArray(value) || value.some(id => typeof id !== 'string' || !id) || new Set(value).size !== value.length)
    throw new Error('Owner control pause ownership must contain unique nonempty native IDs');
  return [...value];
}
export class OwnerControlState implements PublicationOwnerLease {
  readonly stateFile: string;
  readonly nonce = randomUUID();
  readonly file: string;
  private readonly lock: string;
  private data: ControlData;
  constructor(stateFile: string, scope: Scope) {
    this.stateFile = resolve(stateFile); this.file = `${this.stateFile}.control.json`; this.lock = `${this.stateFile}.lock`;
    try { mkdirSync(this.lock, { mode: 0o700 }); }
    catch { throw new Error(`Owner control/publication ownership is held or unknown at ${this.lock}`); }
    try {
      savePublicationFile(resolve(this.lock, 'owner.json'), { pid: process.pid, nonce: this.nonce, startedAt: new Date().toISOString() });
      if (existsSync(this.file)) {
        const value = read(this.file);
        if (value.version !== 1 || value.account !== scope.account || value.apiBase !== scope.apiBase || !same(value.nativeRuntime, scope.nativeRuntime) || !value.seed || !['empty', 'reporter-v2', 'reporter-v3'].includes(value.seed.kind) || typeof value.seed.basis !== 'string' || !value.seed.basis || (value.seed.kind === 'empty' ? value.seed.reporterDigest !== undefined : typeof value.seed.reporterDigest !== 'string' || !/^[0-9a-f]{64}$/.test(value.seed.reporterDigest)))
          throw new Error('Owner control state version, scope or seed record conflicts; reconciliation required');
        this.data = { ...value, paused_jobs: ids(value.paused_jobs), paused_tasks: ids(value.paused_tasks) };
      } else {
        const prior = existsSync(this.stateFile) ? read(this.stateFile) : undefined;
        if (prior && ![2, 3].includes(prior.version)) throw new Error('Unsupported retained reporter state for owner control seed');
        if (prior?.version === 3) {
          const enrollment = prior.publication?.enrollment;
          if (!enrollment || enrollment.account !== scope.account || enrollment.apiBase !== scope.apiBase || !same(enrollment.selectedRuntime, scope.nativeRuntime))
            throw new Error('Retained reporter enrollment conflicts with owner control scope');
        }
        this.data = { version: 1, ...scope, paused_jobs: prior ? ids(prior.paused_jobs === undefined ? [] : prior.paused_jobs) : [], paused_tasks: prior ? ids(prior.paused_tasks === undefined ? [] : prior.paused_tasks) : [],
          seed: { kind: prior ? `reporter-v${prior.version}` : 'empty', ...(prior ? { reporterDigest: createHash('sha256').update(readFileSync(this.stateFile)).digest('hex') } : {}),
            basis: prior?.version === 2 ? 'Selected owner configuration and retained local state/root custody assertion; historical account/runtime provenance is not available' : prior ? 'Matching retained enrollment and owner local custody' : 'No retained reporter file' } };
        this.save(this.data.paused_jobs, this.data.paused_tasks);
      }
    } catch (error) {
      try { this.assert(this.stateFile); }
      catch (ownership) { throw new Error(`${(error as Error).message}; local control ownership retained as uncertain: ${(ownership as Error).message}`); }
      rmSync(this.lock, { recursive: true }); throw error;
    }
  }
  assert(stateFile: string): void {
    if (resolve(stateFile) !== this.stateFile) throw new Error('Owner control lease state path differs');
    const owner = read(resolve(this.lock, 'owner.json'));
    if (owner.pid !== process.pid || owner.nonce !== this.nonce) throw new Error('Owner control lease process or nonce changed');
  }
  get jobs(): string[] { return [...this.data.paused_jobs]; }
  get tasks(): string[] { return [...this.data.paused_tasks]; }
  save(jobs: string[], tasks: string[]): void {
    this.assert(this.stateFile); this.data = { ...this.data, paused_jobs: ids(jobs), paused_tasks: ids(tasks) }; savePublicationFile(this.file, this.data);
  }
  close(): void { this.assert(this.stateFile); rmSync(this.lock, { recursive: true }); }
}

type BoardRow = { id: string; status: string };
export class OwnerController {
  private readonly pausedJobs: Set<string>;
  private readonly pausedTasks: Set<string>;
  private timer?: ReturnType<typeof setInterval>;
  private work?: Promise<void>;
  private again = false;
  private stopping = false;
  private reported = '';
  private readonly nativeAbort = new AbortController();
  constructor(private readonly options: { state: OwnerControlState; runtime: NativeRuntime; sc: SupercodeHarnessClient; oa: OpenAutonomy; account: string; tenant?: string;
    board: (...args: string[]) => string; abort: () => void; log: (message: string) => void }) {
    this.pausedJobs = new Set(options.state.jobs); this.pausedTasks = new Set(options.state.tasks);
  }
  start(): void { this.timer = setInterval(() => void this.request(), 10_000); void this.request(); }
  private request(): Promise<void> {
    if (this.stopping || this.options.tenant) return Promise.resolve();
    this.again = true;
    if (this.work) return this.work;
    this.work = (async () => {
      while (this.again && !this.stopping) {
        this.again = false;
        try { await this.pass(); } catch (error) { this.options.log(`owner control pending: ${(error as Error).message}`); }
      }
    })().finally(() => { this.work = undefined; });
    return this.work;
  }
  private allowed(): void { if (this.stopping) throw new Error('Owner control stopping; retained intent waits'); this.options.state.assert(this.options.state.stateFile); }
  private save(): void { this.options.state.save([...this.pausedJobs], [...this.pausedTasks]); }
  private async jobs() {
    const value = await this.options.runtime.jobs({ signal: this.nativeAbort.signal });
    if (new Set(value.jobs.map(j => j.id)).size !== value.jobs.length) throw new Error('Native job identity is ambiguous across profiles');
    return value;
  }
  private board(): BoardRow[] {
    const value = JSON.parse(this.options.board('list', '--json'));
    if (!Array.isArray(value) || value.some(t => !t || typeof t.id !== 'string' || !t.id || typeof t.status !== 'string' || !t.status) || new Set(value.map(t => t.id)).size !== value.length)
      throw new Error('Hermes board control inventory unreadable or ambiguous');
    return value;
  }
  private async pass(): Promise<void> {
    const { runtime, sc, oa } = this.options;
    const command = await oa.state(this.options.account);
    if (!command) throw new Error('Owner SDK state unreadable');
    const desired = command.desired?.state ?? 'running';
    if (!['paused', 'running'].includes(desired)) throw new Error('Owner desired state unsupported');
    const [, , inventory] = await Promise.all([runtime.load({ signal: this.nativeAbort.signal }), runtime.runs({ signal: this.nativeAbort.signal }), this.jobs()]);
    let jobs = inventory;
    if (new Set(jobs.jobs.map(j => j.id)).size !== jobs.jobs.length) throw new Error('Native job identity is ambiguous across profiles');
    const boardRead = (): BoardRow[] => {
      if (runtime.native) return [];
      try { return this.board(); } catch (error) { this.options.log(`Hermes board authority pending: ${(error as Error).message}`); return []; }
    };
    let board = boardRead();
    this.allowed();
    if (desired === 'paused') {
      for (const job of jobs.jobs) if (job.enabled) {
        this.allowed(); this.pausedJobs.add(job.id); this.save();
        await sc.pauseJob({ ...runtime.scheduler, id: job.id, profile: job.profile ?? undefined }, { signal: this.nativeAbort.signal });
        const observed = await this.jobs();
        if (!observed.jobs.some(j => j.id === job.id && j.profile === job.profile && !j.enabled)) throw new Error(`Native job ${job.id} pause not observed`);
      }
    } else {
      for (const id of [...this.pausedJobs]) {
        const job = jobs.jobs.find(j => j.id === id);
        if (job && !job.enabled) {
          this.allowed(); await sc.resumeJob({ ...runtime.scheduler, id, profile: job.profile ?? undefined }, { signal: this.nativeAbort.signal });
          if (!(await this.jobs()).jobs.some(j => j.id === id && j.profile === job.profile && j.enabled)) throw new Error(`Native job ${id} resume not observed`);
        }
        this.allowed(); this.pausedJobs.delete(id); this.save();
      }
    }
    this.allowed();
    const [finalModel, finalHistory, finalJobs] = await Promise.all([runtime.load({ signal: this.nativeAbort.signal }), runtime.runs({ signal: this.nativeAbort.signal }), this.jobs()]);
    jobs = finalJobs; board = boardRead();
    const activeBinding = Object.values(finalModel.profiles).some(p => Object.values(p.bindings).some(b => b.worker.session_id && !b.ended_at));
    const running = activeBinding || finalHistory.runs.some(r => !r.finished_at && !['completed', 'failed', 'ok', 'error', 'skipped'].includes(r.status)) || board.some(t => ['running', 'review'].includes(t.status));
    // Hermes exposes no safe dispatcher quiescence/readback contract. Its task
    // ownership stays retained; schedule/promote can end work or refuse resume.
    const boardPending = runtime.native ? Boolean(finalModel.orchestration.workflow) : true;
    const enabled = jobs.jobs.some(j => j.enabled);
    const state = desired === 'paused' && !enabled && !running && !boardPending ? 'paused' : 'running';
    const note = state === 'paused' ? 'Owned scheduled work paused; no live funded run observed' : desired === 'paused' ? boardPending ? `pausing: ${runtime.native ? 'native' : 'Hermes'} dispatcher has no safe authorized pause/resume door; board intent remains pending` : running ? 'pausing: a funded run is live' : 'pausing: scheduled work remains enabled' : this.pausedTasks.size ? 'running: retained board pause ownership remains pending; no safe board resume door' : undefined;
    this.allowed();
    const digest = `${state}|${note ?? ''}`;
    if (digest !== this.reported && (await oa.reportState(state, note)).ok) { this.reported = digest; this.options.log(`operating state ${state}${note ? ` (${note})` : ''}`); }
  }
  async stop(): Promise<void> { this.stopping = true; this.again = false; clearInterval(this.timer); this.nativeAbort.abort(); this.options.abort(); await this.work; }
}
