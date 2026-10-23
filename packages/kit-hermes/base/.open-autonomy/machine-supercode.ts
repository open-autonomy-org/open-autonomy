// One supercode per machine, one release per install (open-autonomy D215, D217): supercode, its orchestrator, its
// harness SDK and its Teams package are the machine's, which its machine daemon runs too, never a copy in this install.
// `@volter/supercode` pins the other three exactly and npm installs them inside it, so `npm install -g @volter/supercode`
// puts the four on a machine at one release (supercode RELEASING.md, "One release, one install"). They are found from
// the machine's `supercode` on PATH (never one in an install's node_modules/.bin): that bin's link target is
// `<prefix>/lib/node_modules/@volter/supercode/bin/…`, and the three are in that package's own node_modules. Each must
// be there at exactly the version `@volter/supercode` pins, or nothing starts: a client a release behind the machine's
// daemon or serve was refused by it, and an orchestrator released apart from its native refused its board verbs.
// A review or a World runs unreleased builds instead, named together: OPEN_AUTONOMY_SUPERCODE_BIN, its
// OPEN_AUTONOMY_ORCHESTRATOR_BIN and its OPEN_AUTONOMY_HARNESS_SDK (a harness SDK package folder, sdk/typescript).
// A machine whose supercode runs from a source lock (`<supercode home>/source-lock.json`: supercode pinned to a checked-out
// commit, its `packaging/npm` package linked onto PATH) is one release too: the lock's tree carries the orchestrator,
// harness SDK and Teams package at that commit (sdk/orchestrator, sdk/typescript, sdk/teams), and the machine daemon
// runs that tree's Teams package. Its packaging/npm package pins nothing, because the tree is the release.
import { sourceProgram } from './source-program.ts';
import { machineSourceBinding, machinePublishedBinding } from './install-runtime.ts';
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

/** The one command that installs, or upgrades, the four at one release. */
export const INSTALL = 'npm install -g --allow-scripts=@homebridge/node-pty-prebuilt-multiarch,@volter/supercode @volter/supercode';

/** What a machine's supercode is made of: its command, and its release's orchestrator entry and harness SDK folder. */
export type MachineSupercode = { bin: string; orchestratorEntry: string; harnessSdk: string; release: string | null };

const PINNED = ['@volter/supercode-orchestrator', '@volter/supercode-harness-sdk', '@volter/supercode-teams'];

/** The first `name` on PATH outside any install's own `node_modules/.bin`, or null. */
function onPath(name: string): string | null {
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
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
  const fromSource = sourceLocked();
  if (fromSource) return fromSource;
  const retained = machinePublishedBinding();
  if (retained) {
    const machine = json(join(process.env.SUPERCODE_TEAMS_HOME || join(supercodeHome(), 'teams'), 'machine.json'));
    if (machine?.generation_owner !== machine?.pid || machine?.mail_ready !== true || machine?.release?.supercode !== retained.release)
      refuse(`retained supercode ${retained.release} is not the serving machine generation`);
    return { bin: join(retained.root, 'bin/supercode.js'),
      orchestratorEntry: join(retained.root, 'node_modules/@volter/supercode-orchestrator/bin/orchestrator.mjs'),
      harnessSdk: join(retained.root, 'node_modules/@volter/supercode-harness-sdk'), release: retained.release };
  }
  const bin = onPath('supercode') ?? refuse('no supercode is installed on this machine (none on PATH outside an install)');
  // <prefix>/lib/node_modules/@volter/supercode/bin/supercode.js → the package folder
  const pkg = resolve(dirname(realpathSync(bin)), '..');
  const manifest = json(join(pkg, 'package.json'));
  if (manifest?.name !== '@volter/supercode') refuse(`${bin} is not the npm package @volter/supercode`);
  const pins = manifest.dependencies ?? {};
  if (!PINNED.every((name) => pins[name])) refuse(`supercode ${manifest.version} at ${pkg} predates one release per install (it pins no orchestrator, harness SDK and Teams package)`);
  const wrong = PINNED.flatMap((name) => {
    const found = json(join(pkg, 'node_modules', name, 'package.json'))?.version ?? null;
    return found === pins[name] ? [] : [`${name} is ${found ?? 'missing'} where supercode ${manifest.version} pins ${pins[name]}`];
  });
  if (wrong.length) refuse(`supercode ${manifest.version} at ${pkg} is not one release: ${wrong.join('; ')}`);
  // The machine daemon too: its connector unit must run this release's Teams package. A unit written before one-release
  // installs names a separately installed one; supercode's install or upgrade moves it (its postinstall,
  // lib/release.mjs), and a unit still naming another release is refused here.
  const teams = join(pkg, 'node_modules', '@volter/supercode-teams', 'bin', 'teams.mjs');
  const stale = daemonEntries().filter((entry) => resolve(entry) !== teams);
  if (stale.length) refuse(`the machine daemon runs ${[...new Set(stale)].join(', ')}, not supercode ${manifest.version}'s Teams package (${teams}); reinstall its service: supercode teams connect --install`);
  return {
    bin,
    orchestratorEntry: join(pkg, 'node_modules', '@volter/supercode-orchestrator', 'bin', 'orchestrator.mjs'),
    harnessSdk: join(pkg, 'node_modules', '@volter/supercode-harness-sdk'),
    release: manifest.version,
  };
}

const supercodeHome = () => process.env.SUPERCODE_HOME || (process.env.XDG_CONFIG_HOME ? join(process.env.XDG_CONFIG_HOME, 'supercode') : join(homedir(), '.config', 'supercode'));

/**
 * The machine's supercode when it runs from its source lock: the package on PATH is the lock's tree's packaging/npm, and
 * the three come from that tree at its pinned commit. Null when the package on PATH is not a source-locked tree's.
 */
function sourceLocked(): MachineSupercode | null {
  const lock = machineSourceBinding();
  if (typeof lock?.root !== 'string' || !existsSync(lock.root)) return null;
  const root = realpathSync(lock.root);
  const refuse = (why: string): never => { throw new Error(`supercode's source lock at ${root} (commit ${String(lock.commit ?? '?').slice(0, 9)}) ${why}; re-pin it, or install a release: ${INSTALL}`); };
  const orchestratorEntry = join(root, 'sdk', 'orchestrator', 'bin', 'orchestrator.mjs');
  const harnessSdk = join(root, 'sdk', 'typescript');
  const teams = join(root, 'sdk', 'teams', 'bin', 'teams.mjs');
  const missing = [orchestratorEntry, join(harnessSdk, 'package.json'), teams].filter((path) => !existsSync(path));
  if (missing.length) refuse(`has no ${missing.join(', ')}`);
  const selected = sourceProgram(lock), bin = selected.program;
  if (selected.node) process.env.SUPERCODE_NODE_BIN = selected.node;
  const machine = json(join(process.env.SUPERCODE_TEAMS_HOME || join(supercodeHome(), 'teams'), 'machine.json'));
  if (machine?.generation_owner) {
    const source = machine.release?.source;
    if (machine.generation_owner !== machine.pid || machine.mail_ready !== true || source?.root !== root || source?.commit !== lock.commit || (source?.binding_verdict ?? source?.binding) !== 'matches')
      refuse('is not the serving machine generation; activate the coherent machine selection before this kit');
  } else {
    const stale = daemonEntries().filter((entry) => resolve(entry) !== teams);
    if (stale.length) refuse(`is not what the machine daemon runs (${[...new Set(stale)].join(', ')}, not ${teams})`);
  }
  return { bin, orchestratorEntry, harnessSdk, release: typeof lock.supercode === 'string' ? lock.supercode : null };
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

/** A module of the orchestrator package (`.`, `./apply`, `./apply/doors`), for a dynamic import. */
export const orchestratorModule = (subpath = '.'): string => exported(resolve(dirname(orchestratorEntry()), '..'), subpath);

/** A module of the harness SDK package (`.`, `./core`, …), for a dynamic import, checked. */
export const harnessSdkModule = (subpath = '.'): string => exported(machine().harnessSdk, subpath);
