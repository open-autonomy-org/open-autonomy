import { describe, expect, test } from 'bun:test';
import { renderRoadmapPanel, parseRoadmap, roadmapItemState } from '../src/project-docs.js';
import { renderActivitySvg, renderRoadmapSvg } from '../src/widgets-svg.js';
import type { FundingSnapshot } from '../src/limit-ledger.js';

// One YAML item from a flat spec object.
function item(o: Record<string, unknown>): string {
  return `- id: ${o.id}\n` + Object.entries(o).filter(([k]) => k !== 'id').map(([k, v]) => `  ${k}: ${v}`).join('\n');
}
function yml(items: Array<Record<string, unknown>>): string {
  return items.map(item).join('\n');
}

describe('roadmapItemState: the written status is the state', () => {
  test('active → in progress, done → done, proposed → proposed, anything else → queued', () => {
    expect(roadmapItemState({ id: 'a', title: 'A', status: 'active' })).toBe('in_progress');
    expect(roadmapItemState({ id: 'a', title: 'A', status: 'done' })).toBe('done');
    expect(roadmapItemState({ id: 'a', title: 'A', status: 'proposed' })).toBe('proposed');
    expect(roadmapItemState({ id: 'a', title: 'A', status: 'planned' })).toBe('parked');
    expect(roadmapItemState({ id: 'a', title: 'A' })).toBe('parked');
  });
});

describe('parseRoadmap', () => {
  test('reads id, title, status, phase, priority; ignores nested acceptance lines', () => {
    const src = `items:\n  - id: a\n    phase: 1\n    priority: high\n    status: active\n    title: Do A\n    acceptance:\n      - id: not-an-item\n      - The thing works.\n  - id: b\n    title: "Do B"\n    status: planned\n`;
    const items = parseRoadmap(src);
    expect(items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(items[0].phase).toBe('1');
    expect(items[0].priority).toBe('high');
    expect(items[0].status).toBe('active');
    expect(items[0].title).toBe('Do A');
    expect(items[1].title).toBe('Do B');
  });
});

describe('renderRoadmapPanel: journey timeline (phase spine of stations)', () => {
  test('stations carry phase + status; the earliest active item wears the now marker', () => {
    const items = [
      { id: 'now1', title: 'Now One', phase: '1', status: 'active' },
      { id: 'park1', title: 'Park One', phase: '2', status: 'planned' },
      { id: 'shipped1', title: 'Shipped One', phase: '1', status: 'done' },
    ];
    const html = renderRoadmapPanel(yml(items), 'https://github.com/acme/widget');
    expect(html.includes('rm-spine')).toBe(true);
    expect(html.includes('Phase 1 / 2')).toBe(true);
    expect(html.includes('class="rm-now"')).toBe(true);
    expect(html.includes('in progress')).toBe(true);
    expect(html.includes('rm-stn done')).toBe(true);
    expect(html.includes('shipped')).toBe(true);
    expect(html.includes('/blob/HEAD/ROADMAP.yml')).toBe(true);
  });

  test('proposed candidates fold into a single future station at the foot of the spine', () => {
    const items = [
      { id: 'a', title: 'Active A', phase: '1', status: 'active' },
      { id: 'p1', title: 'Prop One', phase: '4', status: 'proposed' },
      { id: 'p2', title: 'Prop Two', phase: '5', status: 'proposed' },
    ];
    const html = renderRoadmapPanel(yml(items), undefined);
    expect(html.includes('2 proposed')).toBe(true);
    expect(html.includes('P4–5')).toBe(true);
    expect(html.includes('Prop One')).toBe(true);
  });

  test('momentum counts in-progress / queued / shipped (proposals excluded)', () => {
    const items = [
      { id: 'a', title: 'A', status: 'active' },
      { id: 'b', title: 'B', status: 'planned' },
      { id: 'c', title: 'C', status: 'done' },
      { id: 'd', title: 'D', status: 'proposed' },
    ];
    const html = renderRoadmapPanel(yml(items), undefined);
    expect(html.includes('<b>1</b> in progress')).toBe(true);
    expect(html.includes('<b>1</b> queued')).toBe(true);
    expect(html.includes('<b>1</b> shipped')).toBe(true);
  });

  test('an empty or absent roadmap renders no panel', () => {
    expect(renderRoadmapPanel('', undefined)).toBe('');
    expect(renderRoadmapPanel(undefined, undefined)).toBe('');
  });
});

describe('README widgets (Camo-safe SVG)', () => {
  const camoSafe = (svg: string) => {
    expect(svg.startsWith('<?xml')).toBe(true);
    expect(svg.includes('<script')).toBe(false);
    expect(/href=|url\(|<image/.test(svg)).toBe(false); // no external references
    expect(svg.includes('<animate')).toBe(false);
  };

  test('roadmap.svg lists committed items in phase order with a now marker and folds proposals', () => {
    const items = parseRoadmap(yml([
      { id: 'b', title: 'Queued B', phase: '2', status: 'planned' },
      { id: 'a', title: 'Active A <with & chars>', phase: '1', status: 'active' },
      { id: 'c', title: 'Shipped C', phase: '1', status: 'done' },
      { id: 'p', title: 'Proposed P', phase: '3', status: 'proposed' },
    ]));
    const svg = renderRoadmapSvg(items);
    camoSafe(svg);
    expect(svg.includes('1 shipped · 1 in progress · 1 queued')).toBe(true);
    expect(svg.includes('Active A &lt;with &amp; chars&gt;')).toBe(true);
    expect(svg.includes('in progress · now')).toBe(true);
    expect(svg.includes('1 proposed')).toBe(true);
    expect(svg.indexOf('Shipped C')).toBeLessThan(svg.indexOf('Queued B')); // phase order
    expect(svg.includes('Proposed P')).toBe(false); // folded, not listed
  });

  test('roadmap.svg with no items still renders a frame', () => {
    const svg = renderRoadmapSvg([]);
    camoSafe(svg);
    expect(svg.includes('No roadmap yet')).toBe(true);
  });

  test('activity.svg shows the call count, the week spend, bars per day and the last call', () => {
    const now = Date.parse('2026-09-03T00:10:00Z');
    const f = {
      calls_total: 1234, last_call_at: '2026-09-03T00:03:00Z', burn_per_day_usd_cents: 9,
      daily_spend_usd_cents: [0, 5, 12, 0, 3, 40, 1],
    } as unknown as FundingSnapshot;
    const svg = renderActivitySvg(f, now);
    camoSafe(svg);
    expect(svg.includes('1,234 metered calls · $0.61 this week')).toBe(true);
    expect(svg.includes('last call 7m ago · ~$0.09/day')).toBe(true);
    expect((svg.match(/<rect x="\d+" y="\d+" width="\d+" height="\d+" rx="2"/g) ?? []).length).toBe(14);
  });

  test('activity.svg before any call', () => {
    const f = { calls_total: 0, last_call_at: null, burn_per_day_usd_cents: 0, daily_spend_usd_cents: [] } as unknown as FundingSnapshot;
    const svg = renderActivitySvg(f);
    camoSafe(svg);
    expect(svg.includes('0 metered calls · $0.00 this week')).toBe(true);
    expect(svg.includes('no calls yet')).toBe(true);
  });
});

import { spineHtml, jobPageHtml, renderNowSvg, parseSchedule } from '../src/agent-view.js';
import type { JobRecord, JobSummary } from '../src/limit-ledger.js';

const ROADMAP = `schema: open-autonomy.roadmap.v3
items:
  - id: fund-and-show
    phase: 1
    priority: high
    status: done
    title: Fund the project and show its vision and roadmap
    acceptance:
      - The site renders docs/VISION.md and ROADMAP.yml.
  - id: prune-actions-era
    phase: 3
    priority: medium
    status: active
    title: Nothing in the worker exists only for the retired fleet
    acceptance:
      - Run purposes and github_run_id fields are gone.
      - The activity feed presents a standing key as a key.
  - id: hermes-live-view
    phase: 3
    priority: medium
    status: proposed
    title: Show what the agent is doing now
    acceptance:
      - Visualization only; nothing on the site drives the agent.
  - id: second-project
    phase: 4
    priority: high
    status: planned
    title: A second funded project
    acceptance:
      - Another repository mints a key and runs its own agent.
`;
const SCHEDULE = JSON.stringify({ jobs: [{ name: 'build-roadmap', schedule: 'every 360m', deliver: 'discord' }] });
const doneJob: JobSummary = { key: 'cron_j_20260903_085658', account: 'o/r', status: 'done', job_name: 'build-roadmap', item_id: 'fund-and-show', started_at: '2026-09-03T08:56:58Z', ended_at: '2026-09-03T09:20:57Z', report: 'Done. fund-and-show — committed 0d71f31.', commit_sha: '0d71f31352271ed4dbbd818e4d252b742c087549', turn_count: 40, tool_calls: 11, next_seq: 40, updated_at: '2026-09-03T09:20:57Z' };
const liveJob: JobSummary = { key: 'cron_j_20260903_152011', account: 'o/r', status: 'running', job_name: 'build-roadmap', item_id: 'prune-actions-era', started_at: new Date(Date.now() - 14 * 60_000).toISOString(), turn_count: 38, tool_calls: 12, next_seq: 38, updated_at: new Date().toISOString() };

describe('the spine: NEXT / NOW / DONE from the roadmap, the schedule, and the receipts', () => {
  test('bands, acceptance lines verbatim, receipts under the item they shipped, proofs linked', () => {
    const html = spineHtml({ account: 'o/r', yml: ROADMAP, scheduleJson: SCHEDULE, jobs: [doneJob], repoUrl: 'https://github.com/o/r', now: Date.now() });
    expect(html.indexOf('>Next<')).toBeLessThan(html.indexOf('>Now<'));
    expect(html.indexOf('>Now<')).toBeLessThan(html.indexOf('>Done<'));
    expect(html.includes('Show what the agent is doing now')).toBe(true); // proposed, in NEXT
    expect(html.includes('proposed · awaits owner')).toBe(true);
    expect(html.includes('Another repository mints a key and runs its own agent.')).toBe(true); // acceptance verbatim
    expect(html.includes('fires every 360m')).toBe(true); // the schedule, since nothing is live
    expect(html.includes('reports to discord')).toBe(true);
    expect(html.includes('class="rm-now"')).toBe(true); // the active item wears now
    expect(html.includes('commit 0d71f31 ↗')).toBe(true);
    expect(html.includes('https://github.com/o/r/commit/0d71f31352271ed4dbbd818e4d252b742c087549')).toBe(true);
    expect(html.includes('/p/o%2Fr/jobs/cron_j_20260903_085658')).toBe(true);
    expect(html.includes('40 turns · 11 tools')).toBe(true);
    expect(html.includes('last run')).toBe(true);
  });
  test('a live job replaces the schedule with the live box', () => {
    const html = spineHtml({ account: 'o/r', yml: ROADMAP, scheduleJson: SCHEDULE, jobs: [liveJob, doneJob], current: liveJob.key, now: Date.now() });
    expect(html.includes('livebox')).toBe(true);
    expect(html.includes('Follow the run')).toBe(true);
    expect(html.includes('fires every 360m')).toBe(false);
    expect(html.includes('in progress · 14m')).toBe(true);
    expect(html.includes('data-live-job="cron_j_20260903_152011"')).toBe(true);
  });
  test('a shipped item with no receipt says so instead of inventing one', () => {
    const html = spineHtml({ account: 'o/r', yml: ROADMAP, jobs: [], now: Date.now() });
    expect(html.includes('shipped by the maintainer · no agent run')).toBe(true);
    expect(html.includes('No schedule committed.')).toBe(true);
  });
});

describe('the run page and the now widget', () => {
  const job: JobRecord = { ...doneJob, turns: [
    { ts: '2026-09-03T08:57:00Z', role: 'user', text: 'Work the top open item…' },
    { ts: '2026-09-03T08:57:04Z', role: 'assistant', tool: 'read_file', args: '{"path":"ROADMAP.yml"}' },
    { ts: '2026-09-03T08:57:05Z', role: 'tool', tool: 'read_file', result: '1|# The roadmap…' },
    { ts: '2026-09-03T08:58:00Z', role: 'assistant', text: 'Done.' },
  ] };
  test('run page: report first, then proofs, then the transcript with tool rows', () => {
    const html = jobPageHtml('o/r', job, 'https://github.com/o/r', Date.now());
    expect(html.indexOf('Report (the agent')).toBeLessThan(html.indexOf('>Proofs<'));
    expect(html.indexOf('>Proofs<')).toBeLessThan(html.indexOf('>Transcript<'));
    expect(html.includes('ROADMAP.yml')).toBe(true);
    expect(html.includes('class="tn">read_file<')).toBe(true);
    expect(html.includes('↳ read_file')).toBe(true);
    expect(html.includes('4 of 40 turns kept')).toBe(true);
    expect(html.includes('✓ completed · 24m')).toBe(true);
  });
  test('now.svg: the schedule and last run when idle; the live run when running', () => {
    const idle = renderNowSvg([doneJob], undefined, SCHEDULE, Date.now());
    expect(idle.includes('build-roadmap · fires every 360m')).toBe(true);
    expect(idle.includes('last run 09-03 08:56 UTC · done · fund-and-show · 0d71f31')).toBe(true);
    const live = renderNowSvg([liveJob, doneJob], liveJob.key, SCHEDULE, Date.now());
    expect(live.includes('running 14m · prune-actions-era')).toBe(true);
    expect(live.includes('38 turns · 12 tool calls so far')).toBe(true);
    expect(parseSchedule('garbage').length).toBe(0);
  });
});
