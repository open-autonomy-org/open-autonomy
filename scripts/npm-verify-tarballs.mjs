#!/usr/bin/env node
// The packed tarballs, proven loadable as npm will serve them, before any is uploaded (scripts/npm-publish-missing.sh),
// as supercode's release proves its own (its scripts/npm-verify-tarballs.mjs). Every tarball listed in <dir>/packed is
// installed into a fresh folder, as a user installs it (npm, scripts off), beside this run's tarballs of the packages
// it names (a package of this run is its own tarball there, never the repository's tree; one npm already serves comes
// from the registry, as it will for a user), and from that install:
//   1. every entry its `files` names is in the tarball;
//   2. every module it names (each export, each bin, its main) is resolved with everything it imports, file by file,
//      without running it: a relative import its `files` left out, or a package missing from its dependencies, fails
//      here by name.
// The modules are not run: these packages' entries are TypeScript run by bun, and their bins and the kit's keeper act
// when imported. A type-only import is erased at run time and passed over.
//
//   node scripts/npm-verify-tarballs.mjs <tarballs dir>   (its `packed` lists: package dir <tab> name <tab> version)
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const tarballs = resolve(process.argv[2] ?? '');
const listed = readFileSync(join(tarballs, 'packed'), 'utf8').split('\n').filter(Boolean).map((line) => line.split('\t'));
const packages = [...new Map(listed.map(([dir, name, version]) => [name, { dir, name, version, tarball: join(tarballs, `${name.replace('/', '+')}@${version}.tgz`) }])).values()];
/** How long one package's fresh install may take (its dependencies come from the registry). */
const INSTALL_TIMEOUT_MS = 5 * 60_000;
const CODE = /\.(?:[mc]?[jt]s|tsx|jsx)$/;
// what the runtime gives every module: node's built-ins and bun's own (`bun`, `bun:sqlite`, …)
const RUNTIME = new Set([...builtinModules, 'bun']);

const failures = [];
const manifestOf = new Map(packages.map((item) => [item.name, JSON.parse(execFileSync('tar', ['-xzOf', item.tarball, 'package/package.json'], { encoding: 'utf8' }))]));
// what a package's own tarball names among this run's packages (its dependencies and peers), transitively
function siblings(name, found = new Set()) {
  const manifest = manifestOf.get(name);
  for (const dependency of Object.keys({ ...manifest?.dependencies, ...manifest?.peerDependencies })) {
    if (manifestOf.has(dependency) && !found.has(dependency)) { found.add(dependency); siblings(dependency, found); }
  }
  return found;
}
for (const item of packages) {
  const work = mkdtempSync(join(tmpdir(), 'npm-verify-'));
  try {
    writeFileSync(join(work, 'package.json'), JSON.stringify({ name: 'npm-verify', private: true }));
    // the release pins this run's packages to exact versions, so npm takes each sibling's tarball given here
    const beside = [...siblings(item.name)].filter((name) => name !== item.name).map((name) => packages.find((other) => other.name === name).tarball);
    const install = spawnSync('pnpm', ['add', '--ignore-scripts', '--package-import-method', 'hardlink', '--config.auto-install-peers=false', '--config.shamefully-hoist=true', item.tarball, ...beside], { cwd: work, encoding: 'utf8', timeout: INSTALL_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'pipe'] });
    if (install.status !== 0) { failures.push(`${item.name}@${item.version}: its tarball does not install${install.error ? ` (${install.error.message})` : ''}: ${String(install.stderr ?? '').trim().split('\n').slice(-6).join(' | ')}`); continue; }
    const root = join(work, 'node_modules', ...item.name.split('/'));
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    for (const entry of manifest.files ?? []) {
      if (/[*?[]/.test(entry)) continue;
      if (!existsSync(join(root, entry))) failures.push(`${item.name}@${item.version}: its files name ${entry}, which its tarball does not hold`);
    }
    const named = [...exportTargets(manifest.exports), ...Object.values(typeof manifest.bin === 'string' ? { [manifest.name]: manifest.bin } : manifest.bin ?? {}), ...(manifest.main ? [manifest.main] : [])];
    const seen = new Set();
    for (const target of new Set(named.map((value) => String(value).replace(/^\.\//, '')))) {
      if (!CODE.test(target)) { if (!existsSync(join(root, target))) failures.push(`${item.name}@${item.version}: names ${target}, which its tarball does not hold`); continue; }
      closure(item, root, join(root, target), seen, target, manifest);
    }
    console.log(`verified from its tarball: ${item.name}@${item.version} (${seen.size} modules resolved)`);
  } finally { rmSync(work, { recursive: true, force: true }); }
}
if (failures.length) {
  for (const failure of failures) console.error(failure);
  console.error(`${failures.length} packed module${failures.length === 1 ? '' : 's'} would not load as npm serves ${failures.length === 1 ? 'it' : 'them'}; nothing is uploaded`);
  process.exit(1);
}

/** Every file an `exports` field names, by the conditions a runtime takes (import, bun, node, default, require). */
function exportTargets(exports) {
  const out = [];
  const walk = (value) => {
    if (typeof value === 'string') { if (!value.includes('*')) out.push(value.replace(/^\.\//, '')); return; }
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (value && typeof value === 'object') for (const [key, inner] of Object.entries(value)) if (key !== 'types') walk(inner);
  };
  walk(exports);
  return out;
}

/** The target an `exports` field gives a subpath, by the conditions bun's loader takes; null when none. */
function exportOf(exports, subpath) {
  if (exports == null) return null;
  const pick = (value) => {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) { for (const inner of value) { const found = pick(inner); if (found) return found; } return null; }
    if (value && typeof value === 'object') { for (const key of ['bun', 'node', 'import', 'default']) if (key in value) { const found = pick(value[key]); if (found) return found; } }
    return null;
  };
  if (typeof exports === 'string' || Array.isArray(exports) || !Object.keys(exports).some((key) => key.startsWith('.'))) return subpath === '.' ? pick(exports) : null;
  if (subpath in exports) return pick(exports[subpath]);
  for (const [key, value] of Object.entries(exports)) {
    const star = key.indexOf('*');
    if (star < 0) continue;
    const [head, tail] = [key.slice(0, star), key.slice(star + 1)];
    if (subpath.startsWith(head) && subpath.endsWith(tail) && subpath.length >= head.length + tail.length) {
      const found = pick(value);
      if (found) return found.replace('*', subpath.slice(head.length, subpath.length - tail.length));
    }
  }
  return null;
}

/** What one module reaches: its imports and re-exports that survive type erasure (`import … from`, `import '…'`,
 *  `export … from`, `require('…')`), its dynamic imports of a literal (`import('…')`), and the files it names beside
 *  itself (`new URL('…', import.meta.url)`). A dynamic import may be guarded (an optional sibling), so one of a package
 *  it does not depend on is passed over; one inside its package is held to its files, as an asset named by `new URL` is. */
function references(text) {
  const stripped = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
  const code = withoutTemplateText(stripped) ?? stripped;
  const out = [];
  for (const match of code.matchAll(/(?:^|[;\n}])\s*(import|export)\s+([\w*{}\s,$]+?\s+from\s+)?['"]([^'"\n]+)['"]/g)) {
    // `import type …`, `export type …` and `import { type A, type B }` are erased with the types
    if (match[2] && (/^type\s/.test(match[2]) || /^\{\s*type\s[^}]*\}\s+from\s+$/.test(match[2]) && match[2].slice(1, match[2].lastIndexOf('}')).split(',').every((part) => !part.trim() || /^type\s/.test(part.trim())))) continue;
    out.push({ specifier: match[3], kind: 'static' });
  }
  for (const match of code.matchAll(/(?:^|[^.\w#$])require\(\s*['"]([^'"\n]+)['"]\s*\)/g)) out.push({ specifier: match[1], kind: 'static' });
  for (const match of code.matchAll(/(?:^|[^.\w])import\(\s*['"]([^'"\n]+)['"]\s*\)/g)) out.push({ specifier: match[1], kind: 'dynamic' });
  for (const match of code.matchAll(/new URL\(\s*['"](\.{1,2}\/[^'"\n]+)['"]\s*,\s*import\.meta\.url\s*\)/g)) out.push({ specifier: match[1], kind: 'asset' });
  return out;
}

/** The code with every template literal's text blanked (its `${…}` expressions and line breaks kept): a module that
 *  writes out another module's source in a template names that module's imports, not its own. A scan that ends with a
 *  template still open returns null, and its caller reads the text unblanked: a misread file fails closed. */
function withoutTemplateText(code) {
  let out = '', last = '', gap = false;
  const stack = [];
  const regexAfter = /^$|[(,=:[!&|?{};+\-*%<>~^]$|^(?:return|typeof|instanceof|in|of|new|delete|void|throw|case|do|else|yield|await)$/;
  for (let i = 0; i < code.length; i++) {
    const c = code[i], top = stack.at(-1);
    if (top === 'text') {
      if (c === '\\') { out += code[i + 1] === '\n' ? ' \n' : '  '; i++; }
      else if (c === '`') { stack.pop(); out += c; last = '`'; gap = false; }
      else if (c === '$' && code[i + 1] === '{') { stack.push(0); out += '${'; i++; last = '{'; gap = false; }
      else out += c === '\n' ? '\n' : ' ';
      continue;
    }
    if (c === "'" || c === '"' || (c === '/' && regexAfter.test(last))) {
      let j = i + 1, inClass = false;
      while (j < code.length && code[j] !== '\n' && (inClass || code[j] !== c)) {
        if (code[j] === '\\') j++;
        else if (c === '/' && code[j] === '[') inClass = true;
        else if (c === '/' && code[j] === ']') inClass = false;
        j++;
      }
      if (c === '/') while (j + 1 < code.length && /[a-z]/i.test(code[j + 1])) j++;
      out += code.slice(i, j + 1); i = j; last = c === '/' ? ')' : c; gap = false;
      continue;
    }
    if (c === '`') stack.push('text');
    else if (typeof top === 'number' && c === '{') stack[stack.length - 1]++;
    else if (typeof top === 'number' && c === '}') { if (top === 0) stack.pop(); else stack[stack.length - 1]--; }
    out += c;
    if (/\s/.test(c)) gap = true;
    else { last = /[\w$]/.test(c) && !gap && /[\w$]$/.test(last) ? last + c : c; gap = false; }
  }
  return stack.length ? null : out;
}

/** The file a relative import names, as bun resolves it: as written, a `.js` written for its `.ts`, or with an
 *  extension or an index added. */
function moduleFile(target) {
  const candidates = [target, target.replace(/\.js$/, '.ts'), target.replace(/\.jsx$/, '.tsx'), ...['.ts', '.tsx', '.js', '.mjs'].map((ext) => `${target}${ext}`), ...['index.ts', 'index.tsx', 'index.js'].map((file) => join(target, file))];
  return candidates.find((file) => existsSync(file) && statSync(file).isFile()) ?? target;
}

/** One module and everything it reaches, resolved in the install: a module or an asset missing is a failure, by name. */
function closure(item, root, file, seen, from, manifest) {
  if (seen.has(file)) return;
  seen.add(file);
  if (!existsSync(file) || !statSync(file).isFile()) { failures.push(`${item.name}@${item.version}: ${from} is not in its tarball (${file.slice(root.length + 1)})`); return; }
  if (!CODE.test(file)) return;
  for (const { specifier, kind } of references(readFileSync(file, 'utf8'))) {
    const at = `${from} -> ${specifier}`;
    if (RUNTIME.has(specifier) || RUNTIME.has(specifier.split('/')[0])) continue;
    if (/^[a-z][a-z0-9+.-]*:/.test(specifier)) continue;
    if (specifier.startsWith('.') || specifier.startsWith('/')) {
      const target = resolve(dirname(file), specifier.split(/[?#]/)[0]);
      // a module inside this package is held to its files; one beside it in the repository never ships with it
      if (!target.startsWith(`${root}/`)) continue;
      if (kind === 'asset' && specifier.endsWith('/')) {
        if (!existsSync(target) || !statSync(target).isDirectory() || !readdirSync(target, { recursive: true }).some((name) => statSync(join(target, String(name))).isFile()))
          failures.push(`${item.name}@${item.version}: ${at}: its directory is not in its tarball (${target.slice(root.length + 1)})`);
        continue;
      }
      closure(item, root, kind === 'asset' ? target : moduleFile(target), seen, at, manifest);
      continue;
    }
    if (kind === 'asset') continue;
    const parts = specifier.split('/');
    const name = specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
    const subpath = specifier.length > name.length ? `.${specifier.slice(name.length)}` : '.';
    const found = installed(dirname(file), name);
    if (!found) {
      if (name in { ...manifest.peerDependencies } || name in { ...manifest.optionalDependencies }) continue;
      if (kind === 'dynamic' && !(name in { ...manifest.dependencies })) continue;
      failures.push(`${item.name}@${item.version}: ${at}: ${name} is not installed beside it (is it in its dependencies?)`);
      continue;
    }
    // a package of this run is held to the same proof; another package is taken as npm serves it
    const owner = packages.find((other) => other.name === name);
    if (!owner) continue;
    const dependency = JSON.parse(readFileSync(join(found, 'package.json'), 'utf8'));
    const target = dependency.exports !== undefined ? exportOf(dependency.exports, subpath) : subpath === '.' ? (dependency.main ?? 'index.js') : subpath;
    if (!target) { failures.push(`${item.name}@${item.version}: ${at}: ${name} exports no ${subpath}`); continue; }
    closure(owner, found, join(found, target), seen, at, dependency);
  }
}

/** The folder of package `name` as a runtime finds it from `dir` (each `node_modules` up the tree), or null. */
function installed(dir, name) {
  for (let at = dir; ; at = dirname(at)) {
    const candidate = join(at, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return candidate;
    if (dirname(at) === at) return null;
  }
}
