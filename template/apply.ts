#!/usr/bin/env bun
// Apply the template's home to a project: copy template/home into <repo>/hermes, byte for byte. The home
// is generic on purpose — a project's particulars live in hermes/.env (git-ignored) and in the project's
// own AGENTS.md and ROADMAP.yml — so an applied home never drifts from the template except by upgrading.
//
//   bun template/apply.ts [<repo>...]        # apply (default: this repo and every cookbook)
//   bun template/apply.ts --check [<repo>...] # exit 1 if any applied home differs from the template
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const HERE = resolve(import.meta.dir);
const HOME = join(HERE, 'home');
const ROOT = resolve(HERE, '..');
const check = process.argv.includes('--check');
const args = process.argv.slice(2).filter((a) => a !== '--check');
const targets = args.length ? args.map((a) => resolve(a)) : [ROOT, ...readdirSync(join(ROOT, 'cookbook'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => join(ROOT, 'cookbook', d.name))];

function files(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...files(full));
    else out.push(full);
  }
  return out;
}
const source = files(HOME).map((f) => relative(HOME, f)).sort();

let drift = 0;
for (const repo of targets) {
  const dest = join(repo, 'hermes');
  for (const rel of source) {
    const want = readFileSync(join(HOME, rel));
    const at = join(dest, rel);
    const have = existsSync(at) ? readFileSync(at) : null;
    if (have && Buffer.compare(have, want) === 0) continue;
    drift += 1;
    if (check) { console.error(`${relative(ROOT, at)}: ${have ? 'differs from' : 'missing; in'} template/home/${rel}`); continue; }
    mkdirSync(dirname(at), { recursive: true });
    writeFileSync(at, want);
    console.log(`applied ${relative(ROOT, at)}`);
  }
}
if (check) {
  if (drift) { console.error(`template drift: ${drift} file(s). Run \`bun template/apply.ts\` to re-apply — the template is the source, an applied home is never edited in place.`); process.exit(1); }
  console.log(`template: ${targets.length} applied home(s) match template/home`);
} else if (!drift) console.log('template: nothing to apply');
