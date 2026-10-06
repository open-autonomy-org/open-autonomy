#!/usr/bin/env bun
// Local enrollment/adoption and evidence-backed offline control reconciliation.
// Native observations use the public SDK; this door never mutates native jobs.
import { randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { SupercodeHarnessClient } from '@volter/supercode-harness-sdk';
import { PublicationStore, acquirePublicationLease, acquireAttestedPublicationLease, releaseAbandonedPublicationLease, retainedDigest, publicationHash, savePublicationBytes, savePublicationFile, type NativeRuntimeSelection, type LocalPublicationLease, type LeaseHandoffAcknowledgement } from './publication.ts';
import { NativeRuntime } from './native-runtime.ts';
import { OwnerControlState, validateRecoveryControlSnapshot, effectDigest, type ControlScope, type ControlDataV3, type ControlSelection, type ControlReconciliationAudit, type ControlRecoveryAction, type ControlRecoveryEvidence } from './owner-control.ts';
const args = process.argv.slice(2), command = args.shift();
const all = (key: string): string[] => args.flatMap((value, i) => value === key ? [args[i + 1] ?? ''] : []);
const one = (key: string): string | undefined => { const values = all(key); if (values.length > 1) throw new Error(`Repeated ${key}`); return values[0]; };
const need = (key: string): string => { const value = one(key); if (!value) throw new Error(`Required ${key}`); return value; };
const readJSON = (file: string): any => { if (lstatSync(file).isSymbolicLink()) throw new Error(`Refusing symlink ${file}`); return JSON.parse(readFileSync(file, 'utf8')); };
const hash = /^[0-9a-f]{64}$/;
const canonical = (value: unknown): string => JSON.stringify(value, (_key, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(key => [key, v[key]])) : v);
const digest = (value: unknown): string => publicationHash(canonical(value));
const nonempty = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim());
function shape(value: any, keys: string[], optional: string[] = []): void {
  if (!value || typeof value !== 'object' || Array.isArray(value) || keys.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => !keys.includes(key) && !optional.includes(key))) throw new Error('Recovery object has missing or unknown fields');
}
function privatePath(file: string, root: string): string {
  const path = resolve(file), boundary = resolve(root), rel = relative(boundary, path);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || resolve(boundary, rel) !== path || rel.startsWith(sep)) throw new Error('Recovery files must be inside publication-private/control-recovery');
  for (let current = path; ; current = dirname(current)) {
    if (existsSync(current)) {
      const info = lstatSync(current);
      if (info.isSymbolicLink() || (process.getuid && info.uid !== process.getuid()) || (info.mode & 0o077) || (info.isFile() && info.nlink !== 1)) throw new Error('Recovery files/directories require private owner permissions and no links');
      if (current === path && !info.isFile()) throw new Error('Recovery input must be a regular private file');
    }
    if (current === dirname(boundary)) break;
  }
  return path;
}
type Selection = ControlSelection & { id: string; profile: string | null };
type ControlAbsence = { kind: 'absent-control'; file: string };
type RecoveryManifest = {
  version: 1; mode: 'reconcile' | 'lease-handoff-only'; operator: string; statement: string; scope: ControlScope;
  configDigest: string; controlDigest: string | null; controlAbsence?: ControlAbsence; inventoryDigest: string;
  custody: { exclusiveLocalHome: true; priorEffectWriters: 'retired-or-settled' };
  selections: Selection[]; actions: ControlRecoveryAction[]; evidence: ControlRecoveryEvidence[];
  coverage: ControlReconciliationAudit['coverage'];
  leaseHandoff?: { nonce: string; ownerDigest: string; stateFile: string };
};
function manifestAt(file: string, privateRoot: string, scope: ControlScope, controlFile: string): { manifest: RecoveryManifest; bytes: string; evidence: ControlRecoveryEvidence[] } {
  const path = privatePath(file, privateRoot), bytes = readFileSync(path, 'utf8'), value = JSON.parse(bytes);
  shape(value, ['version', 'mode', 'operator', 'statement', 'scope', 'configDigest', 'controlDigest', 'inventoryDigest', 'custody', 'selections', 'actions', 'evidence', 'coverage'], ['leaseHandoff', 'controlAbsence']);
  shape(value.scope, ['account', 'apiBase', 'nativeRuntime']); shape(value.scope.nativeRuntime, ['kind', 'root']);
  shape(value.custody, ['exclusiveLocalHome', 'priorEffectWriters']);
  if (value.version !== 1 || !nonempty(value.operator) || !nonempty(value.statement) || canonical(value.scope) !== canonical(scope) || value.custody.exclusiveLocalHome !== true || value.custody.priorEffectWriters !== 'retired-or-settled' || [value.configDigest, value.inventoryDigest].some(d => typeof d !== 'string' || !hash.test(d))) throw new Error('Recovery manifest version, authority, scope or digests conflict');
  const custodyOnly = command === 'handoff-controls';
  if (value.mode !== (custodyOnly ? 'lease-handoff-only' : 'reconcile') || !Array.isArray(value.selections) || (custodyOnly ? value.selections.length !== 0 || !value.leaseHandoff || (value.controlDigest !== null && (typeof value.controlDigest !== 'string' || !hash.test(value.controlDigest))) : !value.selections.length || typeof value.controlDigest !== 'string' || !hash.test(value.controlDigest) || Object.hasOwn(value, 'controlAbsence'))) throw new Error('Recovery mode, control proof or selections conflict');
  if (custodyOnly && value.controlDigest === null) {
    shape(value.controlAbsence, ['kind', 'file']);
    if (value.controlAbsence.kind !== 'absent-control' || value.controlAbsence.file !== controlFile) throw new Error('Handoff-only requires the exact structured canonical control absence token');
  } else if (custodyOnly && Object.hasOwn(value, 'controlAbsence')) throw new Error('Present-state custody handoff forbids a control absence token');
  const operations = new Set<string>();
  for (const item of value.selections) {
    shape(item, ['operation', 'effectDigest', 'id', 'profile', 'disposition']);
    if (!nonempty(item.operation) || operations.has(item.operation) || !nonempty(item.id) || (item.profile !== null && !nonempty(item.profile)) || typeof item.effectDigest !== 'string' || !hash.test(item.effectDigest) || !['retain-owned', 'relinquish', 'relinquish-absent'].includes(item.disposition)) throw new Error('Duplicate, malformed or unsupported recovery selection');
    operations.add(item.operation);
  }
  if (!Array.isArray(value.evidence) || !value.evidence.length || !Array.isArray(value.actions) || !value.actions.length) throw new Error('Concrete lifecycle actions and retained evidence are required');
  const evidence: ControlRecoveryEvidence[] = [], evidencePaths = new Set<string>();
  for (const item of value.evidence) {
    shape(item, ['path', 'digest']);
    if (!nonempty(item.path) || typeof item.digest !== 'string' || !hash.test(item.digest)) throw new Error('Recovery evidence requires a private file and SHA-256');
    const evidencePath = privatePath(resolve(dirname(path), item.path), privateRoot);
    if (evidencePaths.has(evidencePath) || retainedDigest(evidencePath) !== item.digest) throw new Error('Duplicate or changed retirement evidence');
    evidencePaths.add(evidencePath); evidence.push({ path: evidencePath, digest: item.digest });
  }
  const actionIds = new Set<string>();
  for (const action of value.actions) {
    shape(action, ['id', 'door', 'action', 'evidence']);
    if (!nonempty(action.id) || actionIds.has(action.id) || !nonempty(action.door) || !nonempty(action.action) || !Array.isArray(action.evidence) || !action.evidence.length || new Set(action.evidence).size !== action.evidence.length || action.evidence.some((ref: unknown) => typeof ref !== 'string' || !evidencePaths.has(resolve(dirname(path), ref)))) throw new Error('Lifecycle actions require unique identities, owning doors and exact evidence references');
    action.evidence = action.evidence.map((ref: string) => resolve(dirname(path), ref));
    actionIds.add(action.id);
  }
  shape(value.coverage, ['publishers', 'sdkServices', 'nativeCliChildren', 'executionDomain']);
  for (const references of Object.values(value.coverage)) if (!Array.isArray(references) || !references.length || new Set(references).size !== references.length || references.some(ref => !actionIds.has(ref))) throw new Error('Retirement coverage must identify concrete actions for publishers, SDK services, wrappers/cold/Hermes children and the execution domain');
  if (value.leaseHandoff !== undefined) {
    shape(value.leaseHandoff, ['nonce', 'ownerDigest', 'stateFile']);
    if (!nonempty(value.leaseHandoff.nonce) || typeof value.leaseHandoff.ownerDigest !== 'string' || !hash.test(value.leaseHandoff.ownerDigest) || !nonempty(value.leaseHandoff.stateFile)) throw new Error('Explicit lease handoff requires exact prior identity and state path');
  }
  return { manifest: value, bytes, evidence };
}
type Inventory = { profiles: Array<{ name: string; home: string; default: boolean }>; jobs: Awaited<ReturnType<NativeRuntime['jobs']>>['jobs']; sources: Awaited<ReturnType<NativeRuntime['jobs']>>['sources'] };
async function inventory(runtime: NativeRuntime, signal: AbortSignal): Promise<Inventory> {
  const read = { signal, timeoutMs: 10_000 };
  const [model, descriptors, listing] = await Promise.all([runtime.load(read), runtime.profiles(read), runtime.jobs(read)]);
  const names = Object.keys(model.profiles).sort(), profiles: Inventory['profiles'] = [];
  if (!names.includes('default') || descriptors.length !== names.length || new Set(descriptors.map(p => p.name)).size !== descriptors.length) throw new Error('Incomplete native profile enumeration');
  for (const name of names) {
    const descriptor = descriptors.find(p => p.name === name), expectedHome = name === 'default' ? runtime.root : resolve(runtime.root, 'profiles', name);
    if (!descriptor || descriptor.harness !== runtime.selected.kind || descriptor.default !== (name === 'default') || !descriptor.home || resolve(descriptor.home) !== expectedHome || (model.profiles[name].dir !== undefined && resolve(model.profiles[name].dir!) !== expectedHome)) throw new Error('Native profile identity/root coverage is unsupported or ambiguous');
    profiles.push({ name, home: expectedHome, default: descriptor.default });
  }
  if (listing.sources.length !== names.length) throw new Error('Native jobs do not report every profile source');
  for (const profile of profiles) {
    const sourceProfile = profile.default ? null : profile.name, rows = listing.sources.filter(s => s.profile === sourceProfile);
    if (rows.length !== 1 || rows[0].harness !== runtime.selected.kind || resolve(rows[0].path) !== resolve(profile.home, 'cron/jobs.json') || !['read', 'absent_store'].includes(rows[0].state) || rows[0].detail !== null || rows[0].scan_limit !== null || rows[0].sessions_scanned !== null) throw new Error('Native inventory is incomplete, unreadable, truncated or from another scope');
  }
  const seen = new Set<string>();
  for (const job of listing.jobs) {
    if (!nonempty(job.id) || seen.has(job.id) || job.harness !== runtime.selected.kind || typeof job.enabled !== 'boolean' || (job.profile !== null && !profiles.some(p => !p.default && p.name === job.profile))) throw new Error('Native job identity is ambiguous or outside the complete profile inventory');
    seen.add(job.id);
  }
  return { profiles, jobs: [...listing.jobs].sort((a, b) => a.id.localeCompare(b.id)), sources: [...listing.sources].sort((a, b) => a.path.localeCompare(b.path)) };
}
function preflight(manifest: RecoveryManifest, control: ControlDataV3 | null, native: Inventory, configDigest: string, controlDigest: string | null): void {
  if (manifest.configDigest !== configDigest || manifest.controlDigest !== controlDigest || manifest.inventoryDigest !== digest(native)) throw new Error('Recovery configuration/control/native snapshot changed');
  if (manifest.mode === 'lease-handoff-only') {
    if (controlDigest === null ? control !== null : !control || control.pending_effects.length !== 0) throw new Error('Custody-only handoff requires actual absent controls or valid present controls with zero pending phases');
    return;
  }
  if (!control) throw new Error('Reconciliation requires retained canonical controls; missing state is not fresh ownership');
  for (const item of manifest.selections) {
    const phase = control.pending_effects.find(effect => effect.operation === item.operation);
    if (!phase || phase.id !== item.id || phase.profile !== item.profile || effectDigest(phase) !== item.effectDigest) throw new Error('Recovery selection is stale, unknown or has conflicting native identity');
    const historicalUnknown = phase.origin === 'retained-ownership' && phase.profile === null;
    const rows = native.jobs.filter(job => job.id === item.id && (historicalUnknown || job.profile === phase.profile));
    if (item.disposition === 'relinquish-absent') {
      if (rows.length) throw new Error('Relinquish-absent requires complete inventory with no matching native identity');
    } else if (rows.length !== 1 || (item.disposition === 'retain-owned' && rows[0].enabled)) throw new Error('Recovery disposition requires an exact native row; retain-owned requires disabled');
  }
}
async function controlDoor(configFile: string, stateFile: string, scope: ControlScope): Promise<void> {
  const permitted = ['--config', '--state-file', '--kind', '--root', ...(command === 'control-status' ? [] : ['--manifest'])];
  for (let i = 0; i < args.length; i += 2) if (!permitted.includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Control recovery received an unknown or incomplete argument');
  for (const key of permitted) one(key);
  const controlFile = `${stateFile}.control.json`, privateRoot = resolve(dirname(configFile), 'publication-private/control-recovery');
  const current = (): { control: ControlDataV3 | null; controlDigest: string | null; controlAbsence?: ControlAbsence } => {
    const parent = lstatSync(dirname(controlFile));
    if (!parent.isDirectory() || parent.isSymbolicLink()) throw new Error('Canonical control parent must be an existing owning directory');
    try { if (lstatSync(controlFile).isSymbolicLink()) throw new Error('Control recovery refuses a symlink sidecar'); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { control: null, controlDigest: null, controlAbsence: { kind: 'absent-control', file: controlFile } };
      throw error;
    }
    const bytes = readFileSync(controlFile), controlDigest = publicationHash(bytes);
    return { control: validateRecoveryControlSnapshot(JSON.parse(bytes.toString('utf8')), scope, controlDigest), controlDigest };
  };
  let retained = current(), control = retained.control;
  const initialConfigDigest = retainedDigest(configFile), initialControlDigest = retained.controlDigest;
  const selected = scope.nativeRuntime as NativeRuntimeSelection;
  const bin = process.env.SUPERCODE_BIN ?? resolve(import.meta.dir, 'node_modules/.bin/supercode');
  const sc = new SupercodeHarnessClient({ command: bin, args: ['harness', 'serve'], startTimeoutMs: 10_000, requestTimeoutMs: 10_000, env: { ...process.env, ...(selected.kind === 'hermes' ? { HERMES_HOME: selected.root } : { SUPERCODE_HOME: selected.root }) } as Record<string, string> });
  const runtime = new NativeRuntime(selected, sc), abort = new AbortController();
  let closeWork: Promise<void> | undefined;
  const close = () => closeWork ??= sc.close();
  const stop = () => { abort.abort(new Error('Control operator stopping; no new reconciliation')); void close().catch(() => {}); };
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(signal, stop);
  let lease: LocalPublicationLease | undefined, state: OwnerControlState | undefined;
  let handoff: LeaseHandoffAcknowledgement | undefined;
  let handoffAttempt: { priorOwnerDigest: string; priorNonce: string; preparedAudit: string } | undefined;
  let canonicalWriteAttempt: { reconciliation: string; preparedAudit: string; originalDigest: string } | undefined;
  let performedAuditAttempt: string | undefined;
  let applied = false, result: unknown, failure: unknown;
  try {
    if (abort.signal.aborted) throw abort.signal.reason;
    await sc.start();
    let native = await inventory(runtime, abort.signal);
    if (retainedDigest(configFile) !== initialConfigDigest || current().controlDigest !== initialControlDigest) throw new Error('Operator configuration/control changed during initial native read');
    const metadata = () => ({ scope, configDigest: retainedDigest(configFile), controlDigest: retained.controlDigest, ...(retained.controlAbsence ? { controlAbsence: retained.controlAbsence } : {}), inventoryDigest: digest(native), phases: (control?.pending_effects ?? []).map(effect => ({ operation: effect.operation, effectDigest: effectDigest(effect), id: effect.id, profile: effect.profile, origin: effect.origin, profileAuthority: effect.origin === 'retained-ownership' && effect.profile === null ? 'historical-unknown' : 'known', action: effect.action, stage: effect.stage })), profiles: native.profiles, jobs: native.jobs.map(job => ({ id: job.id, profile: job.profile, enabled: job.enabled })) });
    if (command === 'control-status') {
      retained = current(); control = retained.control;
      if (retained.controlDigest !== initialControlDigest) throw new Error('Canonical controls changed before status output');
      result = { ...metadata(), authority: 'public-sdk-current-inventory; historical effects remain unknown', lock: existsSync(`${stateFile}.lock`) ? { digest: retainedDigest(resolve(`${stateFile}.lock`, 'owner.json')) } : null };
    } else {
      const manifestFile = resolve(need('--manifest'));
      let loaded = manifestAt(manifestFile, privateRoot, scope, controlFile);
      const manifestDigest = publicationHash(loaded.bytes);
      preflight(loaded.manifest, control, native, retainedDigest(configFile), initialControlDigest);
      if (loaded.manifest.leaseHandoff && resolve(loaded.manifest.leaseHandoff.stateFile) !== stateFile) throw new Error('Handoff manifest state path conflicts');
      if (abort.signal.aborted) throw abort.signal.reason;
      // The whole plan/evidence/snapshot is validated before changing lease custody.
      const id = randomUUID(), directory = resolve(privateRoot, id);
      for (const path of [resolve(dirname(configFile), 'publication-private'), privateRoot]) {
        if (existsSync(path)) {
          const info = lstatSync(path);
          if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) || (process.getuid && info.uid !== process.getuid())) throw new Error('Recovery audit directory must be private and owner-controlled');
        } else mkdirSync(path, { mode: 0o700 });
      }
      mkdirSync(directory, { mode: 0o700 });
      // Custody-only present state is never rewritten, even for format migration.
      let preservedControl: { file: string; digest: string; backup: string } | undefined;
      if (loaded.manifest.mode === 'lease-handoff-only' && loaded.manifest.controlDigest !== null) {
        const original = readFileSync(controlFile), backup = resolve(directory, 'control.before.json');
        if (publicationHash(original) !== loaded.manifest.controlDigest) throw new Error('Canonical controls changed before custody-only backup');
        savePublicationBytes(backup, original);
        savePublicationBytes(resolve(directory, 'manifest.json'), loaded.bytes);
        preservedControl = { file: controlFile, digest: loaded.manifest.controlDigest, backup };
      }
      if (loaded.manifest.leaseHandoff) {
        const requested = loaded.manifest.leaseHandoff;
        const auditFile = resolve(directory, 'lease-handoff.json');
        const packet = { nonce: requested.nonce, ownerDigest: requested.ownerDigest, manifestDigest, operator: loaded.manifest.operator, evidenceDigest: digest(loaded.evidence), configFile, configDigest: loaded.manifest.configDigest, controlDigest: loaded.manifest.controlDigest, ...(loaded.manifest.controlAbsence ? { controlAbsence: loaded.manifest.controlAbsence } : {}), auditFile };
        savePublicationFile(auditFile, { version: 1, stage: 'prepared', authority: 'local-owner-assertion', ...packet, scope, ...(preservedControl ? { preservedControl } : {}), statement: loaded.manifest.statement, actions: loaded.manifest.actions, evidence: loaded.evidence, coverage: loaded.manifest.coverage, inventoryDigest: loaded.manifest.inventoryDigest });
        handoffAttempt = { priorOwnerDigest: requested.ownerDigest, priorNonce: requested.nonce, preparedAudit: auditFile };
        const acquired = acquireAttestedPublicationLease(stateFile, packet);
        handoff = acquired.handoff;
        if (handoff.durability !== 'durable') throw new Error('Handoff canonical publication is unconfirmed; retained custody evidence needs inspection');
        lease = acquired;
      } else lease = acquirePublicationLease(stateFile);
      lease.assert(stateFile);
      // Re-read all bytes and the public inventory under the new/current writer.
      loaded = manifestAt(manifestFile, privateRoot, scope, controlFile);
      if (publicationHash(loaded.bytes) !== manifestDigest) throw new Error('Manifest changed after lease acquisition/handoff; control dispositions were not applied');
      retained = current(); control = retained.control; native = await inventory(runtime, abort.signal);
      preflight(loaded.manifest, control, native, retainedDigest(configFile), retained.controlDigest);
      if (abort.signal.aborted) throw abort.signal.reason;
      if (loaded.manifest.mode === 'lease-handoff-only') {
        if (!handoff || current().controlDigest !== loaded.manifest.controlDigest || (preservedControl && retainedDigest(preservedControl.backup) !== preservedControl.digest) || retainedDigest(configFile) !== loaded.manifest.configDigest || publicationHash(readFileSync(manifestFile)) !== manifestDigest || loaded.evidence.some(item => retainedDigest(item.path) !== item.digest)) throw new Error('Handoff-only inputs changed; control state was not created');
        lease.assert(stateFile);
        const performedFile = resolve(directory, 'handoff-performed.json');
        performedAuditAttempt = performedFile;
        savePublicationFile(performedFile, { version: 1, stage: 'performed', authority: 'local-owner-assertion', mode: 'lease-handoff-only', scope, controlDigest: loaded.manifest.controlDigest, controlAbsence: loaded.manifest.controlAbsence, ...(preservedControl ? { preservedControl } : {}), manifestDigest, configDigest: loaded.manifest.configDigest, inventoryDigest: loaded.manifest.inventoryDigest, operator: loaded.manifest.operator, statement: loaded.manifest.statement, evidence: loaded.evidence, actions: loaded.manifest.actions, coverage: loaded.manifest.coverage, handoff, canonicalControlsCreated: false, canonicalControlsChanged: false });
        performedAuditAttempt = undefined;
        result = { custodyTransferred: true, canonicalReconciliationApplied: false, authority: 'local-owner-assertion', leaseHandoff: handoff, performedAudit: performedFile, controlDigest: loaded.manifest.controlDigest, controlAbsence: loaded.manifest.controlAbsence, ...(preservedControl ? { preservedControl } : {}), canonicalControlsChanged: false, nativeJobsMutated: false, next: 'Review custody audit, then ordinary publisher startup may load unchanged controls or conservatively seed missing state; no prior native completion is asserted.' };
      } else {
        if (loaded.manifest.controlDigest === null) throw new Error('Reconciliation cannot apply a null control digest');
        const original = readFileSync(controlFile), backup = resolve(directory, 'control.before.json');
        if (publicationHash(original) !== loaded.manifest.controlDigest) throw new Error('Canonical controls changed before backup');
        savePublicationBytes(backup, original);
        savePublicationBytes(resolve(directory, 'manifest.json'), loaded.bytes);
        const selections: ControlSelection[] = loaded.manifest.selections.map(({ operation, effectDigest, disposition }) => ({ operation, effectDigest, disposition }));
        const audit: ControlReconciliationAudit = { version: 1, id, authority: 'local-owner-assertion', operator: loaded.manifest.operator, statement: loaded.manifest.statement, manifestDigest: publicationHash(loaded.bytes), configDigest: loaded.manifest.configDigest, controlDigest: loaded.manifest.controlDigest, snapshotDigest: loaded.manifest.inventoryDigest, backup: { path: backup, digest: publicationHash(original) }, actions: loaded.manifest.actions, evidence: loaded.evidence, coverage: loaded.manifest.coverage, selected: selections, ...(handoff ? { leaseHandoff: { priorOwnerDigest: handoff.priorOwnerDigest, priorNonce: handoff.priorNonce, auditFile: handoff.auditFile } } : {}) };
        savePublicationFile(resolve(directory, 'prepared-audit.json'), audit);
        state = new OwnerControlState(stateFile, scope, { owner: lease });
        if (retainedDigest(configFile) !== loaded.manifest.configDigest || retainedDigest(controlFile) !== loaded.manifest.controlDigest || publicationHash(readFileSync(manifestFile)) !== audit.manifestDigest || loaded.evidence.some(item => retainedDigest(item.path) !== item.digest) || abort.signal.aborted) throw new Error('Recovery inputs changed before canonical write');
        canonicalWriteAttempt = { reconciliation: id, preparedAudit: resolve(directory, 'prepared-audit.json'), originalDigest: audit.controlDigest };
        state.reconcile(selections, audit); applied = true;
        result = { applied: true, authority: 'local-owner-assertion', reconciliation: id, controlDigest: retainedDigest(controlFile), backup, leaseHandoff: handoff ?? null, nativeJobsMutated: false, next: 'Review canonical audit, then restart the ordinary publisher; prior-domain retirement is the owner assertion, not a native fence.' };
      }
    }
  } catch (error) {
    failure = error;
    const performed = (error as Error & { handoff?: typeof handoff }).handoff;
    if (performed) handoff = performed;
  }
  finally {
    abort.abort();
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.off(signal, stop);
    let retired = false;
    try { await close(); retired = true; } catch (error) { failure ??= error; }
    if (retired) try { state?.close(); lease?.close(); } catch (error) { failure ??= error; }
    else if (lease) console.error('Control operator SDK retirement is uncertain; local writer evidence retained.');
  }
  if (failure) {
    if (handoffAttempt || canonicalWriteAttempt || applied) console.error(JSON.stringify({ leaseHandoff: handoff ?? null, ...(handoffAttempt && !handoff ? { handoffAttempt, handoffCompletion: 'not acknowledged; inspect retained lease/quarantine/staging evidence' } : {}), ...(performedAuditAttempt ? { performedAuditAttempt, performedAuditPublication: 'not acknowledged; performed audit may be visible; inspect before retry' } : {}), canonicalReconciliationApplied: applied ? true : canonicalWriteAttempt ? 'unconfirmed' : false, ...(canonicalWriteAttempt && !applied ? { canonicalWriteAttempt, canonicalPublication: 'not acknowledged; canonical bytes/audit may have changed; inspect before retry' } : {}), cause: (failure as Error).message }));
    throw failure;
  }
  console.log(JSON.stringify(result, null, 2));
}
try {
  const configFile = resolve(need('--config')), text = readFileSync(configFile, 'utf8'), cfg = Bun.YAML.parse(text) as any;
  if (!cfg || typeof cfg.account !== 'string' || !cfg.account) throw new Error('Reporter configuration needs its explicit OA account');
  const base = dirname(configFile), stateFile = resolve(one('--state-file') ?? resolve(base, cfg.state_file ?? 'reporter-state.json'));
  const cacheFile = resolve(one('--cache-file') ?? `${stateFile}.board.json`);
  const apiBase = `${(cfg.platform ?? 'https://open-autonomy.org').replace(/\/$/, '')}/v1`;
  const runtime = (): NativeRuntimeSelection => {
    const kind = need('--kind'); if (kind !== 'hermes' && kind !== 'orchestrator') throw new Error('--kind must be hermes or orchestrator');
    const selected = { kind, root: resolve(need('--root')) } as NativeRuntimeSelection;
    if (Object.hasOwn(cfg, 'native_runtime') && (!cfg.native_runtime || !['hermes', 'orchestrator'].includes(cfg.native_runtime.kind) || typeof cfg.native_runtime.root !== 'string' || !isAbsolute(cfg.native_runtime.root) || cfg.native_runtime.kind !== kind || resolve(cfg.native_runtime.root) !== selected.root)) throw new Error('Selected runtime conflicts with a malformed or different reporter declaration');
    return selected;
  };
  if (command === 'control-status' || command === 'reconcile-controls' || command === 'handoff-controls') {
    await controlDoor(configFile, stateFile, { account: cfg.account, apiBase, nativeRuntime: runtime() });
  } else if (command === 'status') {
    console.log(JSON.stringify({ account: cfg.account, apiBase, enrolled: Boolean(cfg.publication), reporter: existsSync(stateFile) ? { version: readJSON(stateFile).version, digest: retainedDigest(stateFile) } : null, cache: existsSync(cacheFile) ? { version: readJSON(cacheFile).version, digest: retainedDigest(cacheFile) } : null, lock: existsSync(`${stateFile}.lock`) ? readJSON(resolve(`${stateFile}.lock`, 'owner.json')) : null }, null, 2));
  } else if (command === 'enroll' || command === 'prepare-adoption') {
    if (cfg.publication) throw new Error('Publication is already declared; no fresh contexts overwrite an enrollment');
    if (existsSync(`${stateFile}.lock`)) throw new Error('Publisher ownership is held/unknown; stop its owner first');
    if (command === 'enroll' && (existsSync(stateFile) || existsSync(cacheFile))) throw new Error('Retained state requires prepare-adoption and an exact reviewed alias manifest');
    if (command === 'prepare-adoption' && (!existsSync(stateFile) || !existsSync(cacheFile) || readJSON(stateFile).version !== 2 || readJSON(cacheFile).version !== 1)) throw new Error('Legacy preparation requires original version2 reporter and version1 cache');
    const selected = runtime(), boards = all('--backing-board'), contexts = all('--store-context');
    if (!boards.length || boards.some(board => !board) || new Set(boards).size !== boards.length || (contexts.length && contexts.length !== boards.length)) throw new Error('Explicit unique --backing-board selectors and matching optional --store-context values required');
    const sourceContext = one('--source-context') ?? randomUUID(), stores = boards.map((backing_board, i) => ({ context: contexts[i] ?? randomUUID(), backing_board }));
    const validUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    if (!validUUID.test(sourceContext) || stores.some(store => !validUUID.test(store.context)) || new Set(stores.map(store => store.context)).size !== stores.length) throw new Error('OA contexts must be unique lowercase UUIDv4 values');
    const privateDirectory = resolve(base, 'publication-private');
    if (existsSync(privateDirectory) && lstatSync(privateDirectory).isSymbolicLink()) throw new Error('Private publication directory must not be a symlink');
    mkdirSync(privateDirectory, { recursive: true, mode: 0o700 });
    const custodyName = `publication-private/${basename(configFile)}.custody.json`, custodyFile = resolve(base, custodyName);
    if (existsSync(custodyFile)) throw new Error('Custody declaration already exists; retain it and reconcile incomplete enrollment explicitly');
    const custody = { version: 1, generation: 1, account: cfg.account, apiBase, sourceContext, stores, nativeRuntime: selected, operator: need('--operator'), statement: need('--statement'), evidence: need('--evidence') };
    const publication = { source_context: sourceContext, stores, custody: custodyName };
    const declared = { ...cfg, publication };
    // Block mappings support an append that retains comments. A complete flow
    // mapping cannot accept another top-level block: serialize its existing data.
    let prepared = `${text}${text.endsWith('\n') ? '' : '\n'}\npublication: ${JSON.stringify(publication)}\n`;
    try { if (JSON.stringify(Bun.YAML.parse(prepared)) !== JSON.stringify(declared)) prepared = Bun.YAML.stringify(declared) + '\n'; }
    catch { prepared = Bun.YAML.stringify(declared) + '\n'; }
    if (JSON.stringify(Bun.YAML.parse(prepared)) !== JSON.stringify(declared)) throw new Error('Prepared publication configuration does not preserve the existing parsed data');
    // Keep original bytes before either enrollment write. A partial operation
    // retains these and the exact declaration; it never creates replacement IDs.
    const beforeFile = resolve(privateDirectory, `${basename(configFile)}.before-enrollment.yaml`);
    if (existsSync(beforeFile)) throw new Error('Original enrollment configuration already retained; reconcile the prior operation explicitly');
    savePublicationBytes(beforeFile, text);
    savePublicationFile(custodyFile, custody);
    savePublicationBytes(configFile, prepared);
    console.log(JSON.stringify({ account: cfg.account, publication, ...(command === 'prepare-adoption' ? { reporterDigest: retainedDigest(stateFile), cacheDigest: retainedDigest(cacheFile), next: 'Supply explicit reviewed items/notes/sessions provenance in adoption JSON; adopt does not infer it.' } : { next: 'Review/commit the association configuration; native execution is unchanged.' }) }, null, 2));
  } else if (command === 'adopt') {
    if (!cfg.publication) throw new Error('Run prepare-adoption and review its explicit source declaration first');
    const store = new PublicationStore({ configFile, stateFile, cacheFile, publication: { ...cfg.publication, adoption: need('--manifest') }, account: cfg.account, apiBase, nativeRuntime: runtime() });
    await store.close(); console.log('Explicit adoption saved; original bytes retained. Next publisher start requires a genuine full native snapshot.');
  } else if (command === 'release-lock') {
    if (!args.includes('--same-executor-stopped')) throw new Error('Release requires verified teardown in the same executor/process namespace');
    releaseAbandonedPublicationLease(stateFile, need('--nonce'));
    console.log('Proven-dead local writer lease retained in quarantine; publication state retained. Source retirement is not inferred.');
  } else throw new Error('Use status, enroll, prepare-adoption, adopt, release-lock, control-status, reconcile-controls or handoff-controls with --config FILE; run this door inside the owning World/executor.');
} catch (error) { console.error(`publication: ${(error as Error).message}`); process.exitCode = 1; }
