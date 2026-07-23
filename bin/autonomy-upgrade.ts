#!/usr/bin/env bun
// Upgrade an installation to a profile's current compiled output as one reviewable Git commit.
//   bun bin/autonomy-upgrade.ts --profile <profileDir> --target <installDir>
//     --substrate <local|gh-actions> [--prune]
//   bun bin/autonomy-upgrade.ts --target <installDir> --accept <full-candidate-sha>
//     [--provider-url <url>] [--local-schedule-config <json>]
// Preparation refuses a dirty target, compiles in a detached temporary worktree, creates one immutable
// candidate commit, and prints its complete diff without touching the target. A separate installing-agent
// review accepts that exact SHA; acceptance rechecks both worktree cleanliness and the original base SHA
// before fast-forwarding. There is deliberately no raw overwrite / --apply path.
//
// DELETION IS OPT-IN. --prune may include manifest-owned orphan deletions in the candidate commit; those
// deletions are visible in the same complete diff and do not reach the target until that commit is accepted.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseIr, planUpgrade, applyUpgrade } from '@open-autonomy/core';
import type { CompileOutput } from '@open-autonomy/core';
import type { LocalScheduleConfig } from '@open-autonomy/substrate-local';
import {
  acceptInstallCandidate,
  prepareInstallCandidate,
  renderPreparedInstallCandidate,
} from './git-install-transaction.ts';
// OA-10: the SAME `.claude/settings.json` merge policy the fresh-compile CLI applies
// (bin/autonomy-compile.ts) — without it, every upgrade would silently revert an adopter's merged settings
// file back to the profile's whole-file copy (planUpgrade's `update` on a byte-differing derived file).
import { settingsMergeStrategies } from './settings-merge.ts';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const profileDir = arg('--profile');
const targetDir = arg('--target');
const substrateArg = arg('--substrate');
const substrate = substrateArg === 'github' ? 'gh-actions' : substrateArg;
const providerUrl = arg('--provider-url');
const scheduleConfigPath = arg('--local-schedule-config');
const accept = arg('--accept');
const rawApply = process.argv.includes('--apply');
const prune = process.argv.includes('--prune');
const usage =
  'Usage: bun bin/autonomy-upgrade.ts --profile <dir> --target <dir> --substrate <local|gh-actions> [--prune] [--provider-url <url>] [--local-schedule-config <json>]\n' +
  '   or: bun bin/autonomy-upgrade.ts --target <dir> --accept <full-candidate-sha>';
if (rawApply) {
  process.stderr.write(
    'open-autonomy: --apply is no longer supported because upgrades may not overwrite a worktree. ' +
      'Prepare the candidate commit, review its complete diff, then pass --accept <full-candidate-sha>.\n',
  );
  process.exit(2);
}
if (accept) {
  if (!targetDir) {
    process.stderr.write(`${usage}\n`);
    process.exit(2);
  }
  try {
    const receipt = acceptInstallCandidate(resolve(targetDir), accept, {
      expectedKind: 'upgrade',
    });
    process.stdout.write(
      `Accepted reviewed ${receipt.kind} candidate ${receipt.candidateSha} onto ${receipt.targetRoot}.\n`,
    );
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exit(1);
  }
  process.exit(0);
}
if (!profileDir || !targetDir || (substrate !== 'local' && substrate !== 'gh-actions')) {
  process.stderr.write(`${usage}\n`);
  process.exit(2);
}
if ((providerUrl || scheduleConfigPath) && substrate !== 'local') {
  process.stderr.write(`${usage}\n  --provider-url and --local-schedule-config apply only to the local substrate\n`);
  process.exit(2);
}
if (providerUrl) {
  try {
    new URL(providerUrl);
  } catch {
    process.stderr.write(`${usage}\n  --provider-url value "${providerUrl}" is not a valid URL\n`);
    process.exit(2);
  }
}
let scheduleConfig: LocalScheduleConfig | undefined;
if (scheduleConfigPath) {
  try {
    scheduleConfig = JSON.parse(readFileSync(scheduleConfigPath, 'utf8')) as LocalScheduleConfig;
  } catch (error) {
    process.stderr.write(`${usage}\n  could not read --local-schedule-config ${scheduleConfigPath}: ${(error as Error).message}\n`);
    process.exit(2);
  }
}

const ir = parseIr(readFileSync(join(profileDir, 'ir.yml'), 'utf8'));
let out: CompileOutput;
if (substrate === 'local') {
  const { compileLocal } = await import('@open-autonomy/substrate-local');
  out = compileLocal(ir, { destDir: resolve(targetDir), providerUrl, scheduleConfig });
} else {
  const { compileGithub } = await import('@open-autonomy/substrate-github');
  out = compileGithub(ir);
}
const plan = planUpgrade(out, resolve(profileDir), resolve(targetDir), { prune, mergeStrategies: settingsMergeStrategies });
if (plan.changes.length === 0) {
  process.stdout.write('Already up to date with the open-autonomy template.\nupgrade-changes=0\n');
  process.exit(0);
}

try {
  const candidate = await prepareInstallCandidate({
    targetDir: resolve(targetDir),
    kind: 'upgrade',
    message: `chore: upgrade Open Autonomy (${substrate})`,
    apply(candidateRoot) {
      const candidatePlan = planUpgrade(out, resolve(profileDir), candidateRoot, {
        prune,
        mergeStrategies: settingsMergeStrategies,
      });
      applyUpgrade(
        candidatePlan,
        out,
        resolve(profileDir),
        candidateRoot,
        settingsMergeStrategies,
      );
    },
  });
  if (!candidate) {
    process.stdout.write('Already up to date with the open-autonomy template.\nupgrade-changes=0\n');
    process.exit(0);
  }
  process.stdout.write(`${renderPreparedInstallCandidate(candidate)}\n`);
  process.stdout.write(`upgrade-changes=${plan.changes.length}\n`);
  process.stdout.write(`upgrade-candidate=${candidate.receipt.candidateSha}\n`);
} catch (error) {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exit(1);
}
