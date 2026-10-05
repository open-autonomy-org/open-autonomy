// Durable owner pause ownership and its independent execution-control loop.
// Narrative enrollment and delivery never supply authority for this controller.
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { OpenAutonomy } from './sdk/client.ts';
import type { SupercodeHarnessClient } from '@volter/supercode-harness-sdk';
import { acquirePublicationLease, savePublicationFile, type PublicationOwnerLease, type LocalPublicationLease } from './publication.ts';
import { NativeRuntime } from './native-runtime.ts';

type Scope = { account: string; apiBase: string; nativeRuntime: { kind: string; root: string } };
type PendingEffect = { id: string; profile: string | null; action: 'pause' | 'resume'; operation: string; origin: 'rpc' | 'retained-ownership' };
type ControlData = Scope & { version: 2; pending_effects: PendingEffect[]; paused_jobs: string[]; paused_tasks: string[]; seed: { kind: string; reporterDigest?: string; basis: string } };
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
function effects(value: unknown, jobs: string[]): PendingEffect[] {
  if (!Array.isArray(value)) throw new Error('Owner control pending effects must be an explicit array');
  const jobsSeen = new Set<string>(), operations = new Set<string>();
  for (const effect of value) {
    if (!effect || typeof effect !== 'object' || Array.isArray(effect) || Object.keys(effect).sort().join(',') !== 'action,id,operation,origin,profile' || typeof effect.id !== 'string' || !effect.id || !jobs.includes(effect.id) || (effect.profile !== null && (typeof effect.profile !== 'string' || !effect.profile)) || !['pause', 'resume'].includes(effect.action) || !['rpc', 'retained-ownership'].includes(effect.origin) || typeof effect.operation !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(effect.operation) || jobsSeen.has(effect.id) || operations.has(effect.operation) || (effect.origin === 'retained-ownership' && (effect.action !== 'pause' || effect.profile !== null)))
      throw new Error('Owner control pending effect shape or ownership conflicts');
    jobsSeen.add(effect.id); operations.add(effect.operation);
  }
  return value.map(effect => ({ ...effect }));
}
const historicalEffects = (jobs: string[]): PendingEffect[] => jobs.map(id => ({ id, profile: null, action: 'pause', operation: randomUUID(), origin: 'retained-ownership' }));
export class OwnerControlState implements PublicationOwnerLease {
  readonly stateFile: string;
  readonly nonce = randomUUID();
  readonly file: string;
  private readonly lease: LocalPublicationLease;
  private data: ControlData;
  constructor(stateFile: string, scope: Scope) {
    this.stateFile = resolve(stateFile); this.file = `${this.stateFile}.control.json`;
    this.lease = acquirePublicationLease(this.stateFile, this.nonce);
    try {
      if (existsSync(this.file)) {
        const value = read(this.file);
        if (![1, 2].includes(value.version) || value.account !== scope.account || value.apiBase !== scope.apiBase || !same(value.nativeRuntime, scope.nativeRuntime) || !value.seed || !['empty', 'reporter-v2', 'reporter-v3'].includes(value.seed.kind) || typeof value.seed.basis !== 'string' || !value.seed.basis || (value.seed.kind === 'empty' ? value.seed.reporterDigest !== undefined : typeof value.seed.reporterDigest !== 'string' || !/^[0-9a-f]{64}$/.test(value.seed.reporterDigest)))
          throw new Error('Owner control state version, scope or seed record conflicts; reconciliation required');
        const jobs = ids(value.paused_jobs), tasks = ids(value.paused_tasks);
        if (value.version === 1 && Object.hasOwn(value, 'pending_effects')) throw new Error('Version-1 owner state cannot declare unknown effect phases');
        this.data = { ...value, version: 2, paused_jobs: jobs, paused_tasks: tasks, pending_effects: value.version === 1 ? historicalEffects(jobs) : effects(value.pending_effects, jobs) };
        if (value.version === 1) this.save(jobs, tasks);
      } else {
        const prior = existsSync(this.stateFile) ? read(this.stateFile) : undefined;
        if (prior && ![2, 3].includes(prior.version)) throw new Error('Unsupported retained reporter state for owner control seed');
        if (prior?.version === 3) {
          const enrollment = prior.publication?.enrollment;
          if (!enrollment || enrollment.version !== 1 || enrollment.account !== scope.account || enrollment.apiBase !== scope.apiBase || !same(enrollment.selectedRuntime, scope.nativeRuntime))
            throw new Error('Retained reporter enrollment conflicts with owner control scope');
        }
        this.data = { version: 2, pending_effects: [], ...scope, paused_jobs: prior ? ids(prior.paused_jobs === undefined ? [] : prior.paused_jobs) : [], paused_tasks: prior ? ids(prior.paused_tasks === undefined ? [] : prior.paused_tasks) : [],
          seed: { kind: prior ? `reporter-v${prior.version}` : 'empty', ...(prior ? { reporterDigest: createHash('sha256').update(readFileSync(this.stateFile)).digest('hex') } : {}),
            basis: prior?.version === 2 ? 'Selected owner configuration and retained local state/root custody assertion; historical account/runtime provenance is not available' : prior ? 'Matching retained enrollment and owner local custody' : 'No retained reporter file' } };
        this.data.pending_effects = historicalEffects(this.data.paused_jobs);
        this.save(this.data.paused_jobs, this.data.paused_tasks);
      }
    } catch (error) {
      try { this.assert(this.stateFile); }
      catch (ownership) { throw new Error(`${(error as Error).message}; local control ownership retained as uncertain: ${(ownership as Error).message}`); }
      this.lease.close(); throw error;
    }
  }
  assert(stateFile: string): void {
    if (resolve(stateFile) !== this.stateFile) throw new Error('Owner control lease state path differs');
    this.lease.assert(stateFile);
  }
  get jobs(): string[] { return [...this.data.paused_jobs]; }
  get tasks(): string[] { return [...this.data.paused_tasks]; }
  get pending(): PendingEffect[] { return this.data.pending_effects.map(effect => ({ ...effect })); }
  save(jobs: string[], tasks: string[], pending = this.data.pending_effects): void {
    this.assert(this.stateFile);
    const owned = ids(jobs), candidate = { ...this.data, paused_jobs: owned, paused_tasks: ids(tasks), pending_effects: effects(pending, owned) };
    savePublicationFile(this.file, candidate); this.data = candidate;
  }
  begin(id: string, profile: string | null, action: 'pause' | 'resume'): PendingEffect {
    if (this.data.pending_effects.some(effect => effect.id === id)) throw new Error('Native job effect remains unresolved');
    const effect: PendingEffect = { id, profile, action, operation: randomUUID(), origin: 'rpc' };
    this.save([...new Set([...this.data.paused_jobs, id])], this.data.paused_tasks, [...this.data.pending_effects, effect]);
    return effect;
  }
  settle(effect: PendingEffect): void {
    if (!this.data.pending_effects.some(current => same(current, effect))) throw new Error('Native job effect phase no longer matches current call');
    this.save(effect.action === 'resume' ? this.data.paused_jobs.filter(id => id !== effect.id) : this.data.paused_jobs, this.data.paused_tasks, this.data.pending_effects.filter(current => current.operation !== effect.operation));
  }
  close(): void { this.lease.close(); }
}

export class OwnerController {
  private readonly pausedTasks: Set<string>;
  private readonly blockedJobs = new Set<string>();
  private timer?: ReturnType<typeof setInterval>;
  private work?: Promise<void>;
  private again = false;
  private stopping = false;
  private reported = '';
  private readonly nativeAbort = new AbortController();
  constructor(private readonly options: { state: OwnerControlState; runtime: NativeRuntime; sc: SupercodeHarnessClient; oa: OpenAutonomy; account: string; tenant?: string;
    abort: () => void; log: (message: string) => void }) {
    this.pausedTasks = new Set(options.state.tasks);
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
  private async jobs() {
    const value = await this.options.runtime.jobs({ signal: this.nativeAbort.signal });
    if (new Set(value.jobs.map(j => j.id)).size !== value.jobs.length) throw new Error('Native job identity is ambiguous across profiles');
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
    this.allowed();
    for (const candidate of jobs.jobs) {
      if (this.blockedJobs.has(candidate.id) || this.options.state.pending.some(effect => effect.id === candidate.id)) continue;
      const job = (await this.jobs()).jobs.find(current => current.id === candidate.id && current.profile === candidate.profile);
      if (!job) continue;
      const action = desired === 'paused' && job.enabled ? 'pause' : desired === 'running' && this.options.state.jobs.includes(job.id) && !job.enabled ? 'resume' : undefined;
      if (!action) continue;
      try {
        this.allowed();
        this.blockedJobs.add(job.id);
        const effect = this.options.state.begin(job.id, job.profile ?? null, action);
        this.allowed();
        const request = { ...runtime.scheduler, id: job.id, profile: job.profile ?? undefined };
        const result = action === 'pause' ? await sc.pauseJob(request, { signal: this.nativeAbort.signal }) : await sc.resumeJob(request, { signal: this.nativeAbort.signal });
        if (result.id !== job.id || result.harness !== runtime.scheduler.harness || result.verb !== action || typeof result.ran !== 'string' || !result.ran.trim()) throw new Error('Native job effect completion envelope is not authoritative');
        const observed = await this.jobs();
        if (!observed.jobs.some(current => current.id === job.id && current.profile === job.profile && current.enabled === (action === 'resume'))) throw new Error(`Native job ${job.id} ${action} not observed`);
        this.allowed(); this.options.state.settle(effect); this.blockedJobs.delete(job.id);
      } catch (error) { this.options.log(`owner control job ${job.id} remains pending: ${(error as Error).message}`); }
    }
    // An already-enabled or missing row cannot settle an older accepted effect.
    // Settled ownership may be relinquished without mutating unrelated pauses.
    if (desired === 'running') for (const id of this.options.state.jobs) {
      if (this.blockedJobs.has(id) || this.options.state.pending.some(effect => effect.id === id)) continue;
      if (!jobs.jobs.some(job => job.id === id && !job.enabled)) {
        this.allowed(); this.options.state.save(this.options.state.jobs.filter(job => job !== id), this.options.state.tasks);
      }
    }
    this.allowed();
    const [finalModel, finalHistory, finalJobs] = await Promise.all([runtime.load({ signal: this.nativeAbort.signal }), runtime.runs({ signal: this.nativeAbort.signal }), this.jobs()]);
    jobs = finalJobs;
    const activeBinding = Object.values(finalModel.profiles).some(p => Object.values(p.bindings).some(b => b.worker.session_id && !b.ended_at));
    const running = activeBinding || finalHistory.runs.some(r => !r.finished_at && !['completed', 'failed', 'ok', 'error', 'skipped'].includes(r.status));
    // Hermes exposes no safe dispatcher quiescence/readback contract. Its task
    // ownership stays retained; schedule/promote can end work or refuse resume.
    const boardPending = runtime.native ? Boolean(finalModel.orchestration.workflow) : true;
    const enabled = jobs.jobs.some(j => j.enabled);
    const unresolved = new Set([...this.blockedJobs, ...this.options.state.pending.map(effect => effect.id)]).size;
    const state = desired === 'paused' && !unresolved && !enabled && !running && !boardPending ? 'paused' : 'running';
    const note = unresolved ? `${desired === 'paused' ? 'pausing' : 'running'}: native job effect or local ownership persistence remains unresolved (${unresolved}); affected jobs await evidence` : state === 'paused' ? 'Owned scheduled work paused; no unresolved native execution observed' : desired === 'paused' ? boardPending ? `pausing: ${runtime.native ? 'native' : 'Hermes'} dispatcher has no safe authorized pause/resume door; board intent remains pending` : running ? 'pausing: native execution readback remains unresolved' : 'pausing: scheduled work remains enabled' : this.pausedTasks.size ? 'running: retained board pause ownership remains pending; no safe board resume door' : undefined;
    this.allowed();
    const digest = `${state}|${note ?? ''}`;
    if (digest !== this.reported && (await oa.reportState(state, note)).ok) { this.reported = digest; this.options.log(`operating state ${state}${note ? ` (${note})` : ''}`); }
  }
  async stop(): Promise<void> { this.stopping = true; this.again = false; clearInterval(this.timer); this.nativeAbort.abort(); this.options.abort(); await this.work; }
}
