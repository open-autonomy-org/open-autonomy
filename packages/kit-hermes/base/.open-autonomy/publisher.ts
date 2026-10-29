#!/usr/bin/env bun
// Volter Harness SDK in, Open Autonomy SDK out. Native state belongs to Volter Harness;
// publication policy, repository documents and acknowledged delivery belong here.
// Projection contract for this adapter (not a second native execution model):
// - source-events.ts retains native backing-store/card observations; publication.ts resolves
//   OA item IDs under explicitly enrolled source/store contexts and preserves adopted IDs.
//   Archived cards are omitted; ordinary installs select the default assignee, organization
//   installs select project tags/tenant. No removed card supplies a session end.
// - board() uses the source's normalized card.status as lane, not its raw lane.
//   done projects to past/done; running/review to present/active; any supplied
//   blocked/scheduled status to present/proposed; remaining statuses to present/planned.
//   Supercode normalizes raw blocked/scheduled lanes to todo, so those project as
//   planned here; the raw lane and its more specific standing are not exported.
//   First attempt start, last handoff/attempt author, native completion time and a
//   validated handoff commit provide the available item timestamps, attribution and proof.
// - Attempt IDs are not OA session keys. Native session_id is the initial key; an
//   attempt's session reference binds a worker to its card, else a unique workspace match
//   can supply item_id. Ambiguous association leaves item_id absent. Organization sessions
//   go to the card's primary project; an unassigned session stays on the organization.
// - completionOf maps recorded completed/failed runs, a closed (done or cancelled) card's
//   last ended attempt that ran, and bindings; an open card's ended attempt is a pause the
//   board may resume, never an end. One card's attempts on a session are one association; a
//   session several cards name is refused alone and skipped while every other session
//   publishes. Absent verdicts stay absent, and a board-launched session never ends before
//   its latest run started. A session its card resumed after its published end (a reopened
//   card) continues as <native-id>~<n> once its source holds more turns than that end
//   published, as does a source rewrite that
//   reporting.ts detects when it closes an old OA transcript projection; neither boundary is
//   native task completion. Silence and source disappearance supply no completion evidence.
// - Review and handoff notes use native effect IDs under the same OA association.
//   Adopted legacy IDs/markers remain valid; exact requests and full receipts survive retry.
//   Full attempt topology, native control records and source-only fields are not exported.
//   reporting.ts also applies audience exclusions, selects supported text/tool turns,
//   clips content and omits reconstructed Hermes messages without a stored native row.
// - Transcript receipts are separate persisted seq/digest/end checkpoints, verified
//   against source windows and the server's retained tail. Session failures retry separately;
//   a saved board-source cursor does not attest that every transcript was delivered.
//   Native events/index/transcripts, OA publications and owner control have separate ordering.
import { existsSync, readFileSync, watch as watchFiles } from 'node:fs';
import { spawn as spawnCommand } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import type { SupercodeHarnessClient, SessionDescriptor, HarnessRun } from '@volter/supercode-harness-sdk';
import { harnessSdkModule, orchestratorEntry, supercodeBin, supercodeCommand, machineNode } from './machine-supercode.ts';
// the machine's harness SDK (machine-supercode.ts)
const { SupercodeHarnessClient: HarnessClient } = await import(harnessSdkModule());
import { ROADMAP_SCHEMA, itemTime, linkOf, linksIn, normalizeRoadmap, type Link, type RoadmapItem } from './sdk/roadmap.ts';
import { OpenAutonomy } from './sdk/client.ts';
import { BoardEventSource } from './source-events.ts';
import { publicationPolicy, publishes, SourceRewritten, takeReadVolume, TranscriptPublisher, turnsOf, type PublicationCheckpoint, type RecordedCompletion } from './reporting.ts';
import { nativeRuntime, NativeRuntime } from './native-runtime.ts';
import { OwnerControlState, OwnerController } from './owner-control.ts';
import { PublicationStore } from './publication.ts';
import { TranscriptQueue } from './transcript-queue.ts';
import { initializeWorkLedger, closeWorkLedger, recordWork, measureWork, responseWork, spawnWork, stopWorkChild } from './work-ledger.ts';

const arg = (name: string): string | undefined => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const configPath = resolve(arg('--config') ?? resolve(import.meta.dir, 'config.yaml'));
const cfg = Bun.YAML.parse(readFileSync(configPath, 'utf8')) as any;
if (!cfg || typeof cfg.account !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(cfg.account)) throw new Error('Reporter configuration must name the project account');
// An organization's install (docs/decisions/0017): one board for every project, each card tagged with its primary project
// (its tenant). A project's reporter (`tenant:` in the config the start writes for it) publishes that project's cards and
// their sessions under the project's account; the organization's reporter publishes the rest. Its timeline is the board:
// the future is the cards ahead, the past the done ones; no ROADMAP.md or CHANGELOG.md is read.
const tenant: string | undefined = typeof cfg.tenant === 'string' ? cfg.tenant : undefined;
// A tenant reporter is scoped even when it does not duplicate the organization's project roster.
const organization = Boolean(tenant) || Array.isArray(cfg.organization?.projects);
const elsewhere = (process.env.OPEN_AUTONOMY_PROJECT_REPORTERS ?? '').split(',').filter(Boolean);
const tagIs = (tag: string | undefined, account: string): boolean => !!tag && (tag === account || tag === account.split('/')[1]);
const ours = (tag: string | undefined): boolean => (tenant ? tagIs(tag, tenant) : !elsewhere.some((a) => tagIs(tag, a)));
// A card's tags are ordered (its tenant is the first): it shows in every project it is tagged with, and in the
// organization's view when it is tagged with none. Its sessions, and their usage, are its first tag's (`ours` on the tenant).
const shown = (t: { tenant?: string; tags?: string[] }): boolean => {
  const tags = t.tags?.length ? t.tags : [t.tenant];
  return tenant ? tags.some((tag) => tagIs(tag, tenant)) : !tags.some((tag) => elsewhere.some((a) => tagIs(tag, a)));
};
const selectedRuntime = nativeRuntime(cfg);
const home = selectedRuntime.root;
await initializeWorkLedger('oa-publisher', { kind: tenant ? 'project' : 'install', id: `${cfg.account}\0${home}\0${tenant ?? ''}` });
const container = arg('--container');
if (container && !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(container)) throw new Error('Invalid container');
if (container && cfg.seats) throw new Error('Host Claude seats require their own reporter');
if (container && selectedRuntime.kind === 'orchestrator') throw new Error('This adapter supports native orchestrator publication on the bare host; container publication requires its explicit Hermes adapter');
const projectDir = arg('--project') ?? (container ? '/work/project' : resolve(dirname(configPath), '..'));
// A prepared install's state, custody and adoption stay in its source checkout (`--local-dir`), never in the snapshot.
const localDirectory = resolve(arg('--local-dir') ?? dirname(configPath));
const stateFile = resolve(arg('--state-file') ?? resolve(localDirectory, cfg.state_file ?? 'reporter-state.json'));
const baseUrl = process.env.OPEN_AUTONOMY_BASE_URL ?? `${(cfg.platform ?? 'https://open-autonomy.org').replace(/\/$/, '')}/v1`;
const narrativeAbort = new AbortController();
const narrativeRead = { signal: narrativeAbort.signal, timeoutMs: 10_000 };
const narrativeTimers = new Set<ReturnType<typeof setTimeout>>();
const commands = new Set<Promise<unknown>>();
const commandFailures = new Set<Error>();
const oa = new OpenAutonomy({ baseUrl, key: process.env.OPEN_AUTONOMY_KEY ?? 'valve', fetch: ((input, init) => {
  if (quitting) throw new Error('Narrative stopping; publication intent retained');
  ownerState.assert(stateFile);
  return responseWork('call', 'publisher.upstream', () => fetch(input, { ...init, signal: AbortSignal.any([narrativeAbort.signal, AbortSignal.timeout(10_000), ...(init?.signal ? [init.signal] : [])]) }));
}) as typeof fetch });
const log = (message: string) => console.log(`publisher: ${message}`);
// What runs the agent, as the start script says (mode, kit, executor, host): published with the setup, never a credential.
const runtimeFacts = (() => { try { const r = JSON.parse(process.env.OPEN_AUTONOMY_RUNTIME ?? ''); return r && (r.mode === 'container' || r.mode === 'bare') ? r : undefined; } catch { return undefined; } })();
// File/Git reads below are only for the project's documents; no native Hermes
// database, config, jobs file or skill directory is parsed by the reporter.
// HOME is the profile's home too: Git's route to the origin (a fleet's door rewrite) lives in its .gitconfig.
const inContainer = (cmd: string[]) => ['docker', 'exec', '-i', '--user', 'hermes', '--env', `HERMES_HOME=${home}`, '--env', `HOME=${home}`, container!, ...cmd];
// A private command group keeps committed Git reads from blocking owner controls or
// signal handlers. Retirement includes descendants; uncertainty retains the lease.
function run(cmd: string[], env = process.env, signal = narrativeAbort.signal): Promise<{ exitCode: number | null; stdout: string; stderr: string; exitedDueToTimeout: boolean }> {
  if (signal.aborted || quitting) return Promise.reject(new Error('Publisher stopping; command not started'));
  ownerState.assert(stateFile);
  const command = container ? inContainer(cmd) : cmd;
  const grouped = process.platform !== 'win32';
  const child = spawnWork(() => spawnCommand(command[0], command.slice(1), { env, detached: grouped, stdio: ['ignore', 'pipe', 'pipe'] }), 'node');
  let timedOut = false, stdout = '', stderr = '', closed = false;
  let retirement: Promise<void> | undefined;
  // macOS answers EPERM, to the probe and to a signal alike, for a group whose members have all exited but are not yet
  // reaped (a command's descendants just after it exits). That is unknown: never absence, never authority to escalate.
  const alive = (): boolean | undefined => {
    if (!child.pid) return !closed;
    if (!grouped) return !closed;
    try { process.kill(-child.pid, 0); return true; }
    catch (error) { const code = (error as NodeJS.ErrnoException).code; if (code === 'ESRCH') return false; if (code === 'EPERM') return undefined; throw error; }
  };
  const kill = (value: NodeJS.Signals): void => {
    if (!child.pid) return;
    try { stopWorkChild(child, () => grouped ? process.kill(-child.pid!, value) : child.kill(value), { signal: value }); }
    catch (error) { const code = (error as NodeJS.ErrnoException).code; if (code !== 'ESRCH' && code !== 'EPERM') throw error; }
  };
  const retire = (): Promise<void> => retirement ??= (async () => {
    const uncertain = (): never => { const error = new Error('Publisher command retirement is uncertain; local ownership retained'); commandFailures.add(error); throw error; };
    // The group's state at the deadline: gone, live, or unknown.
    const settle = async (duration: number): Promise<boolean | undefined> => {
      const end = Date.now() + duration;
      while (Date.now() < end) { if (alive() === false) return false; await Bun.sleep(25); }
      return alive();
    };
    kill('SIGTERM');
    const afterTerm = await settle(1000);
    if (afterTerm === false) return;
    if (afterTerm === undefined) uncertain();
    kill('SIGKILL'); // the preceding probe positively observed a live group
    if (await settle(1000) !== false) uncertain();
  })();
  const abort = () => { void retire().catch(error => { commandFailures.add(error); child.stdout?.destroy(); child.stderr?.destroy(); }); };
  signal.addEventListener('abort', abort, { once: true });
  const bound = setTimeout(() => { timedOut = true; abort(); }, 20_000);
  child.stdout!.setEncoding('utf8'); child.stderr!.setEncoding('utf8');
  child.stdout!.on('data', data => { stdout += data; }); child.stderr!.on('data', data => { stderr += data; });
  const drainError = (error: Error) => { commandFailures.add(new Error(`Publisher command output drain failed: ${error.message}`)); abort(); };
  child.stdout!.on('error', drainError); child.stderr!.on('error', drainError);
  child.once('exit', abort);
  const work = (async () => {
    try {
      const exitCode = await new Promise<number | null>((resolve, reject) => {
        child.once('error', reject); child.once('close', code => { closed = true; resolve(code); });
      });
      await retire();
      if (container && (timedOut || signal.aborted)) {
        const error = new Error('Container Git command cancellation cannot prove executor retirement; local ownership retained');
        commandFailures.add(error); throw error;
      }
      if (signal.aborted) throw new Error('Publisher command stopped; intent retained');
      return { exitCode, stdout, stderr, exitedDueToTimeout: timedOut };
    } catch (error) { await retire(); throw error; }
    finally { clearTimeout(bound); signal.removeEventListener('abort', abort); }
  })();
  commands.add(work); void work.then(() => commands.delete(work), () => commands.delete(work));
  return work;
}
const supercode = container ? (process.env.SUPERCODE_BIN ?? 'supercode') : supercodeBin();
const reader = container ? inContainer([supercode, 'harness', 'serve']) : supercodeCommand(['harness', 'serve'], supercode);
// An orchestrator home travels in each query and in the runtime's root. SUPERCODE_HOME stays the machine's supercode
// home: its source lock and machine door (the session index answers through that door), never the orchestrator's.
const nativeEnvironment = { ...process.env, ...(selectedRuntime.kind === 'hermes' ? { HERMES_HOME: home } : {}) } as Record<string, string>;
const sc = new HarnessClient({ command: reader[0], args: reader.slice(1), env: nativeEnvironment });
const runtime = new NativeRuntime(selectedRuntime, sc);
const ownerState = new OwnerControlState(stateFile, { account: cfg.account, apiBase: `${(cfg.platform ?? 'https://open-autonomy.org').replace(/\/$/, '')}/v1`, nativeRuntime: selectedRuntime });
let quitting = false;
const controlAbort = new AbortController();
const ownerOa = new OpenAutonomy({ baseUrl, key: process.env.OPEN_AUTONOMY_KEY ?? 'valve', fetch: ((input, init) => {
  ownerState.assert(stateFile);
  return responseWork('call', 'publisher.upstream', () => fetch(input, { ...init, signal: AbortSignal.any([controlAbort.signal, AbortSignal.timeout(20_000), ...(init?.signal ? [init.signal] : [])]) }));
}) as typeof fetch });
const controller = new OwnerController({ state: ownerState, runtime, sc, oa: ownerOa, account: cfg.account, tenant, abort: () => controlAbort.abort(), log });
let activePublication: PublicationStore | undefined, activeSource: BoardEventSource | undefined;
let stopNarrative = () => {};
let shutdownWork: Promise<void> | undefined;
let narrativeWork: Promise<void> | undefined;
let stopTranscripts = async (): Promise<void> => {};
function shutdown(code: number): Promise<void> {
  if (shutdownWork) return shutdownWork;
  quitting = true; narrativeAbort.abort(); controlAbort.abort();
  for (const timer of narrativeTimers) clearTimeout(timer); narrativeTimers.clear();
  activeSource?.close(); stopNarrative();
  shutdownWork = (async () => {
    try {
      await Promise.all([controller.stop(), activeSource?.stop(), narrativeWork, stopTranscripts()]);
      await activePublication?.close();
      await Promise.allSettled(commands);
      if (commandFailures.size) throw [...commandFailures][0];
    }
    catch (error) { log(`shutdown retains uncertain publication ownership: ${(error as Error).message}`); try { await sc.close(); } finally { await closeWorkLedger(); } process.exit(1); }
    try { await sc.close(); ownerState.close(); } finally { await closeWorkLedger(); }
    process.exit(code);
  })();
  return shutdownWork;
}
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) process.on(signal, () => { void shutdown(0); });
sc.on('exit', code => { if (!quitting) { log(`Volter Harness reader exited (${code})`); void shutdown(1); } });
await sc.start(); controller.start();
process.send?.({ type: 'reporter-ready' });
const configWatch = watchFiles(configPath, () => { log('configuration changed; restart required'); void shutdown(1); });
stopNarrative = () => configWatch.close();
if (!Object.hasOwn(cfg, 'publication')) { log('control-only: publication enrollment required; owner controls remain active'); }
else narrativeWork = narrate().catch(error => { if (!quitting) log(`narrative publication pending: ${(error as Error).message}; owner controls remain active`); });
function later(work: () => void, delay: number): ReturnType<typeof setTimeout> | undefined {
  if (quitting) return undefined;
  const timer = setTimeout(() => { narrativeTimers.delete(timer); if (!quitting) work(); }, delay);
  narrativeTimers.add(timer);
  return timer;
}
async function retryStartup<T>(stage: string, work: () => T | Promise<T>): Promise<T> {
  for (;;) {
    if (quitting) throw new Error('Narrative initialization stopped');
    try { return await work(); }
    catch (error) {
      if (quitting) throw error;
      log(`narrative ${stage} pending: ${(error as Error).message}; retrying in 5 s; owner controls remain active`);
      await new Promise<void>(resolve => {
        const done = () => { clearTimeout(timer); narrativeAbort.signal.removeEventListener('abort', done); resolve(); };
        const timer = setTimeout(done, 5000); narrativeAbort.signal.addEventListener('abort', done, { once: true });
      });
    }
  }
}
async function narrate(): Promise<void> {
if (quitting) return;
const policy = await retryStartup('policy', () => publicationPolicy(cfg.publish));
// The owner's pause and resume reach the runtime that holds the schedule: Hermes's own file under Hermes; under the
// orchestrator (another harness picked), its running daemon's door, which a write to the file would be lost under.
const onOrchestrator = runtime.native;
const scheduler = runtime.scheduler;
// Legacy `ended` markers are deliberately ignored: they included timer guesses.
const publication = activePublication = await retryStartup('enrollment', () => new PublicationStore({ configFile: configPath, localDirectory, stateFile, cacheFile: `${stateFile}.board.json`, publication: cfg.publication,
  account: cfg.account, apiBase: `${(cfg.platform ?? 'https://open-autonomy.org').replace(/\/$/, '')}/v1`, nativeRuntime: selectedRuntime, owner: ownerState }));
const saved = publication.runtime;
// The runtime's own maps: the store compares each change against them and applies it.
const checkpoints: Record<string, PublicationCheckpoint> = saved.published ??= {};
// A session whose source was rewritten continues on the platform as `<id>~<n>`: n per native session id.
const continuations: Record<string, number> = saved.continuations ??= {};
const platformKey = (id: string): string => (continuations[id] ? `${id}~${continuations[id]}` : id);
const nativeId = (key: string): string => key.replace(/~\d+$/, '');
// Each change is saved as itself when it happens: a session's checkpoint when it moves, its continuation when it begins.
function saveCheckpoint(pkey: string, checkpoint: PublicationCheckpoint): void { publication.saveRuntimeEntry('published', pkey, checkpoint); }
function continueSession(key: string): void { publishers.delete(key); publication.saveRuntimeEntry('continuations', key, (continuations[key] ?? 0) + 1); }

type Binding = { worker: { session_id?: string }; started_at?: string; ended_at?: string; end_reason?: string };
type Profile = { persona?: { text?: string }; worker?: { model?: string; harness?: string }; jobs: Record<string, { residue?: { name?: string } }>; bindings: Record<string, Binding>; residue?: { config?: { model?: { default?: string; provider?: string; base_url?: string } } } };
let profiles: Record<string, Profile> = {};
let bindings = new Map<string, Binding>();
let runs = new Map<string, HarnessRun>();
const jobNames = new Map<string, string>();
const descriptors = new Map<string, SessionDescriptor>();
const publishers = new Map<string, TranscriptPublisher>();
const publisherItems = new Map<string, string | undefined>();
const stopped = new Set<string>();
// The sessions a pass reconciles: those whose descriptor, transcript, card or native record changed since the last pass,
// or every session (the first pass, or a change every session reads). An unchanged session is not read again.
const sessionsDue = new Set<string>();
let allSessionsDue = true;
const isSeat = (d: SessionDescriptor): boolean => d.locator.harness === 'claude-code' && !!cfg.seats && !!d.cwd && `${resolve(d.cwd)}/`.startsWith(`${resolve(cfg.seats)}/`);
// Under the orchestrator a worker is a Claude Code or Codex session the orchestrator opened: a card's, in the card's
// workspace, or a job's, in its profile's folder under the home. (A Claude session elsewhere is a seat or not the install's.)
// The board's attempts on a session name its card. The board may resume a session in later attempts of the same card,
// so a session is one card's whatever its attempt count: its first attempt launched it (the association's evidence) and
// its latest that ran (attempts are in order; a resume that failed to spawn never ran) is the round it serves now or
// served last. A session several cards name is refused (SessionRefused): it alone stays unpublished, and every other
// session's publication goes on.
type BoardAttempt = NonNullable<BoardTask['attempts']>[number];
class SessionRefused extends Error {}
const ran = (attempt: BoardAttempt): boolean => attempt.status !== 'spawn_failed' && attempt.outcome !== 'spawn_failed';
// board() indexes the board's attempts by the session they name, in board order, and the workspaces its cards hold.
let attemptsBySession = new Map<string, Array<{ task: BoardTask; attempt: BoardAttempt }>>();
let cardWorkspaces = new Set<string>();
const attemptOf = (sessionId: string): { task: BoardTask; first: BoardAttempt; attempt: BoardAttempt } | undefined => {
  const matches = attemptsBySession.get(sessionId) ?? [];
  if (new Set(matches.map(match => `${match.task.board}\0${match.task.id}`)).size > 1) throw new SessionRefused(`Native session ${sessionId} has multiple positive task/attempt associations; publication remains pending`);
  const latest = [...matches].reverse().find(match => ran(match.attempt)) ?? matches.at(-1);
  return latest ? { task: latest.task, first: matches[0].attempt, attempt: latest.attempt } : undefined;
};
// A session whose end was published and that its card then resumed (a reopened card): an attempt that ran started after
// that end. The platform is append-only, so once its source has grown its later rounds continue as `<id>~<n>`.
const resumedAfter = (sessionId: string, endedAt: string): boolean => {
  const served = attemptOf(sessionId)?.attempt;
  return !!served?.started_at && ran(served) && Date.parse(served.started_at) > Date.parse(endedAt);
};
const cardAt = (cwd: string | null | undefined): boolean => !!cwd && cardWorkspaces.has(cwd);
const isWorker = (d: SessionDescriptor): boolean => onOrchestrator && (d.locator.harness === 'claude-code' || d.locator.harness === 'codex') && !isSeat(d)
  && (bindings.has(d.locator.session_id) || !!attemptOf(d.locator.session_id) || cardAt(d.cwd ?? d.workspace?.value) || (!!d.cwd && `${resolve(d.cwd)}/`.startsWith(`${resolve(home)}/`)));
const kindOf = (d: SessionDescriptor): 'run' | 'chat' => isSeat(d) || isWorker(d) || ['cron', 'heartbeat', 'task'].includes(d.trigger ?? '') ? 'run' : 'chat';
const sourceOf = (d: SessionDescriptor): string => isSeat(d) ? 'seat' : isWorker(d) ? (attemptOf(d.locator.session_id) || cardAt(d.cwd ?? d.workspace?.value) ? 'board' : 'worker') : d.recurrence ? jobNames.get(d.recurrence.job_id) ?? d.recurrence.job_id : d.trigger === 'task' ? 'board' : d.surface?.platform ?? kindOf(d);
function providerOf(name = 'default'): string | undefined {
  const model = profiles[name]?.residue?.config?.model;
  if (model?.base_url === '${OPEN_AUTONOMY_BASE_URL}' || model?.base_url?.replace(/\/$/, '') === baseUrl.replace(/\/$/, '')) return 'open-autonomy';
  return model?.provider === 'custom' ? undefined : model?.provider;
}
function completionOf(d: SessionDescriptor): RecordedCompletion | undefined {
  const native = runs.get(d.locator.session_id);
  if (native) return ['completed', 'failed', 'unknown'].includes(native.status) && native.finished_at
    ? { endedAt: native.finished_at, outcome: native.status === 'completed' ? 'done' : native.status === 'failed' ? 'failed' : undefined } : undefined;
  // A session's native end is authoritative even when its old cron fire has left
  // the bounded native run ledger. An absent outcome stays absent.
  // A worker the board launched ends with its card's last attempt that ran once the card is closed (done or cancelled),
  // when no resume follows. While the card is open an attempt's end is a pause: an end published then would cut off
  // every round the board resumes the session for.
  const served = isWorker(d) ? attemptOf(d.locator.session_id) : undefined;
  if (served && !served.task.closed) return undefined;
  const launched = served?.attempt;
  if (launched?.ended_at) return { endedAt: launched.ended_at, outcome: launched.outcome === 'completed' ? 'done' : ['crashed', 'failed', 'timed_out', 'spawn_failed'].includes(launched.outcome ?? '') ? 'failed' : undefined };
  const binding = bindings.get(d.locator.session_id);
  // A board-launched session never ends before its latest run started: an older binding's end is an earlier round's.
  if (binding?.ended_at && !(launched?.started_at && Date.parse(binding.ended_at) < Date.parse(launched.started_at)))
    return { endedAt: binding.ended_at, outcome: binding.end_reason === 'error' ? 'failed' : undefined };
  return undefined;
}
// Read native declarations on startup and source changes; never on an observation timer.
let nativeOk = false, declarations = '';
async function nativeState(): Promise<void> {
  if (nativeOk) return;
  nativeOk = false;
  const read = () => Promise.all([
    runtime.load(narrativeRead), runtime.runs(narrativeRead),
  ]);
  let result: Awaited<ReturnType<typeof read>>;
  try { result = await measureWork('pass', 'publisher.native-refresh', read); }
  catch (e) { if (!/No such file or directory/.test((e as Error).message)) throw e; await Bun.sleep(300); result = await measureWork('pass', 'publisher.native-refresh', read); }
  const [orchestration, history] = result;
  if (history.sources.some(s => s.state === 'unreadable')) throw new Error('Native run ledger unreadable');
  const next = orchestration.profiles as Record<string, Profile>;
  if (!next || !next.default) throw new Error('Native profile state unavailable');
  const priorBindings = bindings, priorRuns = runs, priorDeclarations = declarations;
  profiles = next;
  bindings = new Map(Object.values(profiles).flatMap(p => Object.values(p.bindings).filter(b => b.worker.session_id).map(b => [b.worker.session_id!, b] as const)));
  runs = new Map(history.runs.filter(r => r.session_id).map(r => [r.session_id!, r]));
  jobNames.clear();
  for (const profile of Object.values(profiles)) for (const [id, job] of Object.entries(profile.jobs)) jobNames.set(id, job.residue?.name ?? id);
  // A session's publication reads its own binding and run; every session's reads the profiles and job names.
  declarations = JSON.stringify(Object.entries(profiles).map(([name, { bindings: _bindings, ...profile }]) => [name, profile]));
  // The setup document reads the profiles' declarations (persona, model, jobs), so a change to them is a documents change too.
  if (declarations !== priorDeclarations) { allSessionsDue = true; documentsDirty = true; }
  else for (const [before, after] of [[priorBindings, bindings], [priorRuns, runs]] as Array<[Map<string, unknown>, Map<string, unknown>]>)
    for (const id of new Set([...before.keys(), ...after.keys()])) if (JSON.stringify(before.get(id)) !== JSON.stringify(after.get(id))) sessionsDue.add(id);
  nativeOk = true;
}
// A publication that failed waits before the next attempt, a minute after its first failure and twice as long after each
// failure since, up to half an hour. One timer per session carries its retry; a tick that
// shares the failing attempt adds neither a failure nor a timer.
const retryAt = new Map<string, number>(), failures = new Map<string, number>(), retryTimers = new Set<string>();
function retryLater(key: string, delay: number): void {
  if (retryTimers.has(key)) return;
  retryTimers.add(key);
  later(() => {
    retryTimers.delete(key);
    const wait = (retryAt.get(key) ?? 0) - Date.now();
    if (wait > 0) { retryLater(key, wait); return; }
    sessions(key);
  }, delay);
}
const sessionReaders = new Map<string, SupercodeHarnessClient>();
const transcripts = new TranscriptQueue(4,
  () => new HarnessClient({ command: reader[0], args: reader.slice(1), env: nativeEnvironment }),
  publishSession, (key, error) => { if (!quitting) log(`${key}: publication pending (${(error as Error).message})`); },
  reader => reader.close());
stopTranscripts = () => transcripts.close();
// A refused session is said once per reason, then skipped on every pass until the board stops refusing it.
const refused = new Map<string, string>();
function refuse(key: string, error: SessionRefused): void {
  if (refused.get(key) !== error.message) log(`${key}: not published (${error.message})`);
  refused.set(key, error.message);
}
function sessions(only?: string): void {
  const keys = only !== undefined ? [only] : allSessionsDue ? [...descriptors.keys()] : [...sessionsDue];
  if (only === undefined) { allSessionsDue = false; sessionsDue.clear(); }
  for (const [at, key] of keys.entries()) {
    if (quitting) return;
    const d = descriptors.get(key);
    if (!d) continue;
    try {
      if (!runtime.accepts(d, isWorker(d), isSeat(d)) || !publishes(policy, d, kindOf(d), d.recurrence ? jobNames.get(d.recurrence.job_id) : undefined)) continue;
      // Published to its end: nothing to read, nothing to send, unless its card has since resumed it (a reopened card).
      // That resume is checked against the source when its publication runs (publishSession).
      const ended = checkpoints[platformKey(key)]?.endedAt;
      if (ended && resumedAfter(key, ended)) stopped.delete(key); else if (ended) stopped.add(key);
    } catch (error) {
      if (error instanceof SessionRefused) { refuse(key, error); continue; }
      // A pass that fails here leaves this session and every one after it due for the next pass.
      if (only === undefined) for (const left of keys.slice(at)) sessionsDue.add(left);
      throw error;
    }
    refused.delete(key);
    if (stopped.has(key)) continue;
    if ((retryAt.get(key) ?? 0) > Date.now()) continue;
    transcripts.enqueue(key);
  }
}
// The source message count at which a resume's source held no more turns than its published end, so an unchanged
// source is not read again on the next pass.
const resumeChecked = new Map<string, number>();
async function grownPast(key: string, d: SessionDescriptor, reader: SupercodeHarnessClient, seq: number): Promise<boolean> {
  const read = { signal: narrativeAbort.signal, timeoutMs: 0 };
  const messages = (await reader.loadWindow(d.locator, { message_tail: 1, inline_media: 'metadata' }, read)).window.total_messages;
  if (resumeChecked.get(key) === messages) return false;
  let turns = 0;
  for (let offset = 0; ;) {
    const page = await reader.loadWindow(d.locator, { message_limit: 500, inline_media: 'metadata', message_offset: offset }, read);
    turns += page.session.messages.reduce((n, m) => n + turnsOf(m, d.locator.harness).length, 0);
    if (turns > seq) { resumeChecked.delete(key); return true; }
    offset += page.window.returned;
    if (!page.window.has_newer || !page.window.returned) break;
  }
  resumeChecked.set(key, messages);
  return false;
}
async function publishSession(key: string, reader: SupercodeHarnessClient): Promise<void> {
  const d = descriptors.get(key);
  if (quitting || !d || stopped.has(key) || (retryAt.get(key) ?? 0) > Date.now()) return;
  try {
    if (!runtime.accepts(d, isWorker(d), isSeat(d)) || !publishes(policy, d, kindOf(d), d.recurrence ? jobNames.get(d.recurrence.job_id) : undefined)) return;
  } catch (error) { if (error instanceof SessionRefused) { refuse(key, error); return; } throw error; }
  sessionReaders.set(key, reader);
  try {
    // A session published to its end that its card resumed continues as `<id>~<n>` only once its source holds more
    // turns than that end published. A resume that never ran or an older end the board outlived adds nothing to it.
    const published = checkpoints[platformKey(key)];
    if (published?.endedAt) {
      if (!await grownPast(key, d, reader, published.seq)) return;
      continueSession(key);
      log(`${key}: resumed after its published end; continues as ${platformKey(key)}`);
    }
    const pkey = platformKey(key);
    const exactAttempt = attemptOf(key);
    const launched = exactAttempt?.task;
    const candidates = launched ? [launched] : (organization ? boardTasksAll : nativeTasks).filter(t => t.workspace?.path && t.workspace.path === (d.cwd ?? d.workspace?.value));
    if (organization && (candidates.length === 1 ? !ours(candidates[0].tags?.[0] ?? candidates[0].tenant) : Boolean(tenant))) {
      if (publishers.has(key) || checkpoints[pkey]) throw new Error(`Native session ${key} tenant attribution changed; its retained account/key is not reassigned`);
      return;
    }
    const candidate = (launched || d.trigger === 'task' || isSeat(d) || isWorker(d)) && candidates.length === 1 ? candidates[0] : undefined;
    const association = candidate ? publication.association(candidate.board, candidate.id) : undefined;
    const item = await publication.run(() => publication.sessionItem({ platformKey: pkey, nativeSessionId: key, associationKey: association?.key, itemId: association?.itemId,
      evidence: exactAttempt ? `native-attempt:${exactAttempt.first.id}` : candidate ? `workspace:${d.cwd ?? d.workspace?.value ?? ''}` : 'unknown' }, oa));
    const completion = completionOf(d);
    let publisher = publishers.get(key);
    if (!publisher || publisherItems.get(key) !== item) {
      publisher = new TranscriptPublisher({ loadWindow: (locator, options) => sessionReaders.get(key)!.loadWindow(locator, options, { signal: narrativeAbort.signal, timeoutMs: 0 }) }, oa, cfg.account, d, { key: pkey, kind: kindOf(d), source: sourceOf(d), title: d.title ?? undefined, harness: d.locator.harness,
        modelProvider: isSeat(d) ? 'claude-code' : providerOf(d.profile), startedAt: bindings.get(key)?.started_at ?? undefined, item }, checkpoints[pkey], checkpoint => saveCheckpoint(pkey, checkpoint));
      publishers.set(key, publisher);
      publisherItems.set(key, item);
    }
    const receipt = await publisher.publish(completion);
    retryAt.delete(key); failures.delete(key);
    if (receipt.endedAt) { stopped.add(key); log(`${key}: native completion published`); }
  } catch (e) {
    if (e instanceof SessionRefused) { refuse(key, e); return; }
    if (e instanceof SourceRewritten) { continueSession(key); log(`${key}: source rewritten; continues as ${platformKey(key)}`); sessionsDue.add(key); requestTick(); return; }
    // A publication its own stop cut short is not a failure: this reporter retries nothing, and its successor reads the
    // retained intent afresh (a kit handover's retiring stack aborted every publication in flight, said as failures).
    if (quitting) { log(`${key}: publication not finished: the reporter is stopping; its intent is retained`); return; }
    if ((retryAt.get(key) ?? 0) > Date.now()) return; // this attempt's failure is already counted and its retry armed
    const failed = (failures.get(key) ?? 0) + 1, delay = Math.min(60_000 * 2 ** (failed - 1), 30 * 60_000);
    failures.set(key, failed); retryAt.set(key, Date.now() + delay); retryLater(key, delay);
    log(`${key}: publication incomplete (${(e as Error).message}); failure ${failed}, next attempt in ${delay / 60_000} min`);
  } finally { sessionReaders.delete(key); }
}

// The timeline, published through the SDK as one document in one language: the past from CHANGELOG.md, the
// present from the board (through Volter Harness's workflow layer) with the sessions serving it, the future from
// ROADMAP.md. Unifying the three is this reporter's job; the platform reads no file and knows no board.
// Every board task is an item — its id, its title, its lane as the status, the `- ` lines of its body as the
// acceptance; its attempts are the sessions serving the item, and a review's verdict or an attempt's handoff is a
// progress note on it, published once.
type BoardTask = { id: string; board: string; title?: string; body?: string; tenant?: string; tags?: string[]; workspace?: { kind: string; path?: string; branch?: string }; assignee?: string; lane: string; closed?: boolean; priority?: number; created_at?: string; completed_at?: string; attempts?: Array<{ id: string; profile?: string; status: string; started_at?: string; ended_at?: string; outcome?: string; session?: { id?: string; session_id?: string }; handoff?: { summary?: string; metadata?: { branch?: string; commit?: string } } }>; reviews?: Array<{ id: string | number; verdict: string; by?: string; reason?: string; at?: string }> };
// The lanes as the status words: done; running or review is active; blocked or parked (scheduled) waits on a
// decision, so proposed; the rest is planned. A done task is the past; every other lane is the present.
const statusOf = (lane: string): RoadmapItem['status'] => (lane === 'done' ? 'done' : lane === 'running' || lane === 'review' ? 'active' : lane === 'blocked' || lane === 'scheduled' ? 'proposed' : 'planned');
const defined = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
const dedupe = (links: Link[]): Link[] | undefined => { const m = new Map<string, Link>(); for (const l of links) if (!m.has(l.url)) m.set(l.url, l); return m.size ? [...m.values()] : undefined; };
// A task's proof is the commit recorded in its native handoff metadata.
function commitOf(t: BoardTask): string | undefined {
  const value = [...(t.attempts ?? [])].reverse().find(a => a.handoff?.metadata?.commit)?.handoff?.metadata?.commit;
  return value && /^[0-9a-f]{7,40}$/.test(value) ? value : undefined;
}
let nativeTasks: BoardTask[] = [];
// Every task on the board, whoever publishes it: a session is routed by the card it serves.
let boardTasksAll: BoardTask[] = [];
let timelineDigest = '', timelineBounded = -1, timelineContent = '', timelineDue = false;
let timelineTimer: ReturnType<typeof setTimeout> | undefined;
// An unchanged card keeps its view (publication.observedCards), so it keeps its task, its item and the knowledge that its
// notes are published: a board change costs the cards it changed.
const taskOf = new WeakMap<object, BoardTask>(), itemOf = new WeakMap<BoardTask, RoadmapItem>(), notedTasks = new WeakSet<BoardTask>();
async function board(): Promise<RoadmapItem[] | undefined> {
  // This app's cache is rebuilt only from the retained source stream. An organization's board has no root profile's
  // tasks: every card is a profile's (docs/decisions/0017), and a project's reporter publishes its tenant's.
  const previous = boardTasksAll;
  boardTasksAll = [...publication.observedCards().values()].map((t) => {
    let task = taskOf.get(t);
    if (!task) taskOf.set(t, task = { ...t, lane: t.archived ? 'archived' : t.status,
      // A done or cancelled card resumes no session. The board normalizes a cancelled card's status to todo; its raw lane keeps it.
      closed: t.status === 'done' || t.lane === 'cancelled' || t.board_status === 'cancelled' } as BoardTask);
    return task;
  })
    .filter((t) => t.lane !== 'archived' && (organization || (t.assignee ?? 'default') === 'default'))
    .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '') || a.id.localeCompare(b.id));
  attemptsBySession = new Map(); cardWorkspaces = new Set();
  for (const task of boardTasksAll) {
    if (task.workspace?.path) cardWorkspaces.add(task.workspace.path);
    for (const attempt of task.attempts ?? []) {
      const id = attempt.session?.session_id ?? attempt.session?.id;
      if (id) { const named = attemptsBySession.get(id); if (named) named.push({ task, attempt }); else attemptsBySession.set(id, [{ task, attempt }]); }
    }
  }
  // A session is due when a card that names it, or holds its workspace, changed, arrived or left.
  const before = new Set(previous), after = new Set(boardTasksAll), workspaces = new Set<string>();
  for (const task of [...boardTasksAll.filter(t => !before.has(t)), ...previous.filter(t => !after.has(t))]) {
    if (task.workspace?.path) workspaces.add(task.workspace.path);
    for (const attempt of task.attempts ?? []) { const id = attempt.session?.session_id ?? attempt.session?.id; if (id) sessionsDue.add(id); }
  }
  if (workspaces.size) for (const [key, d] of descriptors) if (workspaces.has((d.cwd ?? d.workspace?.value) as string)) sessionsDue.add(key);
  const tasks = organization ? boardTasksAll.filter(shown) : boardTasksAll;
  nativeTasks = tasks;
  const items: RoadmapItem[] = tasks.map((t) => {
    const cached = itemOf.get(t);
    if (cached) return cached;
    const attempts = t.attempts ?? [];
    const first = attempts.find((a) => a.started_at);
    const last = [...attempts].reverse().find((a) => a.handoff) ?? attempts[attempts.length - 1];
    const item = defined({
      id: publication.item(t.board, t.id), title: t.title ?? t.id, tense: t.lane === 'done' ? 'past' : 'present', status: statusOf(t.lane), home: 'kanban', phase: /<!-- roadmap:([A-Za-z0-9][A-Za-z0-9._-]{0,79}):/.exec(t.body ?? '')?.[1],
      priority: t.priority !== undefined ? String(t.priority) : undefined, proposed_at: t.created_at, started_at: first?.started_at, done_at: t.lane === 'done' ? t.completed_at ?? last?.ended_at : undefined,
      by: last?.profile, commit: commitOf(t),
      links: dedupe([...linksIn(t.body ?? ''), ...(last?.handoff?.metadata?.branch ? [linkOf(`https://github.com/${cfg.account}/tree/${last.handoff.metadata!.branch}`, last.handoff.metadata!.branch)] : [])]),
      acceptance: (t.body ?? '').split('\n').filter((l) => /^- /.test(l)).map((l) => l.slice(2).trim()),
    }) as RoadmapItem;
    itemOf.set(t, item);
    return item;
  });
  // The board's lane is the item's status and its attempts are the item's sessions; what the timeline cannot say, a
  // review's verdict and an attempt's handoff, is a progress note on the item, published once each: the note's key is the
  // update's identity on the platform, so a retry after a lost acknowledgement, or a restart, lands on the same record.
  for (const t of tasks) {
    if (notedTasks.has(t)) continue;
    const notes: Array<{ key: string; kind: 'review' | 'handoff'; effectId: string | number; text: string; at?: string }> = [];
    // A review's position in the board's append-only list keeps two rounds with the same verdict apart when the harness stamps no time.
    (t.reviews ?? []).forEach((r, i) => notes.push({ key: `${t.id}:review:${i}:${r.at ?? ''}:${r.verdict}`, kind: 'review', effectId: r.id, text: `review ${r.verdict}${r.by ? ` by ${r.by}` : ''}${r.reason ? `: ${r.reason}` : ''}`, at: r.at }));
    for (const a of t.attempts ?? []) if (a.handoff?.summary) notes.push({ key: `${t.id}:handoff:${a.id}`, kind: 'handoff', effectId: a.id, text: `handoff (attempt ${a.id}${a.profile ? `, ${a.profile}` : ''}): ${a.handoff.summary}`, at: a.ended_at });
    for (const n of notes) {
      try { await publication.note({ board: t.board, cardId: t.id, kind: n.kind, effectId: n.effectId, text: n.text, at: n.at, legacyKey: n.key }, oa); }
      catch (e) { throw new Error(`board note pending for ${t.id}: ${(e as Error).message}`); }
    }
    notedTasks.add(t);
  }
  return items;
}
// The past, from CHANGELOG.md as the PM keeps it: a `## ` heading per release (`Unreleased` first; a released
// heading carries its date), a `- ` line per change. A line is an item whose id is a hash of its own words,
// so an unchanged line keeps its identity across revisions; a commit or a PR named in the line is its proof.
const plain = (md: string): string => md.replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/`/g, '').replace(/\s+/g, ' ').trim();
const clipWords = (s: string, n: number): string => (s.length <= n ? s : `${s.slice(0, n - 1).replace(/\s+\S*$/, '')}…`);
function changelogItems(md: string | undefined, account: string): RoadmapItem[] {
  const out: RoadmapItem[] = [];
  if (!md) return out;
  const seen = new Set<string>();
  let release: string | undefined;
  let date: string | undefined;
  for (const line of md.split('\n')) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) {
      const head = h[1].replace(/^\[|\]$/g, '').trim();
      if (/^unreleased$/i.test(head)) { release = 'unreleased'; date = undefined; continue; }
      const d = /(\d{4}-\d{2}-\d{2})/.exec(head);
      date = d ? `${d[1]}T00:00:00Z` : undefined;
      release = plain(head.replace(/\s*[—–-]+\s*\d{4}-\d{2}-\d{2}.*$/, '')).slice(0, 80) || 'released';
      continue;
    }
    const b = release !== undefined && /^\s*[-*]\s+(.+?)\s*$/.exec(line);
    if (!b) continue;
    const text = b[1];
    let id = `shipped-${createHash('sha1').update(text).digest('hex').slice(0, 10)}`;
    while (seen.has(id)) id = `${id}-`;
    seen.add(id);
    const commit = /\b(?=[0-9a-f]*\d)([0-9a-f]{7,40})\b/.exec(text)?.[1];
    // A bare `#N` is the project's own pull request unless the line already links a pull request by address.
    const named = linksIn(text);
    const links = dedupe([...named, ...(named.some((l) => l.kind === 'github-pr') ? [] : [...text.matchAll(/(?:PR\s*)?#(\d+)\b/g)].map((m) => linkOf(`https://github.com/${account}/pull/${m[1]}`, `#${m[1]}`)))]);
    out.push(defined({ id, title: clipWords(plain(text), 200), tense: 'past', status: 'done', home: 'changelog', release, done_at: date, commit, links, acceptance: [] }) as RoadmapItem);
  }
  return out;
}
// The future, from ROADMAP.md as the PM keeps it: a `## <id>: <title>` section per intention; its `Status:` line
// (planned, else proposed), its `Target version:` as the release, its `Completion:` bullets as the acceptance.
function roadmapItems(md: string | undefined): RoadmapItem[] {
  const out: RoadmapItem[] = [];
  if (!md) return out;
  const seen = new Set<string>();
  let cur: { item: RoadmapItem; bullets: string[]; completion: string[]; inCompletion: boolean; text: string[] } | undefined;
  const close = () => { if (!cur) return; cur.item.acceptance = cur.completion.length ? cur.completion : cur.bullets; cur.item.links = dedupe(linksIn(cur.text.join('\n'))); out.push(defined(cur.item) as RoadmapItem); cur = undefined; };
  for (const line of md.split('\n')) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) {
      close();
      // Only a `## <id>: <title>` section is an intention; a section without an id is the file's own prose.
      const m = /^([A-Za-z0-9][A-Za-z0-9._-]{0,79}):\s+(.+)$/.exec(h[1]);
      if (!m) continue;
      let id = m[1];
      while (seen.has(id)) id = `${id}-`;
      seen.add(id);
      cur = { item: { id, title: clipWords(plain(m[2]), 200), tense: 'future', status: 'proposed', home: 'roadmap', acceptance: [] }, bullets: [], completion: [], inCompletion: false, text: [] };
      continue;
    }
    if (!cur) continue;
    cur.text.push(line);
    const kv = /^([A-Za-z][A-Za-z ]{0,30}):\s*(.*)$/.exec(line);
    if (kv) {
      const key = kv[1].toLowerCase();
      const val = kv[2].trim();
      cur.inCompletion = key === 'completion';
      if (key === 'status') cur.item.status = /^(planned|active)\b/i.test(val) ? (val.toLowerCase().startsWith('active') ? 'active' : 'planned') : 'proposed';
      if (key === 'target version' && val) cur.item.release = plain(val).slice(0, 80);
      if (key === 'target window' && /\d{4}-\d{2}-\d{2}/.test(val)) cur.item.proposed_at ??= `${/(\d{4}-\d{2}-\d{2})/.exec(val)![1]}T00:00:00Z`;
      continue;
    }
    const b = /^\s*[-*]\s+(.+?)\s*$/.exec(line);
    if (b) { (cur.inCompletion ? cur.completion : cur.bullets).push(clipWords(plain(b[1]), 1000)); continue; }
    if (line.trim() === '') cur.inCompletion = false;
  }
  close();
  return out;
}
// One intention is one item across its tenses. A task carries the roadmap section it serves (the scrum's marker,
// kept above in `phase` until folded here): that section is no longer the future, and the task takes its release
// and, when it has none of its own, its acceptance. A changelog line that names a done task's commit or id is that
// task shipped: the task keeps its receipts and takes the line's release and record; the line is not a second item.
function fold(tasks: RoadmapItem[], shipped: RoadmapItem[], intentions: RoadmapItem[]): RoadmapItem[] {
  const served = new Map<string, RoadmapItem>(intentions.map((i) => [i.id, i]));
  const items: RoadmapItem[] = [];
  const folded = new Set<string>();
  for (const t of tasks) {
    const section = t.phase ? served.get(t.phase) : undefined;
    const { phase: _section, ...rest } = t;
    const item: RoadmapItem = { ...rest };
    if (section) {
      folded.add(section.id);
      if (section.release && !item.release) item.release = section.release;
      if (!item.acceptance.length) item.acceptance = section.acceptance;
      item.links = dedupe([...(item.links ?? []), ...(section.links ?? [])]);
    }
    if (t.tense === 'past') {
      const sameCommit = (a?: string, b?: string) => !!a && !!b && (a.startsWith(b) || b.startsWith(a));
      // The line that shipped this task: it names the task, or the intention the task served (an engagement's ticket key),
      // or the same commit, or the project's own pull request for it.
      const line = shipped.find((l) => l.title.includes(t.id) || (!!t.phase && l.title.includes(t.phase)) || sameCommit(l.commit, t.commit));
      if (line) { folded.add(line.id); if (line.release) item.release = line.release; item.links = dedupe([...(item.links ?? []), ...(line.links ?? [])]); item.commit ??= line.commit; item.done_at ??= line.done_at; }
    }
    items.push(item);
  }
  const ids = new Set(items.map((i) => i.id));
  for (const it of [...shipped, ...intentions]) if (!folded.has(it.id) && !ids.has(it.id)) { ids.add(it.id); items.push(it); }
  return items;
}
// Repository-owned planning and constitution are read only from the committed main
// snapshot. A failed Git read never substitutes an agent's working tree.
let mainRevision = '';
async function refreshMain(): Promise<void> {
  const fetch = await run(['git', '-C', projectDir, 'fetch', '-q', 'origin', 'main']);
  if (fetch.exitCode !== 0 || fetch.exitedDueToTimeout) {
    const why = fetch.exitedDueToTimeout ? 'git fetch passed its 20 s limit' : fetch.stderr.trim().slice(-300) || `git fetch exited ${fetch.exitCode}`;
    throw new Error(`Cannot refresh committed project documents: ${why}`);
  }
  const rev = await run(['git', '-C', projectDir, 'rev-parse', 'origin/main']);
  if (rev.exitCode !== 0 || rev.exitedDueToTimeout) throw new Error('Committed main unavailable');
  mainRevision = rev.stdout.toString().trim();
}
// A document the project keeps is read from committed main; one it does not keep is simply absent (an organization
// keeps no changelog; a project may keep no constitution yet). Any other failure to read is an error, never silence.
async function mainFile(name: string): Promise<string | undefined> {
  if (!mainRevision) return undefined;
  const exists = await run(['git', '-C', projectDir, 'cat-file', '-e', `${mainRevision}:${name}`]);
  if (exists.exitedDueToTimeout) throw new Error(`Committed ${name} lookup passed its 20 s limit`);
  if (exists.exitCode !== 0) return undefined;
  const r = await run(['git', '-C', projectDir, 'show', `${mainRevision}:${name}`]);
  if (r.exitCode !== 0 || r.exitedDueToTimeout) throw new Error(`Cannot read committed ${name}`);
  return r.stdout.toString();
}
// `timeline: none` in the config: the project's own driver (or, for an organization, its projects) owns the timeline;
// the reporter publishes sessions, setup and documents only.
async function timeline(present: RoadmapItem[] | undefined): Promise<void> {
  if (cfg.timeline === 'none') return;
  if (!present) return;
  const items = organization ? present : fold(present, changelogItems(await mainFile('CHANGELOG.md'), cfg.account), roadmapItems(await mainFile('ROADMAP.md')));
  const digest = JSON.stringify(items);
  if (digest === timelineDigest && !timelineDue) return;
  timelineDue = false;
  const bounded = timelineWindow(items);
  if (bounded.length < items.length && bounded.length !== timelineBounded) log(`timeline: ${bounded.length} of ${items.length} items (every present and future item, then the most recently done that fit)`);
  timelineBounded = bounded.length;
  // What the platform would store: the window as normalized. A board change outside the window, or one normalization
  // drops, is no change to the timeline and writes nothing.
  const content = JSON.stringify(normalizeRoadmap({ schema: ROADMAP_SCHEMA, items: bounded }));
  if (content === timelineContent) { timelineDigest = digest; return; }
  // Each revision is the whole window again (about 900 kB on the platform), and a busy board changes every minute or
  // so. A changed window waits until TIMELINE_INTERVAL has passed since the account's current revision, then the
  // latest window is written as one revision.
  const wait = publication.lastTimelineAt + TIMELINE_INTERVAL - Date.now();
  if (wait > 0) { timelineDigest = digest; timelineTimer ??= later(() => { timelineTimer = undefined; timelineDue = true; requestTick(); }, wait); return; }
  timelineDigest = ''; // a write that fails is tried again on the next pass
  await publication.timeline({ schema: ROADMAP_SCHEMA, items: bounded }, 'hermes', 'reporter', oa);
  timelineDigest = digest; timelineContent = content;
}
// An account holds one timeline, and the platform bounds it. normalizeRoadmap, which the SDK and the platform both apply,
// keeps at most 2000 items, and the publication refuses a timeline it would cut (publication.ts). The platform stores a
// revision (the roadmap and its changes) as one Durable Object value, whose size is bounded, so the roadmap is held
// under 900 kB. That value's bound is the storage's documented limit, not one measured here. A board larger than either
// bound publishes every present and future item, then its past from the most recently done back as far as fits; older
// past items stay on the board but not on the account's timeline.
const TIMELINE_ITEMS = 2000, TIMELINE_BYTES = 900_000;
const TIMELINE_INTERVAL = 10 * 60_000;
function timelineWindow(items: RoadmapItem[]): RoadmapItem[] {
  const kept = new Set<RoadmapItem>();
  let bytes = 0;
  const fits = (item: RoadmapItem): boolean => {
    const size = JSON.stringify(normalizeRoadmap({ schema: ROADMAP_SCHEMA, items: [item] })?.items[0] ?? item).length + 1;
    if (kept.size >= TIMELINE_ITEMS || bytes + size > TIMELINE_BYTES) return false;
    kept.add(item); bytes += size;
    return true;
  };
  for (const item of items) if (item.tense !== 'past' && !fits(item)) throw new Error(`Timeline present and future exceed the platform's bound (${TIMELINE_ITEMS} items, ${TIMELINE_BYTES} bytes); publication remains pending`);
  for (const item of items.filter((i) => i.tense === 'past').sort((a, b) => itemTime(b) - itemTime(a))) if (!fits(item)) break;
  return items.filter((item) => kept.has(item));
}
let docsDigest = '', setupDigest = '';
// The project's "about" is the committed document its config names (`about: <path>`); with none named there is none.
async function docs(): Promise<void> {
  // A project's reporter publishes its cards and sessions; its page's documents are its own repository's.
  if (tenant) return;
  const d = { about_md: typeof cfg.about === 'string' && cfg.about ? await mainFile(cfg.about) : undefined };
  // No document named (or none committed): nothing to publish. The platform refuses an empty one (invalid_docs).
  if (d.about_md === undefined) return;
  const digest = JSON.stringify(d);
  if(digest!==docsDigest){const result=await oa.docs(d);if(!result.ok)throw new Error(`Document publication refused: ${result.status}`);docsDigest=digest;}
}
async function setup(): Promise<void> {
  if (tenant) return;
  const [jobs, skills, inventory] = await Promise.all([
    runtime.jobs(narrativeRead), runtime.skills(narrativeRead), runtime.profiles(narrativeRead),
  ]);
  if (jobs.sources.some(s => s.state === 'unreadable')) throw new Error('Native schedule unreadable');
  const s = { harness: onOrchestrator ? profiles.default.worker?.harness ?? 'orchestrator' : 'hermes', persona: profiles.default.persona?.text, model: inventory.find(p => p.name === 'default')?.model ?? undefined,
    provider: providerOf(), schedule: jobs.jobs.map(j => ({ name: jobNames.get(j.id) ?? j.id, schedule: j.enabled ? j.schedule.display : `${j.schedule.display} (${j.state})`, description: j.payload.text ?? undefined })),
    skills: [...new Set(skills.filter(s => s.enabled !== false).map(s => s.name))].sort(), setup_md: await mainFile(onOrchestrator ? 'home/README.md' : 'hermes/README.md'), ...(runtimeFacts ? { runtime: { ...runtimeFacts, native: selectedRuntime.kind } } : {}) };
  const digest = JSON.stringify(s);
  if(digest!==setupDigest){const result=await oa.setup(s);if(!result.ok)throw new Error(`Setup publication refused: ${result.status}`);setupDigest=digest;}
}
// A pass publishes what changed since the last one: native declarations when a source change invalidated them, the board
// when a delivery changed it, the sessions whose inputs changed (sessions()), the documents when committed main may have
// moved, and the timeline when the board, a project's committed main or the revision interval did. Passes run one at a
// time through the publication writer. A change marks what it touched and asks for a pass (requestTick); every change
// that arrives before that pass starts folds into it, and the pass starts once its burst has settled: SETTLE after the
// latest change, and never later than SETTLE_MAX after the first. A board delivery runs its own pass at once, folding
// whatever else is pending, and acknowledges its cursor after it. SETTLE_MAX is the five seconds the board poll this
// replaced ran at.
const SETTLE = 1000, SETTLE_MAX = 5000;
let dirty=false, boardDirty=true, documentsDirty=true, timelineStale=false, boardReady=false, queued=false;
let boardItems: RoadmapItem[] | undefined;
let settle: ReturnType<typeof setTimeout> | undefined, burstAt = 0;
let passes = 0, passMs = 0;
const documentWatchers: Array<ReturnType<typeof watchFiles>>=[];
stopNarrative = () => { configWatch.close(); clearTimeout(retry); for (const watcher of documentWatchers) watcher.close(); };
async function pass(): Promise<void> {
  dirty = false;
  const began = performance.now();
  try {
    await measureWork('pass', 'publisher.pass', async () => {
      await nativeState();
      if (boardDirty) { boardItems = await measureWork('pass', 'publisher.board-refresh', board); boardDirty = false; timelineStale = true; }
      sessions();
      if (documentsDirty) {
        const revision = mainRevision;
        await refreshMain();
        // A project's timeline folds main's CHANGELOG.md and ROADMAP.md into the board (timeline()), so a moved main is a
        // timeline change too; an organization's timeline is its board alone.
        if (!organization && mainRevision !== revision) timelineStale = true;
        await docs(); await setup(); documentsDirty = false;
      }
      if (timelineStale || timelineDue) { await timeline(boardItems); timelineStale = false; }
    });
  } catch (error) { dirty = true; throw error; }
  finally { passes++; passMs += performance.now() - began; }
}
function flush(): void {
  settle = undefined;
  if (queued || quitting) return;
  queued = true;
  void publication.run(async () => { queued = false; if (dirty && !quitting) await pass(); }).catch(error => {
    queued = false;
    if (quitting) return;
    log(`publication pending (${error.message}); retaining acknowledgement`);
    clearTimeout(retry); if (retry) narrativeTimers.delete(retry); retry = later(requestTick, 5000);
  });
}
let retry: ReturnType<typeof setTimeout>|undefined;
function requestTick(): void {
  recordWork('pass', 'publisher.wakeup');
  dirty = true;
  if (quitting || !boardReady) return;
  const now = Date.now();
  if (settle) { clearTimeout(settle); narrativeTimers.delete(settle); } else burstAt = now;
  settle = later(flush, Math.max(0, Math.min(SETTLE, burstAt + SETTLE_MAX - now)));
}
// The session index is how a session's change reaches the publisher. A transcript that grows or is rewritten changes its
// descriptor (a Claude Code or Codex row's updated_at_ms, a Hermes row's message_count), so the index says it `updated`,
// and that session alone is due. No session is followed as well: a follow opened one more subscription per live session
// on the shared reader, each opening read its source in the reader's one harness serve, and a backlog of them (follow
// opens past their 30 s timeout, reopened every 5 s while the serve still worked the abandoned ones) filled the reader's
// subscription cap and the serve's waiting callers, which then refused every pass its native reads. A session that
// appeared or left can change the declarations and documents.
sc.on('sessionIndexEvent', ev => {
  if(quitting)return;
  if ('error' in ev) { log(`index unavailable: ${ev.error.message}`); return; }
  let membership = false;
  for (const c of ev.changes) if (c.kind === 'removed') { descriptors.delete(c.key.session_id); membership = true; } else {
    descriptors.set(c.descriptor.locator.session_id, c.descriptor);
    stopped.delete(c.descriptor.locator.session_id);
    sessionsDue.add(c.descriptor.locator.session_id);
    if (c.kind === 'added') membership = true;
  }
  nativeOk=false; if (membership) documentsDirty=true; requestTick();
});
const eventCommand=container
  ? ['supercode-orchestrator','workflow','events','--root',home,'--json']
  // The orchestrator the start runs (a review World's branch build), else the machine's.
  : [machineNode(),orchestratorEntry(),'workflow','events','--root',home,'--json'];
const source=activeSource=await retryStartup('source cache',()=>new BoardEventSource({command:container?inContainer(eventCommand):eventCommand,
  stateFile:`${stateFile}.board.json`,env:nativeEnvironment,
  sourceContextId:publication.sourceContextId,storeContext:board=>publication.storeContext(board),allowLegacyUpgrade:publication.legacyAdopted,forceSnapshot:publication.requiresSnapshot,
  changed:snapshot=>publication.run(async()=>{publication.observe(snapshot);boardReady=true;nativeOk=false;boardDirty=true;await publication.retry(oa);await pass();publication.snapshotAcknowledged();}),log}));

// Each profile of the home keeps its own Hermes store, and discovery reads one store per query: the root's, then each
// named profile's (its home from `listProfiles`). A profile's sessions carry its name, which `publish.private` may name.
const discovery = await retryStartup('profile discovery',()=>runtime.queries(cfg.seats,narrativeRead));
const named = discovery.profiles.filter(p => !p.default && p.home);
// The treasurer's sessions hold the cards it mints, so a home with a treasurer that `publish.private` does not name is
// refused rather than published: a project's config is its own, and an upgrade does not rewrite it.
await retryStartup('private profile policy',()=>{if (named.some(p => p.name === 'treasurer') && !policy.private.includes('treasurer')) throw new Error('publish.private in .open-autonomy/config.yaml must name treasurer: its sessions hold the cards it mints, and they would be published');});
// Under the orchestrator each profile's worker keeps its sessions in the profile's own config home, one folder per
// harness (`<profile>/claude-code`, `<profile>/codex`; the root profile's in the home itself), made at its first launch.
const queries = discovery.queries;
for (const query of queries) for (const d of (await retryStartup('session index subscription',()=>sc.subscribeSessionIndex(query,narrativeRead))).initial) descriptors.set(d.locator.session_id, d);
// Discovery and native state can be readable before historical delivery finishes.
// Historical publication may take minutes; replay is not a readiness condition. A ledger still being written by the
// gateway that just drained (a restart onto a moved main) reads as unreadable for a moment: that is a wait, not a death.
await retryStartup('native state',nativeState);
// Discovery has its own pagination; the retained live index is not all history.
for (const query of queries) {
  let cursor: string | undefined;
  do {
    const page = await retryStartup('session history page',()=>sc.discover({ ...query, cursor, limit: 500 },narrativeRead));
    for (const d of page.sessions) if (!descriptors.has(d.locator.session_id)) descriptors.set(d.locator.session_id, d);
    cursor = page.next_cursor ?? undefined;
  } while (cursor);
}
if (quitting) return;
await source.start();
for(const path of [resolve(projectDir,'.git')]){
  if(!existsSync(path))continue;
  try{const watcher=watchFiles(path,{recursive:true},(_event,name)=>{
      const file=String(name??'').replaceAll('\\','/');
      if(name!=null&&!['HEAD','packed-refs','refs/remotes/origin/main'].includes(file))return;
      documentsDirty=true;requestTick();
    });watcher.on('error',error=>log(`document watch unavailable: ${error.message}`));documentWatchers.push(watcher);}
  catch(error){log(`document watch unavailable: ${(error as Error).message}`);}
}

log(`watching ${home} for ${cfg.account}`);
// Every ten minutes, what transcript reconciliation read from the sources and what the publisher holds per session.
const readings = (): void => {
  const v = takeReadVolume();
  log(`last 10 min: ${passes} passes (${(passMs / 1000).toFixed(1)} s), ${v.reconciled} transcripts reconciled (${v.windows} source windows, ${v.messages} messages), ${v.unchanged} unchanged; holding ${descriptors.size} sessions, ${publishers.size} transcript publishers, ${retryTimers.size} awaiting retry`);
  passes = 0; passMs = 0;
  later(readings, 600_000);
};
later(readings, 600_000);

}
