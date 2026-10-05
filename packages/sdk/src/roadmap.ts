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
//   commit        the proof: the commit that landed it
//   links         every record it is tied to, typed: the ticket that asked, the issue, the pull request, the branch, the
//                 recording, the roadmap section, the discussion — as many as the publisher knows
//   acceptance    the lines that define done

export const ROADMAP_SCHEMA = 'open-autonomy.timeline.v1';
export type Tense = 'past' | 'present' | 'future';
export const TENSES: readonly Tense[] = ['past', 'present', 'future'];
export type RoadmapStatus = 'proposed' | 'planned' | 'active' | 'done';
export const ROADMAP_STATUSES: readonly RoadmapStatus[] = ['proposed', 'planned', 'active', 'done'];

// A link's kind is what the record is, so a page can show it as such; anything else is `other`.
export type LinkKind = 'jira' | 'github-issue' | 'github-pr' | 'github-discussion' | 'branch' | 'commit' | 'recording' | 'roadmap' | 'changelog' | 'other';
export const LINK_KINDS: readonly LinkKind[] = ['jira', 'github-issue', 'github-pr', 'github-discussion', 'branch', 'commit', 'recording', 'roadmap', 'changelog', 'other'];
export interface Link { kind: LinkKind; url: string; label?: string }

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
  links?: Link[];
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
// A link from a URL and, when known, its words: the kind follows the host and the path.
export function linkOf(url: string, label?: string): Link {
  const u = url.trim();
  const kind: LinkKind = /atlassian\.net\/browse\/|\/jira\/|\/browse\/[A-Z][A-Z0-9]+-\d+/.test(u) ? 'jira'
    : /github\.com\/[^/]+\/[^/]+\/pull\/\d+/.test(u) ? 'github-pr'
    : /github\.com\/[^/]+\/[^/]+\/issues\/\d+/.test(u) ? 'github-issue'
    : /github\.com\/[^/]+\/[^/]+\/discussions\/\d+/.test(u) ? 'github-discussion'
    : /github\.com\/[^/]+\/[^/]+\/commit\/[0-9a-f]{7,40}/.test(u) ? 'commit'
    : /github\.com\/[^/]+\/[^/]+\/tree\//.test(u) ? 'branch'
    : /runhuman\.com\//.test(u) ? 'recording'
    : /\/ROADMAP\.md/.test(u) ? 'roadmap'
    : /\/CHANGELOG\.md/.test(u) ? 'changelog'
    : 'other';
  return label ? { kind, url: u, label } : { kind, url: u };
}
// The links in a run of markdown or plain text: `[words](url)` and bare URLs, each once.
export function linksIn(text: string): Link[] {
  const out = new Map<string, Link>();
  for (const m of text.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g)) out.set(m[2], linkOf(m[2], m[1]));
  for (const m of text.matchAll(/(?<![(\[])(https?:\/\/[^\s)\]>]+)/g)) if (!out.has(m[1])) out.set(m[1], linkOf(m[1]));
  return [...out.values()];
}

export function itemTime(item: Pick<RoadmapItem, 'done_at' | 'started_at' | 'proposed_at'>): number {
  const t = Date.parse(item.done_at ?? item.started_at ?? item.proposed_at ?? '');
  return Number.isNaN(t) ? 0 : t;
}

// A timeline as pushed or pulled, checked to the model's shape: short ids, known statuses and tenses, real
// timestamps, bounded text. A tense the substrate did not name follows from the status.
const isoOrNone = (v: unknown): string | undefined => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : undefined);
const shortOrNone = (v: unknown, n: number): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : undefined);
export function normalizeRoadmap(r: unknown): Roadmap | undefined {
  if (!r || typeof r !== 'object' || !Array.isArray((r as Roadmap).items)) return undefined;
  const items: RoadmapItem[] = [];
  const seen = new Set<string>();
  for (const it of (r as Roadmap).items.slice(0, 2000)) {
    if (!it || typeof it !== 'object' || typeof it.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(it.id) || seen.has(it.id) || typeof it.title !== 'string') return undefined;
    seen.add(it.id);
    const status = (ROADMAP_STATUSES as readonly string[]).includes(it.status) ? it.status : 'planned';
    const optional: Partial<RoadmapItem> = {
      home: shortOrNone(it.home, 40), phase: shortOrNone(it.phase, 20), priority: shortOrNone(it.priority, 20), release: shortOrNone(it.release, 80),
      proposed_at: isoOrNone(it.proposed_at), started_at: isoOrNone(it.started_at), done_at: isoOrNone(it.done_at),
      by: shortOrNone(it.by, 80), commit: typeof it.commit === 'string' && /^[0-9a-f]{7,40}$/.test(it.commit) ? it.commit : undefined,
      links: Array.isArray(it.links) ? (it.links as unknown[]).filter((l): l is { kind?: unknown; url: string; label?: unknown } => !!l && typeof l === 'object' && typeof (l as { url?: unknown }).url === 'string' && /^https:\/\/[^\s]{1,400}$/.test((l as { url: string }).url)).slice(0, 20).map((l) => ({ kind: (typeof l.kind === 'string' && (LINK_KINDS as readonly string[]).includes(l.kind) ? l.kind : 'other') as LinkKind, url: l.url, ...(typeof l.label === 'string' && l.label.trim() ? { label: l.label.trim().slice(0, 120) } : {}) })) : undefined,
    };
    items.push({
      id: it.id, title: it.title.slice(0, 200), tense: tenseOf({ status, tense: it.tense }), status,
      ...Object.fromEntries(Object.entries(optional).filter(([, v]) => v !== undefined)),
      acceptance: Array.isArray(it.acceptance) ? it.acceptance.filter((l): l is string => typeof l === 'string').slice(0, 40).map((l) => l.slice(0, 1000)) : [],
    });
  }
  return { schema: typeof (r as Roadmap).schema === 'string' ? (r as Roadmap).schema : ROADMAP_SCHEMA, items };
}
