#!/usr/bin/env bun
// A cookbook is exactly what the generator makes plus the project's own files. `bun create open-autonomy`
// into an empty directory with the cookbook's own identity, then every file the cookbook has that the kit
// does not own copied in, must be byte-identical to the committed cookbook: no kit file altered, none
// missing, nothing the kit would not have made except what the project wrote itself.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { create, isOwned } from '../packages/kit-hermes/src/kit.ts';

const dir = resolve(process.argv[2] ?? '');
if (!dir || !existsSync(join(dir, '.open-autonomy', 'kit.json'))) { console.error('usage: bun scripts/check-cookbook.ts <cookbook dir>'); process.exit(2); }
const rec = JSON.parse(readFileSync(join(dir, '.open-autonomy', 'kit.json'), 'utf8')) as { params: { project: string; account: string } };
const walk = (root: string, at = root): string[] => readdirSync(at).flatMap((name) => {
  const p = join(at, name);
  if (name === 'node_modules' || name === '.git' || name === 'bun.lock') return [];
  return statSync(p).isDirectory() ? walk(root, p) : [relative(root, p)];
});
const made = mkdtempSync(join(tmpdir(), 'oa-cookbook-'));
try {
  create(made, rec.params);
  // The project's own files: everything the kit does not own, copied over the generated tree.
  for (const rel of walk(dir)) {
    if (isOwned(rel) || rel === '.open-autonomy/kit.json') continue;
    mkdirSync(dirname(join(made, rel)), { recursive: true });
    writeFileSync(join(made, rel), readFileSync(join(dir, rel)));
  }
  const problems: string[] = [];
  const left = new Set(walk(made));
  for (const rel of walk(dir)) {
    if (!left.delete(rel)) { problems.push(`${rel}: the cookbook has it, the generator plus the project's own files do not`); continue; }
    if (Buffer.compare(readFileSync(join(dir, rel)), readFileSync(join(made, rel))) !== 0) problems.push(`${rel}: differs from what the kit makes`);
  }
  for (const rel of left) problems.push(`${rel}: the kit makes it, the cookbook lacks it`);
  if (problems.length) { for (const p of problems) console.error(p); console.error(`check:cookbook FAILED — ${dir} is not the generator plus its own files (${problems.length})`); process.exit(1); }
  console.log(`check:cookbook OK — ${relative(process.cwd(), dir) || dir} is exactly \`bun create open-autonomy\` (${rec.params.project}, ${rec.params.account}) plus its own files`);
} finally { rmSync(made, { recursive: true, force: true }); }
