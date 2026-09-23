// The dashboard's data, and the SDK's records projected into Supercode's UI models: a session is a chat row and
// a run, its turns a transcript, the roadmap a workflow board, the schedule a job list, the owner's control a
// job's pause. Nothing is invented: a field the records do not carry stays empty, and a control the viewer may
// not use is absent.
import { tenseOf, type Roadmap, type RoadmapItem } from '@open-autonomy/sdk/roadmap';
import type { TeamMember } from '@open-autonomy/sdk/team';
import type { CallRecord, ProjectView, SessionRecord, SessionSummary } from '../ledger.js';
import { sees, type Role, type Visibility } from '../page/model.js';
import { firstLine, type SessionTail, type Turn } from '../page/parts.js';
import { normalizeUiState, relativeAge, type SessionRowModel, type SupercodeUiState, type TranscriptEntryModel } from '@volter-ai-dev/supercode-ui/core';
import type { JobModel, RunModel, TaskAttempt, WorkflowBoardModel, WorkflowTask } from '@volter-ai-dev/supercode-ui/supervision';

export type DashPage = 'overview' | 'sessions' | 'board' | 'books' | 'agent' | 'team';
export interface DashData {
  brand: string;
  viewer: Role;
  visibility: Visibility;
  v: ProjectView;
  sessions: SessionSummary[];
  live: string[];
  roadmap: Roadmap;
  tail?: SessionTail;
  daily: number[];
  now: number;
  calls?: CallRecord[];
  // The committed roster as the team page holds it: its members and the commit they were read at, which member
  // is being edited, why it could not be read, and whether this deployment has an identity door for a change.
  roster?: { members?: TeamMember[]; sha?: string; head?: string; editing?: string; failure?: string; configured: boolean };
  page: DashPage;
  // The address's depth: one session's whole record on the sessions page, one item's id on the board.
  session?: SessionRecord;
  item?: string;
}

export const PAGES: Array<{ id: DashPage; label: string; panel: keyof Visibility }> = [
  { id: 'overview', label: 'Overview', panel: 'overview' }, { id: 'sessions', label: 'Sessions', panel: 'sessions' }, { id: 'board', label: 'Board', panel: 'work' },
  { id: 'books', label: 'Books', panel: 'books' }, { id: 'agent', label: 'Agent', panel: 'agent' }, { id: 'team', label: 'Team', panel: 'team' },
];
export interface Schedule { name?: string; schedule?: string }
export const scheduleOf = (v: ProjectView): Schedule[] => { try { const j = JSON.parse(v.profile.schedule_json ?? '{}') as { jobs?: Schedule[] }; return Array.isArray(j.jobs) ? j.jobs : []; } catch { return []; } };
export const harnessOf = (v: ProjectView): string => v.profile.agent_harness ?? 'hermes';
export const itemTitle = (roadmap: Roadmap, id: string | undefined): string | undefined => (id ? roadmap.items.find((i) => i.id === id)?.title : undefined);
const said = (report: string | undefined): string | undefined => (report && report !== '[SILENT]' ? firstLine(report, 160) : undefined);
const when = (s: SessionSummary): number => Date.parse(s.ended_at ?? s.started_at);

// ---- sessions as chat rows ------------------------------------------------------------------------------------------
export function rowOf(d: DashData, s: SessionSummary): SessionRowModel {
  const live = d.live.includes(s.key) || s.status === 'live';
  const on = itemTitle(d.roadmap, s.item_id);
  const runs = d.sessions.filter((x) => (x.source ?? x.kind) === (s.source ?? s.kind) && x.kind === 'run');
  const last = runs.find((x) => x.status === 'ended');
  return {
    key: s.key, harness: harnessOf(d.v), name: s.source ?? s.kind, cwd: '',
    title: on ? `${s.source ?? s.kind} · ${on}` : s.source ?? s.kind,
    preview: said(s.report), previewUpdatedAt: s.report ? when(s) : null,
    age: relativeAge(when(s), d.now), updatedAt: when(s), messages: s.turn_count,
    active: live, writable: false, live, runtimeStatus: live ? 'running' : null,
    workspaceRef: { kind: 'none', value: null },
    trigger: { kind: s.kind === 'run' ? 'cron' : 'human', label: s.source ?? null },
    recurring: s.kind === 'run' && runs.length > 1 ? { groupKey: s.source ?? s.kind, runs: runs.length, lastStatus: last ? (last.outcome === 'failed' ? 'failed' : 'ok') : null } : undefined,
  };
}

// ---- turns as a transcript ------------------------------------------------------------------------------------------
// A tool call and the tool's answer are two turns in the stream, and calls made together land their answers
// together: an answer belongs to the oldest unanswered call of its tool. The transcript shows the pair as one
// entry. A call still unanswered is running only while the session is; afterwards it simply had no answer.
const unwrap = (result: string | undefined): string => {
  const r = (result ?? '').trim();
  if (r.startsWith('{')) { try { const o = JSON.parse(r) as Record<string, unknown>; const s = o.output ?? o.stdout ?? o.result ?? o.text; if (typeof s === 'string') return s; } catch { /* the answer as written */ } }
  return r;
};
export function entriesOf(turns: Turn[], live = false): TranscriptEntryModel[] {
  const out: TranscriptEntryModel[] = [];
  const open: TranscriptEntryModel[] = [];
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    const ts = t.ts ? Date.parse(t.ts) : null;
    const id = `t${t.seq ?? i}`;
    if (t.role === 'assistant' && t.tool) {
      const e: TranscriptEntryModel = { id, role: 'tool', text: '', ts, truncated: false, label: t.tool, arguments: t.args ?? '', resultText: '', status: live ? 'pending' : 'completed' };
      out.push(e); open.push(e);
    } else if (t.role === 'tool') {
      const n = open.findIndex((e) => !t.tool || e.label === t.tool);
      if (n >= 0) { const e = open.splice(n, 1)[0]; e.resultText = unwrap(t.result); e.status = 'completed'; }
      else out.push({ id, role: 'tool', text: '', ts, truncated: false, label: t.tool ?? 'tool', arguments: '', resultText: unwrap(t.result), status: 'completed' });
    } else if (t.role === 'system') {
      if (t.text?.trim()) out.push({ id, role: 'notice', text: t.text, ts, truncated: false });
    } else if (t.text?.trim()) {
      out.push({ id, role: t.role === 'user' || t.role === 'assistant' ? t.role : 'notice', text: t.text, ts, truncated: false });
    }
  }
  return out;
}
export const lastSeq = (turns: Turn[]): number => turns.reduce((m, t) => (typeof t.seq === 'number' && t.seq > m ? t.seq : m), -1);

// ---- the kit's state ------------------------------------------------------------------------------------------------
// One bounded state for the session components: every session as a row; the attached one's transcript, when the
// address names a session or a live one is narrating. Nothing here can send, steer or take over: the page watches.
export function uiState(d: DashData, attached?: SessionRecord | { key: string; turns: Turn[] }): SupercodeUiState {
  const rows = d.sessions.map((s) => rowOf(d, s));
  const a = attached ? d.sessions.find((s) => s.key === attached.key) : undefined;
  const live = attached ? d.live.includes(attached.key) || ('status' in attached && attached.status === 'live') : false;
  const busy = live;
  return normalizeUiState({
    startup: 'ready', harness: harnessOf(d.v), workspace: d.v.account, workspaceRef: { kind: 'repo', value: d.v.account },
    pill: live ? { tone: 'live', label: 'live' } : { tone: 'off', label: 'ended' },
    busy, operation: busy ? 'running' : null, needsInput: false, mode: 'observe', messaging: null,
    canSend: false, canSteer: false, canResume: false, supportsResume: false, continuationModes: [], canBranch: false, supportsBranch: false,
    canAttach: false, supportsAttach: false, canDetach: false, canOpenTerminal: false, canExport: false, canReduce: false, canInterrupt: false, canRespond: false, canConfigureSettings: false,
    sessions: rows,
    transcript: attached ? entriesOf(attached.turns, live) : [],
    attached: attached && a ? { key: a.key, harness: harnessOf(d.v), name: a.source ?? a.kind, cwd: d.v.account, title: rowOf(d, a).title } : attached ? { key: attached.key, harness: harnessOf(d.v), name: attached.key, cwd: d.v.account, title: attached.key } : null,
    history: { sessionLimit: rows.length, hasMoreSessions: false, transcriptLimit: attached ? attached.turns.length : 0, hasEarlier: false },
    attention: [], harnesses: [{ id: harnessOf(d.v), label: harnessOf(d.v), available: true }],
  });
}

// ---- the roadmap as a board ------------------------------------------------------------------------------------------
const LANE: Record<RoadmapItem['status'], string> = { proposed: 'proposed', planned: 'planned', active: 'in progress', done: 'shipped' };
const ORDER: Record<RoadmapItem['status'], number> = { active: 0, planned: 1, proposed: 2, done: 3 };
export function attemptsOf(d: DashData, id: string): TaskAttempt[] {
  return d.sessions.filter((s) => s.item_id === id).map((s) => ({
    key: s.key, status: d.live.includes(s.key) || s.status === 'live' ? 'running' : s.outcome === 'failed' ? 'failed' : s.outcome === 'done' ? 'done' : 'ended',
    profile: s.source ?? s.kind, startedAt: s.started_at, endedAt: s.ended_at ?? '', error: '', summary: said(s.report) ?? '', evidence: s.commit_sha ? `commit ${s.commit_sha.slice(0, 7)}` : '', sessionKey: s.key,
  }));
}
export function taskOf(d: DashData, i: RoadmapItem): WorkflowTask {
  const attempts = attemptsOf(d, i.id);
  const note = [i.release ? `release ${i.release}` : '', i.done_at ? `shipped ${i.done_at.slice(0, 10)}` : i.started_at ? `since ${i.started_at.slice(0, 10)}` : '', i.commit ? `commit ${i.commit.slice(0, 7)}` : ''].filter(Boolean).join(' · ');
  return {
    key: i.id, id: i.id, title: i.title, lane: LANE[i.status] ?? i.status, assignee: i.by ?? '', body: i.acceptance.map((x) => `- ${x}`).join('\n'), note,
    dependencies: [], dependents: [], attemptCount: attempts.length, reviewCount: 0, commentCount: 0, attempts, reviews: [], comments: [],
  };
}
export function boardOf(d: DashData): WorkflowBoardModel {
  const items = [...d.roadmap.items].sort((x, y) => ORDER[x.status] - ORDER[y.status] || (tenseOf(x) === 'past' ? Date.parse(y.done_at ?? '') - Date.parse(x.done_at ?? '') || 0 : 0));
  return { key: 'roadmap', title: 'The roadmap', source: 'roadmap', status: 'ready', stale: false, total: items.length, offset: 0, hasMore: false, tasks: items.map((i) => taskOf(d, i)) };
}

// ---- the schedule as jobs, sessions as their runs ---------------------------------------------------------------------
export const paused = (v: ProjectView): boolean => (v.control?.desired?.state ?? 'running') === 'paused';
export function jobsOf(d: DashData): JobModel[] {
  const owner = sees(d.viewer, 'owner');
  const off = paused(d.v);
  return scheduleOf(d.v).map((j, n) => {
    const name = j.name ?? `job ${n + 1}`;
    return {
      key: name, id: name, title: name, source: harnessOf(d.v), harness: harnessOf(d.v), profile: d.v.profile.agent_model ?? '', schedule: j.schedule ?? '',
      state: off ? 'paused' : 'scheduled', enabled: !off, nextRunAt: null, destination: null, channelConnection: '',
      canPause: owner && !off, canResume: owner && off, canRun: false, canDelete: false,
    };
  });
}
export function runsOf(d: DashData, job: string): RunModel[] {
  return d.sessions.filter((s) => s.kind === 'run' && (s.source ?? s.kind) === job).map((s) => {
    const live = d.live.includes(s.key) || s.status === 'live';
    return {
      key: s.key, id: s.key, jobKey: job, startedAt: s.started_at, finishedAt: s.ended_at ?? '', execution: live ? 'running' : s.outcome === 'failed' ? 'failed' : 'succeeded', error: '', sessionKey: s.key, delivery: null,
      completion: live ? null : { status: s.outcome ?? 'ended', sessionId: s.key },
    };
  });
}
