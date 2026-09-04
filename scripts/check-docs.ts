#!/usr/bin/env bun
// Every doc names only what exists. Walks the repository's markdown for backticked paths, routes and world
// verbs, and fails on any the tree, the router or the runner does not have. Docs drift the moment code
// moves; this is the gate that keeps them honest.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..');
const DOCS = ['README.md', 'CLAUDE.md', 'AGENTS.md', 'CONTRIBUTING.md', 'SECURITY.md', 'apps/platform/README.md', 'apps/platform/DEPLOY.md', 'packages/sdk/README.md', 'packages/kit-hermes/README.md', 'world/README.md', 'cookbooks/todo-cli/README.md'];
const router = readFileSync(resolve(ROOT, 'apps/platform/src/index.ts'), 'utf8') + readFileSync(resolve(ROOT, 'apps/platform/src/keys.ts'), 'utf8') + readFileSync(resolve(ROOT, 'apps/platform/src/stream.ts'), 'utf8');
const runner = readFileSync(resolve(ROOT, 'world/run.ts'), 'utf8');
const verbs = new Set([...runner.matchAll(/case '([a-z-]+)'/g)].map((m) => m[1]));
const problems: string[] = [];

// A route the router serves: its literal path, or a pattern whose fixed segments all appear in the router.
function routeExists(route: string): boolean {
  const path = route.replace(/\?.*$/, '');
  if (router.includes(`'${path}'`)) return true;
  const fixed = path.split('/').filter((seg) => seg && !seg.startsWith(':') && !seg.startsWith('<') && !seg.startsWith('{'));
  return fixed.every((seg) => router.includes(seg));
}

for (const doc of DOCS) {
  const file = resolve(ROOT, doc);
  if (!existsSync(file)) { problems.push(`${doc}: the doc itself is missing`); continue; }
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/`([^`\n]+)`/g)) {
    const ref = m[1].trim();
    // Paths: something with a slash or a known extension, no spaces, not a command or a URL.
    if (/^(https?:|\$|-|bun |curl |docker |git |create-open-autonomy|npm |TWINS_ROOT|WORLD_|SUPERCODE_|OPEN_AUTONOMY_)/.test(ref) || /\s/.test(ref)) {
      const verb = /^bun world\/run\.ts ([a-z-]+)/.exec(ref)?.[1];
      if (verb && !verbs.has(verb)) problems.push(`${doc}: world verb \`${verb}\` does not exist`);
      continue;
    }
    if (ref.startsWith('/v1/') || ref.startsWith('/admin/') || ref.startsWith('/p/') || ref.startsWith('/webhooks/')) {
      if (!routeExists(ref)) problems.push(`${doc}: route \`${ref}\` is not served`);
      continue;
    }
    // A path: a file with a known extension, a directory (trailing slash), or a path under a known top
    // directory. Model slugs, branches and accounts (`zai/glm-5.3-flash`, `origin/main`, `owner/repo`) are not paths.
    const top = /^(apps|packages|cookbooks|world|hermes|container|docs|scripts|src|test|\.github|\.open-autonomy)(\/|$)/;
    if ((/\.(md|yml|yaml|json|ts|tsx|toml|sh|pin)$/.test(ref) || ref.endsWith('/') || top.test(ref)) && !/[*<>{}\s]/.test(ref) && !ref.startsWith('@')) {
      // Read from the doc's own directory, the root, and the directories a doc describes by bare name.
      const bare = ref.replace(/\/$/, '');
      const bases = [dirname(file), ROOT, resolve(ROOT, '.github/workflows'), resolve(ROOT, '.open-autonomy'), resolve(ROOT, 'hermes'), resolve(ROOT, 'container'), resolve(ROOT, 'packages/kit-hermes/template')];
      if (!bases.some((b) => existsSync(resolve(b, bare)))) problems.push(`${doc}: path \`${ref}\` does not exist`);
    }
  }
}
if (problems.length) { for (const p of problems) console.error(p); console.error(`check:docs FAILED — ${problems.length} reference(s) to things that do not exist`); process.exit(1); }
const count = DOCS.length;
console.log(`check:docs OK — ${count} docs name only paths, routes and world verbs that exist`);
