#!/usr/bin/env bun
// The PM's bounded maintenance: inspect releases, land an idle kit upgrade, request a
// drained restart, and request review of a PM-selected release candidate. Never deploys.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const project = resolve(import.meta.dir, '..');
const home = process.env.HERMES_HOME;
if (!home) throw new Error('maintenance requires HERMES_HOME from the running stack');
const command = process.argv[2] ?? 'status';
const run = (cmd: string[], cwd = project): string => {
  // Bun does not use the world's HTTP injector. Point bunx at the same registry
  // npm queried so the rehearsal release, rather than a cached public package, is applied.
  const env = cmd[0] === 'bunx' && process.env.NPM_REGISTRY_TWIN_URL
    ? { ...process.env, BUN_CONFIG_REGISTRY: process.env.NPM_REGISTRY_TWIN_URL }
    : process.env;
  const result = Bun.spawnSync({ cmd, cwd, env, stdout: 'pipe', stderr: 'pipe' });
  if (result.exitCode !== 0) throw new Error(`${cmd.slice(0, 3).join(' ')} failed: ${result.stderr.toString().trim()}`);
  return result.stdout.toString().trim();
};
const git = (...args: string[]) => run(['git', ...args]);
type Task = { id: string; title: string; status: string; body?: string };
const board = () => JSON.parse(run(['hermes', 'kanban', 'list', '--json'])) as Task[];
const requestMarker = '<!-- open-autonomy:owner-request -->';
function ownerRequest(marker: string, title: string, ask: string, key: string, renewedReview = false): void {
  const matches = board().filter((t) => t.body?.startsWith(marker));
  let task = matches.find((t) => !['done', 'archived', ...(renewedReview ? ['scheduled'] : [])].includes(t.status));
  if (!task) {
    task = JSON.parse(run(['hermes', 'kanban', 'create', title, '--body', `${marker}\n${ask}`, '--assignee', 'default', '--workspace', `dir:${project}`, '--idempotency-key', `${key}:${matches.at(-1)?.id ?? 'first'}`, '--json'])) as Task;
  }
  const detail = JSON.parse(run(['hermes', 'kanban', 'show', task.id, '--json'])) as { comments: Array<{ author: string; body: string }> };
  const latest = detail.comments.filter((c) => c.author === 'pm' && c.body.startsWith(requestMarker)).at(-1)?.body;
  if (latest ? latest !== `${requestMarker}\n${ask}` : !task.body?.includes(ask)) {
    // Keep the new ask on the board without toggling blocked or incrementing retries.
    run(['hermes', 'kanban', 'comment', task.id, `${requestMarker}\n${ask}`, '--author', 'pm']);
  }
  if (['ready', 'running'].includes(task.status)) run(['hermes', 'kanban', 'block', task.id, ask, '--kind', 'needs_input']);
  if (board().find((t) => t.id === task.id)?.status !== 'blocked') throw new Error(`owner request ${task.id} needs native triage/dependency reconciliation before outreach`);
}
function reviewUpgrade(branch: string): void {
  git('fetch', '-q', 'origin', branch);
  if (!git('diff', '--name-only', 'origin/main...FETCH_HEAD').split('\n').some((p) => p.startsWith('.github/'))) return;
  const pr = JSON.parse(run(['bun', '.open-autonomy/community.ts', 'pull-request', branch])) as { url: string; number: number } | null;
  if (!pr) { console.log(`${branch} changes .github/; waiting for the landing workflow to open its pull request. The next PM pass will ask the owner.`); return; }
  const ask = `Review the workflow changes in ${pr.url}/files, then choose Review changes → Approve on pull request #${pr.number}. The kit upgrade waits for your review.`;
  ownerRequest(`<!-- open-autonomy:kit-review:${branch} -->`, `Review kit upgrade ${branch}`, ask, `pm:review:${branch}`);
  console.log(ask);
}
const idle = () => !board().some((t) => ['running', 'review'].includes(t.status));
const record = (text: string) => JSON.parse(text) as { version: string };
const installed = record(readFileSync(resolve(project, '.open-autonomy/kit.json'), 'utf8')).version;
const runningFile = resolve(home, 'running-kit.json');
const running = existsSync(runningFile) ? record(readFileSync(runningFile, 'utf8')).version : null;
const stable = (version: string) => /^\d+\.\d+\.\d+$/.test(version);
const newer = (a: string, b: string) => {
  if (!stable(a) || !stable(b)) throw new Error(`expected stable kit versions, got ${a} and ${b}`);
  const aa = a.split('.').map(Number), bb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (aa[i] !== bb[i]) return aa[i]! > bb[i]!;
  return false;
};

// The roadmap is the release plan; this package is only its candidate-specific
// review evidence. Single-line fields make the authority-bearing values unambiguous.
function field(text: string, name: string): string {
  const values = text.split('\n').filter((line) => line.startsWith(`${name}:`)).map((line) => line.slice(name.length + 1).trim());
  if (values.length !== 1 || !values[0]) throw new Error(`release requires one nonempty ${name}: field`);
  return values[0];
}
function releaseSection(roadmap: string, id: string): string {
  const sections = roadmap.split(/^## /m).filter((section) => section.startsWith(`${id}: `));
  if (sections.length !== 1) throw new Error(`roadmap requires one release outcome ${id}`);
  return sections[0];
}
const fullCommit = (value: string) => /^[a-f0-9]{40}$/.test(value);
const releaseFields = ['Release decision', 'Target version', 'Target window', 'Review by', 'Candidate', 'Scope', 'Readiness', 'Readiness evidence', 'Rationale', 'Version rationale'];

if (command === 'ship') {
  const config = Bun.YAML.parse(readFileSync(resolve(project, '.open-autonomy/config.yaml'), 'utf8')) as { account: string; live?: string };
  const shippingTasks = () => board().filter((t) => /^<!-- open-autonomy:ship(?::[a-z0-9-]+)? -->/.test(t.body ?? '') && !['done', 'archived'].includes(t.status));
  let shipping = shippingTasks();
  const park = (reason: string, except?: string) => {
    for (const task of shipping.filter((t) => t.id !== except)) {
      // Scheduled is a native planning hold, not a human-input block or completion.
      // Leave leased/review work intact for PM to reconcile through its handoff.
      if (['blocked', 'ready', 'todo'].includes(task.status)) run(['hermes', 'kanban', 'schedule', task.id, reason]);
    }
  };
  if (!config.live) { console.log('No live address configured; use the project release procedure for non-service artifacts.'); process.exit(0); }
  git('fetch', '-q', 'origin', 'main');
  const roadmap = git('show', 'origin/main:ROADMAP.md');
  // The landed plan, not a transient local package error, withdraws authority.
  // Inspect each request's original/latest proposal before stopping its reminders.
  for (const request of shipping) {
    if (!['blocked', 'ready', 'todo'].includes(request.status)) continue;
    const detail = JSON.parse(run(['hermes', 'kanban', 'show', request.id, '--json'])) as { comments: Array<{ author: string; body: string }> };
    const proposal = detail.comments.filter((c) => c.author === 'pm' && c.body.startsWith(requestMarker)).at(-1)?.body ?? request.body ?? '';
    let id: string, priorPlan: string;
    try {
      id = field(proposal, 'Release');
      priorPlan = field(proposal, 'Plan');
      if (!fullCommit(priorPlan)) throw new Error('legacy or invalid release plan');
    } catch {
      run(['hermes', 'kanban', 'schedule', request.id, 'This legacy review request has no pinned PM release decision. Hold it for PM reconciliation; no approval or release is implied.']);
      continue;
    }
    // Missing history or a failed native read is a source gap, not revocation.
    const priorRoadmap = git('show', `${priorPlan}:ROADMAP.md`);
    let withdrawn = false;
    try {
      const before = releaseSection(priorRoadmap, id);
      const current = releaseSection(roadmap, id);
      withdrawn = field(current, 'Release decision') !== 'request-review' || field(current, 'Readiness') !== 'ready-for-review' ||
        field(proposal, 'Candidate') !== field(current, 'Candidate') || field(proposal, 'Version') !== field(current, 'Target version') ||
        releaseFields.some((name) => field(before, name) !== field(current, name));
    } catch { withdrawn = true; }
    if (withdrawn) run(['hermes', 'kanban', 'schedule', request.id, 'The current landed PM plan no longer authorizes this review proposal. Hold it for reconciliation; no approval or release is implied.']);
  }
  shipping = shippingTasks();
  const packagePath = resolve(home, 'release-review.md');
  const review = existsSync(packagePath) ? readFileSync(packagePath, 'utf8') : '';
  let release: string, candidate: string, version: string, plan: string, section: string;
  try {
    release = field(review, 'Release');
    if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(release)) throw new Error('Release must name a roadmap outcome ID');
    candidate = field(review, 'Candidate');
    plan = field(review, 'Plan');
    if (!fullCommit(candidate) || !fullCommit(plan)) throw new Error('Candidate and Plan must be full commit SHAs');
    // Both the selected candidate and the decision must already be consolidated.
    git('merge-base', '--is-ancestor', candidate, plan);
    git('merge-base', '--is-ancestor', plan, 'origin/main');
    section = releaseSection(git('show', `${plan}:ROADMAP.md`), release);
    const current = releaseSection(roadmap, release);
    for (const name of releaseFields) if (field(section, name) !== field(current, name)) throw new Error(`${name} changed; PM must reconcile the release package`);
    if (field(current, 'Release decision') !== 'request-review') throw new Error('PM has not decided to request release review');
    if (field(current, 'Readiness') !== 'ready-for-review') throw new Error('release readiness is not established');
    if (field(current, 'Candidate') !== candidate) throw new Error('Candidate does not match the landed PM decision');
    version = field(review, 'Version');
    if (version !== field(current, 'Target version')) throw new Error('Version does not match the landed PM decision');
    for (const name of ['Verification', 'Risks', 'Human action']) field(review, name);
    if (!/\[[^\]]+\]\(https:\/\/[^)]+\)/.test(section) || !/\[[^\]]+\]\(https:\/\/[^)]+\)/.test(review)) throw new Error('release decision and verification require source links');
  } catch (error) {
    const reason = `Release review is on hold: ${(error as Error).message}. Continue PM planning; this is not an approval or a release.`;
    console.log(`${reason} No release request sent.`);
    process.exit(0);
  }
  const marker = `<!-- open-autonomy:ship:${release} -->`;
  const task = shipping.find((t) => t.body?.startsWith(marker) && t.status !== 'scheduled');
  park('PM is reviewing a different release proposal; reconcile this superseded request before resuming.', task?.id);
  if (task && ['ready', 'running', 'review', 'todo', 'triage'].includes(task.status)) {
    console.log(`Release task ${task.id} has an active handoff; PM must reconcile it without replacing its lease or review scope.`);
    process.exit(0);
  }
  const base = process.env.OPEN_AUTONOMY_BASE_URL;
  if (!base) throw new Error('OPEN_AUTONOMY_BASE_URL is required to read deployment status');
  const response = await fetch(`${base.replace(/\/$/, '')}/accounts/${encodeURIComponent(config.account)}`);
  if (!response.ok) throw new Error(`deployment status returned ${response.status}`);
  const { live } = await response.json() as { live?: { ahead: number | null; head?: string; commit?: string } };
  // Main may have advanced since candidate selection. Never move the human's
  // review target just because another commit landed, or require all of main to ship.
  if (!live || !/^[a-f0-9]{7,40}$/i.test(live.commit ?? '')) {
    console.log('Live deployment status is unknown; no request is sent or shipping task released.');
    process.exit(0);
  }
  const deployed = git('rev-parse', '--verify', `${live.commit}^{commit}`);
  if (deployed === candidate) {
    if (task?.status === 'blocked') run(['hermes', 'kanban', 'unblock', task.id]);
    console.log(`Release ${version} candidate ${candidate} is deployed; later main commits remain unreleased. Native review must verify the remaining acceptance.`);
  } else {
    // An already newer/different deployed line needs reconciliation, not a request
    // to roll it back. A normal release candidate must descend from deployed code.
    const forward = Bun.spawnSync({ cmd: ['git', 'merge-base', '--is-ancestor', deployed, candidate], cwd: project, stdout: 'pipe', stderr: 'pipe' });
    if (forward.exitCode) { park('Live code is outside this release range; PM must reconcile the candidate before requesting review.'); console.log('Live code is outside the selected release range; review held.'); process.exit(0); }
    const ask = `${review.trim()}\n\nPM release plan: https://github.com/${config.account}/blob/${plan}/ROADMAP.md (${release}).\nTarget window: ${field(section, 'Target window')}\nReview by: ${field(section, 'Review by')}\nScope: ${field(section, 'Scope')}\nReadiness: ${field(section, 'Readiness')}\nReadiness evidence: ${field(section, 'Readiness evidence')}\nWhy release: ${field(section, 'Rationale')}\nWhy this version: ${field(section, 'Version rationale')}\nCandidate diff: https://github.com/${config.account}/compare/${deployed}...${candidate}. Only a maintainer may approve this proposal, cut its release tag and approve the production run at https://github.com/${config.account}/actions. Approval is for version ${version} at ${candidate}, never later main commits. The target window is not permission to deploy.`;
    ownerRequest(marker, `Review release ${release}`, `${ask}\nWhen resumed, verify live reports candidate ${candidate} and hand off evidence to native review. Never deploy.`, `pm:ship:${release}:${version}:${candidate}:${plan}`, true);
    console.log(ask);
  }
} else if (command === 'restart') {
  if (!idle()) { console.log('A task is running or under review; restart waits for an idle hour.'); process.exit(0); }
  git('fetch', '-q', 'origin', 'main');
  const landed = record(git('show', 'origin/main:.open-autonomy/kit.json')).version;
  if (running === landed) { console.log(`Gateway already runs kit ${landed}.`); process.exit(0); }
  if (!running) throw new Error('the running stack predates managed restarts; owner must restart it once with the current start script');
  if (git('status', '--porcelain')) throw new Error('checkout has uncommitted work; restart waits until it is preserved');
  writeFileSync(resolve(home, 'kit-restart.json'), JSON.stringify({ version: landed }));
  console.log(`Kit ${landed} landed; the supervisor will drain the gateway and restart the complete stack.`);
} else if (command === 'status' || command === 'upgrade') {
  const latest = run(['npm', 'view', 'create-open-autonomy', 'version']).trim();
  console.log(JSON.stringify({ installed, running, latest, idle: idle() }));
  if (command === 'status' || !newer(latest, installed)) process.exit(0);
  if (!idle()) { console.log('A task is running or under review; upgrade waits for an idle hour.'); process.exit(0); }
  git('fetch', '-q', 'origin', 'main');
  const landed = record(git('show', 'origin/main:.open-autonomy/kit.json')).version;
  if (!newer(latest, landed)) { console.log(`Kit ${landed} already landed; request a restart.`); process.exit(0); }
  const branch = `land/kit-${latest}`;
  if (git('ls-remote', '--heads', 'origin', branch)) {
    console.log(`Upgrade ${branch} is already pushed.`);
    reviewUpgrade(branch);
    process.exit(0);
  }
  const parent = resolve(home, 'kit-upgrades');
  mkdirSync(parent, { recursive: true });
  const worktree = resolve(parent, latest);
  if (existsSync(worktree)) {
    if (run(['git', 'branch', '--show-current'], worktree) !== branch) throw new Error(`${worktree} is not the expected upgrade branch ${branch}`);
    console.log(`Resuming the preserved upgrade at ${worktree}.`);
  } else git('worktree', 'add', '-b', branch, worktree, 'origin/main');
  const stagedVersion = record(readFileSync(resolve(worktree, '.open-autonomy/kit.json'), 'utf8')).version;
  if (stagedVersion !== latest) run(['bunx', `create-open-autonomy@${latest}`, 'upgrade', '.'], worktree);
  run(['bun', 'install', '--frozen-lockfile'], worktree);
  run(['bun', 'run', 'check'], worktree);
  if (!idle()) throw new Error(`a task started during the upgrade; ${worktree} is preserved and has not been pushed`);
  run(['git', 'add', '-A'], worktree);
  // Older adopters ignore every hook except seed; the new kit hook is source, not runtime state.
  run(['git', 'add', '-f', 'hermes/hooks/escalate/HOOK.yaml', 'hermes/hooks/escalate/handler.py'], worktree);
  if (run(['git', 'status', '--porcelain'], worktree)) run(['git', '-c', 'core.hooksPath=/dev/null', 'commit', '-s', '--author=Open Autonomy agent <agent@open-autonomy.org>', '-m', `kit-${latest}: take the kit upgrade`], worktree);
  run(['git', 'push', '-u', 'origin', branch], worktree);
  git('worktree', 'remove', worktree);
  reviewUpgrade(branch);
  console.log(`Pushed ${branch}; the landing workflow opens its pull request. Workflow changes need the owner's review.`);
} else throw new Error('usage: maintain.ts status | upgrade | restart | ship');
