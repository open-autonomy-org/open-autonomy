#!/usr/bin/env node
// The keys sweep over the exact tarballs a release uploads, before any is uploaded (scripts/npm-publish-missing.sh
// packs each version once, runs this, and publishes those same files). An npm package is published only with this
// sweep in place ("for the npms, we can carve out an exception to allow public release IF we have the keys sweep"); it
// is the sweep supercode's release runs (its scripts/npm-keys-sweep.mjs). Every tarball listed in <dir>/packed is
// unpacked into a folder of its own and read twice:
//   - by gitleaks itself (`gitleaks dir`, its own default rules and allowlists), pinned here by its release's SHA-256;
//   - by the redactor Teams uses on what leaves a machine (@volter/teams/redact, pinned here by its npm integrity), for
//     what gitleaks cannot know: this machine's custody values (the files its supercode custody registry names,
//     ~/.config/supercode/custody.json or <SUPERCODE_HOME>/custody.json, and SUPERCODE_CUSTODY_FILES; read fresh: a
//     declared file that cannot be read refuses the sweep, and so does a machine with no custody value at all) and the
//     tokens a Teams server mints.
// Any hit refuses the whole publication, naming the package, the file and the rule, never the value. The tools run
// with an environment holding no secret.
//
//   node scripts/npm-keys-sweep.mjs <tarballs dir>   (its `packed` lists: package dir <tab> name <tab> version; each
//                                                 tarball is <dir>/<name with / as +>@<version>.tgz)
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// gitleaks, pinned with its release's checksums (github.com/gitleaks/gitleaks/releases/tag/v8.30.1), the version whose
// default rule set @volter/teams vendors.
const GITLEAKS_VERSION = '8.30.1';
const GITLEAKS_SHA256 = {
  darwin_arm64: 'b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5',
  darwin_x64: 'dfe101a4db2255fc85120ac7f3d25e4342c3c20cf749f2c20a18081af1952709',
  linux_arm64: 'e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080',
  linux_x64: '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb',
};
// @volter/teams, pinned with its npm integrity; only its redactor (node built-ins alone) is loaded.
const TEAMS_VERSION = '0.2.109';
const TEAMS_INTEGRITY = 'sha512-3vJYQ9HbmHml9rlbg6yoCxmUrT0QZ9ouP6YNARaTgxhJTlv+HYhMY7KCxmdd/k7mXP7gqq4aMRUi9S3dOfvxEA==';

const stop = (message) => {
  process.stderr.write(`keys sweep: ${message}: nothing is published\n`);
  process.exit(1);
};
// What the tools run with: no token, no custody path.
const bare = { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: tmpdir(), LANG: 'C' };
// The pinned archives are kept between runs and checked against their pins on every run; each run unpacks its own.
const cache = join(tmpdir(), 'keys-sweep-tools');
// How long one pinned download may take before the sweep refuses (it fails closed: nothing is published).
const DOWNLOAD_DEADLINE_MS = 60_000;

/** The pinned archive's bytes: the kept copy when it still matches its pin, else downloaded and checked. */
async function pinned(url, file, check, what) {
  const kept = join(cache, file);
  if (existsSync(kept)) { const bytes = readFileSync(kept); if (check(bytes)) return bytes; }
  let bytes;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_DEADLINE_MS) });
    if (!response.ok) stop(`downloading ${what} answered ${response.status}: ${url}`);
    bytes = Buffer.from(await response.arrayBuffer());
  } catch (error) {
    stop(`could not download ${what}: ${error.message}`);
  }
  if (!check(bytes)) stop(`${what} does not match its pin`);
  mkdirSync(cache, { recursive: true });
  writeFileSync(`${kept}.part`, bytes);
  renameSync(`${kept}.part`, kept);
  return bytes;
}

/** Unpack `bytes` (a .tgz) into `dir`, only the `members` named. */
function unpack(bytes, dir, members) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'archive.tgz'), bytes);
  execFileSync('tar', ['-xzf', 'archive.tgz', ...members], { cwd: dir, env: bare });
  rmSync(join(dir, 'archive.tgz'));
}

async function gitleaks(tools) {
  const os = { darwin: 'darwin', linux: 'linux' }[process.platform];
  const asset = `${os}_${process.arch}`;
  const sha256 = GITLEAKS_SHA256[asset];
  if (!sha256) stop(`gitleaks ${GITLEAKS_VERSION} is not pinned for ${process.platform} ${process.arch}`);
  const file = `gitleaks_${GITLEAKS_VERSION}_${asset}.tar.gz`;
  const bytes = await pinned(`https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/${file}`, file, (b) => createHash('sha256').update(b).digest('hex') === sha256, `gitleaks ${GITLEAKS_VERSION} ${asset}`);
  unpack(bytes, join(tools, 'gitleaks'), ['gitleaks']);
  return join(tools, 'gitleaks', 'gitleaks');
}

async function teams(tools) {
  const file = `volter-teams-${TEAMS_VERSION}.tgz`;
  const bytes = await pinned(`https://registry.npmjs.org/@volter/teams/-/teams-${TEAMS_VERSION}.tgz`, file, (b) => `sha512-${createHash('sha512').update(b).digest('base64')}` === TEAMS_INTEGRITY, `@volter/teams@${TEAMS_VERSION}`);
  unpack(bytes, join(tools, 'teams'), ['package/redact.mjs', 'package/redact']);
  return join(tools, 'teams', 'package');
}

const tarballs = resolve(process.argv[2] ?? '');
if (!existsSync(join(tarballs, 'packed'))) stop(`no packed list in ${tarballs}`);
const listed = readFileSync(join(tarballs, 'packed'), 'utf8').split('\n').filter(Boolean).map((line) => line.split('\t'));
const packages = [...new Map(listed.map(([, name, version]) => [`${name}@${version}`, { name, version, tarball: join(tarballs, `${name.replace('/', '+')}@${version}.tgz`) }])).values()];
for (const pkg of packages) if (!existsSync(pkg.tarball)) stop(`${pkg.name}@${pkg.version} is listed but its tarball is missing`);
if (!packages.length) { process.stdout.write('keys sweep: no tarball was packed, so none is published\n'); process.exit(0); }

const work = mkdtempSync(join(tmpdir(), 'keys-sweep-'));
process.on('exit', () => rmSync(work, { recursive: true, force: true }));
const binary = await gitleaks(join(work, 'tools'));
const version = spawnSync(binary, ['version'], { encoding: 'utf8', env: bare });
if (version.status !== 0) stop(`gitleaks did not run: ${version.stderr.trim().slice(-300)}`);
const redactor = await teams(join(work, 'tools'));
const { redactText, redactionSnapshot } = await import(pathToFileURL(join(redactor, 'redact.mjs')).href);
const gitleaksIds = new Set(JSON.parse(readFileSync(join(redactor, 'redact', 'gitleaks-rules.json'), 'utf8')).rules.map((rule) => rule.id));
let custody;
try { ({ values: custody } = redactionSnapshot(process.env, { fresh: true })); } catch (error) { stop(error.message); }
if (!custody.length) stop('no custody value is readable here (no supercode custody registry, or it names no secret), so the sweep cannot look for them');

const files = (dir) => readdirSync(dir, { recursive: true }).map((name) => join(dir, String(name))).filter((path) => statSync(path).isFile());
const hits = [];
let count = 0;
const unpacked = join(work, 'tarballs');
mkdirSync(unpacked);
try {
  for (const pkg of packages) {
    const dir = join(unpacked, `${pkg.name.replace('/', '+')}@${pkg.version}`);
    mkdirSync(dir);
    execFileSync('tar', ['-xzf', pkg.tarball, '-C', dir], { env: bare });
    const here = (path) => relative(dir, path);
    const report = join(work, `${pkg.name.replace('/', '+')}.json`);
    // From the work folder, so no .gitleaksignore or config of the caller's applies.
    const run = spawnSync(binary, ['dir', dir, '--no-banner', '--redact', '--exit-code', '0', '--report-format', 'json', '--report-path', report], { cwd: work, encoding: 'utf8', env: bare });
    if (run.status !== 0) stop(`gitleaks failed on ${pkg.name}@${pkg.version}: ${run.stderr.trim().slice(-300)}`);
    for (const finding of JSON.parse(readFileSync(report, 'utf8'))) hits.push({ package: `${pkg.name}@${pkg.version}`, file: here(finding.File), rule: `gitleaks ${finding.RuleID}, line ${finding.StartLine}` });
    for (const path of files(dir)) {
      count += 1;
      // A binary file is read byte for byte (a value held as ASCII inside it is still found); text as UTF-8.
      const bytes = readFileSync(path), isBinary = bytes.subarray(0, 8000).includes(0);
      redactText(bytes.toString(isBinary ? 'latin1' : 'utf8'), process.env, custody, (rule) => {
        // gitleaks' own rules are gitleaks' to report (above); this pass adds custody values and Teams' tokens.
        if (!gitleaksIds.has(rule)) hits.push({ package: `${pkg.name}@${pkg.version}`, file: here(path), rule });
        return '';
      });
    }
  }
} finally { rmSync(unpacked, { recursive: true, force: true }); }
const basis = `${packages.length} tarball(s), ${count} files, under gitleaks ${version.stdout.trim()}, ${custody.length} custody value(s) and Teams' token forms (@volter/teams@${TEAMS_VERSION})`;
if (hits.length) {
  for (const hit of hits) process.stderr.write(`keys sweep: ${hit.package} ${hit.file}: ${hit.rule}\n`);
  stop(`${hits.length} hit(s) in ${basis}`);
}
process.stdout.write(`keys sweep: clean: ${basis}\n`);
