// Manual funding, key rotation, model selection and deployed-version observations in the World.
import { resolve } from 'node:path';
import { ACCOUNT, ENC, MODEL, ROOT, SECRETS, api, context, git, need, sh } from '../lib.ts';
import { PREVIOUS_MODEL } from '../opening.ts';
if (!process.env.VOLTER_WORLD) throw new Error('Use volter-world attach');
const [command, value] = process.argv.slice(2);
const ctx = context();
const platform = need('PLATFORM_URL');
if (command === 'rotate-key') {
  sh(['bun', resolve(ROOT, '.open-autonomy/mint-key.ts'), '--rotate', '--out', resolve(SECRETS, 'agent.env'), '--grace', '5'],
    { env: { OPEN_AUTONOMY_URL: platform } });
  console.log('Rotation requested with five-second grace; inspect the valve health and platform key registry.');
} else if (command === 'model') {
  const gh = api(need('GITHUB_TWIN_URL'), { authorization: 'Bearer octocat' });
  const path = `/repos/${ACCOUNT}/contents/hermes/config.yaml`;
  const current = await gh.get(`${path}?ref=main`);
  if (current.status !== 200) throw new Error(current.text);
  const config = Buffer.from(current.body.content, 'base64').toString('utf8');
  const updated = config.replace(`default: ${PREVIOUS_MODEL}`, `default: ${MODEL}`);
  if (updated !== config) {
    const result = await gh.put(path, { message: `owner: select ${MODEL}`, branch: 'main', sha: current.body.sha, content: Buffer.from(updated).toString('base64') });
    if (result.status !== 200) throw new Error(result.text);
  }
  console.log('Model selected on main. Send /restart through the scenario channel for native Hermes to reload it.');
} else if (command === 'live') {
  const commit = value ?? (await git(ctx.stack.project, 'rev-parse', 'origin/main'));
  const response = await api(need('LIVE_SERVICE_URL')).post('/_world/commit', commit === 'unreachable' ? { reachable: false } : { commit, reachable: true });
  if (response.status !== 200) throw new Error(response.text);
  console.log(response.body);
} else if (command !== 'inspect') throw new Error('usage: account.ts inspect | rotate-key | model | live [commit|unreachable]');
const sync = await api(platform, { 'x-admin-token': need('AGENT_PROXY_ADMIN_TOKEN') }).post(`/admin/accounts/${ENC}/sync`);
if (sync.status !== 200) throw new Error(sync.text);
const account = await api(platform).get(`/v1/accounts/${ENC}`);
if (account.status !== 200) throw new Error(account.text);
console.log(JSON.stringify({ account: ACCOUNT, books: account.body }, null, 2));
