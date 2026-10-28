// The selected Rooms program's append-only recovery evidence. It records truth; only live owners admit phases.
import { createHash } from 'node:crypto';

export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function canonical(value, depth = 0, limit = 64) {
  if (depth > limit) throw new Error('Project Rooms recovery: JSON exceeds its supported depth');
  if (value === null || typeof value === 'string' || typeof value === 'boolean'
    || typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(item => canonical(item, depth + 1, limit)).join(',')}]`;
  if (value && Object.getPrototypeOf(value) === Object.prototype) return `{${Object.keys(value).sort()
    .map(key => `${JSON.stringify(key)}:${canonical(value[key], depth + 1, limit)}`).join(',')}}`;
  throw new Error('Project Rooms recovery: evidence contains a non-JSON value');
}
export const digestValue = value => hash(canonical(value));
export const copy = value => JSON.parse(canonical(value));
export const refuse = message => { throw new Error(`Project Rooms recovery: ${message}`); };

/** `persist` fsyncs and re-reads the complete state. An exception leaves admission held. */
export function createRecoveryJournal({ state, selection, binding, persist }) {
  if (!/^[a-f0-9]{64}$/.test(selection) || !binding) refuse('a selected immutable program and parent binding are required');
  const { generation: _generation, ...logical } = binding;
  const identity = { selection, binding: logical };
  state.roomsRecovery ??= { version: 1, selections: {} };
  if (state.roomsRecovery.version !== 1 || !state.roomsRecovery.selections
    || Array.isArray(state.roomsRecovery.selections)) refuse('unsupported recovery journal');
  const existing = state.roomsRecovery.selections[selection];
  if (existing && canonical(existing.identity) !== canonical(identity)) refuse('selection journal belongs to different immutable inputs');
  const journal = state.roomsRecovery.selections[selection] ??= { identity, entries: [] };
  if (!Array.isArray(journal.entries)) refuse('journal entries are absent');
  let previous = null;
  for (const [index, entry] of journal.entries.entries()) {
    const { digest, ...body } = entry;
    if (body.sequence !== index || body.previous !== previous || digestValue(body) !== digest) refuse(`journal chain differs at ${index}`);
    previous = digest;
  }
  let durable = false;
  function flush() { durable = false; persist(); durable = true; }
  function append(kind, value) {
    if (typeof kind !== 'string' || !kind || journal.entries.length >= 100_000) refuse('unsupported or full recovery journal');
    const body = { sequence: journal.entries.length, previous, kind, value: copy(value) };
    const entry = { ...body, digest: digestValue(body) };
    journal.entries.push(entry); previous = entry.digest;
    // Never remove a failed append or roll back to an older snapshot. Before
    // dispatch this prevents the effect; after dispatch the prior intent stays
    // unresolved on disk and an exact owner status must settle it.
    flush();
    return copy(entry);
  }
  flush();
  return { append, flush, get durable() { return durable; }, get head() { return previous; },
    entries: kind => journal.entries.filter(entry => kind === undefined || entry.kind === kind).map(copy),
    identity: copy(identity) };
}

/** Successful transport is not terminal no effect. Only the exact receipt contract classifies it. */
export function terminalDisposition(result, namespace, operationId) {
  const conditional = result?.conditional;
  if (!conditional || conditional.namespace !== namespace || conditional.operationId !== operationId) refuse('receipt identity differs');
  if (conditional.outcome === 'unavailable') {
    if (canonical(Object.keys(result).sort()) !== canonical(['conditional'])
      || canonical(Object.keys(conditional).sort()) !== canonical(['code', 'namespace', 'operationId', 'outcome'])
      || conditional.code !== 'conditional-receipt-reading-unavailable') refuse('unsupported unreadable receipt shape');
    return 'unreadable';
  }
  if (!['applied', 'original-effect-absent', 'refused'].includes(conditional.outcome)
    || typeof result.changed !== 'boolean' || !Array.isArray(conditional.effect)) refuse('unsupported terminal receipt');
  if (conditional.outcome === 'refused') {
    if (result.changed || conditional.effect.length || typeof conditional.code !== 'string') refuse('refusal does not prove no effect');
    return 'terminal-no-effect';
  }
  if (conditional.outcome === 'original-effect-absent') {
    if (result.changed || conditional.effect.length || result.originalEffectAbsent !== true) refuse('absence receipt is inconsistent');
    return 'original-effect-absent';
  }
  return 'applied';
}

export function closedInventory(status, manifest) {
  if (status?.namespace !== manifest.id || status.state !== 'closed' || !Array.isArray(status.operations)
    || status.operations.length !== manifest.operations.length) refuse('namespace closure is incomplete');
  const operations = [];
  for (const expected of manifest.operations) {
    const matches = status.operations.filter(operation => operation.id === expected.id);
    if (matches.length !== 1) refuse('namespace operation inventory differs');
    const operation = matches[0];
    if (operation.state === 'never-admitted') operations.push({ id: expected.id, disposition: 'never-admitted' });
    else if (operation.state === 'terminal') {
      const disposition = terminalDisposition(operation.result, manifest.id, expected.id);
      if (disposition === 'unreadable') refuse('current reading authority retains namespace debt');
      operations.push({ id: expected.id, disposition, result: copy(operation.result) });
    } else refuse('an unresolved operation retains namespace debt');
  }
  return { namespace: manifest.id, state: 'closed', operations };
}
