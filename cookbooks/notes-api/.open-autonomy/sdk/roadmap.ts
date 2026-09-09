// The timeline model: one document of a project's work in one language, past, present and future, whatever
// holds each part natively. The Hermes kit keeps its past in CHANGELOG.md, its present on the Hermes board with
// the sessions serving it, and its future in ROADMAP.md; an engagement keeps all three in a client's tracker.
// Unifying those into this shape is the substrate's SDK implementation's job (the reporter, a driver); the
// platform holds the document revisioned and renders it as views, sorts and groupings, never edits.
//
// An item:
//   id            stable within the project (a task id, a ticket key, a hash of a changelog line)
//   tense         past | present | future — where the item sits on the timeline
//   status        proposed | planned | active | done — the finer word within its tense
//   home          the native place it came from, the substrate's own label: changelog, kanban, roadmap, jira…
//   phase, priority, release   how the views group and order it (a release is what shipped it, or will)
//   proposed_at, started_at, done_at   when it entered each tense, ISO
//   by            who: an agent profile, a login
//   commit, url   the proof and the native record
//   acceptance    the lines that define done

export const ROADMAP_SCHEMA = 'open-autonomy.timeline.v1';
export type Tense = 'past' | 'present' | 'future';
export const TENSES: readonly Tense[] = ['past', 'present', 'future'];
export type RoadmapStatus = 'proposed' | 'planned' | 'active' | 'done';
export const ROADMAP_STATUSES: readonly RoadmapStatus[] = ['proposed', 'planned', 'active', 'done'];

export interface RoadmapItem {
  id: string;
  title: string;
  tense: Tense;
  status: RoadmapStatus;
  home?: string;
  phase?: string;
  priority?: string;
  release?: string;
  proposed_at?: string;
  started_at?: string;
  done_at?: string;
  by?: string;
  commit?: string;
  url?: string;
  acceptance: string[];
}

export interface Roadmap {
  schema: string;
  items: RoadmapItem[];
}

// A tense a driver did not name follows from the status: shipped is past, in progress is present, the rest is future.
export function tenseOf(item: Pick<RoadmapItem, 'status'> & { tense?: string }): Tense {
  if (item.tense && (TENSES as readonly string[]).includes(item.tense)) return item.tense as Tense;
  return item.status === 'done' ? 'past' : item.status === 'active' ? 'present' : 'future';
}

// Where an item stands, for a renderer: the status as written, anything unrecognized queued.
export type RoadmapState = 'proposed' | 'queued' | 'active' | 'done';
export function itemState(item: Pick<RoadmapItem, 'status'>): RoadmapState {
  if (item.status === 'proposed' || item.status === 'active' || item.status === 'done') return item.status;
  return 'queued';
}

export function phaseNumber(item: Pick<RoadmapItem, 'phase'>): number {
  const n = parseInt(item.phase ?? '', 10);
  return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
}

// The moment an item is placed at on the timeline: when it shipped, else when it started, else when it was proposed.
export function itemTime(item: Pick<RoadmapItem, 'done_at' | 'started_at' | 'proposed_at'>): number {
  const t = Date.parse(item.done_at ?? item.started_at ?? item.proposed_at ?? '');
  return Number.isNaN(t) ? 0 : t;
}
