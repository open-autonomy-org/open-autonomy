// One supercode per machine (open-autonomy D215, D217): supercode, its orchestrator and its harness SDK are the ones
// installed on the machine, which its machine daemon runs too, never a copy in this install. A client a release behind
// the machine's daemon or serve was refused by it (a pinned supercode older than the daemon's claims; a harness SDK
// skewed against the machine's serve protocol). The machine's packages are found from its `supercode` on PATH outside
// this install: that bin's link target is `<prefix>/lib/node_modules/@volter/supercode/…`, and the others are installed
// beside it (`npm root -g` may name another prefix than the one the machine's supercode is in). A review or a World
// names unreleased builds instead: OPEN_AUTONOMY_SUPERCODE_BIN, OPEN_AUTONOMY_ORCHESTRATOR_BIN and
// OPEN_AUTONOMY_HARNESS_SDK (a harness SDK package folder, supercode's sdk/typescript).
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const own = resolve(import.meta.dir, 'node_modules', '.bin');
const install = 'npm install -g @volter/supercode @volter/supercode-orchestrator @volter/supercode-harness-sdk';

/** The first `name` on PATH outside this install's own `node_modules/.bin`, or null. */
function onPath(name: string): string | null {
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir || resolve(dir) === own) continue;
    for (const file of process.platform === 'win32' ? [`${name}.cmd`, `${name}.exe`] : [name]) if (existsSync(join(dir, file))) return join(dir, file);
  }
  return null;
}

const missing = (what: string) => new Error(`no ${what} is installed on this machine (none on PATH outside this install); install it: ${install}`);

/** The machine's supercode: an unreleased build a review or a World names, the one the keeper handed its children
 *  (SUPERCODE_BIN), else the machine's own. */
export function supercodeBin(): string {
  const bin = process.env.OPEN_AUTONOMY_SUPERCODE_BIN || process.env.SUPERCODE_BIN || onPath('supercode');
  if (!bin) throw missing('supercode');
  return bin;
}

/** The orchestrator's entry, run with node: the one the keeper handed its children (SUPERCODE_ORCHESTRATOR_ENTRY), an
 *  unreleased build, else the machine's `supercode-orchestrator` (its link's target). */
export function orchestratorEntry(): string {
  const named = process.env.SUPERCODE_ORCHESTRATOR_ENTRY || process.env.OPEN_AUTONOMY_ORCHESTRATOR_BIN;
  if (named) return named;
  const bin = onPath('supercode-orchestrator');
  if (!bin) throw missing('supercode-orchestrator');
  return realpathSync(bin);
}

/** The harness SDK's package folder: an unreleased build's, else the machine's, beside its supercode package. */
function harnessSdkDir(): string {
  if (process.env.OPEN_AUTONOMY_HARNESS_SDK) return process.env.OPEN_AUTONOMY_HARNESS_SDK;
  const bin = onPath('supercode');
  if (!bin) throw missing('supercode');
  const dir = join(dirname(dirname(dirname(realpathSync(bin)))), 'supercode-harness-sdk');
  if (!existsSync(join(dir, 'package.json'))) throw missing('@volter/supercode-harness-sdk');
  return dir;
}

/** The URL of the module a package folder exports at `subpath` ('.', './apply', …), as its package.json names it. */
function exported(dir: string, subpath: string): string {
  const entry = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).exports?.[subpath];
  const target = typeof entry === 'string' ? entry : entry?.import ?? entry?.default;
  if (typeof target !== 'string') throw new Error(`${dir} exports no ${subpath}`);
  return pathToFileURL(join(dir, target)).href;
}

/** A module of the machine's orchestrator package (`.`, `./apply`, `./apply/doors`), for a dynamic import. */
export const orchestratorModule = (subpath = '.'): string => exported(resolve(dirname(orchestratorEntry()), '..'), subpath);

/** A module of the machine's harness SDK package (`.`, `./core`, …), for a dynamic import. */
export const harnessSdkModule = (subpath = '.'): string => exported(harnessSdkDir(), subpath);
