import { describe, expect, test } from 'bun:test';
import { CONFORMANCE, diffRoadmaps, fromJira, fromMilestones, jiraChanges, milestoneChanges, parseRoadmapConfig, sameRoadmap, type Milestone } from '../src/drivers.ts';
import { parseRoadmap, renderRoadmap } from '../src/roadmap.ts';

const milestones: Milestone[] = [
  { number: 3, title: 'Search', description: 'Find things.\n\n- `todo find <word>` prints matching items.\n- A test covers it.', state: 'open', due_on: '2026-11-01T00:00:00Z', created_at: '2026-09-03T00:00:00Z' },
  { number: 1, title: 'Add & list', description: 'The two basic commands, one test each.', state: 'closed', due_on: '2026-10-01T00:00:00Z', created_at: '2026-09-01T00:00:00Z' },
  { number: 2, title: 'Done', description: null, state: 'open', due_on: '2026-10-01T00:00:00Z', created_at: '2026-09-02T00:00:00Z' },
  { number: 4, title: 'Someday', state: 'open', due_on: null, created_at: '2026-09-04T00:00:00Z' },
];

describe('roadmap drivers', () => {
  test('the config block names the source and its settings; file is the default', () => {
    expect(parseRoadmapConfig('account: a/b\nroadmap:\n  source: file\n  path: ROADMAP.yml\n')).toEqual({ source: 'file', path: 'ROADMAP.yml' });
    expect(parseRoadmapConfig('roadmap:\n  source: jira\n  jira:\n    base_url: https://x.atlassian.net\n    project: TODO\n    done_transition: Done\npublish:\n  runs: true\n')).toEqual({ source: 'jira', path: 'ROADMAP.yml', jira: { base_url: 'https://x.atlassian.net', project: 'TODO', done_transition: 'Done' } });
    expect(parseRoadmapConfig('roadmap:\n  source: nonsense\n').source).toBe('file');
    expect(parseRoadmapConfig('').source).toBe('file');
  });

  test('milestones become a roadmap: due-date order is the phase, closed is done, bullets are acceptance', () => {
    const r = fromMilestones(milestones);
    expect(r.items.map((i) => [i.id, i.phase, i.status])).toEqual([['add-list', '1', 'done'], ['done', '1', 'planned'], ['search', '2', 'planned'], ['someday', '3', 'planned']]);
    expect(r.items[2].acceptance).toEqual(['`todo find <word>` prints matching items.', 'A test covers it.']);
    expect(r.items[0].acceptance).toEqual(['The two basic commands, one test each.']);
    expect(r.items[3].acceptance).toEqual([]);
    expect(CONFORMANCE['github-milestones'].length).toBeGreaterThan(0);
    // The roadmap file the driver would write parses back to the same model.
    expect(parseRoadmap(renderRoadmap(r)).items).toEqual(r.items);
  });

  test('reconcile: an item done in the roadmap closes its milestone; nothing else moves', () => {
    const r = fromMilestones(milestones);
    r.items.find((i) => i.id === 'search')!.status = 'done';
    expect(milestoneChanges(r, milestones)).toEqual([{ number: 3, title: 'Search', state: 'closed' }]);
    r.items.find((i) => i.id === 'add-list')!.status = 'planned';
    expect(milestoneChanges(r, milestones)).toEqual([{ number: 1, title: 'Add & list', state: 'open' }, { number: 3, title: 'Search', state: 'closed' }]);
  });

  test('jira epics become a roadmap by rank and status category; reconcile plans transitions', () => {
    const epics = [
      { key: 'TODO-3', summary: 'Search', statusCategory: 'new', rank: 3, description: '- find prints matches' },
      { key: 'TODO-1', summary: 'Add', statusCategory: 'done', rank: 1, priority: 'High' },
      { key: 'TODO-2', summary: 'List', statusCategory: 'indeterminate', rank: 2 },
    ];
    const r = fromJira(epics);
    expect(r.items.map((i) => [i.id, i.phase, i.status, i.priority])).toEqual([['TODO-1', '1', 'done', 'high'], ['TODO-2', '2', 'active', 'medium'], ['TODO-3', '3', 'planned', 'medium']]);
    r.items[1].status = 'done'; r.items[2].status = 'active';
    expect(jiraChanges(r, epics)).toEqual([{ key: 'TODO-2', to: 'done' }, { key: 'TODO-3', to: 'active' }]);
  });

  test('a revision names what changed', () => {
    const a = fromMilestones(milestones);
    const b = fromMilestones(milestones.map((m) => (m.number === 3 ? { ...m, state: 'closed' as const, description: 'Find things.' } : m)).filter((m) => m.number !== 4));
    expect(sameRoadmap(a, a)).toBe(true);
    expect(diffRoadmaps(a, b)).toEqual([{ id: 'search', kind: 'status', from: 'planned', to: 'done' }, { id: 'someday', kind: 'removed' }]);
    expect(diffRoadmaps(undefined, a).every((c) => c.kind === 'added')).toBe(true);
  });
});
