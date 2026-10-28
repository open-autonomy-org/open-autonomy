#!/usr/bin/env node
// Prepare a separately identified offline executable from exact Git objects. No connection or selected program is changed.
import { execFileSync } from 'node:child_process';
import { chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readOfflineArtifact } from './offline.mjs';
import { jsonDocument, refuse, sha256 } from './offline-files.mjs';

const directory = 'packages/workplace/rooms';
const git = (source, args) => execFileSync('git', ['-C', source, ...args], { timeout: 5000, maxBuffer: 16 * 1024 * 1024 });
const flush = path => { const fd = openSync(path, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); } };
const seal = (path, bytes, mode) => { writeFileSync(path, bytes, { flag: 'wx', mode }); chmodSync(path, mode); flush(path); };
export function prepareOffline({ source, revision, out }) {
  source = realpathSync(source);
  if (!/^[a-f0-9]{40}$/.test(revision ?? '') || git(source, ['rev-parse', `${revision}^{commit}`]).toString().trim() !== revision) refuse('offline preparation needs one exact full commit');
  const document = jsonDocument(git(source, ['show', `${revision}:${directory}/offline.json`])), metadata = document.value(document.root);
  if (metadata.version !== 1 || metadata.kind !== 'project-rooms-offline-maintenance' || metadata.entry !== 'offline.mjs'
    || metadata.scope !== 'original-terminal-no-effect-intent-only' || metadata.remoteMutations !== false || metadata.nativeControls !== false
    || !Array.isArray(metadata.files) || !metadata.files.includes('offline.json') || !metadata.files.includes(metadata.entry)
    || !Array.isArray(metadata.supports) || !metadata.supports.length || !Array.isArray(metadata.custodyProtocols)
    || !Array.isArray(metadata.terminalEvidenceProfiles) || !Array.isArray(metadata.custodySources)
    || new Set(metadata.files).size !== metadata.files.length || metadata.files.some(path => !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(path))) refuse('offline source metadata differs');
  const files = metadata.files.map(path => {
    const content = git(source, ['show', `${revision}:${directory}/${path}`]);
    const gitMode = git(source, ['ls-tree', revision, '--', `${directory}/${path}`]).toString().split(/\s/, 1)[0];
    if (!['100644', '100755'].includes(gitMode)) refuse('offline source is not a regular file');
    if (path.endsWith('.mjs')) {
      const text = content.toString();
      if (/\bimport\s*\(\s*(?!['"\s])/.test(text)) refuse('offline source has an unbound dynamic import');
      for (const match of text.matchAll(/\b(?:from\s*|import\s*\(?\s*)['"]([^'"]+)['"]/g)) {
        if (!match[1].startsWith('node:') && (!match[1].startsWith('./') || !metadata.files.includes(match[1].slice(2)))) refuse('offline source imports outside its exact closure');
      }
    }
    return { path, gitMode, mode: gitMode === '100755' ? 0o555 : 0o444, sha256: sha256(content), bytes: content.length, content };
  });
  out = join(realpathSync(dirname(resolve(out))), basename(resolve(out)));
  const value = { version: 1, kind: 'project-rooms-offline-artifact', publisher: 'open-autonomy', app: 'project-rooms',
    source: { root: source, revision, directory }, directory: out, entry: metadata.entry, program: join(out, metadata.entry),
    files: files.map(({ content, ...file }) => file), maintenance: metadata };
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  if (existsSync(out)) {
    const current = readOfflineArtifact(join(out, 'offline-artifact.json'));
    if (!readFileSync(current.path).equals(bytes)) refuse('offline artifact output already has different inputs');
    return { receipt: current.path, sha256: current.sha256, program: current.value.program };
  }
  const staging = `${out}.prepare-${process.pid}-${sha256(bytes).slice(0, 12)}`;
  mkdirSync(staging, { mode: 0o700 });
  try {
    for (const file of files) seal(join(staging, file.path), file.content, file.mode);
    seal(join(staging, 'offline-artifact.json'), bytes, 0o444);
    chmodSync(staging, 0o555); flush(staging); renameSync(staging, out); flush(dirname(out));
  } catch (error) { if (existsSync(staging)) { chmodSync(staging, 0o700); rmSync(staging, { recursive: true, force: true }); } throw error; }
  const current = readOfflineArtifact(join(out, 'offline-artifact.json'));
  return { receipt: current.path, sha256: current.sha256, program: current.value.program };
}

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), options = {};
  for (let i = 0; i < args.length; i++) {
    if (['--source', '--revision', '--out'].includes(args[i]) && args[i + 1] && !options[args[i].slice(2)]) options[args[i].slice(2)] = args[++i];
    else refuse('use --source DIR --revision FULL_COMMIT --out NEW_DIRECTORY');
  }
  if (!options.source || !options.revision || !options.out) refuse('use --source DIR --revision FULL_COMMIT --out NEW_DIRECTORY');
  process.stdout.write(`${JSON.stringify(prepareOffline(options))}\n`);
}
