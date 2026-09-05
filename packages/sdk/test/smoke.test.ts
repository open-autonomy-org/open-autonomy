import { expect, test } from 'bun:test';
import { fromMilestones, milestoneChanges, parseRoadmapConfig } from '../src/drivers.ts';
import { parseRailsConfig } from '../src/rails.ts';
import { nextItem, parseRoadmap, renderRoadmap, serializeRoadmap, withStatus } from '../src/roadmap.ts';

// Smoke: the codec round-trips a kit roadmap byte for byte, a status edit touches one line, the drivers
// map a tracker to the model and back, the configs parse.
test("the SDK's codec, drivers and configs", () => {
  const source = renderRoadmap({ schema: 'open-autonomy.roadmap.v3', items: [{ id: 'add', phase: '1', status: 'planned', title: 'todo add: appends', acceptance: ['`todo add` appends "x".'] }, { id: 'later', status: 'proposed', title: 'Later', acceptance: [] }] }, 'The roadmap.');
  const doc = parseRoadmap(source);
  expect(serializeRoadmap(doc)).toBe(source);
  expect(doc.items[0].acceptance).toEqual(['`todo add` appends "x".']);
  expect(nextItem(doc)?.id).toBe('add');
  expect(serializeRoadmap(withStatus(doc, 'add', 'done')).split('\n').filter((l, i) => l !== source.split('\n')[i])).toEqual(['    status: done']);
  const milestones = [{ number: 2, title: 'Search', description: '- find prints', state: 'open' as const, due_on: '2026-11-01T00:00:00Z' }, { number: 1, title: 'Add & list', state: 'closed' as const, due_on: '2026-10-01T00:00:00Z' }];
  const r = fromMilestones(milestones);
  expect(r.items.map((i) => [i.id, i.status])).toEqual([['add-list', 'done'], ['search', 'planned']]);
  r.items[1].status = 'done';
  expect(milestoneChanges(r, milestones)).toEqual([{ number: 2, title: 'Search', state: 'closed' }]);
  expect(parseRoadmapConfig('roadmap:\n  source: jira\n  jira:\n    project: TODO\n')).toMatchObject({ source: 'jira', jira: { project: 'TODO' } });
  expect(parseRailsConfig('rails:\n  card:\n    max_usd_cents: 500\n    categories: [a, b]\n')).toMatchObject({ card: { max_usd_cents: 500, categories: ['a', 'b'] }, partner: { max_usd_cents: 0 } });
});
