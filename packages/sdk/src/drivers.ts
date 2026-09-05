// Roadmap drivers: one normalized roadmap, several native homes. `file` is the default — ROADMAP.yml in
// git, the platform pulls it on sync. `github-milestones` is platform-pulled too, credential-free (public
// milestones). `jira` runs owner-side, where the credential is, and pushes through the SDK on a steer-scoped
// key. Each driver declares its conformance: what its tracker cannot express, so a reader knows which fields
// are the driver's own defaults rather than the project's word. The agent stays tracker-blind: it works and
// narrates ROADMAP.yml, and a driver's `reconcile` plan carries a finished item back to the native side.
import { ROADMAP_SCHEMA, type Roadmap, type RoadmapItem, type RoadmapStatus } from './roadmap.ts';

export type RoadmapSource = 'file' | 'github-milestones' | 'jira' | 'hermes-kanban';
export const ROADMAP_SOURCES: readonly RoadmapSource[] = ['file', 'github-milestones', 'jira'];

export interface RoadmapConfig {
  source: RoadmapSource;
  path: string;
  github?: { repo?: string };
  jira?: { base_url?: string; project?: string; jql?: string; done_transition?: string };
}

// `.open-autonomy/config.yaml`'s `roadmap:` block. The config's shape is small and fixed: a line reader.
export function parseRoadmapConfig(yaml: string): RoadmapConfig {
  const cfg: RoadmapConfig = { source: 'file', path: 'ROADMAP.yml' };
  let block = '';
  let sub = '';
  for (const raw of yaml.split('\n')) {
    const line = raw.replace(/\s+#.*$/, '').trimEnd();
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const top = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (top) { block = top[2] === '' ? top[1] : ''; sub = ''; continue; }
    if (block !== 'roadmap') continue;
    const l2 = /^  ([a-z_]+):\s*(.*)$/.exec(line);
    if (l2) {
      sub = l2[2] === '' ? l2[1] : '';
      const v = l2[2].trim().replace(/^["']|["']$/g, '');
      if (l2[1] === 'source' && (ROADMAP_SOURCES as readonly string[]).includes(v)) cfg.source = v as RoadmapSource;
      if (l2[1] === 'path' && v) cfg.path = v;
      continue;
    }
    const l3 = /^    ([a-z_]+):\s*(.+)$/.exec(line);
    if (l3 && (sub === 'github' || sub === 'jira')) {
      const v = l3[2].trim().replace(/^["']|["']$/g, '');
      const target: Record<string, string> = (cfg[sub] ??= {});
      target[l3[1]] = v;
    }
  }
  return cfg;
}

export interface DriverConformance { source: RoadmapSource; cannot: string[] }

// The Hermes board read onto the roadmap model: every task on the board is an item. What the reporter reads
// through supercode's workflow layer, mapped here so the board and a file speak the same model. A task filed from a roadmap
// names its item (`ROADMAP_ITEM=<id>` in its body) and keeps that id; any other task is an item under its
// own task id. The lane is the status: triage, todo, scheduled and ready are planned; running, review and
// blocked are active; done is done; archived tasks are left out. The body's bullet lines are the acceptance.
export interface BoardTask { id: string; title: string; body?: string | null; lane: string; priority?: number; created_at?: string }
export function fromKanban(tasks: BoardTask[]): Roadmap {
  const status = (lane: string): RoadmapItem['status'] => (lane === 'done' ? 'done' : ['running', 'review', 'blocked'].includes(lane) ? 'active' : 'planned');
  const items = tasks
    .filter((t) => t.lane !== 'archived')
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || (a.created_at ?? '').localeCompare(b.created_at ?? ''))
    .map((t): RoadmapItem => {
      const body = t.body ?? '';
      const id = /^ROADMAP_ITEM=([a-z0-9][a-z0-9-]*)$/m.exec(body)?.[1] ?? t.id.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
      const acceptance = body.split('\n').filter((l) => /^\s*-\s+/.test(l)).map((l) => l.replace(/^\s*-\s+/, '').trim()).filter(Boolean);
      return { id, title: t.title, status: status(t.lane), acceptance };
    });
  return { schema: 'open-autonomy.roadmap.v3', items };
}
export const CONFORMANCE: Record<RoadmapSource, string[]> = {
  file: [],
  'github-milestones': ['priority (a milestone has none; every item is medium)', 'proposed (a milestone is open or closed; open is planned)', 'acceptance lines are the description\'s bullet lines, or its paragraphs'],
  jira: ['phase (an epic has none; the epic\'s rank order is the phase)', 'proposed and active map from the status category: to-do is planned, in-progress is active, done is done'],
  'hermes-kanban': ['a phase and a priority (a board has lanes and a priority number, not phases); an item the board does not know (the roadmap is what is filed on the board)'],
};

// ---- GitHub milestones -----------------------------------------------------------------------------------
export interface Milestone { number: number; title: string; description?: string | null; state: 'open' | 'closed'; due_on?: string | null; created_at?: string }

export const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'item';

// Milestones as the roadmap: due date order is the phase (undated last, by creation), a closed milestone is
// done, an open one planned; the description's bullets (else its paragraphs) are the acceptance lines.
const orderedMilestones = (milestones: Milestone[]): Milestone[] => [...milestones].sort((a, b) => (a.due_on ? Date.parse(a.due_on) : Infinity) - (b.due_on ? Date.parse(b.due_on) : Infinity) || (Date.parse(a.created_at ?? '') || 0) - (Date.parse(b.created_at ?? '') || 0) || a.number - b.number);
export function fromMilestones(milestones: Milestone[]): Roadmap {
  const ordered = orderedMilestones(milestones);
  const seen = new Set<string>();
  let phase = 0;
  let lastDue: string | null | undefined;
  const items: RoadmapItem[] = ordered.map((m) => {
    if (m.due_on !== lastDue || phase === 0) { phase += 1; lastDue = m.due_on; }
    let id = slug(m.title);
    while (seen.has(id)) id = `${id}-${m.number}`;
    seen.add(id);
    return { id, title: m.title, status: m.state === 'closed' ? 'done' : 'planned', phase: String(phase), priority: 'medium', acceptance: acceptanceOf(m.description ?? '') };
  });
  return { schema: ROADMAP_SCHEMA, items };
}
function acceptanceOf(text: string): string[] {
  const bullets = text.split('\n').map((l) => /^\s*[-*]\s+(.+?)\s*$/.exec(l)?.[1]).filter((l): l is string => !!l);
  if (bullets.length) return bullets;
  return text.trim() ? text.trim().split(/\n{2,}/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean) : [];
}
// What the native side must change to match the roadmap: an item done in the roadmap closes its milestone.
export function milestoneChanges(roadmap: Roadmap, milestones: Milestone[]): Array<{ number: number; title: string; state: 'open' | 'closed' }> {
  const ordered = orderedMilestones(milestones);
  const byId = new Map(fromMilestones(milestones).items.map((it, i) => [it.id, ordered[i]] as const));
  const out: Array<{ number: number; title: string; state: 'open' | 'closed' }> = [];
  for (const it of roadmap.items) {
    const m = byId.get(it.id);
    if (!m) continue;
    const want: 'open' | 'closed' = it.status === 'done' ? 'closed' : 'open';
    if (m.state !== want) out.push({ number: m.number, title: m.title, state: want });
  }
  return out;
}

// ---- Jira epics -------------------------------------------------------------------------------------------
export interface JiraEpic { key: string; summary: string; description?: string | null; statusCategory: 'new' | 'indeterminate' | 'done' | (string & {}); rank?: number; priority?: string | null }

// Epics as the roadmap: the epic key is the item id, rank order the phase, the status category the status.
export function fromJira(epics: JiraEpic[]): Roadmap {
  const ordered = [...epics].sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) || a.key.localeCompare(b.key));
  const status = (c: string): RoadmapStatus => (c === 'done' ? 'done' : c === 'indeterminate' ? 'active' : 'planned');
  return { schema: ROADMAP_SCHEMA, items: ordered.map((e, i) => ({ id: e.key, title: e.summary, status: status(e.statusCategory), phase: String(i + 1), priority: (e.priority ?? 'medium').toLowerCase(), acceptance: acceptanceOf(e.description ?? '') })) };
}
// An item done in the roadmap transitions its epic; one active starts it.
export function jiraChanges(roadmap: Roadmap, epics: JiraEpic[]): Array<{ key: string; to: 'done' | 'active' }> {
  const byKey = new Map(epics.map((e) => [e.key, e]));
  const out: Array<{ key: string; to: 'done' | 'active' }> = [];
  for (const it of roadmap.items) {
    const e = byKey.get(it.id);
    if (!e) continue;
    if (it.status === 'done' && e.statusCategory !== 'done') out.push({ key: e.key, to: 'done' });
    else if (it.status === 'active' && e.statusCategory === 'new') out.push({ key: e.key, to: 'active' });
  }
  return out;
}

// ---- the normalized roadmap's own diff ---------------------------------------------------------------------
export interface RoadmapChange { id: string; kind: 'added' | 'removed' | 'status' | 'edited'; from?: string; to?: string }
export function diffRoadmaps(before: Roadmap | undefined, after: Roadmap): RoadmapChange[] {
  const prev = new Map((before?.items ?? []).map((i) => [i.id, i]));
  const next = new Map(after.items.map((i) => [i.id, i]));
  const out: RoadmapChange[] = [];
  for (const [id, it] of next) {
    const p = prev.get(id);
    if (!p) { out.push({ id, kind: 'added', to: it.status }); continue; }
    if (p.status !== it.status) out.push({ id, kind: 'status', from: p.status, to: it.status });
    else if (p.title !== it.title || p.phase !== it.phase || p.priority !== it.priority || p.acceptance.join('\n') !== it.acceptance.join('\n')) out.push({ id, kind: 'edited' });
  }
  for (const id of prev.keys()) if (!next.has(id)) out.push({ id, kind: 'removed' });
  return out;
}
export const sameRoadmap = (a: Roadmap | undefined, b: Roadmap): boolean => !!a && diffRoadmaps(a, b).length === 0 && a.schema === b.schema;
