// Fresh capable selected-program recovery. Native owns admission/source phases; this owner closes its own Room effects.
import { canonical, copy, digestValue, refuse } from './recovery-journal.mjs';
import { positiveDemand, projectRoomKey } from './demand.mjs';
import { createLineage } from './lineage.mjs';

const same = (a, b) => canonical(a) === canonical(b);
const address = row => row && typeof row.registration === 'string' && row.reference !== undefined
  ? { registration: row.registration, reference: row.reference } : null;

export function createRecovery({ journal, owner, rooms, binding, selection, config, configDigest, state, actor, persist }) {
  const lineage = createLineage({ journal, owner, rooms, binding, selection, actor, configDigest });
  function identityOf(status) {
    if (status?.protocol !== 1 || typeof status.operation !== 'string' || !Number.isSafeInteger(status.revision)
      || !['precommit', 'committed'].includes(status.sourceDecision?.branch) || typeof status.sourceDecision?.id !== 'string'
      || !/^[a-f0-9]{64}$/.test(status.sourceDecision?.digest ?? '') || !status.controls
      || ['N', 'T', 'L', 'R'].some(key => !status.controls[key]) || typeof status.invocation?.id !== 'string'
      || status.selected?.artifact !== binding.artifact || status.selected?.selection !== selection
      || status.selected?.transaction !== binding.transaction || status.selected?.configDigest !== configDigest
      || !/^[a-f0-9]{64}$/.test(status.predecessor?.artifact ?? '')
      || !/^[a-f0-9]{64}$/.test(status.predecessor?.selection ?? '')) refuse('native owner supplied no exact admitted selected operation');
    return { operation: status.operation, admissionRevision: status.revision, sourceDecision: status.sourceDecision, selection, artifact: binding.artifact,
      predecessor: status.predecessor.artifact, predecessorSelection: status.predecessor.selection, invocation: status.invocation, controls: status.controls,
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
        || !row.sourceSeal || !row.catalogue || !row.representations || row.inventoryDigest !== digestValue({ identity: row.identity,
          sourceSeal: row.sourceSeal, catalogue: row.catalogue, manifests: row.manifests,
          closedStatuses: row.closedStatuses, representations: row.representations })) refuse('provider closure has no exact owner-bound sealed inventory');
      const current = row.sourceSeal.current, map = row.representations;
      if (row.sourceSeal.state !== 'terminal' || row.sourceSeal.original?.action !== 'seal'
        || current?.state !== 'held' || current.authority_id !== row.identity.authorityId
        || current.organization_id !== row.identity.organizationId || current.organization_id !== config.rh2.organization
        || current.app_id !== row.identity.appId || current.principal_id !== row.identity.principalId
        || current.installation_id !== row.identity.installationId || row.sourceSeal.original.controlId !== row.catalogue.controlId
        || row.sourceSeal.catalogue?.controlId !== row.catalogue.controlId || row.sourceSeal.catalogue.epoch !== row.catalogue.epoch
        || row.sourceSeal.catalogue.digest !== row.catalogue.digest || row.sourceSeal.catalogue.total !== row.catalogue.total
        || !Array.isArray(row.catalogue.entries) || row.catalogue.total !== row.catalogue.entries.length
        || new Set(row.catalogue.entries.map(entry => entry.id)).size !== row.catalogue.entries.length
        || row.catalogue.digest !== digestValue(row.catalogue.entries)
        || map.version !== 1 || map.controlId !== row.catalogue.controlId || map.sourceSeal?.epoch !== row.catalogue.epoch
        || map.sourceSeal.epoch !== current.epoch || map.sourceSeal.catalogueDigest !== row.catalogue.digest
        || map.sourceSeal.generation !== String(current.generation) || map.complete !== true
        || !Array.isArray(map.roles) || !Array.isArray(map.runs) || !Array.isArray(map.unresolved) || map.unresolved.length
        || map.total !== map.roles.length + map.runs.length) refuse('provider current representation map is incomplete or differs from the exact held source seal');
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
  function resolveRoles(demand, providers) {
    const agents = providers.owners.filter(row => row.identity.appId === config.rh2.agentsRegistration
      && row.sourceSeal.current.catalogue === 'agents-v1');
    if (agents.length !== 1) refuse('source closure does not contain the exact Agents issuer');
    const resolved = [];
    for (const role of demand.roles) {
      const rows = agents[0].representations.roles.filter(row => row.reference === role.agentId && row.kind === 'agent');
      if (rows.length !== 1 || typeof rows[0].principalId !== 'string') refuse('a positive native role has no current qualified representation');
      resolved.push({ ...role, principalId: rows[0].principalId });
    }
    return resolved;
  }
  function resolveRuns(demand, providers) {
    const cards = providers.owners.filter(row => row.sourceSeal.current.catalogue === 'cards-v1'
      && (!config.rh2.cardsPrincipalId || row.identity.principalId === config.rh2.cardsPrincipalId));
    if (cards.length !== 1) refuse('source closure does not contain the exact Cards issuer');
    const unique = new Map();
    for (const row of providers.owners) for (const run of row.representations.runs) unique.set(canonical(run), run);
    return demand.runs.map(run => {
      const rows = [...unique.values()].filter(row => row.native === run.native && row.card?.registration === cards[0].identity.appId
        && row.card.reference?.card === run.cardId && row.card.reference.source === config.teams.source
        && row.card.reference.team === config.teams.team && row.workSource?.registration === config.rh2.agentsRegistration
        && row.workSource.reference?.native === run.native);
      if (rows.length !== 1 || !['agent', 'session'].includes(rows[0].kind) || !address(rows[0].session)
        || typeof rows[0].principalId !== 'string') refuse('a positive native run lacks an unambiguous qualified current work representation');
      return { ...run, representation: rows[0] };
    });
  }
  function runsFor(basis, runs, project, principalId, expectedSession) {
    if (!Array.isArray(basis.inputs.tasks) || !Array.isArray(basis.inputs.work)) refuse('the complete basis omits task/work demand');
    const result = [];
    for (const run of runs.filter(run => run.project === project && run.representation.principalId === principalId)) {
      const tasks = basis.inputs.tasks.filter(task => task.record_reference?.card === run.cardId
        && task.record_reference.source === config.teams.source && task.record_reference.team === config.teams.team);
      const work = basis.inputs.work.filter(work => work.app_id === config.rh2.agentsRegistration
        && work.reference?.native === run.native && tasks.some(task => task.task_id === work.task_id));
      // A projected absence cannot negate a held positive native S. This basis
      // may prove the exact existing representation, otherwise recovery waits.
      if (tasks.length !== 1 || tasks[0].record_registration !== run.representation.card.registration
        || work.length !== 1 || work[0].principal_id !== principalId || work[0].task_id !== run.representation.taskId
        || !same(address(work[0].session), run.representation.session) || !same(run.representation.session, expectedSession)) refuse('the atomic Room basis differs from the exact current positive native run representation');
      result.push(run);
    }
    return result;
  }
  async function compensate(demand, identity, predecessor, providers) {
    const resolvedRoles = resolveRoles(demand, providers), resolvedRuns = resolveRuns(demand, providers);
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
      const completed = journal.entries('placement-disposition').filter(entry => entry.value.operation === identity.operation
        && entry.value.roomId === roomId && entry.value.principalId === principalId).at(-1)?.value;
      if (completed) {
        if (completed.sourceDecisionDigest !== identity.sourceDecision.digest) refuse('completed placement belongs to another original source decision');
        disposition.push(completed); continue;
      }
      const originals = rooms.originals(roomId, principalId);
      if (!originals.length) {
        const value = { ...target, operation: identity.operation, sourceDecisionDigest: identity.sourceDecision.digest, kind: 'no-applied-original' };
        journal.append('placement-disposition', value); disposition.push(value); retireCache(roomId, principalId); continue;
      }
      const basis = await rooms.basis(roomId, principalId);
      if (basis.inputs.room?.key !== projectRoomKey(config, project) || basis.inputs.room.organizationId !== config.rh2.organization) refuse('the actual Room is not the declared source-bound project');
      const own = rooms.batches().filter(batch => batch.roomId === roomId && batch.input.principalId === principalId);
      const original = own.find(batch => batch.purpose === 'projection-run' && originals.some(ref => ref.namespace === batch.namespace.id));
      if (!original?.input.expectedSession) refuse('original run effect has no exact session S');
      const expectedSession = original.input.expectedSession;
      const roles = resolvedRoles.filter(role => role.project === project && role.principalId === principalId);
      const current = basis.inputs.principals.find(row => row.principal_id === principalId);
      if (!current) refuse('the complete atomic basis omits the exact existing representation');
      const currentAddress = address(current.kind === 'agent' ? current.current_session : current.participant);
      if (!same(currentAddress, expectedSession)) refuse('the actual representation changed its original exact session');
      const runs = runsFor(basis, resolvedRuns, project, principalId, expectedSession);
      const positive = roles.length || runs.length;
      if (runs.length && (predecessor.value.lifecycle?.compensation?.protocol !== 2
        || predecessor.value.lifecycle.compensation.lineageProtocol !== 1)) refuse('predecessor cannot inherit a current run-only field lineage');
      const wanted = positive ? { answers: roles.some(role => role.answers === 'all') || runs.some(run => run.answers === 'all') ? 'all' : 'mentions',
        roleKeys: [...new Set([...roles.flatMap(role => role.roleKeys), ...runs.flatMap(run => run.roleKeys)])].sort() } : null;
      const input = { principalId, expectedSession, expectedSeatedBy: actor,
        ...(wanted ? { ...wanted, ...(config.postRoleKeys === undefined ? {} : { postRoleKeys: config.postRoleKeys }) } : {}) };
      // Save complete observed field vector and desired union. Server original
      // provenance decides borrowing/ABA, descendants and every atomic change.
      planned.push({ ...target, project, originals, basis, input, action: wanted ? 'join' : 'leave', wanted, runs,
        retainsLineage: Boolean(wanted && predecessor.value.lifecycle?.compensation?.protocol === 2
          && predecessor.value.lifecycle.compensation.lineageProtocol === 1), representationKind: current.kind });
    }
    journal.append('inverse-plan', { identity, demand, steps: planned });
    for (const step of planned) {
      // Each earlier Room write changes the complete revision. Issue this
      // deliberate step's basis only when its body can immediately dispatch;
      // a basis collected for a whole multi-Room plan would expire or be stale.
      const current = await rooms.basis(step.roomId, step.principalId);
      const principal = current.inputs.principals.find(row => row.principal_id === step.principalId);
      if (!principal || current.inputs.room?.key !== projectRoomKey(config, step.project)
        || !same(address(principal.kind === 'agent' ? principal.current_session : principal.participant), step.input.expectedSession)
        || !same(runsFor(current, resolvedRuns, step.project, step.principalId, step.input.expectedSession), step.runs)) refuse('the complete effect-time step basis differs from its held positive union');
      const batch = await rooms.prepare(step.action, step.roomId, step.input, { originalEffects: step.originals,
        invocation: identity.invocation.id, purpose: 'recovery-inverse', issuedBasis: current,
        expected: { basis: current, wanted: step.wanted, retainsLineage: step.retainsLineage } });
      const result = await rooms.dispatch(batch);
      if (!['applied', 'original-effect-absent'].includes(result.conditional.outcome)) refuse(`inverse retained debt: ${result.conditional.code ?? result.conditional.outcome}`);
      await rooms.finish(batch);
      rooms.dispose(batch, { retained: step.retainsLineage });
      disposition.push({ operation: identity.operation, sourceDecisionDigest: identity.sourceDecision.digest,
        roomId: step.roomId, principalId: step.principalId, project: step.project,
        kind: step.retainsLineage ? 'retained-positive-handoff' : step.wanted ? 'retained-positive' : result.conditional.outcome,
        representationKind: step.representationKind,
        expectedSession: step.input.expectedSession, wanted: step.wanted, runs: step.runs,
        originalEffects: step.originals, inverse: { namespace: batch.namespace.id, operationId: batch.operationId } });
      journal.append('placement-disposition', disposition.at(-1));
      if (!step.retainsLineage) retireCache(step.roomId, step.principalId);
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
    const effects = branch === 'precommit' ? await compensate(demand, identity, predecessor, providers) : [{ kind: 'committed-serving', selection }];
    const roomInventory = await rooms.closeAll();
    let handoff = null;
    const retainedRuns = effects.filter(effect => effect.kind === 'retained-positive-handoff');
    if (retainedRuns.length) {
      const offer = lineage.offer({ identity, predecessorSelection: identity.predecessorSelection, placements: retainedRuns, roomInventory });
      handoff = await lineage.acknowledge(offer);
      if (!handoff) return { protocol: 1, kind: 'lineage-pending', offer, offerDigest: digestValue(offer) };
      for (const placement of retainedRuns) {
        const cache = state.runSeats?.[placement.roomId]?.[placement.principalId];
        if (cache && cache.owner !== selection) refuse('lineage acknowledgement cannot retire another selection cache');
        journal.append('run-lineage-transferred', { roomId: placement.roomId, principalId: placement.principalId,
          offerDigest: handoff.offerDigest, acknowledgementDigest: handoff.acknowledgementDigest });
        if (cache) {
          delete state.runSeats[placement.roomId][placement.principalId];
          if (!Object.keys(state.runSeats[placement.roomId]).length) delete state.runSeats[placement.roomId];
          persist();
        }
      }
    }
    providers = await providerClosure(status, identity, cut.providers);
    const final = await owner('recovery-status', { operation, expectedRevision: status.revision });
    if (!same(identityOf(final), identity) || final.phase !== status.phase) refuse('native admission changed before durable acknowledgement');
    journal.append('recovery-final-inventories', { operation, providers, roomInventory, effects, handoff });
    const z = { protocol: 1, kind: branch === 'precommit' ? 'compensated' : 'committed-closed', operation, branch, admissionRevision: identity.admissionRevision,
      sourceDecision: identity.sourceDecision, selection, artifact: binding.artifact, predecessor: predecessor.sha256,
      invocation: identity.invocation, actor, controls: identity.controls,
      ownerInventoryDigests: providers.owners.map(row => ({ identity: row.identity, digest: row.inventoryDigest })),
      roomInventoryDigest: digestValue(roomInventory), effectDispositionDigest: digestValue(effects),
      handoff: handoff ? { offerDigest: handoff.offerDigest, acknowledgementDigest: handoff.acknowledgementDigest } : null, journalHead: journal.head };
    journal.append('recovery-Z', z);
    return copy(z);
  }
  async function adoptLineage(readiness) {
    const inherited = await lineage.adopt(readiness);
    if (!inherited) return;
    for (const placement of inherited.placements) if (placement.runs.length) {
      state.runSeats[placement.roomId] ??= {};
      state.runSeats[placement.roomId][placement.principalId] = { kind: placement.representationKind,
        session: placement.expectedSession, owner: selection, lineage: { operation: inherited.operation,
          originalInventoryDigest: inherited.originalInventoryDigest, offerDigest: digestValue(inherited) } };
    }
    persist();
  }
  return { recover, acceptLineage: lineage.accept, adoptLineage };
}
