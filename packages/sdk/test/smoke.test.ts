import { expect, test } from 'bun:test';
import { fromMilestones, milestoneChanges, parseRoadmapConfig } from '../src/drivers.ts';
import { parseRailsConfig } from '../src/rails.ts';
import { tenseOf } from '../src/roadmap.ts';

// Smoke: the drivers map a tracker to the timeline and back, a tense a driver did not name follows the
// status, the configs parse.
test("the SDK's drivers and configs", () => {
  const milestones = [{ number: 2, title: 'Search', description: '- find prints', state: 'open' as const, due_on: '2026-11-01T00:00:00Z' }, { number: 1, title: 'Add & list', state: 'closed' as const, due_on: '2026-10-01T00:00:00Z', closed_at: '2026-10-02T00:00:00Z' }];
  const r = fromMilestones(milestones);
  expect(r.items.map((i) => [i.id, i.tense, i.status, i.done_at])).toEqual([['add-list', 'past', 'done', '2026-10-02T00:00:00Z'], ['search', 'future', 'planned', undefined]]);
  r.items[1].status = 'done';
  expect(milestoneChanges(r, milestones)).toEqual([{ number: 2, title: 'Search', state: 'closed' }]);
  expect([tenseOf({ status: 'done' }), tenseOf({ status: 'active' }), tenseOf({ status: 'planned' }), tenseOf({ status: 'done', tense: 'present' })]).toEqual(['past', 'present', 'future', 'present']);
  expect(parseRoadmapConfig('roadmap:\n  source: jira\n  jira:\n    project: TODO\n')).toMatchObject({ source: 'jira', jira: { project: 'TODO' } });
  expect(parseRoadmapConfig('models: []\n').source).toBeUndefined();
  expect(parseRailsConfig('rails:\n  card:\n    max_usd_cents: 500\n    categories: [a, b]\n')).toMatchObject({ card: { max_usd_cents: 500, categories: ['a', 'b'] }, partner: { max_usd_cents: 0 } });
});
