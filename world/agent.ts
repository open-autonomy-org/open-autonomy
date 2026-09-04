#!/usr/bin/env bun
// One build-roadmap run of the REAL Hermes against the world (bun world/run.ts agent), as the cron job
// invokes it: the cookbook's applied home, its model pointed at the world's platform on the key the seed
// minted, working in the cookbook clone whose origin is the GitHub twin. Interim: the stack-attaches-to-world
// item replaces this one-shot with the real container stack, attached. Prints the session id; the
// verify step reads the books and the twin, never this run's prose.
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { COOKBOOK, DATA, MODEL, WORK, agentEnv, git, need } from './lib.ts';

const hermes = process.env.HERMES_BIN ?? Bun.which('hermes');
if (!hermes) throw new Error('no runnable `hermes` on PATH (or HERMES_BIN): the agent leg cannot run');
const home = resolve(DATA, 'hermes-home');
mkdirSync(home, { recursive: true });
// The home is the cookbook's own hermes/, which is the template applied — the same files an adopter commits.
cpSync(resolve(COOKBOOK, 'hermes'), home, { recursive: true });
// Single-query mode has no user to approve a command Hermes flags as dangerous; the production job runs in
// the gateway's cron lane. The world runs the same skill one-shot, so it grants that lane's stance here.
writeFileSync(resolve(home, 'config.yaml'), readFileSync(resolve(home, 'config.yaml'), 'utf8') + '\napprovals:\n  single_query_mode: approve\n');
const env = agentEnv();
// Hermes narrates through the sidecar exactly as in production; its model calls go straight to the world's
// platform, since the world's key is a world artifact and the sidecar's job is to keep the real one out of
// the agent's reach, not to add a hop the world needs.
writeFileSync(resolve(home, '.env'), `OPEN_AUTONOMY_BASE_URL=${env.OPEN_AUTONOMY_BASE_URL}\nOPEN_AUTONOMY_KEY=${env.OPEN_AUTONOMY_KEY}\nOPEN_AUTONOMY_NARRATE_URL=${need('SIDECAR_URL')}/hermes-hook\n`);
// Sealed: Hermes must not probe a public model catalog. Its cached metadata says the model is roomy.
mkdirSync(resolve(home, 'cache'), { recursive: true });
writeFileSync(resolve(home, 'cache', 'openrouter_model_metadata.json'), JSON.stringify({ [MODEL]: { context_length: 1_000_000, max_completion_tokens: 65536, name: 'DeepSeek V4 Flash (world)', pricing: {} } }));

const work = WORK;
// Start where the last landing left main: the skill itself fetches, but a stale checkout costs the agent turns.
await git(work, 'fetch', '-q', 'origin'); await git(work, 'checkout', '-q', 'main'); await git(work, 'reset', '-q', '--hard', 'origin/main');
const prompt = "Work the top open item of ROADMAP.yml in this project's repository using the build-roadmap skill. Finish it, verify it, push your branch, record its status, and report in five lines or fewer.";
const proc = Bun.spawn({
  cmd: [hermes, 'chat', '-q', prompt, '--oneshot', '-Q', '--skills', 'build-roadmap', '--in', work],
  cwd: work, stdout: 'inherit', stderr: 'pipe',
  env: { ...process.env, HERMES_HOME: home, HERMES_GATEWAY_NO_SUPERVISE: '1', ...env },
});
const killer = setTimeout(() => proc.kill(), 240_000);
const [code, err] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
clearTimeout(killer);
if (code !== 0) { console.error(err.slice(-3000)); throw new Error(`hermes exited ${code}`); }
console.log('agent: the run is narrated by Hermes\'s own outbound webhooks, through the sidecar');
