// Project Rooms' owner-bound lifecycle and durable mutation journal. Only the connection's existing IPC parent controls it.
import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

export function createLifecycle({ state, configPath, statePath, persist, pause, resume, compensate, readiness, parentDisconnected, log }) {
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
    if (metadata.protocol !== 1 || metadata.transport !== 'node-ipc' || metadata.state?.journalVersion !== 1
      || JSON.stringify(metadata) !== JSON.stringify(artifact.value.lifecycle)
      || JSON.stringify([...metadata.files].sort()) !== JSON.stringify(artifact.value.files.map(file => file.path).sort())) fail('unsupported artifact lifecycle');
  }
  const logical = value => JSON.stringify(Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'generation').sort(([a], [b]) => a.localeCompare(b))));
  const selection = digest(binding ? logical(binding) : JSON.stringify({ program: directory, config: canonical(resolve(configPath)), state: canonical(resolve(statePath)) }));
  state.publisherLifecycle ??= { version: 1, intents: {} };
  const journal = state.publisherLifecycle;
  if (journal.version !== 1 || !journal.intents || typeof journal.intents !== 'object') fail('unsupported durable journal');
  for (const intent of Object.values(journal.intents)) intent.phase = 'unknown';
  let status = process.env.SUPERCODE_CONNECTION_PROGRAM_MODE === 'quiesced' ? 'quiesced' : 'running';
  if (process.env.SUPERCODE_CONNECTION_PROGRAM_MODE && status !== 'quiesced') fail('unsupported startup mode');
  const active = new Set();
  let controls = Promise.resolve(), receipt = null;
  const debt = () => {
    const intents = Object.values(journal.intents), run = Object.values(state.runSeats ?? {}).reduce((sum, seats) => sum + Object.keys(seats).length, 0);
    return { outstanding: intents.length + run, unknown: intents.filter(intent => intent.phase === 'unknown').length, run };
  };
  const sameBinding = other => other && Object.keys(binding).every(key => other[key] === binding[key]) && Object.keys(other).length === Object.keys(binding).length;
  const snapshot = () => ({ binding, status, readiness: readiness(), debt: debt(), receipt });
  function send(message) { if (process.connected) process.send(message, () => {}); }
  function announce() {
    if (binding) send({ type: 'connection-program-ready', ...snapshot() });
  }
  function persistReceipt(extra) {
    const candidate = { binding, ...extra };
    receipt = null; journal.receipt = candidate;
    persist();
    receipt = candidate;
    return receipt;
  }
  async function quiesce() {
    if (status !== 'quiesced') {
      status = 'quiescing';
      await pause();
      await Promise.allSettled([...active]);
      status = 'quiesced';
    }
    if (receipt?.compensated && debt().outstanding === 0) persist();
    else persistReceipt({ quiesced: true, persisted: true });
    return snapshot();
  }
  async function control(frame) {
    if (!binding || !sameBinding(frame.binding)) fail('control binding differs from this generation');
    if (frame.action === 'quiesce') return quiesce();
    if (frame.action === 'compensate') {
      await quiesce();
      if (debt().unknown || Object.keys(journal.intents).length) fail('unanswered product mutations retain recovery debt');
      if (!/^[0-9a-f]{64}$/.test(frame.predecessor)) fail('an exact predecessor receipt digest is required');
      const predecessor = readProgram(frame.predecessorReceipt ?? frame.qualification?.predecessor?.receipt, frame.predecessor);
      const supported = artifact.value.lifecycle.compensation?.predecessors?.find(row => row.revision === predecessor.value.source.revision);
      if (!supported || predecessor.value.lifecycle?.state?.arcVersion !== supported.arcVersion
        || supported.files.length !== predecessor.value.files.length || supported.files.some(row => predecessor.value.files.find(file => file.path === row.path)?.sha256 !== row.sha256)) fail('predecessor is not the exact compensated capability');
      status = 'compensating';
      try { await compensate({ selection, predecessor, mutate }); }
      finally { status = 'quiesced'; }
      if (debt().outstanding !== 0) fail('run cleanup or unanswered product effects remain owed');
      persistReceipt({ quiesced: true, compensated: true, persisted: true, predecessor: predecessor.sha256, runDebt: 0 });
      return snapshot();
    }
    if (frame.action === 'resume') {
      if (status !== 'quiesced') fail('resume requires a quiesced child');
      journal.receipt = null; receipt = null; persist();
      status = 'running'; resume(); announce();
      return snapshot();
    }
    fail(`unsupported control ${frame.action}`);
  }
  if (binding) process.once('disconnect', () => {
    void quiesce().then(() => parentDisconnected(), error => { log('orphan-quiesce-failed', { message: error.message }); parentDisconnected(error); });
  });
  if (binding) process.on('message', frame => {
    if (!frame || typeof frame.id !== 'string') return;
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
    if (Object.values(journal.intents).some(intent => intent.signature === signature)) fail('this mutation has an unanswered durable intent');
    const id = randomUUID();
    const intent = { selection, binding, operation, signature, phase: 'dispatched' };
    journal.intents[id] = intent;
    receipt = null; journal.receipt = null;
    persist(); // No remote effect is dispatched until its entire intent is durable and re-read.
    const work = (async () => {
      try {
        const result = await effect();
        delete journal.intents[id]; persist();
        return result;
      } catch (error) {
        if (error.remoteSettled === true) delete journal.intents[id];
        else { intent.phase = 'unknown'; journal.intents[id] = intent; }
        try { persist(); } catch (persistenceError) { intent.phase = 'unknown'; journal.intents[id] = intent; throw persistenceError; }
        throw error;
      }
    })();
    active.add(work);
    try { return await work; } finally { active.delete(work); }
  }
  if (status === 'running') journal.receipt = null;
  else if (binding && journal.receipt?.binding && logical(journal.receipt.binding) === logical(binding)) {
    const { binding: _previousGeneration, ...retained } = journal.receipt;
    if (!retained.compensated || debt().outstanding === 0) persistReceipt(retained);
  }
  persist();
  return { binding, selection, debt, snapshot, announce, quiesce, mutate, get paused() { return status !== 'running'; } };
}
