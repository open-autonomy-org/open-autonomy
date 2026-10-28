#!/usr/bin/env node
// The publisher's source-only artifact door. Git objects supply every byte; no installed state or custody is copied.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIRECTORY = 'packages/workplace/rooms';
const LEGACY = '9a1c4549356ad5f59c085aeb873d7d4ae65fdb27';
const LEGACY_FILES = ['main.mjs', 'rh2-app.json', 'teams-app.json'];
const LEGACY_DIGESTS = ['9e2cced5959a83b09b6cdaf4853e4ce8b857a10e0db04099531377b5205013a9', 'd5ca88ed2e6812cad365666a6c539b0332a1998a51da5203dec7d2704f76044b', '7fede7b6315791827b04437f21be866dfec7ac8f73a1dfb8bb4cb8fc1412e997'];
const HEX = /^[0-9a-f]{40}$/;
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw new Error(`Project Rooms artifact: ${message}`); };
const relative = path => typeof path === 'string' && path !== '' && !isAbsolute(path) && path === posix.normalize(path) && !path.split('/').some(part => part === '..' || part === '.');
const git = (source, args) => execFileSync('git', ['-C', source, ...args], { timeout: 5000, maxBuffer: 16 * 1024 * 1024 });
const blob = (source, revision, file) => git(source, ['cat-file', 'blob', `${revision}:${DIRECTORY}/${file}`]);
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const modeOf = sourceMode => Number.parseInt(sourceMode, 8) & 0o111 ? 0o555 : 0o444;

// Inspect JavaScript tokens, never strings/comments that happen to say import.
// Template text is skipped; its ${...} expressions remain ordinary code.
function sourceTokens(text) {
  const tokens = [];
  let at = 0;
  const push = (type, value) => tokens.push({ type, value });
  function code(interpolation = false) {
    let braces = 0;
    while (at < text.length) {
      const c = text[at], next = text[at + 1];
      if (/\s/.test(c)) { at++; continue; }
      if (c === '/' && next === '/') { at += 2; while (at < text.length && !/[\r\n]/.test(text[at])) at++; continue; }
      if (c === '/' && next === '*') {
        const end = text.indexOf('*/', at + 2);
        if (end < 0) fail('unterminated source comment');
        at = end + 2; continue;
      }
      if (c === "'" || c === '"') {
        const quote = c, start = ++at;
        while (at < text.length && text[at] !== quote) { if (text[at] === '\\') at++; at++; }
        if (at >= text.length) fail('unterminated source string');
        push('string', text.slice(start, at++)); continue;
      }
      if (c === '`') {
        push('punct', '`'); at++;
        let closed = false;
        while (at < text.length) {
          if (text[at] === '\\') { at += 2; continue; }
          if (text[at] === '`') { at++; closed = true; break; }
          if (text[at] === '$' && text[at + 1] === '{') { at += 2; push('punct', '{'); code(true); continue; }
          at++;
        }
        if (!closed) fail('unterminated source template');
        push('punct', '`'); continue;
      }
      const previous = tokens.at(-1);
      const regex = !previous || previous.type === 'punct' && /[=(:,[!&|?{};+*%~^<>-]/.test(previous.value)
        || previous.type === 'id' && ['return', 'throw', 'case', 'yield', 'await', 'else', 'do'].includes(previous.value);
      if (c === '/' && regex) {
        at++; let group = false, closed = false;
        while (at < text.length) {
          const item = text[at++];
          if (item === '\\') { at++; continue; }
          if (item === '[') group = true;
          if (item === ']') group = false;
          if (item === '/' && !group) { closed = true; break; }
          if (/[\r\n]/.test(item)) fail('unterminated source regular expression');
        }
        if (!closed) fail('unterminated source regular expression');
        while (/[a-z]/i.test(text[at] ?? '') && at < text.length) at++;
        push('regex', ''); continue;
      }
      if (/[A-Za-z_$]/.test(c)) {
        const start = at++;
        while (at < text.length && /[A-Za-z0-9_$]/.test(text[at])) at++;
        push('id', text.slice(start, at)); continue;
      }
      if (interpolation && c === '}' && braces === 0) { at++; push('punct', '}'); return; }
      if (c === '{') braces++;
      if (c === '}') braces--;
      push('punct', c); at++;
    }
    if (interpolation) fail('unterminated source template expression');
  }
  code(); return tokens;
}
function importsIn(file, bytes, names) {
  if (!file.endsWith('.mjs')) return;
  const tokens = sourceTokens(bytes.toString()), imports = [], reads = [];
  const literal = token => {
    if (token?.type !== 'string' || token.value.includes('\\')) fail(`${file} has an unsupported computed or escaped dependency`);
    return token.value;
  };
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i], next = tokens[i + 1];
    if (token.type === 'id' && token.value === 'import' && tokens[i - 1]?.value !== '.' && next?.value !== '.') {
      if (next?.value === '(') imports.push(literal(tokens[i + 2]));
      else if (next?.type === 'string') imports.push(literal(next));
    }
    if (token.type === 'id' && token.value === 'from' && next?.type === 'string' && tokens[i - 1]?.value !== '.') imports.push(literal(next));
    if (tokens.slice(i, i + 3).map(item => item.value).join(' ') === 'new URL (' && tokens[i + 3]?.type === 'string'
      && tokens.slice(i + 4, i + 10).map(item => item.value).join(' ') === ', import . meta . url') reads.push(literal(tokens[i + 3]));
  }
  for (const specifier of imports) {
    if (specifier.startsWith('node:')) continue;
    if (!specifier.startsWith('./') && !specifier.startsWith('../')) fail(`${file} imports an unbound package ${specifier}`);
    const dependency = posix.normalize(posix.join(posix.dirname(file), specifier));
    if (!relative(dependency) || !names.has(dependency)) fail(`${file} imports unshipped ${specifier}`);
  }
  for (const path of reads.filter(path => path.startsWith('.'))) {
    const dependency = posix.normalize(posix.join(posix.dirname(file), path));
    if (!names.has(dependency)) fail(`${file} reads unshipped ${path}`);
  }
}

/** Re-read exact receipt bytes and its immutable closure. Runtime/recovery does not need the source checkout. */
export function readArtifact(receiptPath, { verifySource = false } = {}) {
  const receipt = realpathSync(receiptPath), bytes = readFileSync(receipt), value = JSON.parse(bytes.toString());
  if (value.version !== 1 || value.kind !== 'connection-program-artifact' || value.app !== 'project-rooms'
    || !HEX.test(value.source?.revision) || value.source?.directory !== DIRECTORY || !isAbsolute(value.source?.root ?? '')
    || !isAbsolute(value.directory ?? '') || realpathSync(value.directory) !== value.directory || dirname(receipt) !== value.directory
    || value.publisher !== 'open-autonomy' || (lstatSync(receipt).mode & 0o777) !== 0o444 || lstatSync(receiptPath).isSymbolicLink()
    || (lstatSync(value.directory).mode & 0o777) !== 0o555 || !relative(value.entry) || value.program !== join(value.directory, value.entry)) fail('invalid artifact identity or source binding');
  if (!Array.isArray(value.files) || !value.files.length || new Set(value.files.map(row => row.path)).size !== value.files.length) fail('invalid file vector');
  const names = new Set(value.files.map(row => row.path));
  if (JSON.stringify(readdirSync(value.directory).sort()) !== JSON.stringify(['artifact.json', ...names].sort())) fail('artifact has undeclared directory inputs');
  if (!names.has(value.entry) || !names.has('rh2-app.json') || !names.has('teams-app.json')) fail('entry and both consent manifests are required');
  for (const row of value.files) {
    if (!relative(row.path) || !/^[0-9a-f]{64}$/.test(row.sha256) || !Number.isSafeInteger(row.bytes) || row.bytes < 0
      || ![0o444, 0o555].includes(row.mode)) fail(`invalid file receipt ${row.path}`);
    const path = join(value.directory, row.path), stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(path) !== path || (stat.mode & 0o777) !== row.mode) fail(`changed file mode/path ${row.path}`);
    const current = readFileSync(path);
    if (current.length !== row.bytes || sha256(current) !== row.sha256) fail(`changed artifact bytes ${row.path}`);
    importsIn(row.path, current, names);
    if (verifySource && !current.equals(blob(value.source.root, value.source.revision, row.path))) fail(`source mismatch ${row.path}`);
  }
  if ([1, 2].includes(value.lifecycle?.protocol)) {
    if (!names.has('lifecycle.json') || !names.has('lifecycle.mjs')) fail('lifecycle closure is absent');
    const metadata = json(join(value.directory, 'lifecycle.json'));
    if (JSON.stringify(metadata) !== JSON.stringify(value.lifecycle)) fail('lifecycle metadata changed');
    const capable = metadata.protocol === 2;
    if (metadata.transport !== 'node-ipc' || metadata.compensation?.protocol !== (capable ? 2 : 1)
      || metadata.compensation.scope !== (capable ? 'original-field-effects' : 'run-only')
      || capable && (metadata.state?.arcVersion !== 8 || metadata.state.journalVersion !== 2
        || metadata.compensation.ownerProtocol !== 1 || metadata.compensation.roomProtocol !== 1 || metadata.compensation.lineageProtocol !== 1
        || ['recovery-journal.mjs', 'room-receipts.mjs', 'parent-owner.mjs', 'demand.mjs', 'recovery.mjs', 'lineage.mjs'].some(file => !names.has(file)))) fail('unsupported lifecycle contract');
    if (metadata.withdrawal?.protocol !== 1 || metadata.withdrawal.transport !== 'command'
      || metadata.withdrawal.argument !== '--disconnect' || metadata.withdrawal.scope !== 'all-owned-placements') fail('unsupported withdrawal contract');
    if (JSON.stringify([...metadata.files].sort()) !== JSON.stringify([...names].sort())) fail('runtime closure differs from lifecycle metadata');
  } else if (value.source.revision !== LEGACY || value.lifecycle?.protocol !== null || value.lifecycle?.state?.arcVersion !== 5
    || JSON.stringify([...names].sort()) !== JSON.stringify([...LEGACY_FILES].sort())
    || LEGACY_FILES.some((path, i) => value.files.find(row => row.path === path)?.sha256 !== LEGACY_DIGESTS[i])) fail('unqualified legacy program');
  return { receipt, sha256: sha256(bytes), value };
}

/** Prepare exact full Git inputs into a new immutable directory, or verify an identical existing artifact. */
export function prepareRooms({ source, revision, out, legacy = false }) {
  source = realpathSync(source);
  if (!HEX.test(revision)) fail('revision must be the complete 40-character Git commit');
  if (git(source, ['rev-parse', `${revision}^{commit}`]).toString().trim() !== revision) fail('revision is not that commit');
  if (legacy && revision !== LEGACY) fail('only the exact recorded version-5 legacy source is supported');
  const lifecycle = legacy ? { protocol: null, transport: null, state: { arcVersion: 5, journalVersion: null }, compensation: null }
    : JSON.parse(blob(source, revision, 'lifecycle.json').toString());
  const names = legacy ? LEGACY_FILES : lifecycle.files;
  if (!Array.isArray(names) || !names.length || names.some(name => !relative(name) || name.includes('/')) || new Set(names).size !== names.length) fail('invalid source closure');
  out = join(realpathSync(dirname(resolve(out))), basename(resolve(out)));
  const files = names.map(path => {
    const bytes = blob(source, revision, path);
    const tree = git(source, ['ls-tree', revision, '--', `${DIRECTORY}/${path}`]).toString();
    const gitMode = tree.split(/\s/, 1)[0];
    if (!['100644', '100755'].includes(gitMode)) fail(`source file is not regular: ${path}`);
    importsIn(path, bytes, new Set(names));
    return { path, sha256: sha256(bytes), bytes: bytes.length, mode: modeOf(gitMode), gitMode, content: bytes };
  });
  if (legacy) {
    const known = JSON.parse(readFileSync(new URL('./lifecycle.json', import.meta.url), 'utf8')).compensation.predecessors.find(item => item.revision === revision);
    if (!known || files.some(row => known.files.find(file => file.path === row.path)?.sha256 !== row.sha256)) fail('legacy bytes differ from recorded predecessor');
  }
  const value = { version: 1, kind: 'connection-program-artifact', app: 'project-rooms', publisher: 'open-autonomy',
    source: { root: source, revision, directory: DIRECTORY }, directory: out, program: join(out, 'main.mjs'), entry: 'main.mjs',
    files: files.map(({ content: _content, ...row }) => row), lifecycle };
  const encoded = `${JSON.stringify(value, null, 2)}\n`;
  if (existsSync(out)) {
    const current = readArtifact(join(out, 'artifact.json'), { verifySource: true });
    if (readFileSync(current.receipt, 'utf8') !== encoded) fail('existing artifact belongs to different full inputs');
    return current;
  }
  const staging = `${out}.prepare-${process.pid}-${createHash('sha256').update(encoded).digest('hex').slice(0, 12)}`;
  mkdirSync(staging, { mode: 0o700 });
  try {
    for (const file of files) {
      mkdirSync(dirname(join(staging, file.path)), { recursive: true });
      writeFileSync(join(staging, file.path), file.content, { mode: file.mode });
      chmodSync(join(staging, file.path), file.mode);
    }
    writeFileSync(join(staging, 'artifact.json'), encoded, { mode: 0o444 });
    chmodSync(join(staging, 'artifact.json'), 0o444);
    chmodSync(staging, 0o555);
    renameSync(staging, out);
  } catch (error) { chmodSync(staging, 0o700); rmSync(staging, { recursive: true, force: true }); throw error; }
  return readArtifact(join(out, 'artifact.json'), { verifySource: true });
}

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--legacy') options.legacy = true;
    else if (['--source', '--revision', '--out'].includes(args[i]) && args[i + 1]) options[args[i].slice(2)] = args[++i];
    else fail(`unknown or missing argument ${args[i]}`);
  }
  if (!options.source || !options.revision || !options.out) fail('use --source DIR --revision FULL_COMMIT --out NEW_DIRECTORY [--legacy]');
  const prepared = prepareRooms(options);
  process.stdout.write(`${JSON.stringify({ receipt: prepared.receipt, sha256: prepared.sha256, program: prepared.value.program })}\n`);
}
