#!/usr/bin/env bun
// GitHub Actions for the twin, played by the world (a world service, started by `up`). The twin holds pull
// requests, required checks, branch protection and auto-merge, and lands a merge on its git wire when the
// required check is green — but it runs no workflows; that is the one piece of Actions it leaves out. This
// process plays the runner for the landing convention the template prescribes (our own land.yml + ci.yml):
//   push of agent/** or land/**  → the pull request is opened once and auto-merge armed   (land.yml)
//   a pull request head           → the project's own `bun run check`, reported as the `ci` check run (ci.yml)
//   a merged pull request         → its head branch deleted (the repository's delete-on-merge setting)
// Nothing here merges anything: the twin does, exactly when GitHub would.
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { DATA, api, git, need } from './lib.ts';

const github = need('GITHUB_TWIN_URL');
const gh = api(github);
const repos = (process.env.WORLD_ACTIONS_REPOS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
if (!repos.length) throw new Error('WORLD_ACTIONS_REPOS is empty: nothing to watch');
const clones = resolve(DATA, 'actions');
mkdirSync(clones, { recursive: true });
const recent: string[] = [];
const log = (m: string) => { console.log(`actions: ${m}`); recent.push(`${new Date().toISOString()} ${m}`); if (recent.length > 200) recent.shift(); };
// The runner's door: what it did, as text (the world's ready probe reads /healthz).
Bun.serve({ port: Number(process.env.PORT ?? 0), fetch: (req) => new URL(req.url).pathname === '/healthz' ? new Response('ok') : new Response(`actions runner for ${repos.join(', ')}\n\n${recent.join('\n')}\n`) });
const landing = /^(agent|land)\//;

async function clone(repo: string): Promise<string> {
  const dir = resolve(clones, repo.replace('/', '__'));
  if (!existsSync(resolve(dir, '.git'))) { rmSync(dir, { recursive: true, force: true }); await git(clones, 'clone', '-q', `${github}/${repo}.git`, dir); }
  await git(dir, 'fetch', '-q', '--prune', 'origin');
  return dir;
}

// ci.yml's job on one head: the project's own check on that exact commit, in a detached worktree.
async function runCheck(repo: string, sha: string): Promise<{ ok: boolean; tail: string }> {
  const dir = await clone(repo);
  const tree = resolve(clones, `tree-${sha.slice(0, 12)}`);
  rmSync(tree, { recursive: true, force: true });
  await git(dir, 'worktree', 'prune');
  await git(dir, 'worktree', 'add', '-q', '--detach', tree, sha);
  try {
    const steps = [...(existsSync(resolve(tree, 'bun.lock')) ? [['bun', 'install', '--frozen-lockfile']] : []), ['bun', 'run', 'check']];
    for (const cmd of steps) {
      const r = Bun.spawnSync({ cmd, cwd: tree, stdout: 'pipe', stderr: 'pipe' });
      if (r.exitCode !== 0) return { ok: false, tail: `${cmd.join(' ')}: ${r.stderr.toString().slice(-400)}` };
    }
    return { ok: true, tail: '' };
  } finally { await git(dir, 'worktree', 'remove', '--force', tree).catch(() => {}); }
}

async function tick(repo: string): Promise<void> {
  const branches = await gh.get(`/repos/${repo}/branches`);
  if (branches.status !== 200) return; // not seeded yet
  const pulls = await gh.get(`/repos/${repo}/pulls?state=all&per_page=100`);
  const prs = (pulls.body ?? []) as Array<{ number: number; state: string; merged: boolean; head: { ref: string; sha: string }; auto_merge: unknown }>;
  for (const b of branches.body as Array<{ name: string; commit: { sha: string } }>) {
    if (!landing.test(b.name)) continue;
    const forBranch = prs.filter((p) => p.head.ref === b.name);
    if (forBranch.some((p) => p.merged)) {
      // land.yml's counterpart on GitHub is the repository setting that deletes the head branch on merge.
      const del = await gh.del(`/repos/${repo}/git/refs/heads/${b.name}`);
      if (del.status < 300) log(`${repo}: ${b.name} deleted after merge`);
      continue;
    }
    if (forBranch.some((p) => p.state === 'open')) continue;
    const head = await gh.get(`/repos/${repo}/commits/${b.commit.sha}`);
    const title = String(head.body?.commit?.message ?? b.name).split('\n')[0] || b.name;
    const created = await gh.post(`/repos/${repo}/pulls`, { title, head: b.name, base: 'main', body: `Opened by the landing workflow for the agent's branch \`${b.name}\`. It merges on its own when the required checks pass.` });
    if (created.status !== 201) { log(`${repo}: could not open a pull request for ${b.name} (${created.status}) ${created.text.slice(0, 120)}`); continue; }
    const armed = await gh.put(`/repos/${repo}/pulls/${created.body.number}/auto-merge`, { merge_method: 'merge' });
    log(`${repo}: pull request #${created.body.number} opened for ${b.name}${armed.status === 200 ? ', auto-merge armed' : ` (auto-merge → ${armed.status})`}`);
  }
  for (const p of prs.filter((p) => p.state === 'open' && !p.merged)) {
    const runs = await gh.get(`/repos/${repo}/commits/${p.head.sha}/check-runs`);
    const existing = ((runs.body?.check_runs ?? []) as Array<{ name: string }>).some((c) => c.name === 'ci');
    if (existing) continue;
    const started = await gh.post(`/repos/${repo}/check-runs`, { name: 'ci', head_sha: p.head.sha, status: 'in_progress' });
    log(`${repo}: ci running on #${p.number} (${p.head.sha.slice(0, 7)})`);
    const result = await runCheck(repo, p.head.sha);
    await gh.patch(`/repos/${repo}/check-runs/${started.body.id}`, { status: 'completed', conclusion: result.ok ? 'success' : 'failure', output: result.ok ? undefined : { title: 'check failed', summary: result.tail } });
    log(`${repo}: ci ${result.ok ? 'passed' : 'FAILED'} on #${p.number}${result.ok ? '' : `\n${result.tail}`}`);
  }
}

log(`watching ${repos.join(', ')} on the GitHub twin`);
for (;;) {
  for (const repo of repos) { try { await tick(repo); } catch (e) { log(`${repo}: ${(e as Error).message.split('\n')[0]}`); } }
  await Bun.sleep(3000);
}
