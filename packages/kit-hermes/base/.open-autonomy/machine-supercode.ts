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

/** The Teams entries this machine's installed connector units run (`<teams home>/service`, teams.rs). */
function daemonEntries(): string[] {
  const home = process.env.SUPERCODE_HOME || (process.env.XDG_CONFIG_HOME ? join(process.env.XDG_CONFIG_HOME, 'supercode') : join(homedir(), '.config', 'supercode'));
  const service = join(process.env.SUPERCODE_TEAMS_HOME || join(home, 'teams'), 'service');
  let names: string[] = [];
  try { names = readdirSync(service); } catch { return []; }
  return names.filter((name) => /^dev\.volter\.supercode-teams-connector-[0-9a-f]{16}\.(plist|service|xml)$/.test(name))
    .flatMap((name) => readFileSync(join(service, name), 'utf8').match(/[^\s<>"']*[\\/]@volter[\\/]supercode-teams[\\/]bin[\\/]teams\.mjs/g) ?? []);
}

let checked: MachineSupercode | null = null;
const machine = () => (checked ??= machineSupercode());

/** The machine's supercode command, checked (the keeper's children take the checked one it hands them). */
export const supercodeBin = (): string => machine().bin;

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
