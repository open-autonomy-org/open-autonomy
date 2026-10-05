// Durable owner pause ownership and its independent execution-control loop.
// Native completion receipts and explicit local-owner reconciliation stay private.
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { OpenAutonomy } from './sdk/client.ts';
import { SupercodeRpcError, type SupercodeHarnessClient, type JobMutationOutcome } from '@volter/supercode-harness-sdk';
import { acquirePublicationLease, savePublicationFile, type PublicationOwnerLease, type LocalPublicationLease } from './publication.ts';
import { NativeRuntime } from './native-runtime.ts';
export type ControlScope = { account: string; apiBase: string; nativeRuntime: { kind: string; root: string } };
export type ControlDisposition = 'retain-owned' | 'relinquish' | 'relinquish-absent';
export type ControlSelection = { operation: string; effectDigest: string; disposition: ControlDisposition };
export type ControlRecoveryEvidence = { path: string; digest: string };
export type ControlRecoveryAction = { id: string; door: string; action: string; evidence: string[] };
export type ControlReconciliationAudit = {
 version: 1; id: string; authority: 'local-owner-assertion'; operator: string; statement: string;
 manifestDigest: string; configDigest: string; controlDigest: string; snapshotDigest: string;
 backup: { path: string; digest: string };
 actions: ControlRecoveryAction[]; evidence: ControlRecoveryEvidence[];
 coverage: { publishers: string[]; sdkServices: string[]; nativeCliChildren: string[]; executionDomain: string[] };
 selected: ControlSelection[];
 leaseHandoff?: { priorOwnerDigest: string; priorNonce: string; auditFile: string };
};
export type PendingEffect = {
 id: string; profile: string | null; action: 'pause' | 'resume'; operation: string; origin: 'rpc' | 'retained-ownership';
 stage: 'prepared' | 'invoked' | 'acknowledged' | 'historical'; ownedBefore: boolean | null;
 receipt?: { harness: string; verb: 'pause' | 'resume'; id: string; ran: string; digest: string };
};
export type ControlDataV3 = ControlScope & {
 version: 3; pending_effects: PendingEffect[]; paused_jobs: string[]; paused_tasks: string[];
 seed: { kind: string; reporterDigest?: string; basis: string }; reconciliations: ControlReconciliationAudit[];
};

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const digest = /^[0-9a-f]{64}$/;
const nonempty = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim());
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const copy = <T>(value: T): T => structuredClone(value);
function read(file: string): any {
  if (lstatSync(file).isSymbolicLink()) throw new Error(`Owner control file must not be a symlink: ${file}`);
  const value = JSON.parse(readFileSync(file, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Owner control state must be an object');
  return value;
}
function ids(value: unknown): string[] {
  if (!Array.isArray(value) || value.some(id => !nonempty(id)) || new Set(value).size !== value.length)
    throw new Error('Owner control ownership must contain unique nonempty native IDs');
  return [...value];
}
export function effectDigest(effect: PendingEffect): string { return hash(JSON.stringify(effect)); }
function legacyEffects(value: any, jobs: string[]): PendingEffect[] {
  if (!Array.isArray(value)) throw new Error('Legacy pending effects must be an explicit array');
  return value.map(effect => {
    if (!effect || Object.keys(effect).sort().join(',') !== 'action,id,operation,origin,profile') throw new Error('Legacy pending effect shape conflicts');
    return { ...effect, stage: effect.origin === 'retained-ownership' ? 'historical' : 'invoked', ownedBefore: null };
  });
}
function effects(value: unknown, jobs: string[], scope: ControlScope): PendingEffect[] {
  if (!Array.isArray(value)) throw new Error('Owner control pending effects must be an explicit array');
  const jobsSeen = new Set<string>(), operations = new Set<string>();
  for (const effect of value) {
    const expected = 'action,id,operation,origin,ownedBefore,profile,stage'+(effect?.stage === 'acknowledged' ? ',receipt' : '');
    const keys = expected.split(',').sort().join(',');
    if (!effect || typeof effect !== 'object' || Array.isArray(effect) || Object.keys(effect).sort().join(',') !== keys || !nonempty(effect.id) || !jobs.includes(effect.id) || (effect.profile !== null && !nonempty(effect.profile)) || !['pause', 'resume'].includes(effect.action) || !['rpc', 'retained-ownership'].includes(effect.origin) || !uuid.test(effect.operation) || jobsSeen.has(effect.id) || operations.has(effect.operation) || !['prepared','invoked','acknowledged','historical'].includes(effect.stage) || (effect.ownedBefore !== null && typeof effect.ownedBefore !== 'boolean') || (effect.origin === 'retained-ownership' ? effect.stage !== 'historical' || effect.action !== 'pause' || effect.profile !== null || effect.ownedBefore !== null : effect.stage === 'historical') || (['prepared','acknowledged'].includes(effect.stage) && typeof effect.ownedBefore !== 'boolean'))
      throw new Error('Owner control pending effect shape or ownership conflicts');
    if (effect.action === 'resume' && effect.ownedBefore === false) throw new Error('Native resume cannot claim an unowned job');
    if (effect.stage === 'acknowledged') {
      const receipt = effect.receipt;
      if (!receipt || Object.keys(receipt).sort().join(',') !== 'digest,harness,id,ran,verb' || receipt.harness !== scope.nativeRuntime.kind || receipt.verb !== effect.action || receipt.id !== effect.id || !nonempty(receipt.ran) || receipt.digest !== hash(JSON.stringify({harness:receipt.harness,verb:receipt.verb,id:receipt.id,ran:receipt.ran}))) throw new Error('Native completion receipt conflicts with its effect');
    }
    jobsSeen.add(effect.id); operations.add(effect.operation);
  }
  return copy(value);
}
function audit(value: ControlReconciliationAudit): ControlReconciliationAudit {
  if (!value || value.version !== 1 || !uuid.test(value.id) || value.authority !== 'local-owner-assertion' || !nonempty(value.operator) || !nonempty(value.statement) || ![value.manifestDigest,value.configDigest,value.controlDigest,value.snapshotDigest,value.backup?.digest].every(d => typeof d === 'string' && digest.test(d)) || value.backup.digest !== value.controlDigest || !nonempty(value.backup.path) || !Array.isArray(value.actions) || !value.actions.length || !Array.isArray(value.evidence) || !value.evidence.length || !Array.isArray(value.selected) || !value.selected.length)
    throw new Error('Owner reconciliation audit authority or digests conflict');
  const paths = value.evidence.map(e => e?.path), actionIds = value.actions.map(a => a?.id);
  if (new Set(paths).size !== paths.length || paths.some(p => !nonempty(p)) || value.evidence.some(e => !digest.test(e.digest)) || new Set(actionIds).size !== actionIds.length || actionIds.some(id => !nonempty(id)) || value.actions.some(a => !nonempty(a.door) || !nonempty(a.action) || !Array.isArray(a.evidence) || !a.evidence.length || a.evidence.some(p => !paths.includes(p)))) throw new Error('Owner reconciliation lifecycle evidence is incomplete');
  if (!value.coverage || Object.keys(value.coverage).sort().join(',') !== 'executionDomain,nativeCliChildren,publishers,sdkServices' || Object.values(value.coverage).some(v => !Array.isArray(v) || !v.length || new Set(v).size !== v.length || v.some(id => !actionIds.includes(id)))) throw new Error('Owner reconciliation does not cover every prior writer and domain');
  if (new Set(value.selected.map(s => s.operation)).size !== value.selected.length || value.selected.some(s => !uuid.test(s.operation) || !digest.test(s.effectDigest) || !['retain-owned','relinquish','relinquish-absent'].includes(s.disposition))) throw new Error('Owner reconciliation selected phases conflict');
  if (value.leaseHandoff && (!digest.test(value.leaseHandoff.priorOwnerDigest) || !uuid.test(value.leaseHandoff.priorNonce) || !nonempty(value.leaseHandoff.auditFile))) throw new Error('Owner reconciliation lease handoff audit conflicts');
  return copy(value);
}
export function validateControlSnapshot(value: any, scope: ControlScope): ControlDataV3 {
  if (value?.version !== 3 || value.account !== scope.account || value.apiBase !== scope.apiBase || !same(value.nativeRuntime,scope.nativeRuntime) || !value.seed || !['empty','reporter-v2','reporter-v3'].includes(value.seed.kind) || !nonempty(value.seed.basis) || (value.seed.kind === 'empty' ? value.seed.reporterDigest !== undefined : typeof value.seed.reporterDigest !== 'string' || !digest.test(value.seed.reporterDigest))) throw new Error('Owner control version, scope or seed conflicts');
  const jobs = ids(value.paused_jobs), tasks = ids(value.paused_tasks);
  if (!Array.isArray(value.reconciliations) || new Set(value.reconciliations.map((r:any)=>r?.id)).size !== value.reconciliations.length) throw new Error('Owner reconciliation history conflicts');
  return { ...copy(value), paused_jobs:jobs,paused_tasks:tasks,pending_effects:effects(value.pending_effects,jobs,scope),reconciliations:value.reconciliations.map(audit) };
}
const historicalEffects = (jobs: string[]): PendingEffect[] => jobs.map(id => ({ id, profile:null, action:'pause',operation:randomUUID(),origin:'retained-ownership',stage:'historical',ownedBefore:null }));
// These UUIDs name local recovery obligations, never native operations or acknowledgements.
export function validateRecoveryControlSnapshot(value:any,scope:ControlScope,retainedDigest?:string):ControlDataV3 {
  if(value?.version===3)return validateControlSnapshot(value,scope);
  if(![1,2].includes(value?.version))throw new Error('Unsupported retained owner control version');
  if(Object.hasOwn(value,'reconciliations'))throw new Error('Legacy control version cannot declare reconciliation history');
  const jobs=ids(value.paused_jobs);
  if(value.version===1&&Object.hasOwn(value,'pending_effects'))throw new Error('Version1 cannot declare effect phases');
  if(value.version===1&&!digest.test(retainedDigest??''))throw new Error('Version1 recovery requires exact retained byte digest');
  const pending=value.version===2?legacyEffects(value.pending_effects,jobs):jobs.map(id=>{
    const hex=hash(JSON.stringify(['open-autonomy/local-recovery/v1',retainedDigest,scope,id])).slice(0,32);
    const operation=`${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-${((parseInt(hex[16],16)&3)|8).toString(16)}${hex.slice(17,20)}-${hex.slice(20)}`;
    return {id,profile:null,action:'pause',operation,origin:'retained-ownership',stage:'historical',ownedBefore:null};
  });
  return validateControlSnapshot({...value,version:3,pending_effects:pending,reconciliations:[]},scope);
}
export class OwnerControlState implements PublicationOwnerLease {
  readonly stateFile: string;
  readonly nonce: string;
  readonly file: string;
  private readonly lease: LocalPublicationLease;
  private readonly ownsLease: boolean;
  private data: ControlDataV3;
  constructor(stateFile: string, private readonly scope: ControlScope, options: { owner?: LocalPublicationLease } = {}) {
    this.stateFile=resolve(stateFile);this.file=`${this.stateFile}.control.json`;this.ownsLease=!options.owner;
    this.lease=options.owner ?? acquirePublicationLease(this.stateFile);this.nonce=this.lease.nonce;
    try {
      this.assert(this.stateFile);
      if (existsSync(this.file)) {
        const value=read(this.file);
        this.data=validateRecoveryControlSnapshot(value,scope,hash(readFileSync(this.file)));
        if(value.version!==3&&this.ownsLease)this.save(this.data.paused_jobs,this.data.paused_tasks);
      } else {
        if(!this.ownsLease)throw new Error('Offline reconciliation requires retained canonical control state');
        const prior=existsSync(this.stateFile)?read(this.stateFile):undefined;
        if(prior && ![2,3].includes(prior.version))throw new Error('Unsupported reporter state for owner seed');
        if(prior?.version===3){const e=prior.publication?.enrollment;if(!e||e.version!==1||e.account!==scope.account||e.apiBase!==scope.apiBase||!same(e.selectedRuntime,scope.nativeRuntime))throw new Error('Reporter enrollment conflicts with owner control scope');}
        const jobs=prior?ids(prior.paused_jobs===undefined?[]:prior.paused_jobs):[];
        this.data=validateControlSnapshot({version:3,...scope,paused_jobs:jobs,paused_tasks:prior?ids(prior.paused_tasks===undefined?[]:prior.paused_tasks):[],pending_effects:historicalEffects(jobs),reconciliations:[],seed:{kind:prior?`reporter-v${prior.version}`:'empty',...(prior?{reporterDigest:hash(readFileSync(this.stateFile))}:{}),basis:prior?.version===2?'Selected owner configuration and retained local state/root custody assertion; historical account/runtime provenance is not available':prior?'Matching retained enrollment and owner local custody':'No retained reporter file'}},scope);
        this.save(this.data.paused_jobs,this.data.paused_tasks);
      }
      if(this.ownsLease)for(const effect of this.pending)if(effect.stage==='prepared')this.retract(effect);
    }catch(error){
      if(!this.ownsLease)throw error;
      try{this.assert(this.stateFile);}catch(ownership){throw new Error(`${(error as Error).message}; local control ownership retained as uncertain: ${(ownership as Error).message}`);}
      this.lease.close();throw error;
    }
  }
  assert(stateFile:string):void {if(resolve(stateFile)!==this.stateFile)throw new Error('Owner lease state path differs');this.lease.assert(stateFile);}
  snapshot():ControlDataV3{return copy(this.data);}
  get jobs():string[]{return [...this.data.paused_jobs];}
  get tasks():string[]{return [...this.data.paused_tasks];}
  get pending():PendingEffect[]{return copy(this.data.pending_effects);}
  private persist(candidate:ControlDataV3):void{this.assert(this.stateFile);const valid=validateControlSnapshot(candidate,this.scope);savePublicationFile(this.file,valid);this.data=valid;}
  save(jobs:string[],tasks:string[],pending=this.data.pending_effects):void{this.persist({...this.data,paused_jobs:ids(jobs),paused_tasks:ids(tasks),pending_effects:pending});}
  begin(id:string,profile:string|null,action:'pause'|'resume'):PendingEffect{
    if(this.pending.some(e=>e.id===id))throw new Error('Native job effect remains unresolved');
    if(action==='resume'&&!this.jobs.includes(id))throw new Error('Native resume requires retained owner membership');
    const effect:PendingEffect={id,profile,action,operation:randomUUID(),origin:'rpc',stage:'prepared',ownedBefore:this.jobs.includes(id)};
    this.save([...new Set([...this.jobs,id])],this.tasks,[...this.pending,effect]);return effect;
  }
  private replace(effect:PendingEffect,next:PendingEffect):PendingEffect{if(!this.pending.some(e=>same(e,effect)))throw new Error('Native phase no longer matches current call');this.save(this.jobs,this.tasks,this.pending.map(e=>e.operation===effect.operation?next:e));return copy(next);}
  invoke(effect:PendingEffect):PendingEffect{if(effect.stage!=='prepared')throw new Error('Native effect is not prepared');return this.replace(effect,{...effect,stage:'invoked'});}
  acknowledge(effect:PendingEffect,result:JobMutationOutcome):PendingEffect{
    if(effect.stage!=='invoked'||effect.origin!=='rpc'||result.harness!==this.scope.nativeRuntime.kind||result.verb!==effect.action||result.id!==effect.id||!nonempty(result.ran))throw new Error('Native original completion envelope conflicts');
    const receipt={harness:result.harness,verb:effect.action,id:result.id,ran:result.ran};
    return this.replace(effect,{...effect,stage:'acknowledged',receipt:{...receipt,digest:hash(JSON.stringify(receipt))}});
  }
  retract(effect:PendingEffect):void{
    if(!['prepared','invoked'].includes(effect.stage)||typeof effect.ownedBefore!=='boolean'||!this.pending.some(e=>same(e,effect)))throw new Error('No authoritative unissued/refused effect to retract');
    this.save(effect.ownedBefore?this.jobs:this.jobs.filter(id=>id!==effect.id),this.tasks,this.pending.filter(e=>e.operation!==effect.operation));
  }
  settle(effect:PendingEffect,enabled:boolean):void{
    if(effect.stage!=='acknowledged'||!this.pending.some(e=>same(e,effect)))throw new Error('No durable native completion to reconcile');
    this.save(effect.action==='resume'||enabled?this.jobs.filter(id=>id!==effect.id):this.jobs,this.tasks,this.pending.filter(e=>e.operation!==effect.operation));
  }
  reconcile(selected:ControlSelection[],value:ControlReconciliationAudit):void{
    const record=audit(value);if(!same(selected,record.selected)||record.controlDigest!==hash(readFileSync(this.file)))throw new Error('Owner reconciliation control or selected digest changed');
    let jobs=this.jobs;const operations=new Set<string>();
    for(const selection of selected){const effect=this.pending.find(e=>e.operation===selection.operation);if(!effect||effectDigest(effect)!==selection.effectDigest)throw new Error('Owner reconciliation effect changed');operations.add(effect.operation);if(selection.disposition!=='retain-owned')jobs=jobs.filter(id=>id!==effect.id);}
    this.persist({...this.data,paused_jobs:jobs,pending_effects:this.pending.filter(e=>!operations.has(e.operation)),reconciliations:[...this.data.reconciliations,record]});
  }
  close():void{this.assert(this.stateFile);if(this.ownsLease)this.lease.close();}
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
  private readonly mutationAbort = new AbortController();
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
    // Recorded completion survives readback failure and caller-local restart.
    for (const effect of this.options.state.pending) {
      if (effect.stage !== 'acknowledged') continue;
      const current = (await this.jobs()).jobs.find(job => job.id === effect.id && (job.profile ?? null) === effect.profile);
      if (!current) continue;
      this.allowed(); this.options.state.settle(effect, current.enabled); this.blockedJobs.delete(effect.id);
    }
    for (const candidate of jobs.jobs) {
      if (this.blockedJobs.has(candidate.id) || this.options.state.pending.some(effect => effect.id === candidate.id)) continue;
      const job = (await this.jobs()).jobs.find(current => current.id === candidate.id && current.profile === candidate.profile);
      if (!job) continue;
      const action = desired === 'paused' && job.enabled ? 'pause' : desired === 'running' && this.options.state.jobs.includes(job.id) && !job.enabled ? 'resume' : undefined;
      if (!action) continue;
      let effect: PendingEffect | undefined, issued = false;
      try {
        this.allowed(); this.blockedJobs.add(job.id);
        effect = this.options.state.begin(job.id, job.profile ?? null, action);
        this.allowed(); effect = this.options.state.invoke(effect);
        this.allowed();
        const request = { ...runtime.scheduler, id: job.id, profile: job.profile ?? undefined };
        issued = true;
        const result = action === 'pause' ? await sc.pauseJob(request, { signal: this.mutationAbort.signal }) : await sc.resumeJob(request, { signal: this.mutationAbort.signal });
        // Receipt persistence alone is allowed during stop; this issues no native action.
        effect = this.options.state.acknowledge(effect, result);
        this.allowed();
        const observed = await this.jobs();
        const current = observed.jobs.find(row => row.id === job.id && (row.profile ?? null) === effect!.profile);
        if (!current) throw new Error('Acknowledged native job identity awaits readback');
        this.allowed(); this.options.state.settle(effect, current.enabled); this.blockedJobs.delete(job.id);
      } catch (error) {
        const rejectedBeforeEffect = error instanceof SupercodeRpcError && error.code === -32602 && error.sdkCode === 'invalid_argument' && error.sdkOperation === (action === 'pause' ? 'jobs_pause' : 'jobs_resume') && error.method === `harness.v1.jobs.${action}`;
        if (effect && (!issued || rejectedBeforeEffect)) {
          try { this.options.state.retract(effect); this.blockedJobs.delete(job.id); }
          catch (persistence) { this.options.log(`owner control no-effect persistence remains pending: ${(persistence as Error).message}`); }
        }
        this.options.log(`owner control job ${job.id} pending: ${(error as Error).message}`);
      }
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
    const executionUnresolved = activeBinding || finalHistory.runs.some(r => !r.finished_at && !['completed', 'failed', 'ok', 'error', 'skipped'].includes(r.status));
    // Hermes exposes no safe dispatcher quiescence/readback contract. Its task
    // ownership stays retained; schedule/promote can end work or refuse resume.
    const boardPending = runtime.native ? Boolean(finalModel.orchestration.workflow) : true;
    const enabled = jobs.jobs.some(j => j.enabled);
    const unresolved = new Set([...this.blockedJobs, ...this.options.state.pending.map(effect => effect.id)]).size;
    const state = desired === 'paused' && !unresolved && !enabled && !executionUnresolved && !boardPending ? 'paused' : 'running';
    const note = unresolved ? `${desired === 'paused' ? 'pausing' : 'running'}: native job effect or local ownership persistence remains unresolved (${unresolved}); affected jobs await evidence` : state === 'paused' ? 'Owned scheduled work paused; no unresolved native execution observed' : desired === 'paused' ? boardPending ? `pausing: ${runtime.native ? 'native' : 'Hermes'} dispatcher has no safe authorized pause/resume door; board intent remains pending` : executionUnresolved ? 'pausing: native execution readback remains unresolved' : 'pausing: scheduled work remains enabled' : executionUnresolved ? 'running: native execution readback remains unresolved; running intent does not confirm a live process' : this.pausedTasks.size ? 'running: retained board pause ownership remains pending; no safe board resume door' : undefined;
    this.allowed();
    const digest = `${state}|${note ?? ''}`;
    if (digest !== this.reported && (await oa.reportState(state, note)).ok) { this.reported = digest; this.options.log(`operating state ${state}${note ? ` (${note})` : ''}`); }
  }
  async stop(): Promise<void> {
    this.stopping = true; this.again = false; clearInterval(this.timer);
    this.nativeAbort.abort(); this.options.abort();
    if (!this.work) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([this.work, new Promise<void>(resolve => { timer = setTimeout(resolve, 10_000); })]);
    if (timer) clearTimeout(timer);
    this.mutationAbort.abort();
    await this.work;
  }
}
