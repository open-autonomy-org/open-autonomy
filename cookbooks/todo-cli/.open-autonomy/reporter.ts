#!/usr/bin/env bun
// Supercode SDK in, Open Autonomy SDK out. Native state belongs to Supercode;
// publication policy, repository documents and acknowledged delivery belong here.
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { SupercodeHarnessClient, type SessionDescriptor, type HarnessRun } from '@volter-ai-dev/supercode-harness-sdk';
import { ROADMAP_SCHEMA, linkOf, linksIn, type Link, type RoadmapItem } from './sdk/roadmap.ts';
import { OpenAutonomy, type TaskReview } from './sdk/client.ts';
import { publicationPolicy, publishes, TranscriptPublisher, type PublicationCheckpoint, type RecordedCompletion } from './sdk/reporting.ts';

const arg = (name: string): string | undefined => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const configPath = resolve(arg('--config') ?? resolve(import.meta.dir, 'config.yaml'));
const cfg = Bun.YAML.parse(readFileSync(configPath, 'utf8')) as any;
if (!cfg || typeof cfg.account !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(cfg.account)) throw new Error('Reporter configuration must name the project account');
const policy = publicationPolicy(cfg.publish);
const home = cfg.hermes_home ?? process.env.HERMES_HOME;
if (typeof home !== 'string' || !home.startsWith('/')) throw new Error('Reporter requires the absolute Hermes home');
const container = arg('--container');
if (container && !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(container)) throw new Error('Invalid container');
if (container && cfg.seats) throw new Error('Host Claude seats require their own reporter');
const projectDir = arg('--project') ?? (container ? '/work/project' : resolve(dirname(configPath), '..'));
const stateFile = resolve(arg('--state-file') ?? resolve(dirname(configPath), cfg.state_file ?? 'reporter-state.json'));
const baseUrl = process.env.OPEN_AUTONOMY_BASE_URL ?? `${(cfg.platform ?? 'https://open-autonomy.org').replace(/\/$/, '')}/v1`;
const oa = new OpenAutonomy({ baseUrl, key: process.env.OPEN_AUTONOMY_KEY ?? 'valve' });
const log = (message: string) => console.log(`reporter: ${message}`);
// File/Git reads below are only for the project's documents; no native Hermes
// database, config, jobs file or skill directory is parsed by the reporter.
const inContainer = (cmd: string[]) => ['docker', 'exec', '-i', '--user', 'hermes', '--env', `HERMES_HOME=${home}`, container!, ...cmd];
const run = (cmd: string[]) => Bun.spawnSync({ cmd: container ? inContainer(cmd) : cmd, stdout: 'pipe', stderr: 'pipe', timeout: 20_000 });
const supercode = process.env.SUPERCODE_BIN ?? (container ? 'supercode' : resolve(import.meta.dir, 'node_modules/.bin/supercode'));
const reader = container ? inContainer([supercode, 'harness', 'serve']) : [supercode, 'harness', 'serve'];
const sc = new SupercodeHarnessClient({ command: reader[0], args: reader.slice(1), env: { ...process.env, HERMES_HOME: home } as Record<string, string> });
const homes = { hermes: resolve(home, 'state.db'), ...(cfg.seats ? { claude_code: resolve(process.env.HOME ?? '', '.claude') } : {}) };
// Legacy `ended` markers are deliberately ignored: they included timer guesses.
const saved = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : {};
const checkpoints: Record<string, PublicationCheckpoint> = saved.version === 2 ? saved.published ?? {} : {};
function saveState(): void {
  const temp = `${stateFile}.tmp`;
  writeFileSync(temp, JSON.stringify({ version: 2, published: checkpoints }) + '\n', { mode: 0o600 });
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
const kindOf = (d: SessionDescriptor): 'run' | 'chat' => isSeat(d) || ['cron', 'heartbeat', 'task'].includes(d.trigger ?? '') ? 'run' : 'chat';
const sourceOf = (d: SessionDescriptor): string => isSeat(d) ? 'seat' : d.recurrence ? jobNames.get(d.recurrence.job_id) ?? d.recurrence.job_id : d.trigger === 'task' ? 'board' : d.surface?.platform ?? kindOf(d);
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
  const binding = bindings.get(d.locator.session_id);
  return binding?.ended_at ? { endedAt: binding.ended_at, outcome: binding.end_reason === 'error' ? 'failed' : undefined } : undefined;
}
async function nativeState(): Promise<void> {
  const [orchestration, history] = await Promise.all([
    sc.orchestrationLoad({ root: home, flavor: 'hermes' }),
    sc.listRuns({ harness: 'hermes', homes, limit: 500 }),
  ]);
  if (history.sources.some(s => s.state === 'unreadable')) throw new Error('Native run ledger unreadable');
  const next = orchestration.orchestration.profiles as Record<string, Profile>;
  if (!next || !next.default) throw new Error('Native profile state unavailable');
  profiles = next;
  bindings = new Map(Object.values(profiles).flatMap(p => Object.values(p.bindings).filter(b => b.worker.session_id).map(b => [b.worker.session_id!, b] as const)));
  runs = new Map(history.runs.filter(r => r.session_id).map(r => [r.session_id!, r]));
  jobNames.clear();
  for (const profile of Object.values(profiles)) for (const [id, job] of Object.entries(profile.jobs)) jobNames.set(id, job.residue?.name ?? id);
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
      requestTick();
    }
  } catch (e) { log(`${key}: watch interrupted (${(e as Error).message}); polling still reconciles`); }
  finally { watching.delete(key); }
}
async function sessions(): Promise<void> {
  for (const [key, d] of descriptors) {
    if (!(d.locator.harness === 'hermes' || isSeat(d)) || !publishes(policy, d, kindOf(d), d.recurrence ? jobNames.get(d.recurrence.job_id) : undefined)) continue;
    const completion = completionOf(d);
    if (stopped.has(key)) continue;
    try {
      let publisher = publishers.get(key);
      if (!publisher) {
        const candidates = nativeTasks.filter(t => t.workspace?.path && t.workspace.path === (d.cwd ?? d.workspace?.value));
        const item = (d.trigger === 'task' || isSeat(d)) && candidates.length === 1 ? candidates[0].id : undefined;
        publisher = new TranscriptPublisher(sc, oa, cfg.account, d, { key, kind: kindOf(d), source: sourceOf(d), title: d.title ?? undefined,
          modelProvider: isSeat(d) ? 'claude-code' : providerOf(d.profile), startedAt: bindings.get(key)?.started_at ?? undefined, item }, checkpoints[key], checkpoint => { checkpoints[key] = checkpoint; saveState(); });
        publishers.set(key, publisher);
      }
      const receipt = await publisher.publish(completion);
      if (receipt.endedAt) { stopped.add(key); log(`${key}: native completion published`); }
      else void watch(d);
    } catch (e) { log(`${key}: publication incomplete (${(e as Error).message})`); }
  }
}

// The timeline, published through the SDK as one document in one language: the past from CHANGELOG.md, the
// present from the board (through supercode's workflow layer) with the sessions serving it, the future from
// ROADMAP.md. Unifying the three is this reporter's job; the platform reads no file and knows no board.
// Every board task is an item — its id, its title, its lane as the status, the `- ` lines of its body as the
// acceptance — and each task's board state (lane, attempts, handoff, review verdicts) is published under that
// item whenever it changes. Review verdicts are exactly the SDK's recorded verdicts.
type BoardTask = { id: string; title?: string; body?: string; workspace?: { kind: string; path?: string; branch?: string }; assignee?: string; lane: string; priority?: number; created_at?: string; completed_at?: string; attempts?: Array<{ id: string; profile?: string; status: string; started_at?: string; ended_at?: string; outcome?: string; handoff?: { summary?: string; metadata?: { branch?: string; commit?: string } } }>; reviews?: Array<{ verdict: string; by?: string; reason?: string; at?: string }> };
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
const boardDigests = new Map<string, string>();
let timelineDigest = '';
async function board(): Promise<RoadmapItem[] | undefined> {
  nativeTasks = [];
  let read: { workflow?: { boards?: Record<string, { tasks?: Record<string, BoardTask> }> } };
  try { read = await sc.workflowLoad({ from: 'hermes', home: home }) as typeof read; } catch (e) { log(`board unreadable: ${(e as Error).message}`); return undefined; }
  if (!read.workflow?.boards) throw new Error('Native workflow state unavailable');
  // The developer's tasks are the present. Tasks assigned to another profile (a purchase request for the treasurer)
  // are the board's own bookkeeping: their spend shows on the trail under the developer's task, not as items.
  const tasks = Object.values(read.workflow?.boards ?? {}).flatMap((b) => Object.values(b.tasks ?? {})).filter((t) => t.lane !== 'archived' && (t.assignee ?? 'default') === 'default').sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '') || a.id.localeCompare(b.id));
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
  for (const t of tasks) {
    const item = t.id;
    const attempts = (t.attempts ?? []).map((a) => ({ id: a.id, profile: a.profile, status: a.status, started_at: a.started_at, ended_at: a.ended_at, outcome: a.outcome, summary: a.handoff?.summary }));
    const reviews: TaskReview[] = (t.reviews ?? []).map((r) => ({ verdict: r.verdict as TaskReview['verdict'], by: r.by, reason: r.reason, at: r.at }));
    const last = [...(t.attempts ?? [])].reverse().find((a) => a.handoff);
    const state = { item, task_id: t.id, lane: t.lane, title: t.title, assignee: t.assignee, attempts, reviews, handoff: last?.handoff, updated_at: new Date().toISOString() };
    const taskDigest = JSON.stringify({ ...state, updated_at: undefined });
    if (boardDigests.get(t.id) === taskDigest) continue;
    try { if (await oa.task(state)) { boardDigests.set(t.id, taskDigest); log(`board: ${t.id} (${t.lane}, ${attempts.length} attempt(s), ${reviews.length} review(s))`); } } catch (e) { log(`board publish failed for ${t.id}: ${(e as Error).message}`); }
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
  if (fetch.exitCode !== 0) throw new Error('Cannot refresh committed project documents');
  const rev = run(['git', '-C', projectDir, 'rev-parse', 'origin/main']);
  if (rev.exitCode !== 0) throw new Error('Committed main unavailable');
  mainRevision = rev.stdout.toString().trim();
}
function mainFile(name: string): string | undefined {
  if (!mainRevision) return undefined;
  const r = run(['git', '-C', projectDir, 'show', `${mainRevision}:${name}`]);
  if (r.exitCode !== 0) throw new Error(`Cannot read committed ${name}`);
  return r.stdout.toString();
}
async function timeline(present: RoadmapItem[] | undefined): Promise<void> {
  if (!present) return;
  const items = fold(present, changelogItems(mainFile('CHANGELOG.md'), cfg.account), roadmapItems(mainFile('ROADMAP.md')));
  const digest = JSON.stringify(items);
  if (digest === timelineDigest) return;
  const r = await oa.pushRoadmap({ schema: ROADMAP_SCHEMA, items }, 'hermes', 'reporter');
  if (!r.ok) throw new Error(`Timeline publish refused: ${r.error ?? r.status}`);
  timelineDigest = digest;
}
let docsDigest = '', setupDigest = '';
async function docs(): Promise<void> {
  const d = { about_md: mainFile('CONSTITUTION.md') };
  const digest = JSON.stringify(d);
  if (digest !== docsDigest && await oa.docs(d)) docsDigest = digest;
}
async function setup(): Promise<void> {
  const [jobs, skills, inventory] = await Promise.all([
    sc.listJobs({ harness: 'hermes', homes }), sc.listSkills({ harness: 'hermes', homes: { hermes: home } }), sc.listProfiles({ harness: 'hermes', homes }),
  ]);
  if (jobs.sources.some(s => s.state === 'unreadable')) throw new Error('Native schedule unreadable');
  const s = { harness: 'hermes', persona: profiles.default.persona?.text, model: inventory.profiles.find(p => p.name === 'default')?.model ?? undefined,
    provider: providerOf(), schedule: jobs.jobs.map(j => ({ name: jobNames.get(j.id) ?? j.id, schedule: j.enabled ? j.schedule.display : `${j.schedule.display} (${j.state})`, description: j.payload.text ?? undefined })),
    skills: skills.filter(s => s.enabled !== false).map(s => s.name).sort(), setup_md: mainFile('hermes/README.md') };
  const digest = JSON.stringify(s);
  if (digest !== setupDigest && await oa.setup(s)) setupDigest = digest;
}
let busy = false, dirty = false, quitting = false, documentsAt = 0;
async function tick(): Promise<void> {
  if (busy || quitting) { dirty = true; return; }
  busy = true;
  try {
    do {
      dirty = false;
      await nativeState();
      const present = await board();
      await sessions();
      if (Date.now() - documentsAt > 60_000) {
        refreshMain();
        await docs(); await timeline(present); await setup();
        documentsAt = Date.now();
      }
    } while (dirty && !quitting);
  } catch (e) { log(`observation incomplete (${(e as Error).message}); retrying without declaring completion`); }
  finally { busy = false; }
}
function requestTick(): void { void tick(); }
sc.on('sessionIndexEvent', ev => {
  if ('error' in ev) { log(`index unavailable: ${ev.error.message}`); return; }
  for (const c of ev.changes) if (c.kind === 'removed') descriptors.delete(c.key.session_id); else {
    descriptors.set(c.descriptor.locator.session_id, c.descriptor);
    stopped.delete(c.descriptor.locator.session_id);
  }
  requestTick();
});
sc.on('exit', code => { if (!quitting) { log(`Supercode reader exited (${code})`); process.exit(1); } });
await sc.start();
const query = { harnesses: cfg.seats ? ['hermes', 'claude-code'] : ['hermes'], homes };
const index = await sc.subscribeSessionIndex(query);
for (const d of index.initial) descriptors.set(d.locator.session_id, d);
// The host can start Hermes once SDK discovery and native state are readable.
// Historical publication may take minutes; replay is not a readiness condition.
await nativeState();
process.send?.({ type: 'reporter-ready' });
// Discovery has its own pagination; the retained live index is not all history.
let cursor: string | undefined;
do {
  const page = await sc.discover({ ...query, cursor, limit: 500 });
  for (const d of page.sessions) if (!descriptors.has(d.locator.session_id)) descriptors.set(d.locator.session_id, d);
  cursor = page.next_cursor ?? undefined;
} while (cursor);
await tick();
const poll = setInterval(requestTick, 5000); // observation cadence, never completion evidence
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => {
  quitting = true; clearInterval(poll); void sc.close().then(() => process.exit(0));
});
log(`watching ${home} for ${cfg.account}`);
