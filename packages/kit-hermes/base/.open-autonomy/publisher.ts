#!/usr/bin/env bun
// Volter Harness SDK in, Open Autonomy SDK out. Native state belongs to Volter Harness;
// publication policy, repository documents and acknowledged delivery belong here.
// Projection contract for this adapter (not a second native execution model):
// - source-events.ts caches cards by <board>:<card.id>; timeline items retain card.id.
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
// - completionOf maps recorded completed/failed runs, ended attempts and bindings;
//   absent verdicts stay absent. reporting.ts may close an old OA transcript projection
//   on detected source rewrite and continue <native-id>~<n>; that boundary is not native
//   task completion. Silence and source disappearance supply no completion evidence.
// - Review notes use <card.id>:review:<index>:<time>:<verdict>; handoff notes use
//   <card.id>:handoff:<attempt.id>. Acknowledged update IDs are persisted in noted.
//   Full attempt topology, native control records and source-only fields are not exported.
//   reporting.ts also applies audience exclusions, selects supported text/tool turns,
//   clips content and omits reconstructed Hermes messages without a stored native row.
// - Transcript receipts are separate persisted seq/digest/end checkpoints, verified
//   against source windows and the server's retained tail. Session failures retry separately;
//   a saved board-source cursor does not attest that every transcript was delivered.
//   Native events/index/transcripts, OA publications and owner control have separate ordering.
import { existsSync, readdirSync, readFileSync, writeFileSync, renameSync, watch as watchFiles } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { SupercodeHarnessClient, type SessionDescriptor, type HarnessRun } from '@volter/supercode-harness-sdk';
import { ROADMAP_SCHEMA, linkOf, linksIn, type Link, type RoadmapItem } from './sdk/roadmap.ts';
import { OpenAutonomy } from './sdk/client.ts';
import { BoardEventSource } from './source-events.ts';
import { fileURLToPath } from 'node:url';
import { publicationPolicy, publishes, SourceRewritten, TranscriptPublisher, type PublicationCheckpoint, type RecordedCompletion } from './reporting.ts';

const arg = (name: string): string | undefined => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const configPath = resolve(arg('--config') ?? resolve(import.meta.dir, 'config.yaml'));
const cfg = Bun.YAML.parse(readFileSync(configPath, 'utf8')) as any;
if (!cfg || typeof cfg.account !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(cfg.account)) throw new Error('Reporter configuration must name the project account');
const policy = publicationPolicy(cfg.publish);
// An organization's install (docs/decisions/0017): one board for every project, each card tagged with its primary project
// (its tenant). A project's reporter (`tenant:` in the config the start writes for it) publishes that project's cards and
// their sessions under the project's account; the organization's reporter publishes the rest. Its timeline is the board:
// the future is the cards ahead, the past the done ones; no ROADMAP.md or CHANGELOG.md is read.
const organization = Array.isArray(cfg.organization?.projects);
const tenant: string | undefined = typeof cfg.tenant === 'string' ? cfg.tenant : undefined;
const elsewhere = (process.env.OPEN_AUTONOMY_PROJECT_REPORTERS ?? '').split(',').filter(Boolean);
const tagIs = (tag: string | undefined, account: string): boolean => !!tag && (tag === account || tag === account.split('/')[1]);
const ours = (tag: string | undefined): boolean => (tenant ? tagIs(tag, tenant) : !elsewhere.some((a) => tagIs(tag, a)));
// A card's tags are ordered (its tenant is the first): it shows in every project it is tagged with, and in the
// organization's view when it is tagged with none. Its sessions, and their usage, are its first tag's (`ours` on the tenant).
const shown = (t: { tenant?: string; tags?: string[] }): boolean => {
  const tags = t.tags?.length ? t.tags : [t.tenant];
  return tenant ? tags.some((tag) => tagIs(tag, tenant)) : !tags.some((tag) => elsewhere.some((a) => tagIs(tag, a)));
};
const home = cfg.hermes_home ?? process.env.HERMES_HOME;
if (typeof home !== 'string' || !home.startsWith('/')) throw new Error('Reporter requires the absolute Hermes home');
const container = arg('--container');
if (container && !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(container)) throw new Error('Invalid container');
if (container && cfg.seats) throw new Error('Host Claude seats require their own reporter');
const projectDir = arg('--project') ?? (container ? '/work/project' : resolve(dirname(configPath), '..'));
const stateFile = resolve(arg('--state-file') ?? resolve(dirname(configPath), cfg.state_file ?? 'reporter-state.json'));
const baseUrl = process.env.OPEN_AUTONOMY_BASE_URL ?? `${(cfg.platform ?? 'https://open-autonomy.org').replace(/\/$/, '')}/v1`;
const oa = new OpenAutonomy({ baseUrl, key: process.env.OPEN_AUTONOMY_KEY ?? 'valve' });
const log = (message: string) => console.log(`publisher: ${message}`);
// What runs the agent, as the start script says (mode, kit, executor, host): published with the setup, never a credential.
const runtimeFacts = (() => { try { const r = JSON.parse(process.env.OPEN_AUTONOMY_RUNTIME ?? ''); return r && (r.mode === 'container' || r.mode === 'bare') ? r : undefined; } catch { return undefined; } })();
// File/Git reads below are only for the project's documents; no native Hermes
// database, config, jobs file or skill directory is parsed by the reporter.
// HOME is the profile's home too: Git's route to the origin (a fleet's door rewrite) lives in its .gitconfig.
const inContainer = (cmd: string[]) => ['docker', 'exec', '-i', '--user', 'hermes', '--env', `HERMES_HOME=${home}`, '--env', `HOME=${home}`, container!, ...cmd];
const run = (cmd: string[]) => Bun.spawnSync({ cmd: container ? inContainer(cmd) : cmd, stdout: 'pipe', stderr: 'pipe', timeout: 20_000 });
const supercode = process.env.SUPERCODE_BIN ?? (container ? 'supercode' : resolve(import.meta.dir, 'node_modules/.bin/supercode'));
const reader = container ? inContainer([supercode, 'harness', 'serve']) : [supercode, 'harness', 'serve'];
const sc = new SupercodeHarnessClient({ command: reader[0], args: reader.slice(1), env: { ...process.env, HERMES_HOME: home } as Record<string, string> });
const homes = { hermes: resolve(home, 'state.db'), ...(cfg.seats ? { claude_code: resolve(process.env.HOME ?? '', '.claude') } : {}) };
// The owner's pause and resume reach the runtime that holds the schedule: Hermes's own file under Hermes; under the
// orchestrator (another harness picked), its running daemon's door, which a write to the file would be lost under.
const onOrchestrator = (process.env.OPEN_AUTONOMY_HARNESS ?? 'hermes') !== 'hermes';
const scheduler = onOrchestrator ? { harness: 'orchestrator' as const, homes: { orchestrator: home } } : { harness: 'hermes' as const, homes };
// Legacy `ended` markers are deliberately ignored: they included timer guesses.
const saved = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : {};
const checkpoints: Record<string, PublicationCheckpoint> = saved.version === 2 ? saved.published ?? {} : {};
// A session whose source was rewritten continues on the platform as `<id>~<n>`: n per native session id.
const continuations: Record<string, number> = saved.version === 2 ? saved.continuations ?? {} : {};
const platformKey = (id: string): string => (continuations[id] ? `${id}~${continuations[id]}` : id);
const nativeId = (key: string): string => key.replace(/~\d+$/, '');
// The jobs this reporter paused on the owner's word, so `running` resumes exactly those and nothing the owner disabled on their own.
const pausedJobs = new Set<string>(saved.version === 2 && Array.isArray(saved.paused_jobs) ? saved.paused_jobs.filter((id: unknown) => typeof id === 'string') : []);
// The board's review verdicts and handoffs already published as notes on their items: an update is append-only, so a restart must not repeat one.
// The board tasks this reporter deferred on the owner's word, so `running` promotes exactly those.
const pausedTasks = new Set<string>(saved.version === 2 && Array.isArray(saved.paused_tasks) ? saved.paused_tasks.filter((id: unknown) => typeof id === 'string') : []);
const noted = new Set<string>(saved.version === 2 && Array.isArray(saved.noted) ? saved.noted.filter((k: unknown) => typeof k === 'string') : []);
function saveState(): void {
  const temp = `${stateFile}.tmp`;
  writeFileSync(temp, JSON.stringify({ version: 2, published: checkpoints, continuations, paused_jobs: [...pausedJobs], paused_tasks: [...pausedTasks], noted: [...noted] }) + '\n', { mode: 0o600 });
  renameSync(temp, stateFile);
}

type Binding = { worker: { session_id?: string }; started_at?: string; ended_at?: string; end_reason?: string };
type Profile = { persona?: { text?: string }; worker?: { model?: string }; jobs: Record<string, { residue?: { name?: string } }>; bindings: Record<string, Binding>; residue?: { config?: { model?: { default?: string; provider?: string; base_url?: string } } } };
let profiles: Record<string, Profile> = {};
let bindings = new Map<string, Binding>();
let runs = new Map<string, HarnessRun>();
const jobNames = new Map<string, string>();
const descriptors = new Map<string, SessionDescriptor>();
const publishers = new Map<string, TranscriptPublisher>();
const watching = new Set<string>();
const stopped = new Set<string>();
const isSeat = (d: SessionDescriptor): boolean => d.locator.harness === 'claude-code' && !!cfg.seats && !!d.cwd && `${resolve(d.cwd)}/`.startsWith(`${resolve(cfg.seats)}/`);
// Under the orchestrator a worker is a Claude Code or Codex session the orchestrator opened: a card's, in the card's
// workspace, or a job's, in its profile's folder under the home. (A Claude session elsewhere is a seat or not the install's.)
// The board's attempt that launched a session names its card and, once the run is over, its end.
const attemptOf = (sessionId: string): { task: BoardTask; attempt: NonNullable<BoardTask['attempts']>[number] } | undefined => {
  for (const task of boardTasksAll) for (const attempt of task.attempts ?? []) if ((attempt.session?.session_id ?? attempt.session?.id) === sessionId) return { task, attempt };
  return undefined;
};
const cardAt = (cwd: string | null | undefined): boolean => !!cwd && boardTasksAll.some((t) => t.workspace?.path === cwd);
const isWorker = (d: SessionDescriptor): boolean => onOrchestrator && (d.locator.harness === 'claude-code' || d.locator.harness === 'codex') && !isSeat(d)
  && (!!attemptOf(d.locator.session_id) || cardAt(d.cwd ?? d.workspace?.value) || (!!d.cwd && `${resolve(d.cwd)}/`.startsWith(`${resolve(home)}/`)));
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
  // A worker the board launched ended with its attempt.
  const launched = isWorker(d) ? attemptOf(d.locator.session_id)?.attempt : undefined;
  if (launched?.ended_at) return { endedAt: launched.ended_at, outcome: launched.outcome === 'completed' ? 'done' : ['crashed', 'failed', 'timed_out', 'spawn_failed'].includes(launched.outcome ?? '') ? 'failed' : undefined };
  const binding = bindings.get(d.locator.session_id);
  if (binding?.ended_at) return { endedAt: binding.ended_at, outcome: binding.end_reason === 'error' ? 'failed' : undefined };
  return undefined;
}
// Read native declarations on startup and source changes; never on an observation timer.
let nativeOk = false;
async function nativeState(): Promise<void> {
  if (nativeOk) return;
  nativeOk = false;
  const read = () => Promise.all([
    sc.orchestrationLoad({ root: home, flavor: 'hermes' }, { timeoutMs: 60_000 }),
    sc.listRuns({ harness: 'hermes', homes, limit: 500 }, { timeoutMs: 60_000 }),
  ]);
  let result: Awaited<ReturnType<typeof read>>;
  try { result = await read(); }
  catch (e) { if (!/No such file or directory/.test((e as Error).message)) throw e; await Bun.sleep(300); result = await read(); }
  const [orchestration, history] = result;
  if (history.sources.some(s => s.state === 'unreadable')) throw new Error('Native run ledger unreadable');
  const next = orchestration.orchestration.profiles as Record<string, Profile>;
  if (!next || !next.default) throw new Error('Native profile state unavailable');
  profiles = next;
  bindings = new Map(Object.values(profiles).flatMap(p => Object.values(p.bindings).filter(b => b.worker.session_id).map(b => [b.worker.session_id!, b] as const)));
  runs = new Map(history.runs.filter(r => r.session_id).map(r => [r.session_id!, r]));
  jobNames.clear();
  for (const profile of Object.values(profiles)) for (const [id, job] of Object.entries(profile.jobs)) jobNames.set(id, job.residue?.name ?? id);
  nativeOk = true;
}
async function watch(d: SessionDescriptor): Promise<void> {
  const key = d.locator.session_id;
  if (watching.has(key)) return;
  watching.add(key);
  try {
    for await (const ev of sc.session(d.locator).follow({ view: { tailMessages: 1, maxMessageChars: 1, includeSubagents: false, displayHistory: true } })) {
      if (stopped.has(key)) break;
      if (ev.type === 'watch_error') log(`${key}: ${ev.message}`);
      // Snapshots (including history_rewritten/sequence_gap_recovered) and appends
      // both reconcile against the complete SDK window sequence and server receipt.
      nativeOk=false;requestTick();
    }
  } catch (e) { log(`${key}: watch interrupted (${(e as Error).message}); a retained source change or reconnect retries`); }
  finally { watching.delete(key);if(!quitting&&!stopped.has(key))setTimeout(()=>{const current=descriptors.get(key);if(current)void watch(current);},5000); }
}
// A publication that failed waits a minute before the next attempt: every attempt reloads the session's whole history
// from Volter Harness, and a live session whose earlier turns Hermes has since rewritten (compression) cannot be appended to
// until it ends, so trying every tick would reload it every ten seconds for as long as it runs.
const retryAt = new Map<string, number>();
async function sessions(only?: string): Promise<void> {
  for (const [key, d] of descriptors) {
    if (only && key !== only) continue;
    if (!(d.locator.harness === 'hermes' || isSeat(d) || isWorker(d)) || !publishes(policy, d, kindOf(d), d.recurrence ? jobNames.get(d.recurrence.job_id) : undefined)) continue;
    const completion = completionOf(d);
    const pkey = platformKey(key);
    if (checkpoints[pkey]?.endedAt) stopped.add(key); // published to its end already: nothing to read, nothing to send
    if (stopped.has(key)) continue;
    if ((retryAt.get(key) ?? 0) > Date.now()) continue;
    try {
      let publisher = publishers.get(key);
      if (!publisher) {
        const launched = isWorker(d) ? attemptOf(d.locator.session_id)?.task : undefined;
        const candidates = launched ? [launched] : (organization ? boardTasksAll : nativeTasks).filter(t => t.workspace?.path && t.workspace.path === (d.cwd ?? d.workspace?.value));
        // In an organization, a card's session publishes with its card's project; a session serving no card is the
        // organization's.
        // (Checked again each tick: a session can meet its card's workspace after it starts.)
        if (organization && (candidates.length === 1 ? !ours(candidates[0].tags?.[0] ?? candidates[0].tenant) : Boolean(tenant))) continue;
        const item = (d.trigger === 'task' || isSeat(d) || isWorker(d)) && candidates.length === 1 ? candidates[0].id : undefined;
        publisher = new TranscriptPublisher(sc, oa, cfg.account, d, { key: pkey, kind: kindOf(d), source: sourceOf(d), title: d.title ?? undefined,
          modelProvider: isSeat(d) ? 'claude-code' : providerOf(d.profile), startedAt: bindings.get(key)?.started_at ?? undefined, item }, checkpoints[pkey], checkpoint => { checkpoints[pkey] = checkpoint; saveState(); });
        publishers.set(key, publisher);
      }
      const receipt = await publisher.publish(completion);
      retryAt.delete(key);
      if (receipt.endedAt) { stopped.add(key); log(`${key}: native completion published`); }
      else void watch(d);
    } catch (e) {
      if (e instanceof SourceRewritten) { continuations[key] = (continuations[key] ?? 0) + 1; publishers.delete(key); saveState(); log(`${key}: source rewritten; continues as ${platformKey(key)}`); dirty = true; continue; }
      setTimeout(()=>{retryAt.delete(key);void sessions(key);},60_000);
      retryAt.set(key, Date.now() + 60_000); log(`${key}: publication incomplete (${(e as Error).message}); next attempt in a minute`);
    }
  }
}

// The timeline, published through the SDK as one document in one language: the past from CHANGELOG.md, the
// present from the board (through Volter Harness's workflow layer) with the sessions serving it, the future from
// ROADMAP.md. Unifying the three is this reporter's job; the platform reads no file and knows no board.
// Every board task is an item — its id, its title, its lane as the status, the `- ` lines of its body as the
// acceptance; its attempts are the sessions serving the item, and a review's verdict or an attempt's handoff is a
// progress note on it, published once.
type BoardTask = { id: string; title?: string; body?: string; tenant?: string; tags?: string[]; workspace?: { kind: string; path?: string; branch?: string }; assignee?: string; lane: string; priority?: number; created_at?: string; completed_at?: string; attempts?: Array<{ id: string; profile?: string; status: string; started_at?: string; ended_at?: string; outcome?: string; session?: { id?: string; session_id?: string }; handoff?: { summary?: string; metadata?: { branch?: string; commit?: string } } }>; reviews?: Array<{ verdict: string; by?: string; reason?: string; at?: string }> };
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
let timelineDigest = '';
async function board(): Promise<RoadmapItem[] | undefined> {
  // This app's cache is rebuilt only from the retained source stream. An organization's board has no root profile's
  // tasks: every card is a profile's (docs/decisions/0017), and a project's reporter publishes its tenant's.
  boardTasksAll = [...source.cards.values()].map((t) => ({ ...t, lane: t.archived ? 'archived' : t.status }))
    .filter((t) => t.lane !== 'archived' && (organization || (t.assignee ?? 'default') === 'default'))
    .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '') || a.id.localeCompare(b.id)) as BoardTask[];
  const tasks = organization ? boardTasksAll.filter(shown) : boardTasksAll;
  nativeTasks = tasks;
  const items: RoadmapItem[] = tasks.map((t) => {
    const attempts = t.attempts ?? [];
    const first = attempts.find((a) => a.started_at);
    const last = [...attempts].reverse().find((a) => a.handoff) ?? attempts[attempts.length - 1];
    return defined({
      id: t.id, title: t.title ?? t.id, tense: t.lane === 'done' ? 'past' : 'present', status: statusOf(t.lane), home: 'kanban', phase: /<!-- roadmap:([A-Za-z0-9][A-Za-z0-9._-]{0,79}):/.exec(t.body ?? '')?.[1],
      priority: t.priority !== undefined ? String(t.priority) : undefined, proposed_at: t.created_at, started_at: first?.started_at, done_at: t.lane === 'done' ? t.completed_at ?? last?.ended_at : undefined,
      by: last?.profile, commit: commitOf(t),
      links: dedupe([...linksIn(t.body ?? ''), ...(last?.handoff?.metadata?.branch ? [linkOf(`https://github.com/${cfg.account}/tree/${last.handoff.metadata!.branch}`, last.handoff.metadata!.branch)] : [])]),
      acceptance: (t.body ?? '').split('\n').filter((l) => /^- /.test(l)).map((l) => l.slice(2).trim()),
    }) as RoadmapItem;
  });
  // The board's lane is the item's status and its attempts are the item's sessions; what the timeline cannot say, a
  // review's verdict and an attempt's handoff, is a progress note on the item, published once each: the note's key is the
  // update's identity on the platform, so a retry after a lost acknowledgement, or a restart, lands on the same record.
  for (const t of tasks) {
    const notes: Array<{ key: string; text: string; at?: string }> = [];
    // A review's position in the board's append-only list keeps two rounds with the same verdict apart when the harness stamps no time.
    (t.reviews ?? []).forEach((r, i) => notes.push({ key: `${t.id}:review:${i}:${r.at ?? ''}:${r.verdict}`, text: `review ${r.verdict}${r.by ? ` by ${r.by}` : ''}${r.reason ? `: ${r.reason}` : ''}`, at: r.at }));
    for (const a of t.attempts ?? []) if (a.handoff?.summary) notes.push({ key: `${t.id}:handoff:${a.id}`, text: `handoff (attempt ${a.id}${a.profile ? `, ${a.profile}` : ''}): ${a.handoff.summary}`, at: a.ended_at });
    for (const n of notes) {
      if (noted.has(n.key)) continue;
      try { const u = await oa.update({ item: t.id, text: n.text.slice(0, 2000), at: n.at, id: n.key }); if (u) { noted.add(n.key); saveState(); log(`board: ${t.id} · ${n.text.slice(0, 60)}${u.idempotent ? ' (already there)' : ''}`); } }
      catch (e) { throw new Error(`board note pending for ${t.id}: ${(e as Error).message}`); }
    }
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
function refreshMain(): void {
  const fetch = run(['git', '-C', projectDir, 'fetch', '-q', 'origin', 'main']);
  if (fetch.exitCode !== 0) {
    const why = fetch.exitedDueToTimeout ? 'git fetch passed its 20 s limit' : fetch.stderr.toString().trim().slice(-300) || `git fetch exited ${fetch.exitCode}`;
    throw new Error(`Cannot refresh committed project documents: ${why}`);
  }
  const rev = run(['git', '-C', projectDir, 'rev-parse', 'origin/main']);
  if (rev.exitCode !== 0) throw new Error('Committed main unavailable');
  mainRevision = rev.stdout.toString().trim();
}
// A document the project keeps is read from committed main; one it does not keep is simply absent (an organization
// keeps no changelog; a project may keep no constitution yet). Any other failure to read is an error, never silence.
function mainFile(name: string): string | undefined {
  if (!mainRevision) return undefined;
  const exists = run(['git', '-C', projectDir, 'cat-file', '-e', `${mainRevision}:${name}`]);
  if (exists.exitCode !== 0) return undefined;
  const r = run(['git', '-C', projectDir, 'show', `${mainRevision}:${name}`]);
  if (r.exitCode !== 0) throw new Error(`Cannot read committed ${name}`);
  return r.stdout.toString();
}
// `timeline: none` in the config: the project's own driver (or, for an organization, its projects) owns the timeline;
// the reporter publishes sessions, setup and documents only.
async function timeline(present: RoadmapItem[] | undefined): Promise<void> {
  if (cfg.timeline === 'none') return;
  if (!present) return;
  const items = organization ? present : fold(present, changelogItems(mainFile('CHANGELOG.md'), cfg.account), roadmapItems(mainFile('ROADMAP.md')));
  const digest = JSON.stringify(items);
  if (digest === timelineDigest) return;
  const r = await oa.timeline({ schema: ROADMAP_SCHEMA, items }, 'hermes', 'reporter');
  if (!r.ok) throw new Error(`Timeline publish refused: ${r.error ?? r.status}`);
  timelineDigest = digest;
}
let docsDigest = '', setupDigest = '';
// The project's "about" is the committed document its config names (`about: <path>`); with none named there is none.
async function docs(): Promise<void> {
  // A project's reporter publishes its cards and sessions; its page's documents are its own repository's.
  if (tenant) return;
  const d = { about_md: typeof cfg.about === 'string' && cfg.about ? mainFile(cfg.about) : undefined };
  // No document named (or none committed): nothing to publish. The platform refuses an empty one (invalid_docs).
  if (d.about_md === undefined) return;
  const digest = JSON.stringify(d);
  if(digest!==docsDigest){const result=await oa.docs(d);if(!result.ok)throw new Error(`Document publication refused: ${result.status}`);docsDigest=digest;}
}
async function setup(): Promise<void> {
  if (tenant) return;
  const [jobs, skills, inventory] = await Promise.all([
    sc.listJobs({ harness: 'hermes', homes }), sc.listSkills({ harness: 'hermes', homes: { hermes: home } }), sc.listProfiles({ harness: 'hermes', homes }),
  ]);
  if (jobs.sources.some(s => s.state === 'unreadable')) throw new Error('Native schedule unreadable');
  const s = { harness: 'hermes', persona: profiles.default.persona?.text, model: inventory.profiles.find(p => p.name === 'default')?.model ?? undefined,
    provider: providerOf(), schedule: jobs.jobs.map(j => ({ name: jobNames.get(j.id) ?? j.id, schedule: j.enabled ? j.schedule.display : `${j.schedule.display} (${j.state})`, description: j.payload.text ?? undefined })),
    skills: skills.filter(s => s.enabled !== false).map(s => s.name).sort(), setup_md: mainFile('hermes/README.md'), ...(runtimeFacts ? { runtime: runtimeFacts } : {}) };
  const digest = JSON.stringify(s);
  if(digest!==setupDigest){const result=await oa.setup(s);if(!result.ok)throw new Error(`Setup publication refused: ${result.status}`);setupDigest=digest;}
}
// The owner's word on the operating state, read from the platform and applied through the harness's own schedule.
// `paused` here means the scheduled runs (the funded work) stop: every enabled job is paused and remembered; a run in
// flight finishes; conversations on a channel still answer. `running` resumes the jobs this reporter paused. What is
// reported back is what is true: `paused` only once no job is enabled and no run is live, never an echo of the request.
let reportedState = '', controlUnreadable = false;
// the board is the runtime's: in the executor for a container install, on this host for a bare one
const kanban = (...args: string[]): string => { const r = run(['hermes', 'kanban', ...args]); if (r.exitCode !== 0) log(`board: hermes kanban ${args[0]} ${args[1] ?? ''} failed (${r.stderr.toString().trim().slice(0, 120)})`); return r.stdout.toString(); };
const boardTasks = (): Array<{id:string;status:string}> => [...source.cards.values()].filter(card=>card.board==='default').map(card=>({id:card.id,status:card.status}));
const liveRun = (): boolean => [...descriptors.values()].some(d => kindOf(d) === 'run' && !completionOf(d) && !stopped.has(d.locator.session_id));
async function control(): Promise<void> {
  // The owner's word on the organization's operating state is the organization reporter's to apply.
  if (tenant) return;
  const c = await oa.state(cfg.account);
  if (!c) { if (!controlUnreadable) { controlUnreadable = true; log(`operating state unreadable through ${baseUrl}; the owner's word waits`); } return; }
  controlUnreadable = false;
  const desired = c.desired?.state ?? 'running';
  let jobs = await sc.listJobs(scheduler);
  if (jobs.sources.some(s => s.state === 'unreadable')) throw new Error('Native schedule unreadable');
  let changed = false;
  if (desired === 'paused') {
    // Ownership is written before the harness is touched: a crash or a thrown call after Hermes applied the pause
    // still leaves the job in the set, so `running` re-enables it; a pause that never applied leaves an enabled job,
    // which resume simply forgets.
    for (const j of jobs.jobs) if (j.enabled) { pausedJobs.add(j.id); saveState(); await sc.pauseJob({ ...scheduler, id: j.id, profile: j.profile ?? undefined }); changed = true; }
    // The board is funded work too: its dispatcher would keep starting queued tasks. Each one waiting to be picked up is
    // deferred (a run in flight still finishes) and remembered, so `running` promotes exactly those.
    for (const t of boardTasks()) if (t.status === 'todo' && !pausedTasks.has(t.id)) { pausedTasks.add(t.id); saveState(); kanban('schedule', t.id, 'paused by the owner'); }
  } else {
    // Forgotten only after the harness has the job enabled again (or no longer has it); a thrown resume keeps ownership.
    for (const id of [...pausedJobs]) {
      const j = jobs.jobs.find(x => x.id === id);
      if (j && !j.enabled) { await sc.resumeJob({ ...scheduler, id, profile: j.profile ?? undefined }); changed = true; }
      pausedJobs.delete(id); saveState();
    }
    for (const id of [...pausedTasks]) { if (boardTasks().some(t => t.id === id && t.status === 'scheduled')) kanban('promote', id, 'resumed by the owner'); pausedTasks.delete(id); saveState(); }
  }
  if (changed) jobs = await sc.listJobs(scheduler);
  const enabled = jobs.jobs.filter(j => j.enabled).map(j => jobNames.get(j.id) ?? j.id);
  const paused = [...pausedJobs].map(id => jobNames.get(id) ?? id);
  const running = liveRun();
  const state = desired === 'paused' && !enabled.length && !running ? 'paused' : 'running';
  const deferred = pausedTasks.size ? `; ${pausedTasks.size} board task${pausedTasks.size === 1 ? '' : 's'} deferred` : '';
  const note = state === 'paused' ? `scheduled runs paused: ${paused.join(', ') || 'none were enabled'}${deferred}` : desired === 'paused' ? `pausing: ${running ? 'a run is live' : `still enabled: ${enabled.join(', ')}`}` : undefined;
  const digest = `${state}|${note ?? ''}`;
  if (digest !== reportedState && (await oa.reportState(state, note)).ok) { reportedState = digest; log(`operating state ${state}${note ? ` (${note})` : ''}`); }
}
let work: Promise<void>|null=null, dirty=false, quitting=false, documentsDirty=true, boardReady=false;
function tick(): Promise<void> {
  dirty=true;
  if(!boardReady)return Promise.resolve();
  if(work)return work;
  if(quitting)return Promise.resolve();
  work=(async()=>{
    while(dirty&&!quitting){
      dirty=false;
      await nativeState();
      const present=await board();
      await sessions();
      if(documentsDirty){refreshMain();await docs();await setup();documentsDirty=false;}
      await timeline(present);
    }
  })().finally(()=>{work=null;});
  return work;
}
let retry: ReturnType<typeof setTimeout>|undefined;
function requestTick(): void {
  void tick().catch(error=>{
    log(`publication pending (${error.message}); retaining acknowledgement`);
    clearTimeout(retry);retry=setTimeout(requestTick,5000);
  });
}
sc.on('sessionIndexEvent', ev => {
  if ('error' in ev) { log(`index unavailable: ${ev.error.message}`); return; }
  for (const c of ev.changes) if (c.kind === 'removed') descriptors.delete(c.key.session_id); else {
    descriptors.set(c.descriptor.locator.session_id, c.descriptor);
    stopped.delete(c.descriptor.locator.session_id);
  }
  nativeOk=false;documentsDirty=true;requestTick();
});
const eventCommand=container
  ? ['supercode-orchestrator','workflow','events','--root',home,'--json']
  // The orchestrator the start runs (a review World's branch build), else the installed one.
  : ['node',process.env.SUPERCODE_ORCHESTRATOR_ENTRY||fileURLToPath(import.meta.resolve('@volter/supercode-orchestrator/bin')),'workflow','events','--root',home,'--json'];
const source=new BoardEventSource({command:container?inContainer(eventCommand):eventCommand,
  stateFile:`${stateFile}.board.json`,env:{...process.env,HERMES_HOME:home} as Record<string,string>,
  changed:async()=>{boardReady=true;nativeOk=false;await tick();},log});
sc.on('exit', code => { if (!quitting) { log(`Volter Harness reader exited (${code})`); process.exit(1); } });
await sc.start();
// Each profile of the home keeps its own Hermes store, and discovery reads one store per query: the root's, then each
// named profile's (its home from `listProfiles`). A profile's sessions carry its name, which `publish.private` may name.
const named = (await sc.listProfiles({ harness: 'hermes', homes })).profiles.filter(p => !p.default && p.home);
// The treasurer's sessions hold the cards it mints, so a home with a treasurer that `publish.private` does not name is
// refused rather than published: a project's config is its own, and an upgrade does not rewrite it.
if (named.some(p => p.name === 'treasurer') && !policy.private.includes('treasurer')) throw new Error('publish.private in .open-autonomy/config.yaml must name treasurer: its sessions hold the cards it mints, and they would be published');
// Under the orchestrator each profile's worker keeps its sessions in the profile's own config home, one folder per
// harness (`<profile>/claude-code`, `<profile>/codex`; the root profile's in the home itself), made at its first launch.
const workerDirs = onOrchestrator ? [home, ...(existsSync(resolve(home, 'profiles')) ? readdirSync(resolve(home, 'profiles')).map((n) => resolve(home, 'profiles', n)) : [])] : [];
const queries = [{ harnesses: cfg.seats ? ['hermes', 'claude-code'] : ['hermes'], homes },
  ...named.map(p => ({ harnesses: ['hermes'], homes: { hermes: `${p.home}/state.db` } })),
  ...workerDirs.map((dir) => ({ harnesses: ['claude-code', 'codex'], homes: { claude_code: resolve(dir, 'claude-code'), codex: resolve(dir, 'codex') } }))];
for (const query of queries) for (const d of (await sc.subscribeSessionIndex(query)).initial) descriptors.set(d.locator.session_id, d);
// The host can start Hermes once SDK discovery and native state are readable.
// Historical publication may take minutes; replay is not a readiness condition. A ledger still being written by the
// gateway that just drained (a restart onto a moved main) reads as unreadable for a moment: that is a wait, not a death.
for (let attempt = 1; ; attempt++) {
  try { await nativeState(); break; }
  catch (e) { if (attempt >= 20) throw e; log(`native state not readable yet (${(e as Error).message}); retrying`); await Bun.sleep(3000); }
}
process.send?.({ type: 'reporter-ready' });
// Discovery has its own pagination; the retained live index is not all history.
for (const query of queries) {
  let cursor: string | undefined;
  do {
    const page = await sc.discover({ ...query, cursor, limit: 500 });
    for (const d of page.sessions) if (!descriptors.has(d.locator.session_id)) descriptors.set(d.locator.session_id, d);
    cursor = page.next_cursor ?? undefined;
  } while (cursor);
}
let controlTimer: ReturnType<typeof setInterval>|undefined;
const documentWatchers: Array<ReturnType<typeof watchFiles>>=[];
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => {
  quitting = true; source.close();clearInterval(controlTimer);clearTimeout(retry);for(const watcher of documentWatchers)watcher.close(); void sc.close().then(() => process.exit(0));
});
await source.start();
// The platform's separate owner-control door currently has no subscription.
// Its timer reads only that command and native schedule authority, never the board.
controlTimer=setInterval(()=>{void control().catch(error=>log(`owner control pending: ${error.message}`));},10_000);
for(const path of [resolve(projectDir,'.git'),resolve(projectDir,'.open-autonomy','config.yaml')]){
  if(!existsSync(path))continue;
  try{const watcher=watchFiles(path,{recursive:true},(_event,name)=>{
      if(path.endsWith('config.yaml')){log('publication configuration changed; restart required');source.close();void sc.close().then(()=>process.exit(1));return;}
      const file=String(name??'').replaceAll('\\','/');
      if(name!=null&&!['HEAD','packed-refs','refs/remotes/origin/main'].includes(file))return;
      documentsDirty=true;requestTick();
    });watcher.on('error',error=>log(`document watch unavailable: ${error.message}`));documentWatchers.push(watcher);}
  catch(error){log(`document watch unavailable: ${(error as Error).message}`);}
}

log(`watching ${home} for ${cfg.account}`);
