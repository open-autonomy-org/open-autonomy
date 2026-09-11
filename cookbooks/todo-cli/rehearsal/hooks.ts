// What the kit's rehearsal cannot know about this project: the opening position of Open Autonomy's own world beyond
// the project itself (the platform's patronage books, the deployed service the page compares with main, the model the
// owner moves between two tasks), the acts a story takes through the vendors' doors, the conditions it reads. Every
// door is a vendor's own API or the pinned Hermes; nothing here reads a twin's files.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ACCOUNT, DATA, ENC, KIT_DIR, MODEL, ROOT, STATE, api, git, homeChannel, need, sh } from '../.open-autonomy/rehearsal/lib.ts';
import type { Hooks, RehearsalContext } from '../.open-autonomy/rehearsal/lib.ts';

// The model the config names before the owner moves it to MODEL between two tasks: a world-only name, allowed on the
// key and priced like the model (apps/platform/world.ts), so the schedule's re-pin is proven the way the production
// incident happened.
export const PREVIOUS_MODEL = `${MODEL}-previous`;
const admin = (ctx: RehearsalContext) => api(ctx.world.PLATFORM_URL, { 'x-admin-token': process.env.AGENT_PROXY_ADMIN_TOKEN ?? 'world-admin' });
const github = (ctx: RehearsalContext) => api(ctx.world.GITHUB_TWIN_URL);

// The pinned Hermes the stack runs: the operator's, or the kit's install under the world's state.
export function hermesBin(): string {
  const given = process.env.WORLD_HERMES_BIN ?? process.env.HERMES_BIN;
  if (given) return given.replace(/^~(?=$|\/)/, process.env.HOME ?? '');
  const pin = Object.fromEntries(readFileSync(resolve(ROOT, 'container', 'hermes.pin'), 'utf8').split('\n').map((l) => l.trim().split('=') as [string, string]).filter(([k]) => k && !k.startsWith('#')));
  return resolve(STATE, '.volter', 'hermes', pin.HERMES_TAG, '.venv', 'bin');
}
// A file on the twin's main, written the way an owner commits one: in the brain's clone, as the owner, pushed. The
// twin's git and its API then agree, and the start script brings the brain's checkout to it on its next start.
export async function putMain(ctx: RehearsalContext, path: string, content: string, message: string): Promise<void> {
  const clone = ctx.stack.project;
  await git(clone, 'fetch', '-q', 'origin');
  await git(clone, 'checkout', '-q', 'main');
  await git(clone, 'reset', '-q', '--hard', 'origin/main');
  writeFileSync(resolve(clone, path), content);
  if (!(await git(clone, 'status', '--porcelain', '--', path)).trim()) return;
  await git(clone, '-c', 'user.name=owner', '-c', 'user.email=owner@example.com', 'commit', '-q', '-am', message);
  await git(clone, 'push', '-q', 'origin', 'main');
}
const onMain = async (ctx: RehearsalContext, path: string): Promise<string> => { await git(ctx.stack.project, 'fetch', '-q', 'origin', 'main'); return git(ctx.stack.project, 'show', `origin/main:${path}`); };
const stack = (...args: string[]) => sh(['bun', resolve(KIT_DIR, 'stack.ts'), ...args]);

const hooks: Hooks = {
  // The keys carry the previous model too.
  models: [PREVIOUS_MODEL],
  // Beyond the project on the twin, funded, its keys minted: the platform's patronage and the owner's opening moves.
  async seed(ctx) {
    if (process.env.REHEARSAL_COMMUNITY === '1' && (process.env.REHEARSAL_IDLE !== '1' || process.env.REHEARSAL_SCRUM === '1' || process.env.REHEARSAL_RELEASE === '1')) throw new Error('community requires REHEARSAL_IDLE=1 without REHEARSAL_SCRUM or REHEARSAL_RELEASE');
    const gh = github(ctx); const adm = admin(ctx);
    // The deterministic OAuth user is an admin of the organization whose Sponsors money enters the grants pool: the
    // same membership lookup the page performs after login, through the twin's GitHub API. The scope-free OAuth token
    // cannot read organization roles; the page must use the platform's separate members-reader credential for that.
    const membership = await gh.put('/orgs/open-autonomy-org/memberships/octocat', { role: 'admin' });
    if (membership.status !== 200) throw new Error(`github twin: grants admin → ${membership.status} ${membership.text.slice(0, 200)}`);
    const oauth = await gh.post('/login/oauth/access_token', { client_id: 'world-open-autonomy', code: 'scope-probe', scope: '' });
    const denied = await gh.post('/_twin/oauth/call', { token: oauth.body?.access_token, required_scope: 'read:org' });
    if (oauth.status !== 200 || oauth.body?.scope !== '' || denied.status !== 403) throw new Error(`github twin: scope-free OAuth unexpectedly read org membership (${oauth.status}/${denied.status})`);
    // The funder's credits and the organization's Sponsors pool, on the books beside the project's own funds.
    for (const [account, amount, key, extra] of [['%40octocat', 500, 'world-funder-credits', {}], ['open-autonomy-org%2Fgrants', 1000, 'world-sponsors-pool', { sponsor: { login: 'world-sponsor' } }]] as const) {
      const r = await adm.post(`/admin/accounts/${account}/mint`, { amount_usd_cents: amount, key, ...extra });
      if (r.status !== 200) throw new Error(`platform: ${key} → ${r.status} ${r.text.slice(0, 200)}`);
    }
    // The deployed service reports the commit the kit applied: main moves past it with the owner's commits below, so the
    // page reads a service behind main, and a release has later main commits to consider.
    await git(ctx.stack.project, 'fetch', '-q', 'origin', 'main');
    const deployed = (await git(ctx.stack.project, 'rev-parse', '--short', 'origin/main')).trim();
    const live = await api(ctx.world.LIVE_SERVICE_URL).post('/_world/commit', { commit: deployed });
    if (live.status !== 200) throw new Error(`live service: set commit → ${live.status} ${live.text.slice(0, 200)}`);
    // The owner's opening moves on the twin's main: the bounds allow the previous model and name the deployed service
    // the page compares with main; the brain's config names the previous model until the owner moves it (the
    // `between-tasks` act); the opening position a story asked for (REHEARSAL_IDLE, REHEARSAL_RELEASE, the owner's door).
    const config = (await onMain(ctx, '.open-autonomy/config.yaml')).trimEnd();
    if (!config.includes(`models: [${MODEL}]`)) throw new Error(`the project's .open-autonomy/config.yaml does not bound its funds to ${MODEL}`);
    await putMain(ctx, '.open-autonomy/config.yaml', `${config.replace(`models: [${MODEL}]`, `models: [${MODEL}, ${PREVIOUS_MODEL}]`)}\n\n# The deployed service whose reported commit the project page compares with main.\nlive: ${ctx.world.LIVE_SERVICE_URL}\n`, `.open-autonomy/config.yaml: the world's previous model and live service`);
    const hermesConfig = await onMain(ctx, 'hermes/config.yaml');
    if (!hermesConfig.includes(`default: ${MODEL}`)) throw new Error(`the project's hermes/config.yaml does not name ${MODEL} as its default model`);
    await putMain(ctx, 'hermes/config.yaml', hermesConfig.replace(`default: ${MODEL}`, `default: ${PREVIOUS_MODEL}`), `hermes/config.yaml: the model before the owner moves it (${PREVIOUS_MODEL})`);
    if (process.env.REHEARSAL_IDLE === '1' && process.env.REHEARSAL_SCRUM !== '1') await putMain(ctx, 'hermes/kanban.seed.json', JSON.stringify({ tasks: [] }), 'kanban.seed.json: an empty board');
    if (process.env.REHEARSAL_RELEASE === '1') { const schedule = JSON.parse(await onMain(ctx, 'hermes/cron/jobs.seed.json')); for (const job of schedule.jobs) if (job.name === 'pm') job.deliver = 'local'; await putMain(ctx, 'hermes/cron/jobs.seed.json', `${JSON.stringify(schedule, null, 2)}\n`, "jobs.seed.json: the PM's routine report stays local"); }
    const door = process.env.REHEARSAL_OWNER_DOOR ?? 'discord';
    await putMain(ctx, 'hermes/skills/project-communications/SKILL.md', `---\nname: project-communications\ndescription: The owner's agreed contact practices for this rehearsal.\n---\n\n# Project communications\n\n${door === 'github' ? 'Ask octocat for release review in an assigned GitHub issue in this repository.' : `Ask the maintainer for release review in our project channel, discord:${homeChannel()}.`} Keep follow-up in that conversation. Use judgment about when another message is useful; silence is not approval.\n`, 'project-communications: the owner\'s door for release review');
    // The page reads the repository now.
    const synced = await adm.post(`/admin/accounts/${ENC}/sync`);
    if (synced.status !== 200) throw new Error(`platform: sync → ${synced.status}`);
    if (process.env.REHEARSAL_SCRUM === '1') await hooks.acts!['scrum-seed'](ctx, {});
    if (process.env.REHEARSAL_COMMUNITY === '1') {
      const human = api(ctx.world.GITHUB_TWIN_URL, { authorization: 'Bearer alice' });
      for (const [number, title, body] of [
        [1, 'question: what is todo-cli?', 'How do I see the available commands and propose an improvement?'],
        [2, 'request: document todo usage', 'Please add COMMUNITY.md explaining the help command and how to propose an improvement. Link this request as the source.'],
      ] as const) {
        const issue = await human.post(`/repos/${ACCOUNT}/issues`, { title, body });
        if (issue.status !== 201 || issue.body?.number !== number) throw new Error('community requires a fresh World with no existing issues');
      }
      const [owner, name] = ACCOUNT.split('/');
      const lookup = await human.post('/graphql', { query: 'query($owner:String!,$name:String!){ repository(owner:$owner,name:$name){ id discussionCategories(first:100){ nodes { id slug } } } }', variables: { owner, name } });
      const repository = lookup.body?.data?.repository;
      const category = repository?.discussionCategories?.nodes?.find((c: { slug: string }) => c.slug === 'general');
      if (!category?.id) throw new Error(`community: GitHub category lookup failed: ${lookup.text}`);
      const discussion = await human.post('/graphql', { query: 'mutation($input:CreateDiscussionInput!){ createDiscussion(input:$input){ discussion { number } } }', variables: { input: { repositoryId: repository.id, categoryId: category.id, title: 'idea: a usage tip of the week', body: 'Could we share a helpful CLI example each week?' } } });
      if (discussion.body?.data?.createDiscussion?.discussion?.number !== 1) throw new Error(`community requires a fresh World and GitHub createDiscussion support: ${discussion.text}`);
      const schedule = JSON.parse(await onMain(ctx, 'hermes/cron/jobs.seed.json'));
      schedule.jobs.push({ name: 'community', prompt: 'WAKE: COMMUNITY. Run the community skill: read the sources, answer where asked and preserve requests for the PM.', schedule: 'every 15m', skills: ['community'], deliver: 'local' });
      await putMain(ctx, 'hermes/cron/jobs.seed.json', `${JSON.stringify(schedule, null, 2)}\n`, 'community: enable the community desk for this scenario');
      ctx.log('community: question #1, request #2 and discussion #1 seeded through GitHub APIs');
    }
    ctx.log(`the books hold the funder's credits and the Sponsors pool; main bounds ${MODEL} and ${PREVIOUS_MODEL}, names the live service and the owner's door (${door}); the brain thinks on ${PREVIOUS_MODEL} until the owner moves it`);
  },
  // The stack's environment beyond the kit's: the registry twin for what the brain installs, the registrar for the treasurer.
  stackEnv: (ctx) => ({ npm_config_registry: ctx.world.NPM_REGISTRY_TWIN_URL, STRIPE_TWIN_URL: ctx.world.STRIPE_TWIN_URL }),
  acts: {
    // The scrum rehearsal's community, through GitHub's ordinary doors: owner direction, a volunteer, a suggestion, a
    // contradiction, and an outside contributor's pull request.
    async 'scrum-seed'(ctx) {
      const gh = github(ctx);
      for (const [title, body] of [
        ['scrum: owner direction', 'Owner direction: prioritize the add command. CSV export is later. Keep release review with the maintainer.'],
        ['scrum: documentation commitment', "I'll do the usage documentation. Please acknowledge that scope; I have not agreed a deadline."],
        ['scrum: optional help', 'Could someone help with translations? This is a suggestion; nobody has volunteered.'],
        ['scrum: conflicting proposal', 'Proposal: do CSV export before the add command. This conflicts with the owner direction and needs reconciliation.'],
      ]) { const r = await gh.post(`/repos/${ACCOUNT}/issues`, { title, body }); if (r.status !== 201) throw new Error(`scrum seed issue: ${r.status} ${r.text}`); }
      const clone = ctx.stack.project;
      await git(clone, 'fetch', '-q', 'origin'); await git(clone, 'checkout', '-q', '-B', 'contributor/release-notes', 'origin/main');
      writeFileSync(resolve(clone, 'OUTSIDE.md'), 'An outside contributor supplied release notes. This does not release the project.\n');
      await git(clone, 'add', 'OUTSIDE.md');
      await git(clone, '-c', 'user.name=Outside contributor', '-c', 'user.email=contributor@example.test', 'commit', '-q', '-m', 'contributor: release notes');
      await git(clone, 'push', '-q', 'origin', 'contributor/release-notes');
      await git(clone, 'checkout', '-q', 'main');
      const pr = await gh.post(`/repos/${ACCOUNT}/pulls`, { title: 'scrum: outside release notes', head: 'contributor/release-notes', base: 'main', body: 'Outside contribution overlaps planned release notes. Review and integrate; release review remains required.' });
      if (pr.status !== 201) throw new Error(`scrum seed PR: ${pr.status} ${pr.text}`);
      ctx.log('scrum: owner direction, a volunteer, an unanswered suggestion, a contradiction and an outside PR');
    },
    // What the owner does between two tasks: hermes/config.yaml on main now names the project's model, the brain's
    // checkout follows main, the brain restarts the way an owner restarts it (the start script again: the home re-synced
    // from the checkout, the gateway booted, its seed hook finding the board already filed); the next worker the board
    // dispatches takes the model from it. Then the key is rotated with a short grace: the valve picks the new key up
    // unrestarted, the old key is refused after its grace.
    async 'between-tasks'(ctx) {
      const yaml = await onMain(ctx, 'hermes/config.yaml');
      await putMain(ctx, 'hermes/config.yaml', yaml.replace(`default: ${PREVIOUS_MODEL}`, `default: ${MODEL}`), `hermes/config.yaml: model ${MODEL}`);
      stack('restart');
      await hooks.acts!['rotate-key'](ctx, {});
      ctx.log(`the model moved to ${MODEL}; the next worker the board dispatches spends on it`);
    },
    async 'rotate-key'(ctx) {
      const platform = ctx.world.PLATFORM_URL.replace(/\/$/, '');
      const file = resolve(ctx.secrets, 'agent.env');
      const before = /^OPEN_AUTONOMY_KEY=(.+)$/m.exec(readFileSync(file, 'utf8'))?.[1];
      if (!before) throw new Error(`no key in ${file} to rotate`);
      const r = Bun.spawnSync({ cmd: ['bun', resolve(ROOT, '.open-autonomy', 'mint-key.ts'), '--rotate', '--out', file, '--grace', '5'], cwd: ROOT, env: { ...process.env, OPEN_AUTONOMY_URL: platform }, stdout: 'pipe', stderr: 'pipe' });
      if (r.exitCode !== 0) throw new Error(`key rotation failed: ${r.stderr.toString().slice(-400)}`);
      const after = /^OPEN_AUTONOMY_KEY=(.+)$/m.exec(readFileSync(file, 'utf8'))?.[1];
      if (!after || after === before) throw new Error('the key file was not rewritten with a new key');
      const call = (token: string, path: string) => fetch(`${platform}${path}`, { headers: { authorization: `Bearer ${token}` } });
      const listed = await (await call(after, '/v1/keys')).json() as { keys?: Array<{ kid: string; exp: string }> };
      if ((listed.keys ?? []).length < 2) throw new Error(`the registry does not list both keys after the rotation: ${JSON.stringify(listed).slice(0, 200)}`);
      const kid = (JSON.parse(Buffer.from(after.split('.')[0], 'base64url').toString('utf8')) as { kid: string }).kid;
      const valve = `http://127.0.0.1:${process.env.REHEARSAL_VALVE_PORT ?? 18787}/healthz`;
      let health = '';
      for (let i = 0; i < 20 && !health.includes(kid); i++) { await Bun.sleep(500); health = await fetch(valve).then((h) => h.text()).catch(() => ''); }
      if (!health.includes(kid)) throw new Error(`the valve did not pick up the rotated key within ten seconds: ${health}`);
      await Bun.sleep(6500);
      if ((await call(before, '/v1/models')).status !== 401) throw new Error('the old key still works after its grace');
      if ((await call(after, '/v1/models')).status !== 200) throw new Error('the new key does not spend');
      ctx.log(`key rotated (${kid}); the valve took it unrestarted and the old key is refused after its grace`);
    },
    // The deployed service moves: to a commit ({"act":"live","commit":"<sha>"} or main's), or out of reach ({"act":"live","reachable":false}).
    async live(ctx, line) {
      const commit = typeof line.commit === 'string' ? line.commit : (await git(ctx.stack.project, 'rev-parse', '--short', 'origin/main')).trim();
      const r = await api(ctx.world.LIVE_SERVICE_URL).post('/_world/commit', line.reachable === false ? { reachable: false } : { commit, reachable: true });
      if (r.status !== 200) throw new Error(`live service → ${r.status}`);
      const synced = await admin(ctx).post(`/admin/accounts/${ENC}/sync`);
      if (synced.status !== 200) throw new Error(`platform: sync → ${synced.status}`);
    },
    // The release rehearsal's schedule input, an issue the PM sources ({"act":"release-schedule","phase":"accumulate"|"prepare"|"request-review"|"defer"}).
    async 'release-schedule'(ctx, line) {
      if (process.env.REHEARSAL_RELEASE !== '1') throw new Error('the release story needs a world brought up with REHEARSAL_RELEASE=1 REHEARSAL_IDLE=1');
      const gh = github(ctx); const phase = String(line.phase);
      const issues = (await gh.get(`/repos/${ACCOUNT}/issues?state=all&per_page=100`)).body ?? [];
      const prior = issues.find((i: { title: string }) => i.title === 'release: target schedule');
      const body = `Phase: ${phase}\n${line.continue ? 'Development: continue\n' : ''}${line.request ? `Requested outcome: ${String(line.request)}\n` : ''}\nSchedule scenario: target October 1, 2026, 14:00–16:00 UTC, with review by September 30, 14:00 UTC. PM chooses whether the baseline is ready and proposes a calendar version under the deployment procedure. A date or another merge is not permission to release. ${phase === 'defer' ? 'New evidence: postpone the proposal and stop the previous review request.' : ''}`;
      const r = prior ? await gh.patch(`/repos/${ACCOUNT}/issues/${prior.number}`, { body }) : await gh.post(`/repos/${ACCOUNT}/issues`, { title: 'release: target schedule', body });
      if (![200, 201].includes(r.status)) throw new Error(r.text);
      const synced = await admin(ctx).post(`/admin/accounts/${ENC}/sync`);
      if (synced.status !== 200) throw new Error(`platform: sync → ${synced.status}`);
    },
    // An ordinary outside contributor: merges their pull request and leaves a routine comment, telling nobody.
    async outside(ctx) {
      const gh = github(ctx);
      const pr = ((await gh.get(`/repos/${ACCOUNT}/pulls?state=open&per_page=100`)).body ?? []).find((p: any) => p.title === 'scrum: outside release notes');
      if (!pr) throw new Error('no open pull request titled "scrum: outside release notes" (the scrum-seed act files it)');
      const merged = await gh.put(`/repos/${ACCOUNT}/pulls/${pr.number}/merge`, { merge_method: 'merge' });
      if (merged.status !== 200 || !merged.body?.merged) throw new Error(merged.text);
      const issue = ((await gh.get(`/repos/${ACCOUNT}/issues?state=all&per_page=100`)).body ?? []).find((i: any) => i.title === 'scrum: conflicting proposal');
      if (issue) await gh.post(`/repos/${ACCOUNT}/issues/${issue.number}/comments`, { body: 'Routine update: retried a local command; all fine now. No change in direction.' });
    },
  },
  conditions: {
    answered: async (ctx, want) => { const w = want as { issue: number; includes: string }; const r = await github(ctx).get(`/repos/${ACCOUNT}/issues/${w.issue}/comments`); if (r.status !== 200) throw new Error(r.text); return r.body.some((c: { body?: string }) => String(c.body ?? '').includes(w.includes)); },
    // A phrase on main's ROADMAP.md, or CHANGELOG.md ({"changelog":"…"}), or any file ({"file":{"path":…,"includes":…}}).
    roadmap: async (ctx, want) => (await onMain(ctx, 'ROADMAP.md')).includes(String(want)),
    changelog: async (ctx, want) => (await onMain(ctx, 'CHANGELOG.md')).includes(String(want)),
    file: async (ctx, want) => { const w = want as { path: string; includes: string }; try { return (await onMain(ctx, w.path)).includes(w.includes); } catch { return false; } },
    // An issue on the project's repository whose title contains the phrase ({"issue":"…"}, or {"issue":{"title":…,"state":"closed"}}).
    issue: async (ctx, want) => { const w = typeof want === 'string' ? { title: want } : (want as { title: string; state?: string }); const rows = (await github(ctx).get(`/repos/${ACCOUNT}/issues?state=all&per_page=100`)).body ?? []; return rows.some((i: any) => String(i.title).includes(w.title) && (!w.state || i.state === w.state)); },
    // The page's reading of the deployed service, synced now ({"live":"current"|"behind"|"unreachable"}): the commit it
    // reports against main's head — current when they are one, behind when main is ahead, unreachable when it answers nothing.
    live: async (ctx, want) => {
      await admin(ctx).post(`/admin/accounts/${ENC}/sync`);
      const live = (await api(ctx.world.PLATFORM_URL).get(`/v1/accounts/${ENC}`)).body?.live as { commit: string | null; head: string | null; ahead: number | null } | undefined;
      if (!live) return false;
      if (want === 'unreachable') return live.commit === null;
      if (want === 'behind') return live.commit !== null && (live.ahead ?? 0) > 0;
      return live.commit !== null && live.commit === live.head && live.ahead === 0;
    },
    // The project's balance on the books is below the seed ({"spent":true}): the brain's thinking was metered.
    spent: async (ctx) => { const r = await api(ctx.world.PLATFORM_URL).get(`/v1/accounts/${ENC}`); return Number(r.body?.balance_usd_cents ?? 5000) < 5000; },
  },
};
export default hooks;
// Kept for the operators (rehearsal/operators/*.ts), which drive one beat at a time by hand.
export { DATA, existsSync, need };
