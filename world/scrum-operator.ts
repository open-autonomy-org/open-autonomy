// Manual rehearsal controls. Every vendor mutation uses its ordinary API; board
// mutations use the pinned Hermes CLI. Invoke one beat at a time through world attach.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ACCOUNT, ENC, STATE, api, need } from './lib.ts';
const project = resolve(STATE, '.volter/stack/project');
const home = resolve(STATE, '.volter/stack/home');
const bin = need('WORLD_HERMES_BIN');
const env = { ...process.env, HERMES_HOME: home, PATH: `${bin}:${process.env.PATH}`, GITHUB_API_URL: need('GITHUB_TWIN_URL'), GITHUB_TOKEN: 'world-bot', OPEN_AUTONOMY_BASE_URL: `${need('PLATFORM_URL')}/v1` };
const run = (cmd: string[], allowFailure = false) => {
  const r = Bun.spawnSync({ cmd, cwd: project, env, stdout: 'pipe', stderr: 'pipe' });
  if (r.exitCode && !allowFailure) throw new Error(r.stderr.toString());
  return { code: r.exitCode, out: r.stdout.toString().trim(), error: r.stderr.toString().trim().split('\n').find((l) => l.startsWith('error:')) ?? r.stderr.toString().trim() };
};
const scrum = (...args: string[]) => run(['bun', '.open-autonomy/scrum.ts', ...args]);
const gh = api(need('GITHUB_TWIN_URL'));
const [command] = process.argv.slice(2);
if (command === 'inspect') {
  console.log(run(['hermes', 'kanban', 'list', '--archived', '--json']).out);
  const rows = await gh.get(`/repos/${ACCOUNT}/issues?state=all&per_page=100`);
  console.log(JSON.stringify(rows.body, null, 2));
  console.log(run(['git', 'show', 'origin/main:ROADMAP.md']).out);
} else if (command === 'guards') {
  for (const outcome of ['documentation', 'translation', 'release']) console.log({ outcome, ...run(['bun', '.open-autonomy/scrum.ts', 'queue', outcome, 'accidental', 'Must stay held', '- No human work may dispatch'], true) });
  const hold = JSON.parse(run(['hermes', 'kanban', 'create', 'World verification hold', '--initial-status', 'blocked', '--idempotency-key', 'world:hold', '--json']).out);
  const cmd = ['bun', '.open-autonomy/scrum.ts', 'queue', 'add', 'concurrent-probe', 'Fleet support waiting for verification hold', '- Resume only after the rehearsal hold is released', hold.id];
  const results = await Promise.all(Array.from({ length: 3 }, async () => {
    const p = Bun.spawn({ cmd, cwd: project, env, stdout: 'pipe', stderr: 'pipe' });
    const [out, error, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
    return { code, id: code ? null : JSON.parse(out).id, error };
  }));
  console.log({ repeatedQueue: results });
} else if (command === 'overlap') {
  const task = JSON.parse(run(['hermes', 'kanban', 'create', 'Integrate outside release notes', '--initial-status', 'blocked', '--workspace', `dir:${project}`, '--assignee', 'default', '--idempotency-key', 'world:outside-overlap', '--json']).out);
  console.log(run(['hermes', 'kanban', 'schedule', task.id, 'Existing fleet integration work waiting for the outside PR']));
} else if (command === 'intake') {
  console.log(scrum('note', 'hermes:message/world-scrum-late-reply', 'owner', 'Owner redirection: keep the add command first; CSV is still later.'));
  console.log(scrum('note', 'hermes:message/world-scrum-late-reply', 'owner', 'Owner redirection: keep the add command first; CSV is still later.'));
  console.log(run(['bun', '.open-autonomy/community.ts', 'poll']).out);
  console.log(run(['bun', '.open-autonomy/community.ts', 'mark']).out);
  const late = await gh.post(`/repos/${ACCOUNT}/issues/4/comments`, { body: 'Late owner reply: keep add first. The CSV proposal remains later.' });
  console.log({ lateReply: late.body?.html_url });
  console.log(run(['bun', '.open-autonomy/community.ts', 'poll', 'pm']).out);
  console.log(scrum('prepare').out);
} else if (command === 'release') {
  const sync = await api(need('PLATFORM_URL'), { 'x-admin-token': process.env.AGENT_PROXY_ADMIN_TOKEN ?? 'world-admin' }).post(`/admin/accounts/${ENC}/sync`);
  if (sync.status !== 200) throw new Error(sync.text);
  const status = (await api(need('PLATFORM_URL')).get(`/v1/accounts/${ENC}`)).body.live;
  console.log({ live: status, withoutPackage: run(['bun', '.open-autonomy/maintain.ts', 'ship']) });
  writeFileSync(resolve(home, 'release-review.md'), `Candidate: ${status.head}\n\nVerification: [landed work and checks](https://github.com/${ACCOUNT}/commits/${status.head}); cookbook add command exercised in the twin world.\n\nRisks: outside release notes PR still awaits review; production has not been verified.\n\nHuman action: review this candidate, choose an unused deploy-v tag per [.open-autonomy/PRODUCTION.md](https://github.com/${ACCOUNT}/blob/${status.head}/.open-autonomy/PRODUCTION.md), then approve its production environment run.\n`);
  console.log({ prepared: run(['bun', '.open-autonomy/maintain.ts', 'ship']) });
  console.log(run(['python', resolve(home, 'hooks/escalate/handler.py'), 'remind']));
  console.log(run(['python', resolve(home, 'hooks/escalate/handler.py'), 'remind']));
} else if (command === 'archive') {
  const tasks = JSON.parse(run(['hermes', 'kanban', 'list', '--json']).out);
  const task = tasks.find((t: { title: string; status: string }) => t.title.startsWith('todo add') && t.status === 'done');
  if (!task) throw new Error('add task must finish native review first');
  console.log(run(['hermes', 'kanban', 'archive', task.id]));
  console.log(scrum('queue', 'add', 'implementation', task.title, '- same work').out);
} else if (command === 'resume') {
  console.log(scrum('prepare').out);
  console.log({ pmCursor: existsSync(resolve(home, 'pm-cursor.json')) ? JSON.parse(readFileSync(resolve(home, 'pm-cursor.json'), 'utf8')) : null });
} else throw new Error('usage: scrum-operator.ts inspect | guards | intake | release | archive | resume');
