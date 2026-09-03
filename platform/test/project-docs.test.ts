import { describe, expect, test } from 'bun:test';
import { renderRoadmapPanel, parseRoadmap, roadmapItemState } from '../src/project-docs.js';

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
