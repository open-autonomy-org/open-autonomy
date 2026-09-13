#!/usr/bin/env bun
// create-open-autonomy: the Hermes kit's door.
//
//   bun create open-autonomy <dir> --project <name> --account <owner/repo>   # a complete new repository
//   create-open-autonomy adopt <dir> --project <name> --account <owner/repo>  # into an existing one; only what is missing
//   create-open-autonomy check <dir>      # the kit-owned files against the kit (exit 1 on drift)
//   create-open-autonomy upgrade <dir>    # check, then rewrite the kit-owned files
//   create-open-autonomy setup <dir> [--plan] [--yes] [--with a,b] [--without a,b] [--secrets <dir>] [--bare] [--account-id <cf>]
//                                         # the guided walk: the core, then the doors this situation calls for (setup.ts)
//   create-open-autonomy runtime <dir> [--runtime <dir>] [--secrets <dir>] [--valve <port>] [--provider colima:<p>] [--docker-host <url>]
//                                      [--prepare-volumes]        # the host runtime, from the checkout (runtime.ts)
import { resolve } from 'node:path';
import { KIT, adopt, check, create, upgrade, validateParams } from './kit.ts';
import { setup, type Door } from './setup.ts';
import { runtime } from './runtime.ts';

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const verbs = new Set(['create', 'adopt', 'check', 'upgrade', 'setup', 'runtime']);
const verb = verbs.has(argv[0]) ? argv[0] : 'create';
const dir = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1]?.startsWith('--') !== true && a !== verb)[0];
if (!dir) { console.error('usage: create-open-autonomy [create|adopt] <dir> --project <name> --account <owner/repo> | check <dir> | upgrade <dir> | setup <dir> [--plan] | runtime <dir>'); process.exit(2); }
const target = resolve(dir);
try {
  if (verb === 'create' || verb === 'adopt') {
    const params = validateParams({ project: flag('--project') ?? dir.split('/').filter(Boolean).pop(), account: flag('--account') });
    const out = (verb === 'create' ? create : adopt)(target, params);
    console.log(`${verb}: ${params.project} (${params.account}) → ${target}: ${out.written.length} file(s) written${out.skipped.length ? `, ${out.skipped.length} kept` : ''}`);
    console.log(`next: have the setup agent follow .open-autonomy/SETUP.md, then run \`create-open-autonomy setup ${dir} --plan\` with the agreed development connections. Complete the guided setup before activating the fleet.`);
  } else if (verb === 'setup') {
    const doors = (name: string): Door[] => (flag(name) ?? '').split(',').map((d) => d.trim()).filter(Boolean) as Door[];
    await setup(target, { plan: argv.includes('--plan'), yes: argv.includes('--yes'), with: doors('--with'), without: doors('--without'), secrets: flag('--secrets') ? resolve(flag('--secrets')!) : undefined, bare: argv.includes('--bare'), accountId: flag('--account-id') });
  } else if (verb === 'runtime') {
    const valve = Number(flag('--valve') ?? 8787);
    if (!Number.isInteger(valve) || valve < 1024 || valve > 65532) throw new Error('--valve needs an unprivileged port with three above it');
    runtime(target, { runtime: flag('--runtime'), secrets: flag('--secrets'), valve, provider: flag('--provider'), dockerHost: flag('--docker-host'), prepareVolumes: argv.includes('--prepare-volumes') });
  } else if (verb === 'check') {
    const out = check(target);
    if (out.drift.length) { for (const d of out.drift) console.error(d); console.error(`kit drift: ${out.drift.length} file(s). Run \`create-open-autonomy upgrade ${dir}\`; the kit is the source and its files are never edited in place (name a file in .open-autonomy/kit.json divergences to take it over).`); process.exit(1); }
    console.log(`kit ${KIT.name} ${KIT.version}: ${target} matches`);
  } else {
    const out = upgrade(target);
    console.log(`upgrade: ${out.written.length} file(s) rewritten${out.drift.length ? ` (${out.drift.length} had drifted)` : ''} → ${KIT.name} ${KIT.version}`);
  }
} catch (e) {
  console.error(`create-open-autonomy: ${(e as Error).message}`);
  process.exit(1);
}
