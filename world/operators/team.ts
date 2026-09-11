// Manual roster rehearsal through vendor APIs; run attached to the twin world. No live accounts.
import { resolve } from 'node:path';
import { api, need, ACCOUNT, STACK } from '../lib.ts';
import { hermesBin } from '../lib.ts';
import { parseTeamConfig, replaceTeamConfig } from '../../packages/sdk/src/team.ts';
const gh = api(need('GITHUB_TWIN_URL'));
const platform = need('PLATFORM_URL');
const route = `/repos/${ACCOUNT}/contents/.open-autonomy/config.yaml`;
if (process.argv[2] === 'seed') {
  const user = await gh.get('/user');
  console.log('world human', { id: user.body.id, login: user.body.login, type: user.body.type });
  const file = await gh.get(route);
  if (file.status !== 200) throw new Error(`config ${file.status}`);
  const config = Buffer.from(file.body.content, 'base64').toString();
  const text = replaceTeamConfig(config, { members: [{ id: 'owner', name: 'World owner', github: { id: String(user.body.id), login: user.body.login }, discord: { id: '1000000000000000002', name: 'World owner' }, scopes: ['owner', 'direction', 'release-review'], source: 'Owner-led twin setup: these accounts belong to the same human; public rehearsal, no real identity grant.' }] });
  const result = await gh.put(route, { message: 'Seed owner-confirmed team through repository API', sha: file.body.sha, content: Buffer.from(text).toString('base64'), branch: 'main' });
  console.log('seed config', result.status);
} else if (['propose', 'stale'].includes(process.argv[2])) {
  const file = await gh.get(route);
  const team = parseTeamConfig(Buffer.from(file.body.content, 'base64').toString());
  const owner = team.members[0];
  const form = new URLSearchParams({ sha: process.argv[2] === 'stale' ? '0'.repeat(40) : file.body.sha, id: owner.id, name: 'World owner renamed', github_login: owner.github!.login, github_id: owner.github!.id, discord_id: owner.discord!.id, discord_name: owner.discord!.name, source: owner.source, attest: 'yes', operation: 'save' });
  for (const scope of owner.scopes) form.append('scopes', scope);
  const begin = await fetch(`${platform}/p/${encodeURIComponent(ACCOUNT)}/team`, { method: 'POST', headers: { origin: platform }, body: form, redirect: 'manual' });
  console.log('begin', begin.status);
  if (begin.status !== 302) { console.log(await begin.text()); process.exit(1); }
  const authorize = new URL(begin.headers.get('location')!);
  console.log('requested scope', authorize.searchParams.get('scope'));
  // Synthetic code is understood by the twin's OAuth exchange. No real authorization or cookie is used.
  const cookie = begin.headers.get('set-cookie')!.split(';')[0];
  const result = await fetch(`${platform}/give/callback?code=team-world-${Date.now()}&state=${authorize.searchParams.get('state')}`, { headers: { cookie }, redirect: 'manual' });
  console.log('callback', result.status, result.headers.get('location') ?? await result.text());
  const after = await gh.get(route);
  console.log('committed roster', parseTeamConfig(Buffer.from(after.body.content, 'base64').toString()));
  const prs = await gh.get(`/repos/${ACCOUNT}/pulls?state=open`);
  console.log('draft proposals', prs.body.map((p: any) => ({ number: p.number, draft: p.draft, head: p.head.ref, base: p.base.ref, title: p.title })));
} else if (process.argv[2] === 'scrum') {
  const native = hermesBin();
  const home = resolve(STACK, 'home'), project = resolve(STACK, 'project');
  const result = Bun.spawnSync({ cmd: ['bun', `${project}/.open-autonomy/scrum.ts`, 'prepare'], cwd: project, env: { ...process.env, HERMES_HOME: home, PYTHONPATH: native.replace(/\/.venv\/bin$/, ''), PATH: `${native}:${process.env.PATH}` }, stdout: 'pipe', stderr: 'pipe' });
  if (result.exitCode) throw new Error(result.stderr.toString());
  const prepared = JSON.parse(result.stdout.toString());
  console.log(JSON.stringify({ resumed: prepared.resumed, snapshot: prepared.snapshot.main, current: prepared.main, team: prepared.team }, null, 2));
} else if (process.argv[2] === 'merge') {
  const prs = await gh.get(`/repos/${ACCOUNT}/pulls?state=open`);
  const draft = prs.body.find((p: any) => p.head.ref.startsWith('team/'));
  if (!draft) throw new Error('Create a team proposal first.');
  // The twin lacks GitHub's GraphQL mark-ready mutation. Close the draft and open a normal
  // review PR for the identical branch through the actual REST API, then merge as the world human.
  if (draft.draft) console.log('close draft', (await gh.patch(`/repos/${ACCOUNT}/pulls/${draft.number}`, { state: 'closed' })).status);
  const ready = draft.draft ? await gh.post(`/repos/${ACCOUNT}/pulls`, { head: draft.head.ref, base: draft.base.ref, title: draft.title, body: 'World owner reviewed this exact roster change.', draft: false }) : { status: 201, body: draft };
  if (ready.status !== 201) throw new Error(`review PR ${ready.status}`);
  const result = await gh.put(`/repos/${ACCOUNT}/pulls/${ready.body.number}/merge`, { sha: draft.head.sha, merge_method: 'merge' });
  console.log('human merge', result.status, result.body);
} else if (process.argv[2] === 'non-owner') {
  const file = await gh.get(route);
  const current = parseTeamConfig(Buffer.from(file.body.content, 'base64').toString());
  const other = await gh.get('/users/another-owner');
  current.members[0].scopes = ['moderation'];
  current.members.push({ id: 'another-owner', name: 'Another world owner', github: { id: String(other.body.id), login: other.body.login }, scopes: ['owner'], source: 'World human explicitly transferred project authority for this rehearsal.' });
  console.log('world transfer', (await gh.put(route, { message: 'World owner transfers authority', sha: file.body.sha, content: Buffer.from(replaceTeamConfig(Buffer.from(file.body.content, 'base64').toString(), current)).toString('base64'), branch: 'main' })).status);
  console.log('Run propose again as the original OAuth user; it must refuse without a branch or PR.');
} else {
  const result = await fetch(`${platform}/p/${encodeURIComponent(ACCOUNT)}/team`);
  console.log('team page', result.status, ((await result.text()).match(/<main[\s\S]*?<\/main>/)?.[0] ?? 'No main content').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(-2400));
}
