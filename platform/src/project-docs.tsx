// A project's identity documents — its vision (docs/VISION.md), roadmap (ROADMAP.yml), and changelog — fetched
// from its own repo and rendered into the funding page. These are PURE functions (no network, no DOM)
// so they are testable in isolation: parse the raw doc text the repo ships, then render it into the
// page's existing panel styles. The repo is the source of truth; the page is just a faithful window
// onto what the project says it is and is doing.
import { Icon } from './ui/Icon.js';
import { render } from './ui/render.js';

export interface RoadmapItem {
  id: string;
  title: string;
  // Written in ROADMAP.yml by the agent as it works: proposed (awaits the owner) | planned (queued) |
  // active (being built now) | done (every acceptance line true and verified).
  status?: string;
  phase?: string;
  priority?: string;
}

export type RoadmapState = 'proposed' | 'parked' | 'in_progress' | 'done';

// The rendered state of an item is exactly its written status; anything unrecognized is queued.
export function roadmapItemState(item: RoadmapItem): RoadmapState {
  if (item.status === 'proposed') return 'proposed';
  if (item.status === 'done') return 'done';
  if (item.status === 'active') return 'in_progress';
  return 'parked';
}

export interface ChangelogEntry {
  heading: string;
  lines: string[];
}

function esc(s: string): string {
  return String(s).replace(/[<>&'"]/g, (c) => (
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === "'" ? '&#39;' : '&quot;'
  ));
}

function unquote(s: string): string {
  const t = s.trim();
  return t.replace(/^['"]/, '').replace(/['"]$/, '').trim();
}

// Minimal, safe Markdown → HTML for short prose blocks (the constitution excerpt): escape first, then
// paragraphs, `**bold**`, inline `code`, and `- ` bullet lists. Deliberately tiny — anything fancier is
// out of scope for a doc excerpt and would just be attack surface.
export function mdToSafeHtml(md: string): string {
  const inline = (s: string): string =>
    esc(s)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  const blocks = md.trim().split(/\n{2,}/);
  const out: string[] = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines.every((l) => /^\s*-\s+/.test(l))) {
      out.push(`<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*-\s+/, ''))}</li>`).join('')}</ul>`);
    } else {
      out.push(`<p>${inline(block).replace(/\n/g, ' ')}</p>`);
    }
  }
  return out.join('\n');
}

// Pull the vision's lead: a `## North Star` section if present, else the first prose paragraph after the H1,
// so any document shape yields something.
export function constitutionExcerpt(md: string): string {
  if (!md) return '';
  const lines = md.split('\n');
  const start = lines.findIndex((l) => /^##\s+north star/i.test(l));
  if (start >= 0) {
    const rest = lines.slice(start + 1);
    const end = rest.findIndex((l) => /^##\s/.test(l));
    return rest.slice(0, end < 0 ? undefined : end).join('\n').trim();
  }
  // Fallback: first non-heading paragraph.
  const body = lines.filter((l) => !/^#/.test(l)).join('\n').trim();
  return body.split(/\n{2,}/)[0]?.trim() ?? '';
}

// Tolerant line parser for `ROADMAP.yml` — we only read the handful of fields we render
// (no need for a YAML dependency in the worker). An item starts at `- id:`; its scalar fields follow
// until the next item. Nested `acceptance:` bullets never start with `id:`, so they are ignored.
export function parseRoadmap(yml: string): RoadmapItem[] {
  const items: RoadmapItem[] = [];
  let cur: RoadmapItem | null = null;
  for (const line of yml.split('\n')) {
    const idm = line.match(/^\s*-\s+id:\s*(.+?)\s*$/);
    if (idm) {
      if (cur) items.push(cur);
      cur = { id: unquote(idm[1]), title: '', status: '' };
      continue;
    }
    if (!cur) continue;
    const fm = line.match(/^\s+(phase|priority|status|title):\s*(.+?)\s*$/);
    if (fm) {
      const [, key, val] = fm;
      if (key === 'phase') cur.phase = unquote(val);
      else if (key === 'priority') cur.priority = unquote(val);
      else if (key === 'status') cur.status = unquote(val);
      else if (key === 'title') cur.title = unquote(val);
    }
  }
  if (cur) items.push(cur);
  return items.filter((i) => i.id && i.title);
}

// Parse a Keep-a-Changelog file into its top-level version sections (`## …`) and their bullet lines.
// Sub-headings (`### …`) are flattened away; we keep the first few bullets of the most recent sections.
export function parseChangelog(md: string, maxSections = 2, maxLines = 6): ChangelogEntry[] {
  const sections: ChangelogEntry[] = [];
  let cur: ChangelogEntry | null = null;
  for (const line of md.split('\n')) {
    const hm = line.match(/^##\s+(.+?)\s*$/);
    if (hm) {
      if (cur) sections.push(cur);
      cur = { heading: hm[1].trim(), lines: [] };
      continue;
    }
    if (!cur) continue;
    const bm = line.match(/^\s*-\s+(.+?)\s*$/);
    if (bm) cur.lines.push(bm[1].trim());
  }
  if (cur) sections.push(cur);
  return sections.slice(0, maxSections).map((s) => ({ heading: s.heading, lines: s.lines.slice(0, maxLines) }));
}

// ── Render (into the page's existing `.panel` styling) ──────────────────────────────────────────────
// Each returns '' when the doc is absent, so the page simply omits the panel for a repo that ships none.

export function CharterPanel({ md, repoUrl }: { md?: string; repoUrl?: string }) {
  const excerpt = constitutionExcerpt(md ?? '');
  if (!excerpt) return null;
  return (
    <div class="panel">
      <h3>Vision</h3>
      <div class="prose" dangerouslySetInnerHTML={{ __html: mdToSafeHtml(excerpt) }} />
      {repoUrl ? <a class="docmore" href={`${repoUrl}/blob/HEAD/docs/VISION.md`}>Read the full vision →</a> : null}
    </div>
  );
}

export function renderCharterPanel(md: string | undefined, repoUrl: string | undefined): string {
  return render(<CharterPanel md={md} repoUrl={repoUrl} />);
}

// State → CSS class (reuse the existing node colours): in_progress reads as "active", parked as "planned".
const STATE_CLASS: Record<RoadmapState, string> = {
  in_progress: 'active',
  parked: 'planned',
  proposed: 'proposed',
  done: 'done',
};

type Row = { item: RoadmapItem; state: RoadmapState };

function stateLabel(state: RoadmapState): string {
  if (state === 'in_progress') return 'in progress';
  if (state === 'done') return 'shipped';
  if (state === 'proposed') return 'proposed';
  return 'queued';
}

// One station on the journey timeline — a roadmap item sitting on the phase spine. Its node colour is its
// state (✓ shipped / ● in flight / ○ queued / ◌ proposed); the frontier in-flight item wears a "now" marker.
function RoadmapStation({ row, now }: { row: Row; now?: boolean }) {
  const { item: it, state } = row;
  const phase = it.phase ? (isNaN(parseInt(it.phase, 10)) ? it.phase : `P${it.phase}`) : '';
  return (
    <li class={`rm-stn ${STATE_CLASS[state]}${now ? ' is-now' : ''}`}>
      <span class="rm-node" aria-hidden="true" />
      <div class="rm-stnbody">
        <div class="rm-shead">
          <span class="rm-stitle">{it.title}</span>
          {now ? <span class="rm-now">now</span> : null}
          {phase ? <span class="rm-sphase">{phase}</span> : null}
          <span class="rm-sstatus">{stateLabel(state)}</span>
        </div>
      </div>
    </li>
  );
}

// The proposed candidates — not yet on the committed path — as one collapsed station at the foot of the spine.
function RoadmapFuture({ rows }: { rows: Row[] }) {
  const phaseNums = rows.map((r) => parseInt(r.item.phase ?? '', 10)).filter((n) => !isNaN(n));
  const range = phaseNums.length ? `P${Math.min(...phaseNums)}–${Math.max(...phaseNums)}` : '';
  return (
    <li class="rm-stn proposed">
      <span class="rm-node" aria-hidden="true" />
      <details>
        <summary><div class="rm-shead"><span class="rm-stitle">{`${rows.length} proposed`}</span>{range ? <span class="rm-sphase">{range}</span> : null}<span class="rm-sstatus">candidates</span></div></summary>
        <ul class="rm-future">{rows.map((r) => <li>{r.item.title}{r.item.phase ? <span class="rm-sphase">{`P${r.item.phase}`}</span> : null}</li>)}</ul>
      </details>
    </li>
  );
}

// A JOURNEY TIMELINE. Items are stations on a phase-ordered spine — shipped behind us, the in-flight
// frontier marked "now", the queue ahead, proposed candidates folded at the foot. Reads as a path.
export function RoadmapPanel({ yml, repoUrl }: { yml?: string; repoUrl?: string }) {
  const items = parseRoadmap(yml ?? '');
  if (!items.length) return null;
  const rows: Row[] = items.map((item) => ({ item, state: roadmapItemState(item) }));
  const phaseNum = (i: RoadmapItem): number => { const n = parseInt(i.phase ?? '', 10); return isNaN(n) ? Number.MAX_SAFE_INTEGER : n; };
  const byPhase = (a: Row, b: Row): number => phaseNum(a.item) - phaseNum(b.item);
  const of = (s: RoadmapState): Row[] => rows.filter((r) => r.state === s).sort(byPhase);
  const inProgress = of('in_progress');
  const parked = of('parked');
  const proposed = of('proposed');
  const done = of('done');
  // The committed path: shipped → in flight → queued, one spine in phase order. Proposed candidates fold below.
  const spine = rows.filter((r) => r.state !== 'proposed').sort(byPhase);
  const frontier = inProgress[0] ?? parked[0]; // the "now" station — earliest live (else next queued)
  const phaseNumbers = items.map(phaseNum).filter((n) => n < Number.MAX_SAFE_INTEGER);
  const maxPhase = phaseNumbers.length ? Math.max(...phaseNumbers) : 0;
  const curPhase = frontier && phaseNum(frontier.item) < Number.MAX_SAFE_INTEGER ? phaseNum(frontier.item) : (done.length ? maxPhase : 0);
  const committedTotal = inProgress.length + parked.length + done.length;
  const pct = committedTotal > 0 ? Math.round((done.length / committedTotal) * 100) : 0;
  const roadmapUrl = repoUrl ? `${repoUrl}/blob/HEAD/ROADMAP.yml` : undefined;

  return (
    <div class="panel roadmap-panel">
      <div class="rm-phasehdr">
        <h3>Roadmap</h3>
        {maxPhase > 0 ? <span class="rm-phasenum">{`Phase ${curPhase || 1} / ${maxPhase}`}</span> : null}
      </div>
      <div class="rm-momentum">
        <div class="rm-stats">
          <span class="act"><b>{inProgress.length}</b> in progress</span>
          <span><b>{parked.length}</b> queued</span>
          <span><b>{done.length}</b> shipped</span>
        </div>
        <div class="rm-track"><div class="rm-fill" style={`width:${pct}%`} /></div>
      </div>
      <ol class="rm-spine">
        {spine.map((r) => <RoadmapStation row={r} now={frontier && r.item.id === frontier.item.id} />)}
        {proposed.length ? <RoadmapFuture rows={proposed} /> : null}
      </ol>
      {roadmapUrl ? <a class="docmore" href={roadmapUrl}>Full roadmap →</a> : null}
    </div>
  );
}

export function renderRoadmapPanel(yml: string | undefined, repoUrl: string | undefined): string {
  return render(<RoadmapPanel yml={yml} repoUrl={repoUrl} />);
}

export function ChangelogPanel({ md, repoUrl }: { md?: string; repoUrl?: string }) {
  const withLines = parseChangelog(md ?? '').filter((s) => s.lines.length);
  if (!withLines.length) return null;
  return (
    <div class="panel">
      <h3>What's shipped</h3>
      {withLines.map((s) => (
        <div class="release">
          <div class="rel-head">{s.heading}</div>
          <ul class="changelog">{s.lines.map((l) => <li>{l}</li>)}</ul>
        </div>
      ))}
      {repoUrl ? <a class="docmore" href={`${repoUrl}/blob/HEAD/CHANGELOG.md`}>Full changelog →</a> : null}
    </div>
  );
}

export function renderChangelogPanel(md: string | undefined, repoUrl: string | undefined): string {
  return render(<ChangelogPanel md={md} repoUrl={repoUrl} />);
}
