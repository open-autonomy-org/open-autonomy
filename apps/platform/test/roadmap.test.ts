import { describe, expect, test } from 'bun:test';
import { admin, fund, github, mintKey, request, requestJson, testEnv, useEnv } from './env.ts';

const ROADMAP = `schema: open-autonomy.roadmap.v3
items:
  - id: add
    phase: 1
    status: planned
    title: todo add appends an item
    acceptance:
      - "\`todo add\` appends and prints the id."
  - id: list
    phase: 1
    status: planned
    title: todo list prints open items
`;
const roadmapKey = (env: ReturnType<typeof testEnv>, scopes: string[]) => (async () => {
  github.files['acme/app:.open-autonomy-claim'] = (await requestJson(env, '/v1/keys/challenge?account=acme%2Fapp')).claim;
  return (await requestJson(env, '/v1/keys/mint', { body: { account: 'acme/app', scopes } })).token as string;
})();

describe('the roadmap: one normalized model, revisioned, from drivers', () => {
  test('the file driver: sync stores a revision; a status flip in the file is the next revision with its diff; the page renders from it', async () => {
    const env = useEnv(testEnv());
    github.repos['acme/app'] = { description: 'x', html_url: 'https://github.com/acme/app' };
    github.files['acme/app:ROADMAP.yml'] = ROADMAP;
    await requestJson(env, '/admin/accounts/acme%2Fapp/sync', { headers: admin, method: 'POST' });
    const first = await requestJson(env, '/v1/accounts/acme%2Fapp/roadmap');
    expect(first.revision).toMatchObject({ revision: 1, source: 'file', by: 'sync', conformance: [] });
    expect(first.revision.roadmap.items.map((i: { id: string }) => i.id)).toEqual(['add', 'list']);
    expect(first.revision.changes).toEqual([{ id: 'add', kind: 'added', to: 'planned' }, { id: 'list', kind: 'added', to: 'planned' }]);
    // The same file again is not a revision.
    await requestJson(env, '/admin/accounts/acme%2Fapp/sync', { headers: admin, method: 'POST' });
    expect((await requestJson(env, '/v1/accounts/acme%2Fapp/roadmap')).revision.revision).toBe(1);
    github.files['acme/app:ROADMAP.yml'] = ROADMAP.replace('status: planned\n    title: todo add', 'status: done\n    title: todo add');
    await requestJson(env, '/admin/accounts/acme%2Fapp/sync', { headers: admin, method: 'POST' });
    const second = await requestJson(env, '/v1/accounts/acme%2Fapp/roadmap');
    expect(second.revision.revision).toBe(2);
    expect(second.revision.changes).toEqual([{ id: 'add', kind: 'status', from: 'planned', to: 'done' }]);
    const revisions = await requestJson(env, '/v1/accounts/acme%2Fapp/roadmap/revisions');
    expect(revisions.revisions.map((r: { revision: number }) => r.revision)).toEqual([2, 1]);
    const page = await (await request(env, '/p/acme%2Fapp')).text();
    expect(page.includes('todo list prints open items')).toBe(true);
    expect(page.includes('Roadmap from <b>file</b>, revision 2')).toBe(true);
    const svg = await (await request(env, '/v1/accounts/acme%2Fapp/roadmap.svg')).text();
    expect(svg.includes('1 shipped · 0 in progress · 1 queued')).toBe(true);
    expect((await request(env, '/v1/accounts/nobody%2Fnothing/roadmap')).status).toBe(404);
  });

  test('the milestones driver: a project whose config names github-milestones is pulled from the public milestones API, with its conformance', async () => {
    const env = useEnv(testEnv());
    github.repos['acme/app'] = { description: 'x', html_url: 'https://github.com/acme/app' };
    github.files['acme/app:.open-autonomy/config.yaml'] = 'account: acme/app\nroadmap:\n  source: github-milestones\n';
    github.milestones['acme/app'] = [
      { number: 1, title: 'Add & list', description: '- add appends\n- list prints', state: 'closed', due_on: '2026-10-01T00:00:00Z', created_at: '2026-09-01T00:00:00Z' },
      { number: 2, title: 'Search', description: 'Find things.', state: 'open', due_on: '2026-11-01T00:00:00Z', created_at: '2026-09-02T00:00:00Z' },
    ];
    await requestJson(env, '/admin/accounts/acme%2Fapp/sync', { headers: admin, method: 'POST' });
    const r = (await requestJson(env, '/v1/accounts/acme%2Fapp/roadmap')).revision;
    expect(r.source).toBe('github-milestones');
    expect(r.roadmap.items.map((i: { id: string; status: string; phase: string }) => [i.id, i.status, i.phase])).toEqual([['add-list', 'done', '1'], ['search', 'planned', '2']]);
    expect(r.roadmap.items[0].acceptance).toEqual(['add appends', 'list prints']);
    expect(r.conformance.length).toBeGreaterThan(0);
    const page = await (await request(env, '/p/acme%2Fapp')).text();
    expect(page.includes('Roadmap from <b>github-milestones</b>')).toBe(true);
    expect(page.includes('this source cannot say')).toBe(true);
    expect(page.includes('href="/p/acme%2Fapp/items/search"')).toBe(true);
  });

  test('an owner-side driver pushes on a steer key; a steer key spends nothing and a spending key cannot steer', async () => {
    const env = useEnv(testEnv());
    await fund(env, 'acme/app', 100);
    const steer = await roadmapKey(env, ['steer']);
    const spend = (await mintKey(env)).token;
    const roadmap = { schema: 'open-autonomy.roadmap.v3', items: [{ id: 'TODO-1', title: 'Add', status: 'active', phase: '1', priority: 'high', acceptance: ['adds'] }] };
    const pushed = await request(env, '/v1/agent/roadmap', { method: 'POST', headers: { authorization: `Bearer ${steer}` }, body: { source: 'jira', roadmap, by: 'owner' } });
    expect(pushed.status).toBe(200);
    const r = (await requestJson(env, '/v1/accounts/acme%2Fapp/roadmap')).revision;
    expect(r).toMatchObject({ revision: 1, source: 'jira', by: 'owner' });
    expect(r.roadmap.items[0]).toMatchObject({ id: 'TODO-1', status: 'active' });
    // Again, unchanged: no new revision.
    expect(((await requestJson(env, '/v1/agent/roadmap', { method: 'POST', headers: { authorization: `Bearer ${steer}` }, body: { source: 'jira', roadmap } })) as { unchanged?: boolean }).unchanged).toBe(true);
    // Scopes: steer cannot spend or narrate; spend cannot steer.
    expect((await request(env, '/v1/chat/completions', { headers: { authorization: `Bearer ${steer}` }, body: { model: 'zai/glm-5.3-flash', messages: [] } })).status).toBe(403);
    expect((await request(env, '/v1/agent/events', { method: 'POST', headers: { authorization: `Bearer ${steer}` }, body: { specversion: '1.0', id: '1', source: 't', type: 'org.open-autonomy.session.started', subject: 's', data: {} } })).status).toBe(403);
    expect((await request(env, '/v1/agent/roadmap', { method: 'POST', headers: { authorization: `Bearer ${spend}` }, body: { source: 'jira', roadmap } })).status).toBe(403);
    // A malformed roadmap is refused; a sync (file driver) does not clobber a pushed Jira roadmap when the config says jira.
    expect((await request(env, '/v1/agent/roadmap', { method: 'POST', headers: { authorization: `Bearer ${steer}` }, body: { source: 'jira', roadmap: { items: [{ id: 'bad:id', title: 'x' }] } } })).status).toBe(400);
    github.repos['acme/app'] = { description: 'x' };
    github.files['acme/app:.open-autonomy/config.yaml'] = 'roadmap:\n  source: jira\n';
    github.files['acme/app:ROADMAP.yml'] = ROADMAP;
    await requestJson(env, '/admin/accounts/acme%2Fapp/sync', { headers: admin, method: 'POST' });
    expect((await requestJson(env, '/v1/accounts/acme%2Fapp/roadmap')).revision.source).toBe('jira');
    expect((await request(env, '/v1/keys/mint', { body: { account: 'acme/app', scopes: ['fly'] } })).status).toBe(400);
  });
});
