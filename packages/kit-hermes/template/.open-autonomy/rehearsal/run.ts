#!/usr/bin/env bun
// The rehearsal: the project's world, up, and stories through it. The same shape for every project the kit makes and
// for Open Autonomy's own: the twins the project's channels name (rehearsal/world.json), the model twin on the
// project's scripted brain (rehearsal/model/scenario.*), the backend copy on those twins, the seed (this repository on
// the GitHub twin, the account funded, the keys minted the adopter way), then the brain's stack on the world's secrets.
// Nothing in a rehearsal calls a real API. Judgment that the real model makes in prose is fixed in the scenario;
// what the rehearsal proves is the plumbing: the doors, the books, the board, the dispatcher, the review lane, the
// reporter, the page.
//
//   bun .open-autonomy/rehearsal/run.ts up            everything up (idempotent over a running world)
//   bun .open-autonomy/rehearsal/run.ts fresh         start over: the twins' state, the books, the keys, the home forgotten
//   bun .open-autonomy/rehearsal/run.ts down [--purge]
//   bun .open-autonomy/rehearsal/run.ts story rehearsal/stories/<name>.jsonl     one story, one line per act
//   bun .open-autonomy/rehearsal/run.ts stories       every story, one line per story with its verdict and its seconds
//   bun .open-autonomy/rehearsal/run.ts seed | stack up|down|restart | hermes <args…> | env -- <cmd…> | url [service]
//
// A restart starts over: a world's down-then-up is a new instance, and the twins' vendor roots outlive the instance's
// blob store (the GitHub twin's git objects), which leaves refs without objects. Worlds are cheap; `fresh` is the restart.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DATA, GENERATED, KIT_DIR, NAME, REHEARSAL, ROOT, STACK, STATE, TWINS_ROOT, context, hooks, sh, timed, twinCli } from './lib.ts';

const cli = twinCli('world');
if (!existsSync(cli)) { console.error(`rehearsal: no twins at ${cli} — \`bun install\` in .open-autonomy (or TWINS_ROOT for a checkout)`); process.exit(2); }
const argv = process.argv.slice(2);
const verb = argv[0];
const rest = (() => { const i = argv.indexOf('--'); return i >= 0 ? argv.slice(i + 1) : []; })();
const config = resolve(GENERATED, 'world.config.json');
const envFile = resolve(GENERATED, 'world.env');
const scenario = resolve(GENERATED, 'scenario.json');
mkdirSync(GENERATED, { recursive: true });

function world(args: string[], opts: { check?: boolean } = { check: true }): number {
  const res = Bun.spawnSync({ cmd: ['bun', cli, ...args], cwd: ROOT, stdio: ['inherit', 'inherit', 'inherit'], env: { ...process.env, ...(TWINS_ROOT ? { TWINS_ROOT } : {}) } });
  if (opts.check && res.exitCode !== 0) { console.error(`volter-world ${args[0]} failed (${res.exitCode})`); process.exit(res.exitCode || 1); }
  return res.exitCode;
}
const inWorld = (cmd: string[], opts: { check?: boolean } = {}) => world(['attach', NAME, '--root', STATE, '--', 'env', `VOLTER_WORLD=${NAME}`, ...cmd], opts);
const step = (name: string, ...args: string[]) => timed(`${name}${args.length ? ` ${args.join(' ')}` : ''}`, () => inWorld(['bun', resolve(KIT_DIR, `${name}.ts`), ...args]));
const running = (): boolean => Bun.spawnSync({ cmd: ['bun', cli, 'status', NAME, '--root', STATE], stdout: 'pipe', stderr: 'pipe' }).stdout.toString().includes('running');

// The scripted brain, from the project's generator (TypeScript or Python), printing the scenario document. Then the
// two static checks that catch the failures a scripted brain has: a marker that also occurs in the skill or soul text
// (it would match every turn) is an error; a marker no door prints (it can never match) is a warning naming it.
function generateScenario(): void {
  const gen = ['scenario.ts', 'scenario.py', 'gen-handlers.py', 'gen-handlers.ts'].map((f) => resolve(REHEARSAL, 'model', f)).find(existsSync);
  if (!gen) { console.error(`rehearsal: no rehearsal/model/scenario.ts (or .py): the project has no scripted brain`); process.exit(2); }
  const r = Bun.spawnSync({ cmd: gen.endsWith('.py') ? ['python3', gen] : ['bun', gen], cwd: ROOT, stdout: 'pipe', stderr: 'inherit', env: { ...process.env, REHEARSAL_PROJECT: ROOT, REHEARSAL_STACK_PROJECT: resolve(STACK, 'project') } });
  if (r.exitCode !== 0) { console.error(`rehearsal: ${gen} failed (${r.exitCode})`); process.exit(r.exitCode || 1); }
  const out = r.stdout.toString();
  type Doc = { handlers?: Array<{ $comment?: string; id?: string; on?: Record<string, unknown> }> };
  const doc: Doc = (() => { try { return JSON.parse(out) as Doc; } catch { throw new Error(`rehearsal: ${gen} did not print a scenario document (JSON with handlers)`); } })();
  writeFileSync(scenario, out);
  const skillText = [resolve(ROOT, 'hermes', 'SOUL.md'), ...walk(resolve(ROOT, 'hermes', 'skills')).filter((f) => f.endsWith('.md'))].map((f) => readFileSync(f, 'utf8')).join('\n').toLowerCase();
  const doorDirs = ['bin', 'hermes/scripts', '.open-autonomy', 'rehearsal/model'].map((d) => resolve(ROOT, d)).filter(existsSync);
  const doorText = doorDirs.flatMap((d) => walk(d)).filter((f) => /\.(sh|py|ts|json)$/.test(f) && !f.includes('node_modules')).map((f) => { try { return readFileSync(f, 'utf8'); } catch { return ''; } }).join('\n');
  const toolOutputs = /kanban_|"status": "|"title": "|"id": "|"exit_code"|WAKE: |Monitor Baseline|MONITOR CHANGE|work kanban task/;
  const errors: string[] = []; const warnings: string[] = [];
  for (const [i, hd] of (doc.handlers ?? []).entries()) {
    const label = hd.$comment ?? hd.id ?? `handler-${i + 1}`;
    for (const k of ['anyTextIncludes', 'userTextIncludes']) {
      const m = hd.on?.[k]; if (typeof m !== 'string' || m.includes('{{') || m.length < 4) continue;
      if (skillText.includes(m.toLowerCase())) errors.push(`${label}: on.${k} ${JSON.stringify(m)} also occurs in the skill or soul text — it would match every turn`);
      else if (!doorText.includes(m.replace(/^\+/, '')) && !toolOutputs.test(m)) warnings.push(`${label}: on.${k} ${JSON.stringify(m)} — no door under ${doorDirs.map((d) => d.replace(`${ROOT}/`, '')).join(', ')} prints it`);
    }
  }
  for (const w of warnings) console.warn(`scenario: warning: ${w}`);
  if (errors.length) { for (const e of errors) console.error(`scenario: ${e}`); process.exit(1); }
  console.log(`scenario: ${(doc.handlers ?? []).length} handler(s)${warnings.length ? `, ${warnings.length} unanchored marker(s)` : ''} → ${scenario}`);
}
function walk(dir: string): string[] { if (!existsSync(dir)) return []; return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(resolve(dir, e.name)) : [resolve(dir, e.name)])); }
// The world's definition, rendered: ${TWIN:<vendor>} (that twin's CLI), ${KIT_DIR} (this directory: the backend copy,
// the Actions runner), ${SCENARIO}, ${DATA}. Ports move by REHEARSAL_PORT_OFFSET when two worlds share a machine.
function renderWorld(): void {
  const src = resolve(REHEARSAL, 'world.json');
  if (!existsSync(src)) { console.error('rehearsal: no rehearsal/world.json'); process.exit(2); }
  const offset = Number(process.env.REHEARSAL_PORT_OFFSET ?? 0);
  const doc = JSON.parse(readFileSync(src, 'utf8').replace(/\$\{TWIN:([a-z-]+)\}/g, (_, n: string) => twinCli(n)).replaceAll('${KIT_DIR}', KIT_DIR).replaceAll('${SCENARIO}', scenario).replaceAll('${DATA}', DATA).replaceAll('${HOME}', process.env.HOME ?? ''));
  doc.id = NAME;
  for (const s of doc.services ?? []) { if (typeof s.port === 'number') s.port += offset; if (s.id === 'discord' && s.env?.TWIN_DISCORD_GATEWAY_URL) s.env.TWIN_DISCORD_GATEWAY_URL = `ws://127.0.0.1:${s.port}/gateway`; }
  writeFileSync(config, JSON.stringify(doc, null, 2));
}
async function custody(): Promise<void> { const h = await hooks(); if (h.custody) await h.custody(context((m) => console.log(`custody: ${m}`))); }
const url = (service: string): string => Bun.spawnSync({ cmd: ['bun', cli, 'url', NAME, service, '--root', STATE], stdout: 'pipe', stderr: 'pipe' }).stdout.toString().trim().split('\n').pop() ?? '';

switch (verb) {
  case 'up': {
    generateScenario(); renderWorld();
    if (!running()) { world(['up', config, '--env-file', envFile, '--name', NAME, '--mode', process.env.WORLD_MODE ?? 'local', '--root', STATE]); }
    else console.log(`world ${NAME} is running; the twins keep their state (\`fresh\` starts over)`);
    await custody();
    step('seed');
    step('stack', 'up');
    console.log(`\nrehearsal up: ${NAME}\n  page: ${url('platform')}/p/${encodeURIComponent(context().account)}\n  a story: bun .open-autonomy/rehearsal/run.ts story rehearsal/stories/<name>.jsonl\n  the twins: volter-world tail ${NAME} --root ${STATE}`);
    break;
  }
  case 'fresh': {
    Bun.spawnSync({ cmd: ['bun', resolve(KIT_DIR, 'stack.ts'), 'down', '--purge'], stdio: ['inherit', 'inherit', 'inherit'] });
    world(['down', NAME, '--root', STATE, '--purge'], { check: false });
    for (const d of [DATA, GENERATED, STACK]) rmSync(d, { recursive: true, force: true });
    console.log('rehearsal: forgotten — the twins\' state, the books, the keys, the home, the clone; `up` starts over');
    break;
  }
  case 'down': { Bun.spawnSync({ cmd: ['bun', resolve(KIT_DIR, 'stack.ts'), 'down', ...(argv.includes('--purge') ? ['--purge'] : [])], stdio: ['inherit', 'inherit', 'inherit'] }); world(['down', NAME, '--root', STATE, ...(argv.includes('--purge') ? ['--purge'] : [])], { check: false }); break; }
  case 'seed': await custody(); step('seed'); break;
  case 'stack': process.exit(step('stack', ...argv.slice(1))); break;
  case 'hermes': process.exit(Bun.spawnSync({ cmd: ['bun', resolve(KIT_DIR, 'stack.ts'), 'hermes', ...argv.slice(1)], stdio: ['inherit', 'inherit', 'inherit'] }).exitCode);
  case 'env': inWorld(rest); break;
  case 'url': console.log(url(argv[1] ?? 'platform')); break;
  case 'story': { const f = argv[1]; if (!f) { console.error('usage: run.ts story <file.jsonl>'); process.exit(2); } process.exit(inWorld(['bun', resolve(KIT_DIR, 'story.ts'), resolve(f)], { check: false })); }
  case 'stories': {
    const dir = resolve(REHEARSAL, 'stories'); const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort() : [];
    let failed = 0;
    for (const f of files) { const t0 = Date.now(); const code = inWorld(['bun', resolve(KIT_DIR, 'story.ts'), resolve(dir, f)], { check: false }); const secs = ((Date.now() - t0) / 1000).toFixed(0); console.log(`${code === 0 ? 'PASS' : 'FAIL'}  ${f}  ${secs}s`); if (code !== 0) failed++; }
    console.log(`${files.length - failed}/${files.length} stories pass`);
    process.exit(failed ? 1 : 0);
  }
  default:
    console.error('usage: bun .open-autonomy/rehearsal/run.ts up | fresh | down [--purge] | seed | stack up|down|restart | story <file> | stories | hermes <args…> | env -- <cmd…> | url [service]');
    process.exit(2);
}
