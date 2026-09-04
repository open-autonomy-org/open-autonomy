#!/usr/bin/env bun
// create-open-autonomy: the Hermes kit's door.
//
//   bun create open-autonomy <dir> --project <name> --account <owner/repo>   # a complete new repository
//   create-open-autonomy adopt <dir> --project <name> --account <owner/repo>  # into an existing one; only what is missing
//   create-open-autonomy check <dir>      # the kit-owned files against the kit (exit 1 on drift)
//   create-open-autonomy upgrade <dir>    # check, then rewrite the kit-owned files
import { resolve } from 'node:path';
import { KIT, adopt, check, create, upgrade, validateParams } from './kit.ts';

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const verbs = new Set(['create', 'adopt', 'check', 'upgrade']);
const verb = verbs.has(argv[0]) ? argv[0] : 'create';
const dir = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1]?.startsWith('--') !== true && a !== verb)[0];
if (!dir) { console.error('usage: create-open-autonomy [create|adopt] <dir> --project <name> --account <owner/repo> | check <dir> | upgrade <dir>'); process.exit(2); }
const target = resolve(dir);
try {
  if (verb === 'create' || verb === 'adopt') {
    const params = validateParams({ project: flag('--project') ?? dir.split('/').filter(Boolean).pop(), account: flag('--account') });
    const out = (verb === 'create' ? create : adopt)(target, params);
    console.log(`${verb}: ${params.project} (${params.account}) → ${target}: ${out.written.length} file(s) written${out.skipped.length ? `, ${out.skipped.length} kept` : ''}`);
    console.log(`next: commit it; mint the key (bun .open-autonomy/mint-key.ts); run the stack (container/README.md)`);
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
