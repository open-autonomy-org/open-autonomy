#!/usr/bin/env node
// The records register's check (docs/decisions/0022-the-records-register.md): a record is registered before it is used.
// It is the kit's file, written into the organization's record repository by `create-open-autonomy records init` and
// refreshed there by every later init; it needs Node and git and nothing else, so a pre-commit stays fast.
//
//   node tools/records-check.mjs staged                 the pre-commit: every record this commit adds has its entry
//   node tools/records-check.mjs estate [--json]        every record across the estate's roots without an entry
//
// The register is Markdown: the register file and its volumes under the register directory (records.json). An entry is a
// table row whose first cell names its path in backticks. A volume named `<owner>--<repo>.md` holds one repository's
// entries, by path inside that repository; any other volume holds entries by absolute path (`~/` for the home), for
// records outside a repository. An entry whose path ends in `/` is a series: it registers every file under that folder.
// An entry with a field still `TBD` is a stub, which the check writes for the writer to complete and does not accept.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, extname, join, relative, resolve } from 'node:path';

const STUB = 'TBD';
const COLUMNS = ['Asset / original path', 'Purpose', 'Owner', 'Writers', 'Copies', 'Format', 'Classification', 'Access', 'Retention', 'Depends on / replaces', 'Evidence'];
const DEFAULTS = {
  register: 'records-register.md',
  volumes: 'records-register',
  include: ['**/*.md', '**/*.mdx', '**/*.yaml', '**/*.yml', '**/*.json', '**/*.jsonl', '**/*.csv', '**/*.tsv', '**/*.txt', '**/*.log', '**/*.db', '**/*.sqlite'],
  exclude: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**', '**/coverage/**', '**/vendor/**', '**/fixtures/**', '**/__snapshots__/**',
    '**/package.json', '**/package-lock.json', '**/bun.lock', '**/tsconfig*.json', '**/*.schema.json', '.github/**', '**/.githooks/**'],
  estate: { roots: [] }
};

const root = (() => { try { return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim(); } catch { return process.cwd(); } })();
const configFile = join(root, 'records.json');
const config = { ...DEFAULTS, ...(existsSync(configFile) ? JSON.parse(readFileSync(configFile, 'utf8')) : {}) };
const home = (path) => path.startsWith('~/') ? join(homedir(), path.slice(2)) : path;

// Globs: ** any depth, * within a segment, ? one character. A pattern with no slash matches the basename anywhere.
function matcher(patterns) {
  const res = patterns.map((glob) => {
    const body = glob.split('**/').map((part) => part.split('**').map((p) => p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')).join('.*')).join('(?:.*/)?');
    return new RegExp(glob.includes('/') ? `^${body}$` : `(?:^|/)${body}$`);
  });
  return (path) => res.some((re) => re.test(path));
}
const included = matcher(config.include);
const excluded = matcher(config.exclude);
const isRecord = (path) => included(path) && !excluded(path);

/** Every volume's entries: { repository | null, path, stub } by the volume they are in. */
function entries(registerRoot) {
  const files = [join(registerRoot, config.register)];
  const dir = join(registerRoot, config.volumes);
  if (existsSync(dir)) for (const name of readdirSync(dir)) if (name.endsWith('.md')) files.push(join(dir, name));
  const found = [];
  for (const file of files) {
    if (!existsSync(file)) continue;
    const named = /^([A-Za-z0-9_.-]+)--([A-Za-z0-9_.-]+)\.md$/.exec(file.split('/').pop());
    const repository = named ? `${named[1]}/${named[2]}` : null;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const row = /^\|\s*`([^`]+)`[^|]*\|(.*)$/.exec(line);
      if (!row) continue;
      found.push({ repository, path: row[1], stub: row[2].split('|').some((cell) => cell.trim() === STUB), file });
    }
  }
  return found;
}

function covered(list, repository, path) {
  return list.find((entry) => entry.repository === repository && (entry.path === path || (entry.path.endsWith('/') && path.startsWith(entry.path))));
}

const repositoryOf = (dir) => {
  try {
    const url = execFileSync('git', ['-C', dir, 'remote', 'get-url', 'origin'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const m = /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/.exec(url);
    return m ? `${m[1]}/${m[2]}` : null;
  } catch { return null; }
};

const FORMATS = { '.md': 'Markdown', '.mdx': 'MDX', '.yaml': 'YAML', '.yml': 'YAML', '.json': 'JSON', '.jsonl': 'JSON Lines', '.csv': 'CSV', '.tsv': 'TSV', '.txt': 'Text', '.log': 'Log', '.db': 'SQLite', '.sqlite': 'SQLite' };
const stubRow = (path) => `| \`${path}\` | ${STUB} | ${STUB} | ${STUB} | Original; no copies | ${FORMATS[extname(path)] ?? STUB} | ${STUB} | ${STUB} | ${STUB} | ${STUB} | ${STUB} |`;

function staged() {
  const repository = repositoryOf(root) ?? config.repository;
  if (!repository) { console.error('records: this repository names no origin on GitHub and records.json no "repository"; nothing is checked'); return 0; }
  const registerFiles = (path) => path === config.register || path.startsWith(`${config.volumes}/`) || path === 'records.json';
  const added = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=AR', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)
    .filter((path) => isRecord(path) && !registerFiles(path));
  if (added.length === 0) return 0;
  const list = entries(root);
  const volume = join(root, config.volumes, `${repository.replace('/', '--')}.md`);
  const missing = added.filter((path) => !covered(list, repository, path));
  const stubs = added.map((path) => covered(list, repository, path)).filter((entry) => entry?.stub);
  if (missing.length) {
    const head = existsSync(volume) ? readFileSync(volume, 'utf8') : `# Records register: ${repository}\n\nPart of the [records register](../${config.register}). Paths are inside \`${repository}\`.\n\n| ${COLUMNS.join(' | ')} |\n|${COLUMNS.map(() => '---').join('|')}|\n`;
    writeFileSync(volume, `${head.replace(/\n*$/, '\n')}${missing.map(stubRow).join('\n')}\n`);
    execFileSync('git', ['add', '--', relative(root, volume)], { cwd: root });
  }
  if (missing.length === 0 && stubs.length === 0) return 0;
  console.error(`records: register a record before using it (${config.register}).`);
  for (const path of missing) console.error(`  ${path}: no entry; a stub is added to ${relative(root, volume)} and staged`);
  for (const entry of stubs) console.error(`  ${entry.path}: its entry in ${relative(root, entry.file)} still has ${STUB} fields`);
  console.error(`Complete each entry's ${STUB} fields (purpose, owner, writers, classification, access, retention, dependencies), then commit again.`);
  return 1;
}

function walk(dir, out, base) {
  let names;
  try { names = readdirSync(dir); } catch { return; }
  for (const name of names) {
    const path = join(dir, name);
    let stat;
    try { stat = statSync(path); } catch { continue; }
    const rel = relative(base, path);
    if (stat.isDirectory()) { if (!excluded(`${rel}/x`)) walk(path, out, base); }
    else if (isRecord(rel)) out.push(path);
  }
}

function estate(json) {
  const list = entries(root);
  const roots = (config.estate?.roots ?? []).map(home);
  if (roots.length === 0) { console.error('records: records.json names no estate roots ("estate": { "roots": [...] }): the denominator is empty'); return 2; }
  const report = [];
  for (const dir of roots) {
    if (!existsSync(dir)) { report.push({ root: dir, missing: true, records: 0, unregistered: [] }); continue; }
    const repository = existsSync(join(dir, '.git')) ? repositoryOf(dir) : null;
    let paths;
    if (repository) {
      paths = execFileSync('git', ['-C', dir, 'ls-files', '-z'], { encoding: 'utf8', maxBuffer: 1 << 28 }).split('\0').filter(Boolean).filter(isRecord);
      if (resolve(dir) === resolve(root)) paths = paths.filter((path) => !(path === config.register || path.startsWith(`${config.volumes}/`) || path === 'records.json'));
    } else {
      const found = [];
      walk(dir, found, dir);
      paths = found.map((path) => path.startsWith(homedir()) ? `~/${relative(homedir(), path)}` : path);
    }
    const unregistered = paths.filter((path) => { const entry = covered(list, repository, path); return !entry || entry.stub; });
    report.push({ root: dir, repository, records: paths.length, unregistered });
  }
  const total = report.reduce((sum, r) => sum + r.unregistered.length, 0);
  const denominator = report.reduce((sum, r) => sum + r.records, 0);
  if (json) console.log(JSON.stringify({ roots: report.length, records: denominator, unregistered: total, report }, null, 2));
  else {
    console.log(`records: ${total} unregistered of ${denominator} records across ${report.length} roots (records.json estate.roots)`);
    for (const r of report) {
      console.log(`  ${r.root}${r.repository ? ` (${r.repository})` : ''}: ${r.missing ? 'MISSING ROOT' : `${r.unregistered.length} of ${r.records}`}`);
      for (const path of r.unregistered.slice(0, 50)) console.log(`    ${path}`);
      if (r.unregistered.length > 50) console.log(`    … ${r.unregistered.length - 50} more`);
    }
  }
  return total === 0 && report.every((r) => !r.missing) ? 0 : 1;
}

const verb = process.argv[2];
if (verb === 'staged') process.exit(staged());
else if (verb === 'estate') process.exit(estate(process.argv.includes('--json')));
else { console.error('usage: records-check.mjs staged | estate [--json]'); process.exit(2); }
