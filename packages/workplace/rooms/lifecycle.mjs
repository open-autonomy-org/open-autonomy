// Project Rooms' owner-bound lifecycle and durable mutation journal. Only the connection's existing IPC parent controls it.
import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRecoveryJournal, digestValue } from './recovery-journal.mjs';
import { createParentOwner } from './parent-owner.mjs';

export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw new Error(`Project Rooms lifecycle: ${message}`); };
const canonical = path => {
  if (!isAbsolute(path ?? '') || resolve(path) !== path) fail('noncanonical bound path');
  try { return realpathSync(path); }
  catch (error) { if (error.code !== 'ENOENT') throw error; return join(realpathSync(dirname(path)), path.slice(dirname(path).length + 1)); }
};

// Recovery verifies retained files without the original publisher checkout. Native admission additionally checks Git blobs.
export function readProgram(receiptPath, expected) {
  const receipt = realpathSync(receiptPath), bytes = readFileSync(receipt), value = JSON.parse(bytes);
  if (expected && digest(bytes) !== expected) fail('artifact receipt digest changed');
  if (value.version !== 1 || value.kind !== 'connection-program-artifact' || value.app !== 'project-rooms'
    || value.publisher !== 'open-autonomy' || !/^[0-9a-f]{40}$/.test(value.source?.revision)
    || value.source?.directory !== 'packages/workplace/rooms' || !isAbsolute(value.source?.root ?? '')
    || canonical(value.directory) !== value.directory || dirname(receipt) !== value.directory
    || value.entry !== 'main.mjs' || value.program !== join(value.directory, value.entry)) fail('artifact identity differs');
  if (!Array.isArray(value.files) || !value.files.length || new Set(value.files.map(file => file.path)).size !== value.files.length) fail('artifact has no exact file vector');
  if ((lstatSync(receiptPath).mode & 0o777) !== 0o444 || lstatSync(receiptPath).isSymbolicLink()
    || (lstatSync(value.directory).mode & 0o777) !== 0o555
    || JSON.stringify(readdirSync(value.directory).sort()) !== JSON.stringify(['artifact.json', ...value.files.map(file => file.path)].sort())) fail('artifact directory or receipt is mutable or has extra inputs');
  for (const file of value.files) {
    if (typeof file.path !== 'string' || !/^[a-zA-Z0-9_.-]+$/.test(file.path) || ![0o444, 0o555].includes(file.mode)
      || !/^[0-9a-f]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.bytes)) fail('invalid artifact file');
    const path = join(value.directory, file.path), stat = lstatSync(path), content = readFileSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(path) !== path || (stat.mode & 0o777) !== file.mode
      || content.length !== file.bytes || digest(content) !== file.sha256) fail(`artifact file changed: ${file.path}`);
  }
  return { receipt, sha256: digest(bytes), value };
}

export function createLifecycle({ state, configPath, statePath, persist, pause, resume, recover, acceptLineage, adoptLineage, roomDebt = () => ({ unknown: 0, unreadable: 0, unclosed: 0 }), readiness, parentDisconnected, log }) {
  const encoded = process.env.SUPERCODE_CONNECTION_PROGRAM_BINDING;
  const binding = encoded ? JSON.parse(encoded) : null;
  const directory = dirname(fileURLToPath(import.meta.url));
  let artifact = null;
  if (binding) {
    const fields = ['protocol', 'transaction', 'connection', 'app', 'artifact', 'config', 'state', 'generation'].sort();
    if (!process.send || !process.connected || JSON.stringify(Object.keys(binding).sort()) !== JSON.stringify(fields)
      || binding.protocol !== 1 || binding.app !== 'project-rooms' || !/^[0-9a-f]{24}$/.test(binding.connection)
      || !/^[0-9a-f]{64}$/.test(binding.artifact) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(binding.generation)
      || !(binding.transaction === null || typeof binding.transaction === 'string' && binding.transaction.length > 0)
      || binding.config !== canonical(resolve(configPath)) || binding.state !== canonical(resolve(statePath)) || resolve(statePath) !== binding.state) fail('binding does not name this IPC child/config/state');
    artifact = readProgram(join(directory, 'artifact.json'), binding.artifact);
    const metadata = JSON.parse(readFileSync(join(directory, 'lifecycle.json')));
    if (metadata.protocol !== 2 || metadata.transport !== 'node-ipc' || metadata.state?.journalVersion !== 2
      || metadata.state.arcVersion !== 8 || metadata.compensation?.protocol !== 2 || metadata.compensation.scope !== 'original-field-effects'
      || metadata.compensation.ownerProtocol !== 1 || metadata.compensation.roomProtocol !== 1 || metadata.compensation.lineageProtocol !== 1
      || metadata.withdrawal?.protocol !== 1 || metadata.withdrawal.transport !== 'command'
      || metadata.withdrawal.argument !== '--disconnect' || metadata.withdrawal.scope !== 'all-owned-placements'
      || JSON.stringify(metadata) !== JSON.stringify(artifact.value.lifecycle)
      || JSON.stringify([...metadata.files].sort()) !== JSON.stringify(artifact.value.files.map(file => file.path).sort())) fail('unsupported artifact lifecycle');
  }
  const logical = value => JSON.stringify(Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'generation').sort(([a], [b]) => a.localeCompare(b))));
  const selection = digest(binding ? logical(binding) : JSON.stringify({ program: directory, config: canonical(resolve(configPath)), state: canonical(resolve(statePath)) }));
  state.publisherLifecycle ??= { version: 1, intents: {} };
  const legacy = state.publisherLifecycle;
  if (legacy.version !== 1 || !legacy.intents || typeof legacy.intents !== 'object') fail('unsupported legacy durable journal');
  // Old selection evidence is kept byte-for-byte. New bytes neither settle an
  // old generic intent nor relabel its original placement debt.
  const journal = createRecoveryJournal({ state, selection, binding: binding ?? { program: directory, config: canonical(resolve(configPath)), state: canonical(resolve(statePath)) }, persist });
  const owner = binding ? createParentOwner(binding) : null;
  let status = process.env.SUPERCODE_CONNECTION_PROGRAM_MODE === 'quiesced' ? 'quiesced' : 'running';
  if (process.env.SUPERCODE_CONNECTION_PROGRAM_MODE && status !== 'quiesced') fail('unsupported startup mode');
  const active = new Set();
  let controls = Promise.resolve(), receipt = null;
  const genericDebt = () => journal.entries('mutation-intent').filter(entry => !journal.entries('mutation-result').some(result => result.value.id === entry.value.id));
  const debt = () => {
    const unknown = Object.keys(legacy.intents).length + genericDebt().length, rooms = roomDebt();
    const run = Object.values(state.runSeats ?? {}).reduce((sum, seats) => sum + Object.keys(seats).length, 0);
    return { outstanding: unknown + run + rooms.unknown + rooms.unreadable + rooms.unclosed,
      unknown: unknown + rooms.unknown + rooms.unreadable, run, room: rooms };
  };
  const sameBinding = other => other && Object.keys(binding).every(key => other[key] === binding[key]) && Object.keys(other).length === Object.keys(binding).length;
  const snapshot = () => ({ binding, status, readiness: readiness(), debt: debt(), receipt });
  function send(message) { if (process.connected) process.send(message, () => {}); }
  function announce() {
    if (binding) send({ type: 'connection-program-ready', ...snapshot() });
  }
  function persistReceipt(extra) {
    const candidate = { binding, ...extra };
    receipt = null; journal.append('lifecycle-receipt', candidate);
    receipt = candidate;
    return receipt;
  }
  async function quiesce() {
    if (status !== 'quiesced') {
      status = 'quiescing'; announce();
      await pause();
      await Promise.allSettled([...active]);
      status = 'quiesced';
    }
    if (receipt?.Z) persist();
    else persistReceipt({ quiesced: true, persisted: true });
    announce();
    return snapshot();
  }
  async function control(frame) {
    if (!binding || !sameBinding(frame.binding)) fail('control binding differs from this generation');
    if (frame.action === 'quiesce') return quiesce();
    if (frame.action === 'compensate') {
      await quiesce();
      if (frame.protocol !== 2 || !owner || typeof frame.operation !== 'string' || !Number.isSafeInteger(frame.expectedRevision)) fail('capable recovery needs the original native operation and live versioned parent channel');
      if (Object.keys(legacy.intents).length || genericDebt().length) fail('unanswered generic/legacy product mutations retain recovery debt');
      if (!/^[0-9a-f]{64}$/.test(frame.predecessor)) fail('an exact predecessor receipt digest is required');
      const predecessor = readProgram(frame.predecessorReceipt ?? frame.qualification?.predecessor?.receipt, frame.predecessor);
      const supported = artifact.value.lifecycle.compensation?.predecessors?.find(row => row.revision === predecessor.value.source.revision);
      const nextCapable = predecessor.value.lifecycle?.protocol === 2 && predecessor.value.lifecycle.compensation?.protocol === 2;
      if (!nextCapable && (!supported || predecessor.value.lifecycle?.state?.arcVersion !== supported.arcVersion
        || supported.files.length !== predecessor.value.files.length || supported.files.some(row => predecessor.value.files.find(file => file.path === row.path)?.sha256 !== row.sha256))) fail('predecessor is not the exact supported capability');
      status = 'compensating';
      let Z;
      try { Z = await recover({ operation: frame.operation, expectedRevision: frame.expectedRevision, predecessor }); }
      finally { status = 'quiesced'; }
      if (Z?.kind === 'lineage-pending') {
        persistReceipt({ protocol: 2, quiesced: true, persisted: true, predecessor: predecessor.sha256, lineage: Z });
        return snapshot();
      }
      persistReceipt({ protocol: 2, quiesced: true, persisted: true, predecessor: predecessor.sha256, Z, digest: digestValue(Z) });
      return snapshot();
    }
    if (frame.action === 'lineage-accept') {
      if (status !== 'quiesced' || frame.protocol !== 2 || !owner || typeof frame.operation !== 'string'
        || !Number.isSafeInteger(frame.expectedRevision) || typeof acceptLineage !== 'function') fail('lineage validation needs the exact quiesced capable predecessor');
      return { ...snapshot(), lineage: await acceptLineage({ operation: frame.operation, expectedRevision: frame.expectedRevision }) };
    }
    if (frame.action === 'resume') {
      if (status !== 'quiesced') fail('resume requires a quiesced child');
      if (frame.operation !== undefined || journal.entries('recovery-admitted').length) {
        if (frame.protocol !== 2 || !owner || typeof frame.operation !== 'string' || !Number.isSafeInteger(frame.expectedRevision)) fail('recovery resume requires the live original native readiness owner');
        const actual = await owner('recovery-readiness', { operation: frame.operation, expectedRevision: frame.expectedRevision });
        const branch = actual.sourceDecision?.branch, ready = actual.readiness, ack = ready?.acknowledgement;
        if (actual.protocol !== 1 || actual.operation !== frame.operation || actual.revision !== frame.expectedRevision
          || !['precommit', 'committed'].includes(branch)
          || actual.phase !== (branch === 'precommit' ? 'dependent-predecessor' : 'committed-serving')
          || ready?.branch !== branch || ready.selection !== selection || ready.artifact !== binding.artifact
          || !/^[a-f0-9]{64}$/.test(ready.inventoryDigest ?? '') || ack?.protocol !== 1
          || ack.kind !== (branch === 'precommit' ? 'native-predecessor-ready' : 'committed-native-ready')
          || ack.operation !== frame.operation || ack.sourceDecisionDigest !== actual.sourceDecision.digest
          || ack.selection !== selection || ack.inventoryDigest !== ready.inventoryDigest || typeof ack.reference !== 'string' || !ack.reference) fail('native ordered branch readiness does not admit this exact child');
        journal.append('native-readiness', actual);
        if (branch === 'precommit') await adoptLineage(actual);
      }
      receipt = null; journal.append('lifecycle-resume', { binding });
      status = 'running'; resume(); announce();
      return snapshot();
    }
    fail(`unsupported control ${frame.action}`);
  }
  if (binding) process.once('disconnect', () => {
    void quiesce().then(() => parentDisconnected(), error => { log('orphan-quiesce-failed', { message: error.message }); parentDisconnected(error); });
  });
  if (binding) process.on('message', frame => {
    if (!frame || typeof frame.id !== 'string' || frame.type === 'connection-program-owner-result') return;
    const answer = async () => {
      try {
        if (!sameBinding(frame.binding)) fail('control binding differs from this generation');
        const found = frame.action === 'status' ? snapshot() : await control(frame);
        send({ id: frame.id, ok: true, ...found });
      } catch (error) {
        log('lifecycle-refused', { action: frame.action, message: error.message });
        send({ id: frame.id, ok: false, ...snapshot(), error: error.message });
      }
    };
    if (frame.action === 'status') void answer();
    else controls = controls.then(answer, answer);
  });
  async function mutate(operation, effect) {
    if (!['running', 'compensating'].includes(status)) fail('projection is quiesced');
    const signature = digest(JSON.stringify(operation));
    if (genericDebt().some(entry => entry.value.signature === signature)) fail('this mutation has an unanswered durable intent');
    const id = randomUUID();
    const intent = { id, selection, binding, operation, signature };
    receipt = null;
    journal.append('mutation-intent', intent); // Complete input is durable and read back before dispatch.
    const work = (async () => {
      try {
        const result = await effect();
        journal.append('mutation-result', { id, resultDigest: digestValue(result) }); announce();
        return result;
      } catch (error) {
        // Generic 4xx, malformed replies and lost local persistence are all
        // unresolved. This API has no versioned terminal no-effect contract.
        journal.append('mutation-unknown', { id, code: error.code ?? null, status: error.status ?? null });
        announce(); throw error;
      }
    })();
    active.add(work);
    try { return await work; } finally { active.delete(work); }
  }
  persist();
  async function conditional(effect) {
    if (!['running', 'compensating'].includes(status)) fail('projection is quiesced');
    const work = effect(); active.add(work);
    try { return await work; } finally { active.delete(work); announce(); }
  }
  return { binding, artifact, selection, journal, owner, debt, snapshot, announce, quiesce, mutate, conditional, get paused() { return status !== 'running'; } };
}
