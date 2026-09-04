#!/usr/bin/env bun
// One build-roadmap run of the REAL Hermes against the world (bun world/run.ts agent), exactly as the
// cron job invokes it: the checked-in Hermes home, its model pointed at the world's platform on the key
// the seed minted, working in the clone whose origin is the GitHub twin. Prints the session id; the
// verify step reads the books and the twin, never this run's prose.
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DATA, MODEL, REPO, agentEnv, api } from './lib.ts';

const hermes = process.env.HERMES_BIN ?? Bun.which('hermes');
if (!hermes) throw new Error('no runnable `hermes` on PATH (or HERMES_BIN): the agent leg cannot run');
const home = resolve(DATA, 'hermes-home');
mkdirSync(home, { recursive: true });
for (const f of ['SOUL.md', 'config.yaml', '.no-bundled-skills']) cpSync(resolve(REPO, 'hermes', f), resolve(home, f));
cpSync(resolve(REPO, 'hermes', 'skills'), resolve(home, 'skills'), { recursive: true });
// Single-query mode has no user to approve a command Hermes flags as dangerous; the production job runs in
// the gateway's cron lane. The world runs the same skill one-shot, so it grants that lane's stance here.
writeFileSync(resolve(home, 'config.yaml'), readFileSync(resolve(home, 'config.yaml'), 'utf8') + '\napprovals:\n  single_query_mode: approve\n');
const env = agentEnv();
writeFileSync(resolve(home, '.env'), `OPEN_AUTONOMY_BASE_URL=${env.OPEN_AUTONOMY_BASE_URL}\nOPEN_AUTONOMY_KEY=${env.OPEN_AUTONOMY_KEY}\n`);
// Sealed: Hermes must not probe a public model catalog. Its cached metadata says the model is roomy.
mkdirSync(resolve(home, 'cache'), { recursive: true });
writeFileSync(resolve(home, 'cache', 'openrouter_model_metadata.json'), JSON.stringify({ [MODEL]: { context_length: 1_000_000, max_completion_tokens: 65536, name: 'DeepSeek V4 Flash (world)', pricing: {} } }));

// The receipts the site renders come from the reporter, which narrates a run to the platform on the
// standing key. The reporter itself is not in the world (it reads a Hermes home through supercode beside
// the agent), so the world narrates this run the same way it would: started, then finished with the
// report. That keeps the receipt path — intake, redaction, the page's health line — under the world.
const key = `cron_world_${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15)}`;
const platform = api(env.OPEN_AUTONOMY_BASE_URL.replace(/\/v1$/, ''), { authorization: `Bearer ${env.OPEN_AUTONOMY_KEY}`, 'content-type': 'application/cloudevents+json' });
const event = (type: string, data: Record<string, unknown>) => ({ specversion: '1.0', id: crypto.randomUUID(), source: `hermes://${home}/state.db`, type: `org.open-autonomy.job.${type}`, subject: key, time: new Date().toISOString(), datacontenttype: 'application/json', data });
const started = await platform.post('/v1/agent/events', event('started', { job_name: 'build-roadmap', title: 'build-roadmap · in the world' }));
if (started.status !== 200) throw new Error(`platform: job started → ${started.status} ${started.text.slice(0, 200)}`);

const work = resolve(DATA, 'work');
const prompt = 'Work the top open item of ROADMAP.yml in the Open Autonomy repository using the build-roadmap skill. Finish it, verify it, push your branch, record its status, and report in five lines or fewer.';
const proc = Bun.spawn({
  cmd: [hermes, 'chat', '-q', prompt, '--oneshot', '-Q', '--skills', 'build-roadmap', '--in', work],
  cwd: work, stdout: 'inherit', stderr: 'pipe',
  env: { ...process.env, HERMES_HOME: home, HERMES_GATEWAY_NO_SUPERVISE: '1', ...env },
});
const killer = setTimeout(() => proc.kill(), 240_000);
const [code, err] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
clearTimeout(killer);
const finished = await platform.post('/v1/agent/events', event('finished', {
  status: code === 0 ? 'done' : 'failed',
  item_id: 'world-item',
  report: code === 0 ? 'The world\'s run finished. Its outcome is the twin state the verify step reads, never this line.' : `hermes exited ${code}`,
  ended_at: new Date().toISOString(),
}));
if (finished.status !== 200) console.error(`platform: job finished → ${finished.status} ${finished.text.slice(0, 200)}`);
if (code !== 0) { console.error(err.slice(-3000)); throw new Error(`hermes exited ${code}`); }
console.log(`agent: run narrated to the platform as ${key} (${code === 0 ? 'done' : 'failed'})`);
