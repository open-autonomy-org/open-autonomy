// Render this scenario's paths and model handlers into a disposable directory beside the project.
// Run the printed commands with the ordinary World CLI; this file owns no processes or lifecycle.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MODEL, NAME, ROOT, SCENARIO, STATE, TREE } from './lib.ts';

if (!/^[a-z0-9][a-z0-9-]*$/.test(NAME)) throw new Error('OA_WORLD_NAME must be a lowercase World name');
if (STATE === TREE || STATE.startsWith(`${TREE}/`)) throw new Error('WORLD_STATE_ROOT must be outside this checkout');
const hermes = process.env.WORLD_HERMES_BIN;
if (!hermes || !existsSync(resolve(hermes, 'hermes'))) throw new Error('Set WORLD_HERMES_BIN to the installed pinned Hermes bin directory (world/README.md)');
const valve = Number(process.env.OA_VALVE_PORT ?? 18787);
if (!Number.isInteger(valve) || valve < 1024 || valve > 65531) throw new Error('OA_VALVE_PORT must be an integer between 1024 and 65531');
const cli = (vendor: string): string => {
  const checkout = process.env.TWINS_ROOT;
  const path = process.env[`WORLD_${vendor.toUpperCase().replaceAll('-', '_')}_CLI`] ?? (checkout
    ? resolve(checkout, vendor === 'world' ? 'packages/world-runtime/src/cli.ts' : `packages/twin/${vendor}/src/cli.ts`)
    : Bun.resolveSync(`@volter/${vendor === 'world' ? 'twin-world' : `twin-${vendor}`}/src/cli.ts`, TREE));
  if (!existsSync(path)) throw new Error(`Missing ${vendor} CLI: ${path}`);
  return resolve(path);
};
// Rendering can itself run inside a tooling World; never borrow that World's instance data.
const DATA = resolve(STATE, '.volter/worlds', NAME, 'data');
const STACK = resolve(DATA, 'agent');
const dir = resolve(STATE, 'scenarios', NAME);
const handlers = resolve(dir, 'handlers/openai.json');
mkdirSync(resolve(dir, 'handlers'), { recursive: true });
const generated = Bun.spawnSync({ cmd: ['bun', resolve(SCENARIO, 'model/scenario.ts')], cwd: ROOT,
  env: { ...process.env, REHEARSAL_STACK_PROJECT: resolve(STACK, 'project') }, stdout: 'pipe', stderr: 'inherit' });
if (generated.exitCode !== 0) throw new Error(`Model handler generation failed (${generated.exitCode})`);
JSON.parse(generated.stdout.toString());
writeFileSync(handlers, generated.stdout);
const config = JSON.parse(readFileSync(resolve(SCENARIO, 'world.config.json'), 'utf8')
  .replace(/\$\{TWIN:([a-z-]+)\}/g, (_, name: string) => cli(name))
  .replaceAll('${SCENARIO_DIR}', SCENARIO).replaceAll('${TREE}', TREE).replaceAll('${HANDLERS}', handlers));
config.id = NAME;
const home = resolve(STACK, 'home');
Object.assign(config.env, { OA_WORLD_NAME: NAME, WORLD_STATE_ROOT: STATE, WORLD_HERMES_BIN: resolve(hermes),
  OA_SCENARIO_DIR: SCENARIO, OA_PROJECT: ROOT, OA_AGENT_PROJECT: resolve(STACK, 'project'),
  OA_AGENT_HOME: home, OA_SECRETS: resolve(DATA, 'secrets'), OA_ACCOUNT: 'cookbook/todo-cli',
  HOME: home, HERMES_HOME: home, PATH: `${resolve(hermes)}:${process.env.PATH}`, OPEN_AUTONOMY_MODEL: MODEL,
  // Freeze scenario choices into the config so attach/ready see the same opening situation.
  ...Object.fromEntries(['REHEARSAL_IDLE', 'REHEARSAL_COMMUNITY', 'REHEARSAL_SCRUM', 'REHEARSAL_RELEASE', 'REHEARSAL_OWNER_DOOR'].map(key => [key, process.env[key] ?? (key === 'REHEARSAL_OWNER_DOOR' ? 'discord' : '')])) });
config.services.find((service: { id: string }) => service.id === 'agent').port = valve;
for (const service of config.services) service.cwd = TREE;
const path = resolve(dir, 'world.config.json');
writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
const quote = (s: string) => `'${s.replaceAll("'", "'\\''")}'`;
const world = `bun ${quote(cli('world'))}`;
console.log(`Prepared ${path}\n\n${world} up ${quote(path)} --env-file ${quote(resolve(dir, 'world.env'))} --root ${quote(STATE)}\n${world} app-url ${NAME} --root ${quote(STATE)} --set "$(${world} url ${NAME} platform --root ${quote(STATE)})"\n${world} attach ${NAME} --root ${quote(STATE)} -- bun ${quote(resolve(SCENARIO, 'operator.ts'))} hermes kanban list\n${world} down ${NAME} --root ${quote(STATE)} --purge`);
