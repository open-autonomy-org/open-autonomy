// Offline maintenance's byte-preserving JSON and durable private-file operations. No product or native control doors.
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, fsyncSync, linkSync, lstatSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const digestPattern = /^[0-9a-f]{64}$/;
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function refuse(message) { throw new Error(`Project Rooms offline maintenance: ${message}`); }
export const same = (a, b) => stable(a) === stable(b);
export function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function exactKeys(value, keys, description) {
  if (!value || Array.isArray(value) || typeof value !== 'object' || !same(Object.keys(value).sort(), [...keys].sort())) refuse(`${description} fields differ`);
}
export function canonical(path) {
  if (typeof path !== 'string' || !isAbsolute(path) || resolve(path) !== path || realpathSync(path) !== path) refuse('a bound path is not canonical');
  return path;
}
export function privateDirectory(path) {
  canonical(path);
  const stat = lstatSync(path);
  if (!process.getuid || stat.uid !== process.getuid() || !stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077)) refuse('a private owned directory is required');
  return path;
}
export function readFile(path, expected, { privateFile = false, sealed = false } = {}) {
  canonical(path);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || !process.getuid || stat.uid !== process.getuid()
    || privateFile && (stat.mode & 0o077) || sealed && (stat.mode & 0o777) !== 0o444) refuse('a bound file has unsafe ownership, type or mode');
  const bytes = readFileSync(path);
  if (expected !== undefined && (!digestPattern.test(expected) || sha256(bytes) !== expected)) refuse('a bound file digest changed');
  return { path, bytes, sha256: sha256(bytes), stat };
}
export function readBound(reference, options) {
  exactKeys(reference, ['path', 'sha256'], 'file reference');
  return readFile(reference.path, reference.sha256, options);
}

// Parse spans rather than rewriting the containing document. Unknown numeric fields can exceed JavaScript's range.
// Duplicate names are refused at every depth; values outside the selected intent remain their original bytes.
export function jsonDocument(bytes) {
  const text = bytes.toString('utf8');
  if (!Buffer.from(text).equals(bytes)) refuse('JSON is not exact UTF-8');
  let at = 0;
  const space = () => { while (/\s/.test(text[at] ?? '') && at < text.length) { if (!/[\x20\t\r\n]/.test(text[at])) refuse('invalid JSON whitespace'); at++; } };
  const string = () => {
    const start = at++;
    for (; at < text.length; at++) {
      if (text[at] === '\\') { at++; continue; }
      if (text[at] === '"') { at++; try { return JSON.parse(text.slice(start, at)); } catch { refuse('invalid JSON string'); } }
    }
    refuse('unterminated JSON string');
  };
  const node = depth => {
    if (depth > 128) refuse('JSON nesting is unsupported');
    space(); const start = at;
    if (text[at] === '{') {
      at++; space(); const fields = [];
      while (text[at] !== '}') {
        const keyStart = at;
        if (text[at] !== '"') refuse('invalid JSON object name');
        const key = string(); space();
        if (fields.some(field => field.key === key) || text[at++] !== ':') refuse('duplicate name or invalid JSON object');
        const value = node(depth + 1); fields.push({ key, keyStart, value }); space();
        if (text[at] === '}') break;
        if (text[at++] !== ',') refuse('invalid JSON object separator');
        space(); if (text[at] === '}') refuse('trailing JSON comma');
      }
      if (text[at++] !== '}') refuse('unterminated JSON object');
      return { start, end: at, fields };
    }
    if (text[at] === '[') {
      at++; space();
      while (text[at] !== ']') {
        node(depth + 1); space(); if (text[at] === ']') break;
        if (text[at++] !== ',') refuse('invalid JSON array separator');
        space(); if (text[at] === ']') refuse('trailing JSON comma');
      }
      if (text[at++] !== ']') refuse('unterminated JSON array');
      return { start, end: at };
    }
    if (text[at] === '"') string();
    else {
      const match = /^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(text.slice(at));
      if (!match) refuse('invalid JSON value');
      at += match[0].length;
    }
    return { start, end: at };
  };
  const root = node(0); space(); if (at !== text.length) refuse('trailing JSON data');
  const field = (parent, key) => {
    const found = parent.fields?.find(each => each.key === key);
    if (!found) refuse(`required JSON member ${key} is absent`);
    return found.value;
  };
  const raw = item => text.slice(item.start, item.end);
  const value = item => JSON.parse(raw(item));
  return { text, root, field, raw, value };
}
export function removeIntent(bytes, id) {
  const doc = jsonDocument(bytes), lifecycle = doc.field(doc.root, 'publisherLifecycle'), intents = doc.field(lifecycle, 'intents');
  if (!intents.fields) refuse('retained intents are not an object');
  const index = intents.fields.findIndex(field => field.key === id);
  if (index < 0) refuse('the exact retained intent is absent');
  const selected = intents.fields[index];
  const from = index === intents.fields.length - 1 && index > 0 ? intents.fields[index - 1].value.end : selected.keyStart;
  const to = index < intents.fields.length - 1 ? intents.fields[index + 1].keyStart : selected.value.end;
  const after = Buffer.from(doc.text.slice(0, from) + doc.text.slice(to));
  jsonDocument(after);
  const deleted = Buffer.from(doc.text.slice(from, to));
  return { after, intent: doc.value(selected.value), originalIntent: Buffer.from(doc.raw(selected.value)),
    removed: { start: from, end: to, units: 'utf16-code-units', bytes: deleted.toString('base64'), sha256: sha256(deleted) } };
}
export function syncDirectory(path) {
  privateDirectory(path);
  const fd = openSync(path, 'r');
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
export function durableWrite(path, bytes, { create = false } = {}) {
  privateDirectory(dirname(path));
  const pending = join(dirname(path), `.${randomUUID()}.pending`), fd = openSync(pending, 'wx', 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); }
  catch (error) { closeSync(fd); try { unlinkSync(pending); } catch {} throw error; }
  closeSync(fd);
  try {
    if (create) {
      linkSync(pending, path); // Exclusive atomic publication; an existing audit is never replaced by creation.
      unlinkSync(pending);
    } else renameSync(pending, path);
    syncDirectory(dirname(path));
    if (!readFileSync(path).equals(bytes)) refuse('durable write readback differs');
  } catch (error) { try { unlinkSync(pending); } catch {} throw error; }
}
