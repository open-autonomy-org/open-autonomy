// Explicit v2 predecessor handoff. Native retains the actual child offer/acceptance in its original protected operation.
import { canonical, copy, digestValue, refuse } from './recovery-journal.mjs';

const same = (a, b) => canonical(a) === canonical(b);
const bounded = value => {
  if (Buffer.byteLength(canonical(value)) > 4 * 1024 * 1024) refuse('complete lineage capsule exceeds the private owner bound');
  return value;
};
function validateOffer(offer) {
  if (offer?.protocol !== 1 || offer.kind !== 'rooms-original-lineage-offer' || typeof offer.operation !== 'string'
    || !Number.isSafeInteger(offer.admissionRevision) || offer.branch !== 'precommit'
    || !/^[a-f0-9]{64}$/.test(offer.sourceDecisionDigest ?? '') || !offer.controls || !offer.invocation
    || !Array.isArray(offer.placements) || !offer.placements.length || !offer.actor
    || !Array.isArray(offer.originalInventory?.batches) || !Array.isArray(offer.originalInventory?.roomInventory)
    || !Array.isArray(offer.originalInventory?.activeLineage)
    || offer.originalInventoryDigest !== digestValue(offer.originalInventory)) refuse('lineage offer has no exact complete original inventory');
  const keys = offer.placements.map(row => canonical([row.roomId, row.principalId]));
  if (new Set(keys).size !== keys.length || offer.originalInventory.activeLineage.length !== keys.length) refuse('lineage placement inventory is incomplete or ambiguous');
  for (const placement of offer.placements) {
    const active = offer.originalInventory.activeLineage.filter(row => row.roomId === placement.roomId && row.principalId === placement.principalId);
    if (placement.kind !== 'retained-positive-handoff' || active.length !== 1 || !active[0].originalEffects.length
      || !Array.isArray(placement.runs) || !['agent', 'session'].includes(placement.representationKind)
      || typeof placement.expectedSession?.registration !== 'string' || placement.expectedSession.reference === undefined
      || !['all', 'mentions'].includes(placement.wanted?.answers) || !Array.isArray(placement.wanted.roleKeys)
      || !placement.originalEffects.every(ref => active[0].originalEffects.some(item => same(item, ref)))
      || !active[0].originalEffects.some(ref => same(ref, placement.inverse))) refuse('retained placement has no complete original and reduced field chain');
  }
  for (const side of ['candidate', 'predecessor']) for (const field of ['selection', 'artifact']) {
    if (!/^[a-f0-9]{64}$/.test(offer[side]?.[field] ?? '')) refuse('lineage offer omits an immutable selected artifact');
  }
  bounded(offer);
}
function validateAcceptance(offer, value) {
  const expected = { protocol: 1, kind: 'rooms-lineage-accepted', operation: offer.operation, admissionRevision: offer.admissionRevision,
    sourceDecisionDigest: offer.sourceDecisionDigest, candidate: offer.candidate, predecessor: offer.predecessor,
    offerDigest: digestValue(offer), originalInventoryDigest: offer.originalInventoryDigest, actor: offer.actor,
    currentInventoryDigest: digestValue(offer.originalInventory.roomInventory) };
  if (!same(value, expected)) refuse('actual predecessor acknowledgement differs from the exact complete lineage offer');
  return expected;
}

export function createLineage({ owner, rooms, journal, binding, selection, actor, configDigest }) {
  async function readOffer(operation, expectedRevision) {
    const live = await owner('recovery-lineage-offer', { operation, expectedRevision });
    const offer = live?.offer;
    validateOffer(offer);
    if (live.protocol !== 1 || live.operation !== operation || live.revision !== expectedRevision
      || live.sourceDecision?.branch !== 'precommit' || live.phase !== 'oa-compensation'
      || live.sourceDecision.digest !== offer.sourceDecisionDigest || live.offerDigest !== digestValue(offer)
      || live.selected?.configDigest !== offer.configDigest
      || !same(live.controls, offer.controls) || !same(live.invocation, offer.invocation)
      || live.selected?.artifact !== offer.candidate.artifact || live.selected.selection !== offer.candidate.selection
      || live.predecessor?.artifact !== offer.predecessor.artifact || live.predecessor.selection !== offer.predecessor.selection) refuse('protected native lineage offer does not belong to this original admitted operation');
    return { live, offer };
  }
  function offer({ identity, predecessorSelection, placements, roomInventory }) {
    const activeLineage = placements.map(placement => ({ roomId: placement.roomId, principalId: placement.principalId,
      originalEffects: rooms.originals(placement.roomId, placement.principalId) }));
    const originalInventory = { batches: rooms.batches(), roomInventory, activeLineage };
    const value = bounded({ protocol: 1, kind: 'rooms-original-lineage-offer', operation: identity.operation,
      admissionRevision: identity.admissionRevision, branch: 'precommit', sourceDecisionDigest: identity.sourceDecision.digest,
      controls: identity.controls, invocation: identity.invocation, candidate: { artifact: binding.artifact, selection },
      predecessor: { artifact: identity.predecessor, selection: predecessorSelection }, actor, configDigest,
      placements, originalInventory, originalInventoryDigest: digestValue(originalInventory) });
    validateOffer(value);
    const old = journal.entries('lineage-offer').find(entry => entry.value.operation === identity.operation);
    if (old && !same(old.value, value)) refuse('an original lineage offer cannot rebind its inventory');
    if (!old) journal.append('lineage-offer', value);
    return copy(value);
  }
  async function acknowledge(value) {
    validateOffer(value);
    const actual = await owner('recovery-lineage-ack', { operation: value.operation, expectedRevision: value.admissionRevision });
    if (actual?.protocol !== 1 || actual.operation !== value.operation || actual.revision !== value.admissionRevision
      || actual.sourceDecision?.digest !== value.sourceDecisionDigest || actual.sourceDecision.branch !== 'precommit'
      || actual.phase !== 'oa-compensation' || !same(actual.controls, value.controls)
      || actual.offerDigest !== digestValue(value) || !actual.acknowledgement) return null;
    validateAcceptance(value, actual.acknowledgement);
    if (actual.acknowledgementDigest !== digestValue(actual.acknowledgement)) refuse('protected predecessor acknowledgement digest differs');
    journal.append('lineage-acknowledgement', actual);
    return copy(actual);
  }
  async function accept({ operation, expectedRevision }) {
    const { live, offer: value } = await readOffer(operation, expectedRevision);
    if (live.predecessor.artifact !== binding.artifact || live.predecessor.selection !== selection
      || value.actor !== actor || value.configDigest !== configDigest) refuse('this quiesced child is not the exact compatible predecessor/actor/config');
    // Current reads through this predecessor's own installation are essential;
    // source bytes, old receipts and the candidate's old grant are not authority.
    await rooms.inspectLineage(value.originalInventory);
    const acknowledgement = validateAcceptance(value, { protocol: 1, kind: 'rooms-lineage-accepted', operation,
      admissionRevision: expectedRevision, sourceDecisionDigest: value.sourceDecisionDigest,
      candidate: value.candidate, predecessor: value.predecessor, offerDigest: digestValue(value),
      originalInventoryDigest: value.originalInventoryDigest, actor,
      currentInventoryDigest: digestValue(value.originalInventory.roomInventory) });
    // Native durably records this exact actual-child message. This child does
    // not claim persistence or acquire an ordinary writable FD under held N.
    return { protocol: 1, kind: 'rooms-lineage-acceptance', offerDigest: digestValue(value), acknowledgement,
      acknowledgementDigest: digestValue(acknowledgement) };
  }
  async function adopt(readiness) {
    const { offer: value } = await readOfferForReadiness(readiness);
    if (value === null) return null;
    const actual = await owner('recovery-lineage-ack', { operation: readiness.operation, expectedRevision: readiness.revision });
    if (!actual?.acknowledgement || actual.offerDigest !== digestValue(value)
      || actual.acknowledgementDigest !== digestValue(actual.acknowledgement)) refuse('admitted predecessor has no protected durable lineage acceptance');
    validateAcceptance(value, actual.acknowledgement);
    if (readiness.readiness?.selection !== selection || readiness.readiness.artifact !== binding.artifact
      || value.predecessor.selection !== selection || value.predecessor.artifact !== binding.artifact) refuse('lineage startup names another predecessor');
    await rooms.inspectLineage(value.originalInventory);
    rooms.adoptLineage(value, actual, readiness);
    return copy(value);
  }
  async function readOfferForReadiness(readiness) {
    // The original offer remains readable in later lifecycle phases, but does
    // not permit a second inverse or a release of any original control.
    const live = await owner('recovery-lineage-offer', { operation: readiness.operation, expectedRevision: readiness.revision });
    const value = live?.offer;
    if (value === null && live?.protocol === 1 && live.operation === readiness.operation
      && live.sourceDecision?.digest === readiness.sourceDecision?.digest && same(live.controls, readiness.controls)) return { live, offer: null };
    validateOffer(value);
    if (live.offerDigest !== digestValue(value) || live.operation !== readiness.operation
      || live.sourceDecision?.digest !== readiness.sourceDecision?.digest || !same(live.controls, readiness.controls)) refuse('startup lineage is not the original protected offer');
    return { live, offer: value };
  }
  return { offer, acknowledge, accept, adopt };
}
