#!/usr/bin/env bun
// create-open-autonomy: the Hermes kit's door.
//
//   bun create open-autonomy <dir> --project <name> --account <owner/repo> [--skew self-build|manage-project|manage-organization|soc2]
//   create-open-autonomy adopt <dir> --project <name> --account <owner/repo> [--skew …]  # into an existing one; only what is missing
//   create-open-autonomy check <dir>      # where the project stands against the kit (exit 1 behind it or mid-merge)
//   create-open-autonomy upgrade <dir>    # merge the kit's change into the project's files three-way (exit 2 on conflicts)
//   create-open-autonomy upgrade --fleet <fleet.json>  # every project of a fleet, cloned fresh, upgraded and landed (fleet.ts)
//   create-open-autonomy setup <dir> [--plan] [--yes] [--with a,b] [--without a,b] [--secrets <dir>] [--bare] [--account-id <cf>]
//                                         # the guided walk: the core, then the doors this situation calls for (setup.ts)
//   create-open-autonomy runtime <dir> [--runtime <dir>] [--secrets <dir>] [--valve <port>] [--provider colima:<p>] [--docker-host <url>]
//   create-open-autonomy fleet <runtime-dir> --name <fleet> --image <image> --project owner/repo=<origin> … [--provider colima:<p>] [--prepare-volumes]
//                                      [--prepare-volumes]        # the host runtime, from the checkout (runtime.ts)
import { resolve } from 'node:path';
import { KIT, adopt, check, create, upgrade, validateParams, validateSkew } from './kit.ts';
import { setup, type Door } from './setup.ts';
import { runtime } from './runtime.ts';
import { fleet, upgradeFleet } from './fleet.ts';

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const verbs = new Set(['create', 'adopt', 'check', 'upgrade', 'setup', 'runtime', 'fleet']);
const verb = verbs.has(argv[0]) ? argv[0] : 'create';
if (verb === 'upgrade' && flag('--fleet')) {
  try { process.exit((await upgradeFleet(flag('--fleet')!)) ? 0 : 2); } catch (e) { console.error(`create-open-autonomy: ${(e as Error).message}`); process.exit(1); }
}
const dir = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1]?.startsWith('--') !== true && a !== verb)[0];
if (!dir) { console.error('usage: create-open-autonomy [create|adopt] <dir> --project <name> --account <owner/repo> [--skew self-build|manage-project|manage-organization|soc2] | check <dir> | upgrade <dir> | setup <dir> [--plan] | runtime <dir>'); process.exit(2); }
const target = resolve(dir);
try {
  if (verb === 'create' || verb === 'adopt') {
    const params = validateParams({ project: flag('--project') ?? dir.split('/').filter(Boolean).pop(), account: flag('--account') });
    const skew = validateSkew(flag('--skew') ?? 'self-build');
    const out = (verb === 'create' ? create : adopt)(target, params, skew);
    console.log(`${verb}: ${params.project} (${params.account}), ${skew} → ${target}: ${out.written.length} file(s) written${out.skipped.length ? `, ${out.skipped.length} kept` : ''}`);
    console.log(`next: have the setup agent follow .open-autonomy/SETUP.md, then run \`create-open-autonomy setup ${dir} --plan\` with the agreed development connections. Complete the guided setup before starting the agent.`);
  } else if (verb === 'setup') {
    const doors = (name: string): Door[] => (flag(name) ?? '').split(',').map((d) => d.trim()).filter(Boolean) as Door[];
    await setup(target, { plan: argv.includes('--plan'), yes: argv.includes('--yes'), with: doors('--with'), without: doors('--without'), secrets: flag('--secrets') ? resolve(flag('--secrets')!) : undefined, bare: argv.includes('--bare'), accountId: flag('--account-id') });
  } else if (verb === 'runtime') {
    const valve = Number(flag('--valve') ?? 8787);
    if (!Number.isInteger(valve) || valve < 1024 || valve > 65532) throw new Error('--valve needs an unprivileged port with three above it');
    runtime(target, { runtime: flag('--runtime'), secrets: flag('--secrets'), valve, provider: flag('--provider'), dockerHost: flag('--docker-host'), prepareVolumes: argv.includes('--prepare-volumes') });
  } else if (verb === 'fleet') {
    const projects = argv.flatMap((a, i) => (a === '--project' && argv[i + 1] ? [argv[i + 1]] : []));
    fleet(target, { name: flag('--name') ?? '', image: flag('--image') ?? '', projects, provider: flag('--provider'), dockerHost: flag('--docker-host'), memory: flag('--memory'), cpus: flag('--cpus'), prepareVolumes: argv.includes('--prepare-volumes') });
  } else if (verb === 'check') {
    const s = check(target);
    for (const d of s.diverged) console.log(`  ${d}`);
    if (s.conflicted.length) { for (const c of s.conflicted) console.error(`${c}: unresolved merge markers`); console.error(`kit ${KIT.name} ${KIT.version}: ${target} at ${s.version}, ${s.conflicted.length} file(s) with an unresolved merge`); process.exit(1); }
    if (s.config.length) { for (const c of s.config) console.error(`.open-autonomy/config.yaml: ${c}`); console.error(`kit ${KIT.name} ${KIT.version}: ${target}: fix the project's declarations above`); process.exit(1); }
    if (!s.current) { console.error(`kit ${KIT.name} ${KIT.version}: ${target} at ${s.version}; run \`create-open-autonomy upgrade ${dir}\``); process.exit(1); }
    console.log(`kit ${KIT.name} ${KIT.version}: ${target} at ${s.version}${s.diverged.length ? `, ${s.diverged.length} file(s) diverged` : ', matches'}`);
  } else {
    const u = await upgrade(target);
    console.log(`upgrade: ${target} ${u.from} → ${u.to}: ${u.written.length} taken whole, ${u.merged.length} merged, ${u.kept.length} kept as this project's, ${u.retired.length} retired${u.conflicts.length ? `, ${u.conflicts.length} in conflict` : ''}`);
    for (const k of u.kept) console.log(`  kept: ${k}`);
    if (u.conflicts.length) {
      for (const c of u.conflicts) console.error(`  conflict: ${c}`);
      console.error(`Resolve the markers in each (this project's lines against kit ${u.from} and kit ${u.to}), keeping the project's intent and the kit's change, then commit; the record already says ${u.to}.`);
      process.exit(2);
    }
  }
} catch (e) {
  console.error(`create-open-autonomy: ${(e as Error).message}`);
  process.exit(1);
}
