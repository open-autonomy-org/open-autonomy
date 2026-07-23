#!/usr/bin/env bun
// Maintainer command (NOT an autonomous agent): upgrade THIS installation to the canonical
// open-autonomy template. Run it locally from your installation's repo root:
//
//   bun scripts/open-autonomy-upgrade-cli.ts                        # prepare + print candidate commit
//   bun scripts/open-autonomy-upgrade-cli.ts --accept <full-sha>    # accept the reviewed commit
//
// An upgrade is a RE-COMPILE: it fetches the latest engine, recompiles the canonical profile, and
// regenerates this installation's derived files (workflows, the injected runtime, machinery). Your own
// inputs — roadmap, constitution, sources, the repo shell — are preserved. Preparation requires a clean
// Git worktree, makes one candidate commit in an isolated worktree, and prints its complete diff. It then
// STOPS: an installing agent reviews that exact commit before invoking --accept. It is
// deliberately human-run, because an upgrade can touch `.github/workflows/**` (a human_required path the
// CI GITHUB_TOKEN cannot push) — your own credentials handle that cleanly.
import { $ } from 'bun';
import { existsSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const target = process.cwd();
const acceptIndex = process.argv.indexOf('--accept');
const accept = acceptIndex >= 0 ? process.argv[acceptIndex + 1] : undefined;
if (acceptIndex >= 0 && !accept) {
  console.error('usage: bun scripts/open-autonomy-upgrade-cli.ts [--accept <full-candidate-sha>]');
  process.exit(2);
}
if (process.argv.includes('--dry-run') || process.argv.includes('--apply')) {
  console.error(
    '--dry-run/--apply are retired: preparation already leaves the target untouched. Review the candidate ' +
      'commit it prints, then pass --accept <full-candidate-sha>.',
  );
  process.exit(2);
}
const TEMPLATE_REPO = process.env.OPEN_AUTONOMY_TEMPLATE_REPO || 'volter-ai/open-autonomy';
const TEMPLATE_REF = process.env.OPEN_AUTONOMY_TEMPLATE_REF || 'main';

// Use this checkout if it IS open-autonomy; otherwise clone the template repo to get the engine.
let oa: string;
let scratch: string | undefined;
if (existsSync('bin/autonomy-upgrade.ts') && existsSync('profiles/self-driving/ir.yml')) {
  oa = target;
} else {
  scratch = mkdtempSync(join(tmpdir(), 'open-autonomy-upgrade-source-'));
  oa = join(scratch, 'source');
  await $`git clone --depth 1 --branch ${TEMPLATE_REF} https://github.com/${TEMPLATE_REPO}.git ${oa}`;
}

try {
  if (accept) {
    await $`cd ${oa} && (bun install --frozen-lockfile || bun install) && bun bin/autonomy-upgrade.ts --target ${target} --accept ${accept}`;
  } else {
    await $`cd ${oa} && (bun install --frozen-lockfile || bun install) && bun bin/autonomy-upgrade.ts --profile profiles/self-driving --target ${target} --substrate gh-actions`;
  }
} finally {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
}
