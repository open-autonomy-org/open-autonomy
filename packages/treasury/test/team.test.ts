// Authority guard: a human OAuth token cannot bypass the current repository owner or revision.
import { expect, test } from 'bun:test';
import { replaceTeamConfig, type Team } from '@open-autonomy/sdk/team';
import { proposeTeamEdit, type TeamEdit } from '../src/team.ts';
import type { Env } from '../src/types.ts';

test('team proposals require current owner identity and revision, and never write main or merge', async () => {
  const original = globalThis.fetch;
  const sha = 'a'.repeat(40), head = 'b'.repeat(40);
  const team: Team = { members: [{ id: 'owner', name: 'Owner', github: { id: '42', login: 'owner' }, scopes: ['owner'], source: 'Owner-confirmed setup.' }] };
  const config = replaceTeamConfig('account: acme/app\nmodels: [allowed]\n', team);
  const writes: Array<{ path: string; body: any; authorization: string | null }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init), path = new URL(req.url).pathname;
    if (req.method !== 'GET') { const body = await req.json(); writes.push({ path, body, authorization: req.headers.get('authorization') }); return Response.json(path.endsWith('/pulls') ? { number: 7 } : {}); }
    if (path === '/repos/acme/app') return Response.json({ private: false, default_branch: 'main' });
    if (path.endsWith('/git/ref/heads/main')) return Response.json({ object: { sha: head } });
    if (path.endsWith('/contents/.open-autonomy/config.yaml')) return Response.json({ encoding: 'base64', content: btoa(config), sha, size: config.length });
    if (path === '/users/owner') return Response.json({ id: 42, login: 'owner', type: 'User' });
    throw new Error(`Unexpected request ${path}`);
  }) as typeof fetch;
  try {
    const env = { GITHUB_API_BASE: 'https://github.test', GITHUB_TOKEN: 'reader-only' } as Env;
    const edit: TeamEdit = { account: 'acme/app', sha, member: { ...team.members[0], name: 'New label' }, remove: false };
    await expect(proposeTeamEdit(env, edit, 'human', { id: '43', login: 'owner' }, 'proposal')).rejects.toThrow('Only an owner');
    await expect(proposeTeamEdit(env, { ...edit, sha: 'c'.repeat(40) }, 'human', { id: '42', login: 'owner' }, 'proposal')).rejects.toThrow('changed while');
    await expect(proposeTeamEdit(env, { ...edit, remove: true }, 'human', { id: '42', login: 'owner' }, 'proposal')).rejects.toThrow('last owner');
    await expect(proposeTeamEdit(env, { ...edit, member: team.members[0] }, 'human', { id: '42', login: 'owner' }, 'proposal')).rejects.toThrow('no changes');
    await expect(proposeTeamEdit(env, { ...edit, member: { ...edit.member, github: { id: '1', login: 'owner' } } }, 'human', { id: '42', login: 'owner' }, 'proposal')).rejects.toThrow('does not match');
    expect(writes).toEqual([]);
    expect(await proposeTeamEdit(env, edit, 'human', { id: '42', login: 'owner' }, 'proposal')).toBe('https://github.com/acme/app/pull/7');
    expect(writes.map(w => w.path)).toEqual(['/repos/acme/app/git/refs', '/repos/acme/app/contents/.open-autonomy/config.yaml', '/repos/acme/app/pulls']);
    expect(writes.every(w => w.authorization === 'Bearer human')).toBe(true);
    expect(writes[0].body).toEqual({ ref: 'refs/heads/team/proposal', sha: head });
    expect(writes[1].body.branch).toBe('team/proposal');
    expect(atob(writes[1].body.content)).toStartWith('account: acme/app\nmodels: [allowed]\n');
    expect(writes[2].body.draft).toBe(true);
    expect(writes[2].body.base).toBe('main');
  } finally { globalThis.fetch = original; }
});
