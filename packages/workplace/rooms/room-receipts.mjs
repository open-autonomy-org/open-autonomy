// RH2 ADR0069 client for this selected publisher: immutable body-complete batches and current-authority closure.
import { randomBytes } from 'node:crypto';
import { canonical, closedInventory, copy, digestValue, hash, refuse, terminalDisposition } from './recovery-journal.mjs';

const pathOf = roomId => `/api/v3/rooms/${encodeURIComponent(roomId)}`;
const commandOf = action => action === 'join' ? 'rooms/join-member' : action === 'leave' ? 'rooms/leave-member' : refuse('unsupported conditional action');
const wireDigest = value => {
  const bytes = canonical(value, 0, 32);
  if (Buffer.byteLength(bytes) > 65_536) refuse('conditional body exceeds the RH2 bound');
  return hash(bytes);
};

export function createRoomReceipts({ journal, selection, binding, source, actor, organization, transport }) {
  const batches = () => journal.entries('room-manifest').map(entry => entry.value);
  const batchOf = id => {
    const found = batches().filter(batch => batch.namespace.id === id);
    if (found.length !== 1) refuse('unknown or duplicate original Room manifest');
    return found[0];
  };
  function observe(batch, result, via) {
    const disposition = terminalDisposition(result, batch.namespace.id, batch.operationId);
    const old = journal.entries('room-terminal').filter(entry => entry.value.namespace === batch.namespace.id
      && entry.value.disposition !== 'unreadable');
    if (disposition !== 'unreadable' && old.some(entry => canonical(entry.value.result) !== canonical(result))) refuse('immutable terminal receipt changed');
    journal.append('room-terminal', { namespace: batch.namespace.id, operationId: batch.operationId, via, disposition, result });
    return disposition;
  }
  async function basis(roomId, principalId) {
    const value = (await transport(`${pathOf(roomId)}/conditional-basis?principalId=${encodeURIComponent(principalId)}`)).basis;
    if (value?.complete !== true || value.scope?.roomId !== roomId || value.scope?.organizationId !== organization
      || value.actor?.principalId !== actor || typeof value.scope?.installationId !== 'string'
      || !/^app_[a-f0-9]+$/.test(value.scope?.registration ?? '') || !/^[a-f0-9]{64}$/.test(value.digest ?? '')
      || typeof value.id !== 'string' || !Array.isArray(value.principalIds) || !value.principalIds.includes(principalId)
      || !value.inputs || !value.revision || typeof value.validUntil !== 'string') refuse('RH2 returned no complete actor-bound atomic basis');
    return value;
  }
  function originals(roomId, principalId) {
    const found = [];
    const retired = new Set(journal.entries('room-disposition').flatMap(entry => entry.value.originalEffects.map(ref => canonical(ref))));
    for (const batch of batches()) {
      if (batch.roomId !== roomId || batch.input.principalId !== principalId) continue;
      const reference = { namespace: batch.namespace.id, operationId: batch.operationId };
      if (retired.has(canonical(reference)) || batch.purpose.endsWith('-inverse')) continue;
      const receipts = journal.entries('room-terminal').filter(entry => entry.value.namespace === batch.namespace.id);
      if (!receipts.length) {
        const closure = journal.entries('room-closed').filter(entry => entry.value.namespace === batch.namespace.id).at(-1);
        if (closure?.value.inventory.operations.every(operation => operation.disposition === 'never-admitted')) continue;
        refuse('an original Room effect is unknown');
      }
      if (receipts.at(-1).value.disposition === 'unreadable') refuse('an original Room effect is currently unreadable');
      const terminal = receipts.at(-1).value;
      if (terminal.disposition === 'applied') found.push(reference);
    }
    return found;
  }
  async function prepare(action, roomId, supplied, { originalEffects = [], invocation = binding.generation, purpose = 'projection-role', expected = null, issuedBasis } = {}) {
    const input = copy(supplied);
    const current = issuedBasis === undefined ? await basis(roomId, input.principalId) : copy(issuedBasis);
    if (current.scope?.roomId !== roomId || current.actor?.principalId !== actor
      || !current.principalIds?.includes(input.principalId) || current.complete !== true) refuse('the issued basis does not name this exact effect');
    if (input.expectedSession === undefined) {
      const principal = current.inputs.principals?.find(row => row.principal_id === input.principalId);
      if (['agent', 'session'].includes(principal?.kind)) {
        // Normal projection keeps the actual atomic remote address; it never
        // ranks native activity. Recovery must supply its original exact S.
        if (!['projection-role', 'projection-run'].includes(purpose)) refuse('inverse has no original exact session');
        const address = principal.kind === 'agent' ? principal.current_session : principal.participant;
        if (typeof address?.registration !== 'string' || address.reference === undefined) refuse('current representation has no exact address');
        input.expectedSession = { registration: address.registration, reference: address.reference };
      }
    }
    for (const original of originalEffects) {
      const batch = batchOf(original.namespace);
      if (original.operationId !== batch.operationId || batch.roomId !== roomId || batch.input.principalId !== input.principalId
        || !originals(roomId, input.principalId).some(row => canonical(row) === canonical(original))) refuse('original effect is outside this selection and exact placement');
    }
    const registration = current.scope.registration;
    const namespace = { version: 1, id: randomBytes(16).toString('hex'),
      source: { registration, reference: copy(source) },
      selection: { registration, reference: { selection, artifact: binding.artifact, transaction: binding.transaction } },
      invocation: { registration, reference: { id: invocation } }, operations: [] };
    const operationId = 'operation';
    const conditional = { version: 1, namespace, operationId, basis: { id: current.id, digest: current.digest }, originalEffects: copy(originalEffects) };
    const { operations: _operations, ...identity } = namespace;
    namespace.operations.push({ id: operationId, command: commandOf(action), digest: wireDigest({ command: commandOf(action),
      input: { ...input, roomId }, conditional: { ...conditional, namespace: identity } }) });
    const batch = { roomId, actor, organization, selection, invocation, purpose, expected: copy(expected), basis: current,
      input: copy(input), action, operationId, namespace, body: { ...input, conditional } };
    journal.append('room-manifest', batch); // Complete body and basis precede any dispatch, including first admission.
    return copy(batch);
  }
  async function dispatch(batch) {
    const retained = batchOf(batch.namespace.id);
    if (canonical(retained) !== canonical(batch)) refuse('dispatch differs from its immutable manifest');
    journal.append('room-dispatch', { namespace: batch.namespace.id, operationId: batch.operationId });
    // Any thrown HTTP error, lost/malformed answer or persistence failure leaves
    // the manifested operation owed. Generic 4xx is never terminal no effect.
    const result = await transport(`${pathOf(batch.roomId)}/${batch.action}`, { method: 'POST', body: batch.body });
    const disposition = observe(batch, result, 'effect');
    if (disposition === 'unreadable') refuse('committed terminal reading is unavailable; original effect debt remains');
    return result;
  }
  async function status(batch) {
    const result = await transport(`${pathOf(batch.roomId)}/command-receipts?namespace=${encodeURIComponent(canonical(batch.namespace))}`);
    journal.append('room-status', { namespace: batch.namespace.id, result });
    if (result?.namespace !== batch.namespace.id || !Array.isArray(result.operations)
      || result.operations.length !== batch.namespace.operations.length) refuse('Room receipt inventory differs');
    for (const expected of batch.namespace.operations) {
      const found = result.operations.filter(operation => operation.id === expected.id);
      if (found.length !== 1) refuse('Room operation inventory differs');
      if (found[0].state === 'terminal') observe(batch, found[0].result, 'status');
      else if (!['unknown', 'never-admitted'].includes(found[0].state)) refuse('unsupported Room operation status');
    }
    return result;
  }
  async function close(batch) {
    journal.append('room-close-intent', { namespace: batch.namespace.id });
    const result = await transport(`${pathOf(batch.roomId)}/command-receipts/close`, { method: 'POST', body: { namespace: batch.namespace } });
    // Keep even a currently unreadable irreversible close answer before refusal.
    journal.append('room-close-result', { namespace: batch.namespace.id, result });
    for (const operation of result.operations ?? []) if (operation.state === 'terminal') observe(batch, operation.result, 'close');
    const closed = closedInventory(result, batch.namespace);
    journal.append('room-closed', { namespace: batch.namespace.id, inventory: closed, digest: digestValue(closed) });
    return closed;
  }
  async function closeAll() {
    const inventory = [];
    for (const batch of batches()) {
      await close(batch);
      // A stored old reading is no new grant. Resolve the exact closed namespace
      // again under current standing before publishing this invocation's Z.
      const current = closedInventory(await status(batch), batch.namespace);
      inventory.push({ roomId: batch.roomId, actor: batch.actor, manifest: batch.namespace, inventory: current });
    }
    return inventory;
  }
  async function finish(batch) {
    await close(batch);
    return closedInventory(await status(batch), batch.namespace);
  }
  function dispose(batch) {
    if (!batch.purpose.endsWith('-inverse') || !batch.body.conditional.originalEffects.length) refuse('disposition needs a manifested inverse and original identities');
    const closure = journal.entries('room-closed').filter(entry => entry.value.namespace === batch.namespace.id).at(-1)?.value.inventory;
    const terminal = journal.entries('room-terminal').filter(entry => entry.value.namespace === batch.namespace.id).at(-1)?.value;
    if (!closure || !['applied', 'original-effect-absent'].includes(terminal?.disposition)) refuse('an unreadable or unresolved inverse cannot retire original effects');
    const value = { roomId: batch.roomId, principalId: batch.input.principalId,
      originalEffects: copy(batch.body.conditional.originalEffects), inverse: { namespace: batch.namespace.id, operationId: batch.operationId },
      disposition: terminal.disposition, closureDigest: digestValue(closure) };
    const old = journal.entries('room-disposition').find(entry => entry.value.inverse.namespace === batch.namespace.id);
    if (old && canonical(old.value) !== canonical(value)) refuse('original disposition changed');
    if (!old) journal.append('room-disposition', value);
    return copy(value);
  }
  function reconcileDispositions() {
    // A crash between the remote inverse and the local disposition does not
    // create a second inverse. Its exact now-readable closed receipt settles it.
    for (const batch of batches().filter(batch => batch.purpose.endsWith('-inverse'))) {
      const terminal = journal.entries('room-terminal').filter(entry => entry.value.namespace === batch.namespace.id).at(-1)?.value;
      if (['applied', 'original-effect-absent'].includes(terminal?.disposition)) dispose(batch);
    }
  }
  async function settlePlacement(roomId, principalId) {
    for (const batch of batches().filter(batch => batch.roomId === roomId && batch.input.principalId === principalId)) await finish(batch);
    reconcileDispositions();
  }
  const debt = () => {
    let unknown = 0, unreadable = 0, unclosed = 0;
    for (const batch of batches()) {
      const last = journal.entries('room-terminal').filter(entry => entry.value.namespace === batch.namespace.id).at(-1)?.value;
      const closure = journal.entries('room-closed').some(entry => entry.value.namespace === batch.namespace.id);
      if (!last) {
        if (!closure) unknown++;
      } else if (last.disposition === 'unreadable') unreadable++;
      if (!closure) unclosed++;
    }
    return { unknown, unreadable, unclosed };
  };
  return { basis, originals, prepare, dispatch, status, close, closeAll, finish, dispose, reconcileDispositions, settlePlacement, debt, batches };
}
