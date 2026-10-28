// Fresh capable selected-program recovery. Native owns admission/source phases; this owner closes its own Room effects.
import { canonical, copy, digestValue, refuse } from './recovery-journal.mjs';
import { positiveDemand } from './demand.mjs';

const same = (a, b) => canonical(a) === canonical(b);
const address = row => row && typeof row.registration === 'string' && row.reference !== undefined
  ? { registration: row.registration, reference: row.reference } : null;

export function createRecovery({ journal, owner, rooms, binding, selection, config, configDigest, state, actor, persist, transport }) {
  function identityOf(status) {
    if (status?.protocol !== 1 || typeof status.operation !== 'string' || !Number.isSafeInteger(status.revision)
      || !['precommit', 'committed'].includes(status.sourceDecision?.branch) || typeof status.sourceDecision?.id !== 'string'
      || !/^[a-f0-9]{64}$/.test(status.sourceDecision?.digest ?? '') || !status.controls
      || ['N', 'T', 'L', 'R'].some(key => !status.controls[key]) || typeof status.invocation?.id !== 'string'
      || status.selected?.artifact !== binding.artifact || status.selected?.selection !== selection
      || status.selected?.transaction !== binding.transaction || status.selected?.configDigest !== configDigest
      || !/^[a-f0-9]{64}$/.test(status.predecessor?.artifact ?? '')) refuse('native owner supplied no exact admitted selected operation');
    return { operation: status.operation, admissionRevision: status.revision, sourceDecision: status.sourceDecision, selection, artifact: binding.artifact,
      predecessor: status.predecessor.artifact, invocation: status.invocation, controls: status.controls,
      configDigest, connection: binding.connection, transaction: binding.transaction, actor };
  }
  function bind(status) {
    const identity = identityOf(status);
    const previous = journal.entries('recovery-admitted').filter(entry => entry.value.identity.operation === identity.operation);
    if (previous.length && previous.some(entry => !same(entry.value.identity, identity))) refuse('recovery cannot rebind an original invocation, source decision or concrete control');
    if (!previous.length) journal.append('recovery-admitted', { identity });
    return identity;
  }
  function validateCut(cut, status, identity) {
    if (cut?.protocol !== 1 || cut.operation !== identity.operation || cut.revision !== status.revision
      || !same(cut.sourceDecision, identity.sourceDecision) || !same(cut.controls, identity.controls)
      || typeof cut.native?.source !== 'string' || !Array.isArray(cut.native.cards)
      || !Array.isArray(cut.native.candidateAgentIds) || !Array.isArray(cut.teams?.endedCut)
      || cut.native.recordsDigest !== digestValue({ cards: cut.native.cards, candidateAgentIds: cut.native.candidateAgentIds })
      || !same(cut.teams.control, identity.controls.T) || !Array.isArray(cut.providers)) refuse('native/Teams/source closure cut is incomplete or belongs to another operation');
    return positiveDemand({ cards: cut.native.cards, candidateAgentIds: cut.native.candidateAgentIds, endedCut: cut.teams.endedCut, config });
  }
  async function providerClosure(status, identity, expectedOwners) {
    const result = await owner('provider-closure', { operation: identity.operation, expectedRevision: status.revision });
    // The actual native phase owner calls each issuing Agents/Cards actor's
    // qualified closure door. A file or recover() argument cannot supply this.
    if (result?.protocol !== 1 || result.operation !== identity.operation || !same(result.controls, identity.controls)
      || !Array.isArray(result.owners) || result.owners.length !== expectedOwners.length) refuse('issuing provider closure inventory is unavailable');
    const seen = new Set();
    for (const expected of expectedOwners) {
      const found = result.owners.filter(row => same(row.identity, expected));
      if (found.length !== 1 || seen.has(canonical(expected))) refuse('provider owner/epoch inventory differs');
      seen.add(canonical(expected));
      const row = found[0];
      if (row.contract !== 'rh2-provider-source-closure/v1' || !Array.isArray(row.manifests)
        || !Array.isArray(row.closedStatuses) || row.manifests.length !== row.closedStatuses.length
        || !row.sourceSeal || !row.catalogue || row.inventoryDigest !== digestValue({ identity: row.identity,
          sourceSeal: row.sourceSeal, catalogue: row.catalogue, manifests: row.manifests, closedStatuses: row.closedStatuses })) refuse('provider closure has no exact owner-bound sealed inventory');
      // Wire command details stay with the RH2/provider owner. Its native
      // adapter returns this capsule only after exact current-read validation,
      // terminal/never-admitted closure and sealed-epoch catalogue matching.
      // No boolean supplied by an operator is accepted here as that adapter.
    }
    journal.append('provider-closure', result);
    return result;
  }
  function projectFor(roomId) {
    const projects = Object.keys(state.projects ?? {}).filter(project => state.projects[project] === roomId);
    if (projects.length !== 1) refuse(`owned Room ${roomId} has no unique source-bound project`);
    return projects[0];
  }
  async function resolveRoles(demand) {
    const resolved = [];
    for (const role of demand.roles) {
      const query = new URLSearchParams({ registration: config.rh2.agentsRegistration, reference: role.agentId, kind: 'agent' });
      const result = await transport(`/api/v3/organizations/${encodeURIComponent(config.rh2.organization)}/principals/resolve?${query}`);
      journal.append('positive-role-resolution', { role, registration: config.rh2.agentsRegistration, result });
      if (typeof result?.principal?.principalId !== 'string') refuse('a positive native role has no current qualified representation');
      resolved.push({ ...role, principalId: result.principal.principalId });
    }
    return resolved;
  }
  function runsFor(basis, demand, project, principalId, expectedSession) {
    if (!Array.isArray(basis.inputs.tasks) || !Array.isArray(basis.inputs.work)) refuse('the complete basis omits task/work demand');
    const result = [];
    for (const run of demand.runs.filter(run => run.project === project)) {
      const tasks = basis.inputs.tasks.filter(task => task.record_reference?.card === run.cardId
        && task.record_reference.source === config.teams.source && task.record_reference.team === config.teams.team);
      const work = basis.inputs.work.filter(work => work.app_id === config.rh2.agentsRegistration
        && work.reference?.native === run.native && tasks.some(task => task.task_id === work.task_id));
      // A projected absence cannot negate a held positive native S. This basis
      // may prove the exact existing representation, otherwise recovery waits.
      if (tasks.length !== 1 || work.length !== 1 || !address(work[0].session)) refuse('a positive native run lacks an unambiguous qualified current work representation');
      if (work[0].principal_id === principalId && same(address(work[0].session), expectedSession)) result.push(run);
    }
    return result;
  }
  async function compensate(demand, identity, predecessor) {
    const resolvedRoles = await resolveRoles(demand);
    const disposition = [];
    const targets = new Map();
    for (const batch of rooms.batches()) {
      if (batch.purpose !== 'projection-run') continue;
      targets.set(canonical([batch.roomId, batch.input.principalId]), { roomId: batch.roomId, principalId: batch.input.principalId });
    }
    // A cache can expose extra debt, but cannot supply missing server lineage.
    for (const [roomId, placements] of Object.entries(state.runSeats ?? {})) for (const [principalId, placement] of Object.entries(placements)) {
      if (placement.owner !== selection || !targets.has(canonical([roomId, principalId]))) refuse('run placement has no original selected-program receipt history');
    }
    const planned = [];
    function retireCache(roomId, principalId) {
      const placement = state.runSeats?.[roomId]?.[principalId];
      if (!placement) return;
      if (placement.owner !== selection) refuse('a different selection owns the retained run cache debt');
      journal.append('run-cache-disposition', { roomId, principalId, owner: selection, placement });
      delete state.runSeats[roomId][principalId];
      if (!Object.keys(state.runSeats[roomId]).length) delete state.runSeats[roomId];
      persist();
    }
    for (const target of targets.values()) {
      const { roomId, principalId } = target, project = projectFor(roomId);
      const originals = rooms.originals(roomId, principalId);
      if (!originals.length) { disposition.push({ ...target, kind: 'no-applied-original' }); retireCache(roomId, principalId); continue; }
      const basis = await rooms.basis(roomId, principalId);
      const own = rooms.batches().filter(batch => batch.roomId === roomId && batch.input.principalId === principalId);
      const original = own.find(batch => batch.purpose === 'projection-run' && originals.some(ref => ref.namespace === batch.namespace.id));
      if (!original?.input.expectedSession) refuse('original run effect has no exact session S');
      const expectedSession = original.input.expectedSession;
      const roles = resolvedRoles.filter(role => role.project === project && role.principalId === principalId);
      const current = basis.inputs.principals.find(row => row.principal_id === principalId);
      if (!current) refuse('the complete atomic basis omits the exact existing representation');
      const currentAddress = address(current.kind === 'agent' ? current.current_session : current.participant);
      if (!same(currentAddress, expectedSession)) refuse('the actual representation changed its original exact session');
      const runs = runsFor(basis, demand, project, principalId, expectedSession);
      const positive = roles.length || runs.length;
      if (runs.length) {
        if (predecessor.value.lifecycle?.compensation?.protocol !== 2) refuse('predecessor cannot inherit a current run-only field lineage');
        refuse('current run lineage needs the actual exact predecessor inventory acknowledgement; metadata alone cannot transfer ownership');
      }
      const wanted = positive ? { answers: roles.some(role => role.answers === 'all') || runs.some(run => run.answers === 'all') ? 'all' : 'mentions',
        roleKeys: [...new Set([...roles.flatMap(role => role.roleKeys), ...runs.flatMap(run => run.roleKeys)])].sort() } : null;
      const input = { principalId, expectedSession, expectedSeatedBy: actor,
        ...(wanted ? { ...wanted, ...(config.postRoleKeys === undefined ? {} : { postRoleKeys: config.postRoleKeys }) } : {}) };
      // Save complete observed field vector and desired union. Server original
      // provenance decides borrowing/ABA, descendants and every atomic change.
      planned.push({ ...target, originals, basis, input, action: wanted ? 'join' : 'leave', wanted });
    }
    journal.append('inverse-plan', { identity, demand, steps: planned });
    for (const step of planned) {
      const batch = await rooms.prepare(step.action, step.roomId, step.input, { originalEffects: step.originals,
        invocation: identity.invocation.id, purpose: 'recovery-inverse', issuedBasis: step.basis, expected: { basis: step.basis, wanted: step.wanted } });
      const result = await rooms.dispatch(batch);
      if (!['applied', 'original-effect-absent'].includes(result.conditional.outcome)) refuse(`inverse retained debt: ${result.conditional.code ?? result.conditional.outcome}`);
      await rooms.finish(batch);
      rooms.dispose(batch);
      disposition.push({ roomId: step.roomId, principalId: step.principalId, kind: step.wanted ? 'retained-positive' : result.conditional.outcome,
        originalEffects: step.originals, inverse: { namespace: batch.namespace.id, operationId: batch.operationId } });
      journal.append('placement-disposition', disposition.at(-1));
      retireCache(step.roomId, step.principalId);
    }
    return disposition;
  }
  async function recover({ operation, expectedRevision, predecessor }) {
    const status = await owner('recovery-status', { operation, expectedRevision });
    if (status.operation !== operation) refuse('native status names another operation');
    const identity = bind(status), branch = identity.sourceDecision.branch;
    if (predecessor.sha256 !== identity.predecessor) refuse('native predecessor differs from the exact retained artifact');
    if (status.phase !== (branch === 'precommit' ? 'oa-compensation' : 'oa-committed-close')) refuse('native phase does not admit this selected-program act');
    const old = journal.entries('recovery-Z').filter(entry => entry.value.operation === operation);
    if (old.length) {
      if (old.some(entry => entry.value.branch !== branch)) refuse('source branch cannot change under an original acknowledgement');
      const z = old.at(-1).value;
      const providers = await providerClosure(status, identity, (await owner('recovery-cut', { operation, expectedRevision: status.revision })).providers);
      const roomInventory = await rooms.closeAll();
      if (digestValue(roomInventory) !== z.roomInventoryDigest || !same(providers.owners.map(row => ({ identity: row.identity, digest: row.inventoryDigest })), z.ownerInventoryDigests)) refuse('fresh current inventory differs from the retained acknowledgement');
      const final = await owner('recovery-status', { operation, expectedRevision: status.revision });
      if (!same(identityOf(final), identity) || final.phase !== status.phase) refuse('native admission changed during acknowledgement readback');
      return copy(z);
    }
    const cut = await owner('recovery-cut', { operation, expectedRevision: status.revision });
    const demand = validateCut(cut, status, identity);
    journal.append('recovery-cut', { identity, cut, demand });
    let providers = await providerClosure(status, identity, cut.providers);
    await rooms.closeAll();
    rooms.reconcileDispositions();
    const effects = branch === 'precommit' ? await compensate(demand, identity, predecessor) : [{ kind: 'committed-serving', selection }];
    const roomInventory = await rooms.closeAll();
    providers = await providerClosure(status, identity, cut.providers);
    const final = await owner('recovery-status', { operation, expectedRevision: status.revision });
    if (!same(identityOf(final), identity) || final.phase !== status.phase) refuse('native admission changed before durable acknowledgement');
    journal.append('recovery-final-inventories', { operation, providers, roomInventory, effects });
    const z = { protocol: 1, kind: branch === 'precommit' ? 'compensated' : 'committed-closed', operation, branch, admissionRevision: identity.admissionRevision,
      sourceDecision: identity.sourceDecision, selection, artifact: binding.artifact, predecessor: predecessor.sha256,
      invocation: identity.invocation, actor, controls: identity.controls,
      ownerInventoryDigests: providers.owners.map(row => ({ identity: row.identity, digest: row.inventoryDigest })),
      roomInventoryDigest: digestValue(roomInventory), effectDispositionDigest: digestValue(effects), journalHead: journal.head };
    journal.append('recovery-Z', z);
    return copy(z);
  }
  return { recover };
}
