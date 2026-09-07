// Manual setup and owner-delivery beats. Run through world attach; inspect each result.
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ACCOUNT, DATA, ROOT, STATE, api, need } from './lib.ts';
import { outreachCommand } from './outreach-policy.ts';
import { check, create, upgrade } from '../packages/kit-hermes/src/kit.ts';
import { outreachSection, PM_SKILL } from '../packages/kit-hermes/src/outreach.ts';

const project = resolve(STATE, '.volter/stack/project');
const home = resolve(STATE, '.volter/stack/home');
const env = { ...process.env, HERMES_HOME: home, PATH: `${need('WORLD_HERMES_BIN')}:${process.env.PATH}`, GITHUB_API_URL: need('GITHUB_TWIN_URL'), GITHUB_TOKEN: 'world-bot' };
const run = (cmd: string[], cwd = project) => {
  const r = Bun.spawnSync({ cmd, cwd, env, stdout: 'pipe', stderr: 'pipe' });
  return { code: r.exitCode, out: r.stdout.toString().trim(), error: r.stderr.toString().trim() };
};
const [command] = process.argv.slice(2);
if (command === 'setup') {
  const dir = mkdtempSync(resolve(DATA, 'outreach-setup-'));
  create(dir, { project: 'outreach-setup', account: ACCOUNT });
  const path = resolve(dir, PM_SKILL);
  const before = readFileSync(path, 'utf8');
  const setup = ['bun', resolve(ROOT, 'packages/kit-hermes/src/cli.ts'), 'setup', dir, '--outreach-only', '--yes'];
  console.log('Unspecified policy:', run(setup, ROOT));
  console.log('Missing choices leave skill unchanged:', before === readFileSync(path, 'utf8'));
  const choice = ['--outreach-channel', 'github', '--outreach-recipient', 'octocat', '--outreach-reminder-hours', '48'];
  console.log('Plan:', run([...setup, ...choice, '--plan'], ROOT));
  console.log('Plan leaves skill unchanged:', before === readFileSync(path, 'utf8'));
  console.log('Explicit policy:', run([...setup, ...choice], ROOT));
  const policy = outreachSection(readFileSync(path, 'utf8'));
  // An ordinary kit change outside the project-owned section still gets upgraded.
  writeFileSync(path, readFileSync(path, 'utf8').replace('version: 4.3.0', 'version: 0.0.0'));
  console.log('Before upgrade:', check(dir).drift);
  console.log('Upgrade:', upgrade(dir).written);
  console.log('Policy preserved:', policy === outreachSection(readFileSync(path, 'utf8')));
  console.log('After upgrade:', check(dir).drift);
  console.log(policy);
} else if (command === 'block') {
  const task = run(['hermes', 'kanban', 'create', 'Outreach policy rehearsal', '--assignee', 'default', '--workspace', `dir:${project}`, '--idempotency-key', 'world:outreach-policy', '--json']);
  if (task.code) throw new Error(task.error);
  const row = JSON.parse(task.out);
  console.log(['ready', 'running'].includes(row.status) ? run(['hermes', 'kanban', 'block', row.id, 'Owner input needed; PM must follow the setup-written outreach policy.', '--kind', 'needs_input']) : row);
} else if (command === 'pending') {
  console.log(run(['python', resolve(home, 'hooks/escalate/handler.py'), 'remind']));
} else if (command === 'unavailable') {
  const args = outreachCommand(home);
  const route = { via: args[4], recipient: args[6], reminder_hours: Number(args[8]) };
  // A local credential-availability fault, without printing credentials or changing vendor behavior.
  const code = `import importlib.util, json, os, sys
from pathlib import Path
from hermes_cli.config import load_env
saved = load_env()
for name in ("GITHUB_TOKEN", "GITHUB_API_URL", "DISCORD_BOT_TOKEN", "DISCORD_API_BASE"):
    if saved.get(name): os.environ.setdefault(name, saved[name])
route = json.loads(sys.argv[1])
os.environ.pop("GITHUB_TOKEN" if route["via"] == "github" else "DISCORD_BOT_TOKEN", None)
print("Available transports:", {"github": bool(os.environ.get("GITHUB_TOKEN")), "discord": bool(os.environ.get("DISCORD_BOT_TOKEN"))})
spec = importlib.util.spec_from_file_location("escalate", Path(os.environ["HERMES_HOME"]) / "hooks/escalate/handler.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.reconcile(remind=True, route=route)`;
  console.log(run(['python', '-c', code, JSON.stringify(route)]));
} else if (command === 'deliver') {
  console.log(run(outreachCommand(home)));
} else if (command === 'inspect') {
  console.log('Board:', JSON.parse(run(['hermes', 'kanban', 'list', '--json']).out).map((t: any) => ({ id: t.id, title: t.title, status: t.status })));
  const receipts = resolve(home, 'escalations.json');
  const entries = existsSync(receipts) ? JSON.parse(readFileSync(receipts, 'utf8')) : {};
  console.log('Delivery receipts:', Object.entries(entries).map(([task, e]: [string, any]) => ({ task, route: e.route, issue: e.issue, chat: e.chat, reminded_at: e.reminded_at })));
  console.log('Subscriptions:', run(['hermes', 'kanban', 'notify-list']).out);
  const issues = await api(need('GITHUB_TWIN_URL')).get(`/repos/${ACCOUNT}/issues?state=all&per_page=100`);
  console.log('GitHub issues:', issues.body.map((i: any) => ({ number: i.number, title: i.title, state: i.state, assignees: (i.assignees ?? []).map((a: any) => a.login) })));
  for (const entry of Object.values(entries) as Array<{ issue?: number; chat?: string }>) {
    if (entry.chat) {
      const messages = await api(need('DISCORD_TWIN_URL')).get(`/api/v10/channels/${entry.chat}/messages`);
      console.log(`Discord ${entry.chat} messages:`, messages.body);
    }
    if (!entry.issue) continue;
    const comments = await api(need('GITHUB_TWIN_URL')).get(`/repos/${ACCOUNT}/issues/${entry.issue}/comments`);
    console.log(`Issue ${entry.issue} comment IDs:`, comments.body.map((c: any) => c.id));
  }
} else {
  throw new Error('Use setup, block, pending, unavailable, deliver or inspect');
}
