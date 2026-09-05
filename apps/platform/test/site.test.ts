import { describe, expect, test } from 'bun:test';
import { renderActivitySvg, renderNowSvg, renderRoadmapSvg, renderRunwaySvg } from '../src/widgets.ts';
import { parseRoadmap } from '@open-autonomy/sdk/roadmap';
import { admin, fund, github, mintKey, request, requestJson, testEnv, useEnv } from './env.ts';

const ROADMAP = `schema: open-autonomy.roadmap.v3
items:
  - id: add
    phase: 1
    status: done
    title: todo add appends an item
    acceptance:
      - "\`todo add\` appends and prints the id."
  - id: list
    phase: 1
    status: active
    title: todo list prints open items
    acceptance:
      - One line per open item.
  - id: done
    phase: 2
    status: planned
    title: todo done marks an item finished
  - id: later
    phase: 3
    status: proposed
    title: Something the owner has not decided on
`;
const SCHEDULE = JSON.stringify({ jobs: [{ name: 'build-roadmap', schedule: 'every 360m', deliver: 'discord' }] });
let n = 0;
const ce = (type: string, subject: string, data: unknown, time?: string) => ({ specversion: '1.0', id: `e-${++n}`, source: 'test', type: `org.open-autonomy.${type}`, subject, time, data });

async function project(env: ReturnType<typeof testEnv>) {
  github.repos['acme/app'] = { description: 'A todo list that builds itself', html_url: 'https://github.com/acme/app', owner: { avatar_url: 'https://avatars.test/a.png' } };
  github.files['acme/app:ROADMAP.yml'] = ROADMAP;
  github.files['acme/app:docs/VISION.md'] = '# Vision\n\nA todo list built by its own agent, in the open.\n\nMore below.';
  github.files['acme/app:CHANGELOG.md'] = '# Changelog\n\n## Unreleased\n- `add`: appends an item.\n';
  github.files['acme/app:hermes/cron/jobs.seed.json'] = SCHEDULE;
  github.files['acme/app:hermes/SOUL.md'] = 'You are this project\'s agent.\n\nYou work the roadmap.';
  github.files['acme/app:hermes/config.yaml'] = 'model:\n  default: zai/glm-5.3-flash\n  provider: custom\n';
  expect((await requestJson(env, '/admin/accounts/acme%2Fapp/sync', { headers: admin, method: 'POST' })).ok).toBe(true);
}

describe('the site: explore, the project page, the session page, the item page', () => {
  test('a synced project lists on explore and renders its vision, spine, setup and changelog', async () => {
    const env = useEnv(testEnv());
    await fund(env, 'acme/app', 500);
    await project(env);
    const explore = await (await request(env, '/')).text();
    expect(explore.includes('/p/acme%2Fapp')).toBe(true);
    expect(explore.includes('A todo list that builds itself')).toBe(true);
    const page = await (await request(env, '/p/acme%2Fapp')).text();
    expect(page.indexOf('>Next<')).toBeLessThan(page.indexOf('>Now<'));
    expect(page.indexOf('>Now<')).toBeLessThan(page.indexOf('>Done<'));
    expect(page.includes('A todo list built by its own agent')).toBe(true);
    expect(page.includes('todo done marks an item finished')).toBe(true); // queued, in NEXT
    expect(page.includes('proposed · awaits owner')).toBe(true);
    expect(page.includes('One line per open item.')).toBe(true); // acceptance verbatim
    expect(page.includes('fires every 360m')).toBe(true);
    expect(page.includes('no run yet')).toBe(true);
    expect(page.includes('class="rm-now"')).toBe(true);
    expect(page.includes('href="/p/acme%2Fapp/items/list"')).toBe(true); // stations link to the item view
    expect(page.includes('shipped by the maintainer · no agent session')).toBe(true);
    expect(page.includes('zai/glm-5.3-flash')).toBe(true);
    expect(page.includes('appends an item.')).toBe(true); // the changelog line
    expect(page.includes('About') === false).toBe(true);
    expect((await request(env, '/p/nobody%2Fnothing')).status).toBe(404);
  });

  test('sessions file under their items; a live session shows in NOW with the live channel; the last run makes the health line', async () => {
    const env = useEnv(testEnv());
    await fund(env, 'acme/app', 500);
    await project(env);
    const { token } = await mintKey(env);
    const post = (body: unknown) => request(env, '/v1/agent/events', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body });
    await post(ce('session.started', 'run-1', { session_kind: 'run', source: 'build-roadmap', item_id: 'add' }, '2026-09-03T08:56:58Z'));
    await post(ce('session.ended', 'run-1', { outcome: 'done', report: 'Done. add — committed 0d71f31.', commit_sha: '0d71f31352271ed4dbbd818e4d252b742c087549', ended_at: '2026-09-03T09:20:57Z' }));
    await post(ce('session.started', 'run-2', { session_kind: 'run', source: 'build-roadmap', item_id: 'list' }));
    await post(ce('session.turns', 'run-2', { seq: 0, turns: [{ role: 'assistant', tool: 'read_file', args: '{"path":"ROADMAP.yml"}' }] }));
    const page = await (await request(env, '/p/acme%2Fapp')).text();
    expect(page.includes('commit 0d71f31 ↗')).toBe(true);
    expect(page.includes('https://github.com/acme/app/commit/0d71f31352271ed4dbbd818e4d252b742c087549')).toBe(true);
    expect(page.includes('/p/acme%2Fapp/sessions/run-1')).toBe(true);
    expect(page.includes('livebox')).toBe(true);
    expect(page.includes('Follow the session')).toBe(true);
    expect(page.includes('data-live-session="run-2"')).toBe(true);
    expect(page.includes('new EventSource(')).toBe(true);
    expect(page.includes('fires every 360m')).toBe(false);
    // The session page: report, proofs, transcript, live.
    const session = await (await request(env, '/p/acme%2Fapp/sessions/run-2')).text();
    expect(session.includes('class="tn">read_file<')).toBe(true);
    expect(session.includes('data-last-seq="0"')).toBe(true);
    expect(session.includes('in progress')).toBe(true);
    const ended = await (await request(env, '/p/acme%2Fapp/sessions/run-1')).text();
    expect(ended.indexOf('Report (the agent')).toBeLessThan(ended.indexOf('>Proofs<'));
    expect(ended.includes('✓ completed · 24m')).toBe(true);
    expect((await request(env, '/p/acme%2Fapp/sessions/nope')).status).toBe(404);
    // The item page: the item's own lines, its sessions, its updates, its cents; live while a session runs.
    await post(ce('item.update', 'list', { text: 'the list command prints; sorting next', session: 'run-2' }));
    const item = await (await request(env, '/p/acme%2Fapp/items/list')).text();
    expect(item.includes('todo list prints open items')).toBe(true);
    expect(item.includes('One line per open item.')).toBe(true);
    expect(item.includes('/p/acme%2Fapp/sessions/run-2')).toBe(true);
    expect(item.includes('sorting next')).toBe(true);
    expect(item.includes('data-live="1"')).toBe(true);
    expect(item.includes('/items/')).toBe(true);
    // Every session, on its own page, newest first, each filed under its item.
    const all = await (await request(env, '/p/acme%2Fapp/sessions')).text();
    expect(all.indexOf('/sessions/run-2')).toBeLessThan(all.indexOf('/sessions/run-1'));
    expect(all.includes('href="/p/acme%2Fapp/items/add"')).toBe(true);
    expect(all.includes('2 sessions on the page · 1 live')).toBe(true);
    expect((await request(env, '/p/nobody%2Fnothing/sessions')).status).toBe(404);
    await post(ce('session.ended', 'run-2', { outcome: 'failed', report: 'the check failed' }));
    const after = await (await request(env, '/p/acme%2Fapp')).text();
    expect(/last run .*: failed/.test(after)).toBe(true);
    expect(after.includes('/p/acme%2Fapp/sessions/run-2')).toBe(true);
    expect(after.includes('data-live-session=')).toBe(false);
  });

  test('the widgets render from the same data', async () => {
    const env = useEnv(testEnv());
    await fund(env, 'acme/app', 500);
    const runway = renderRunwaySvg(await requestJson(env, '/v1/accounts/acme%2Fapp'));
    expect(runway.includes('$5.00 left of $5.00')).toBe(true);
    expect(runway.includes('<script')).toBe(false);
    const roadmap = renderRoadmapSvg(parseRoadmap(ROADMAP).items);
    expect(roadmap.includes('1 shipped · 1 in progress · 1 queued')).toBe(true);
    expect(roadmap.includes('1 proposed')).toBe(true);
    expect(roadmap.includes('· now')).toBe(true);
    expect(renderActivitySvg(await requestJson(env, '/v1/accounts/acme%2Fapp')).includes('0 metered calls')).toBe(true);
    const idle = renderNowSvg([], [], SCHEDULE);
    expect(idle.includes('build-roadmap · fires every 360m')).toBe(true);
    for (const kind of ['runway', 'roadmap', 'activity', 'now']) {
      const res = await request(env, `/v1/accounts/acme%2Fapp/${kind}.svg`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('image/svg+xml');
    }
    expect((await request(env, '/v1/funding/runway.svg')).status).toBe(200);
  });
});
