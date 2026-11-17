// Installed fleet and coding releases, selected from their own public package closures (ADR 0036).
// Existing explicit World selections name all fleet inputs; ordinary installs never import a serving source tree.
import { machinePublishedBinding } from './install-runtime.ts';
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { delimiter, dirname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

/** The one command that installs, or upgrades, the four at one release. */
export const INSTALL = 'pnpm --config.nodeLinker=hoisted add -g --package-import-method hardlink --allow-build @homebridge/node-pty-prebuilt-multiarch --allow-build @volter/supercode @volter/supercode';

/** What a machine's supercode is made of: its command, and its release's orchestrator entry and harness SDK folder. */
export type MachineSupercode = { bin: string; orchestratorEntry: string; harnessSdk: string; release: string | null };

const PINNED = ['@volter/supercode-orchestrator', '@volter/supercode-harness-sdk', '@volter/supercode-teams'];

/** The first `name` on PATH outside any install's own `node_modules/.bin`, or null. */
function onPath(name: string, environment = process.env): string | null {
  for (const dir of (environment.PATH ?? '').split(delimiter)) {
    if (!dir || resolve(dir).endsWith(`${sep}node_modules${sep}.bin`)) continue;
    for (const file of process.platform === 'win32' ? [`${name}.cmd`, `${name}.exe`] : [name]) if (existsSync(join(dir, file))) return join(dir, file);
  }
  return null;
}

const json = (path: string) => { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; } };

/**
 * The machine's supercode, its four packages checked to be one release; throws one error naming what is wrong and the
 * one command that fixes it. Unreleased builds a review or a World names are taken as named, all three or none.
 */
export function machineSupercode(): MachineSupercode {
  const named = [process.env.OPEN_AUTONOMY_SUPERCODE_BIN, process.env.OPEN_AUTONOMY_ORCHESTRATOR_BIN, process.env.OPEN_AUTONOMY_HARNESS_SDK];
  if (named.some(Boolean)) {
    if (!named.every(Boolean)) throw new Error('an unreleased supercode is named with its orchestrator and its harness SDK, all three: OPEN_AUTONOMY_SUPERCODE_BIN, OPEN_AUTONOMY_ORCHESTRATOR_BIN and OPEN_AUTONOMY_HARNESS_SDK');
    return { bin: named[0]!, orchestratorEntry: named[1]!, harnessSdk: named[2]!, release: null };
  }
  const refuse = (why: string): never => { throw new Error(`${why}; install supercode (its orchestrator, harness SDK and Teams package come with it, at one release): ${INSTALL}`); };
  const retained = machinePublishedBinding();
  if (retained) {
    const machine = json(join(process.env.SUPERCODE_TEAMS_HOME || join(supercodeHome(), 'teams'), 'machine.json'));
    if (machine?.generation_owner !== machine?.pid || machine?.mail_ready !== true || machine?.release?.supercode !== retained.release)
      refuse(`retained supercode ${retained.release} is not the serving machine generation`);
    return { bin: join(retained.root, 'bin/supercode.js'),
      orchestratorEntry: join(retained.root, 'node_modules/@volter/supercode-orchestrator/bin/orchestrator.mjs'),
      harnessSdk: join(retained.root, 'node_modules/@volter/supercode-harness-sdk'), release: retained.release };
  }
  const { selected, roots } = installedProgram('supercode', '@volter/supercode', PINNED);
  // The machine daemon too: its connector unit must run this release's Teams package. A unit written before one-release
  // installs names a separately installed one; supercode's install or upgrade moves it (its postinstall,
  // lib/release.mjs), and a unit still naming another release is refused here.
  const teams = join(roots.get('@volter/supercode-teams')!, 'bin', 'teams.mjs');
  const stale = daemonEntries().filter((entry) => (existsSync(entry) ? realpathSync(entry) : resolve(entry)) !== teams);
  if (stale.length) refuse(`the machine daemon runs ${[...new Set(stale)].join(', ')}, not supercode ${selected.release}'s Teams package (${teams}); reinstall its service: supercode teams connect --install`);
  return selected;
}

const supercodeHome = () => process.env.SUPERCODE_HOME || (process.env.XDG_CONFIG_HOME ? join(process.env.XDG_CONFIG_HOME, 'supercode') : join(homedir(), '.config', 'supercode'));

/** Resolve exact package dependencies through the selected installed command, never an install-local copy. */
function installedProgram(command: string, packageName: string, pinned: string[], selectedBin?: string, environment = process.env) {
  const refuse = (why: string): never => { throw new Error(`${why}; select a complete installed ${packageName} release`); };
  const bin = selectedBin ?? onPath(command, environment) ?? refuse(`no ${command} is installed on PATH outside an install`);
  const nativeBin = realpathSync(bin);
  const shim = /(?:^|\n)(?:#|::|@?rem)\s*cmd-shim-target=([^\r\n]+)/i.exec(readFileSync(nativeBin, 'utf8'));
  const entry = realpathSync(shim ? resolve(dirname(nativeBin), shim[1]) : nativeBin);
  const pkg = resolve(dirname(entry), '..'), manifest = json(join(pkg, 'package.json'));
  if (manifest?.name !== packageName) refuse(`${bin} is not the installed npm package ${packageName}`);
  const pins = manifest.dependencies ?? {};
  const roots = new Map(pinned.map(name => {
    const directory = createRequire(join(pkg, 'package.json')).resolve.paths(name)?.map(base => join(base, name)).find(base => json(join(base, 'package.json'))?.name === name);
    return [name, directory ? realpathSync(directory) : null] as const;
  }));
  const wrong = pinned.flatMap(name => {
    const found = roots.get(name) ? json(join(roots.get(name)!, 'package.json'))?.version : null;
    const expected = selectedBin && /^workspace:\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.test(pins[name] ?? '') ? pins[name].slice(10) : pins[name];
    return expected && found === expected ? [] : [`${name} is ${found ?? 'missing'} where ${packageName} pins ${pins[name] ?? 'nothing'}`];
  });
  if (wrong.length) refuse(`${packageName} ${manifest.version} at ${pkg} is not one release: ${wrong.join('; ')}`);
  const coding = packageName === '@volter/supercode-agent';
  return { selected: { bin: entry,
    orchestratorEntry: join(roots.get(coding ? '@volter/supercode-agent-orchestrator' : '@volter/supercode-orchestrator')!, 'bin', 'orchestrator.mjs'),
    harnessSdk: roots.get(coding ? '@volter/supercode-agent-sdk' : '@volter/supercode-harness-sdk')!, release: manifest.version } as MachineSupercode, roots };
}

/** The installed coding owner; a prepared generation may require its exact retained selection. */
export function machineCodingProgram(environment = process.env, expected?: MachineSupercode): MachineSupercode {
  const { selected } = installedProgram('supercode-agent', '@volter/supercode-agent',
    ['@volter/supercode-agent-orchestrator', '@volter/supercode-agent-sdk'], expected?.bin ?? environment.SUPERCODE_CODING_BIN, environment);
  if (expected && Object.keys(selected).some(key => selected[key as keyof MachineSupercode] !== expected[key as keyof MachineSupercode]))
    throw new Error('the prepared coding release changed; prepare a new complete kit generation');
  return selected;
}

/** The Teams entries this machine's installed connector units run (`<teams home>/service`, teams.rs): a release's
 *  `@volter/supercode-teams` package, or a source tree's `sdk/teams`. */
function daemonEntries(): string[] {
  const service = join(process.env.SUPERCODE_TEAMS_HOME || join(supercodeHome(), 'teams'), 'service');
  let names: string[] = [];
  try { names = readdirSync(service); } catch { return []; }
  return names.filter((name) => /^dev\.volter\.supercode-teams-connector-[0-9a-f]{16}\.(plist|service|xml)$/.test(name))
    .flatMap((name) => readFileSync(join(service, name), 'utf8').match(/[^\s<>"']*[\\/](?:@volter[\\/]supercode-teams|sdk[\\/]teams)[\\/]bin[\\/]teams\.mjs/g) ?? []);
}

let checked: MachineSupercode | null = null;
const machine = () => (checked ??= machineSupercode());

/** The machine's supercode command, checked (the keeper's children take the checked one it hands them). */
export const supercodeBin = (): string => machine().bin;

/** The selected Node runtime; Bun must never be substituted for this executable. */
export function machineNode(): string {
  const node = process.env.SUPERCODE_NODE_BIN || Bun.which('node');
  if (!node) throw new Error('the machine selection needs an installed Node runtime');
  return node;
}
/** Literal invocation for either a Node source program or a retained legacy executable. */
export function supercodeCommand(args: string[], bin = supercodeBin()): string[] {
  return /\.[cm]?js$/i.test(bin) ? [machineNode(), bin, ...args] : [bin, ...args];
}


/** The orchestrator's entry, run with node, checked. */
export const orchestratorEntry = (): string => machine().orchestratorEntry;

/** The URL of the module a package folder exports at `subpath` ('.', './apply', …), as its package.json names it. */
function exported(dir: string, subpath: string): string {
  const entry = json(join(dir, 'package.json'))?.exports?.[subpath];
  const target = typeof entry === 'string' ? entry : entry?.import ?? entry?.default;
  if (typeof target !== 'string') throw new Error(`${dir} exports no ${subpath}`);
  return pathToFileURL(join(dir, target)).href;
}

let codingChecked: MachineSupercode | null = null;
const coding = () => codingChecked ??= machineCodingProgram();
/** Coding setup and orchestration use Agent's installed package. */
export const codingOrchestratorModule = (subpath = '.'): string => exported(resolve(dirname(coding().orchestratorEntry), '..'), subpath);
export const codingSdkModule = (subpath = '.'): string => exported(coding().harnessSdk, subpath);
export const codingCommand = (args: string[]): string[] => supercodeCommand(args, coding().bin);
export const codingBin = (): string => coding().bin;

/** A module of the harness SDK package (`.`, `./core`, …), for a dynamic import, checked. */
export const harnessSdkModule = (subpath = '.'): string => exported(machine().harnessSdk, subpath);
