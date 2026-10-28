#!/usr/bin/env node
// A distinct stopped-owner maintenance executable. It never calls RH2, changes native control, or resumes a program.
import { randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTerminalEvidence, qualifyTerminalRetirement } from './offline-terminal.mjs';
import { acquireCustody } from './offline-custody.mjs';
import { canonical, digestPattern, durableWrite, exactKeys, jsonDocument, privateDirectory, readBound, readFile,
  refuse, removeIntent, same, sha256, stable, syncDirectory, uuidPattern } from './offline-files.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const parse = bound => { const doc = jsonDocument(bound.bytes); return doc.value(doc.root); };
const objectDigest = value => sha256(Buffer.from(stable(value)));
// Match the native owner's JSON.stringify(sortJson(config)) identity, including integer-key ordering.
const sortJson = value => Array.isArray(value) ? value.map(sortJson) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sortJson(value[key])])) : value;

export function readOfflineArtifact(path, expected) {
  const bound = readFile(path, expected, { sealed: true }), value = parse(bound);
  canonical(value.directory);
  if (value.version !== 1 || value.kind !== 'project-rooms-offline-artifact' || value.publisher !== 'open-autonomy' || value.app !== 'project-rooms'
    || !/^[0-9a-f]{40}$/.test(value.source?.revision ?? '') || value.source.directory !== 'packages/workplace/rooms'
    || !isAbsolute(value.source.root ?? '') || value.entry !== 'offline.mjs' || value.program !== join(value.directory, value.entry)
    || dirname(path) !== value.directory || (lstatSync(value.directory).mode & 0o777) !== 0o555) refuse('offline artifact identity differs');
  const metadata = value.maintenance;
  if (metadata?.version !== 1 || metadata.kind !== 'project-rooms-offline-maintenance' || metadata.entry !== value.entry
    || metadata.scope !== 'original-terminal-no-effect-intent-only' || metadata.remoteMutations !== false || metadata.nativeControls !== false
    || !Array.isArray(metadata.files) || !Array.isArray(metadata.supports) || !Array.isArray(metadata.custodyProtocols)
    || !Array.isArray(metadata.terminalEvidenceProfiles) || !Array.isArray(metadata.custodySources) || !Array.isArray(value.files) || !value.files.length
    || new Set(value.files.map(file => file.path)).size !== value.files.length
    || !same([...metadata.files].sort(), value.files.map(file => file.path).sort())
    || !same(readdirSync(value.directory).sort(), ['offline-artifact.json', ...metadata.files].sort())) refuse('offline artifact closure differs');
  for (const file of value.files) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(file.path) || !digestPattern.test(file.sha256 ?? '')
      || !['100644', '100755'].includes(file.gitMode) || file.mode !== (file.gitMode === '100755' ? 0o555 : 0o444)
      || !Number.isSafeInteger(file.bytes) || file.bytes < 0) refuse('offline file vector is invalid');
    const current = readFile(join(value.directory, file.path), file.sha256);
    if (current.bytes.length !== file.bytes || (current.stat.mode & 0o777) !== file.mode) refuse('offline artifact file changed');
  }
  if (!same(parse(readFile(join(value.directory, 'offline.json'))), metadata)) refuse('offline metadata differs from its receipt');
  return { ...bound, value };
}

function readOldArtifact(reference, metadata) {
  const artifact = readBound(reference, { sealed: true }), value = parse(artifact);
  const support = metadata.supports.find(item => item.revision === value.source?.revision);
  if (!support || value.version !== 1 || value.kind !== 'connection-program-artifact' || value.app !== 'project-rooms' || value.publisher !== 'open-autonomy'
    || value.source.directory !== 'packages/workplace/rooms' || value.entry !== 'main.mjs' || value.program !== join(value.directory, value.entry)
    || dirname(artifact.path) !== canonical(value.directory) || (lstatSync(value.directory).mode & 0o777) !== 0o555
    || value.lifecycle?.protocol !== 1 || value.lifecycle.state?.journalVersion !== support.journalVersion
    || value.lifecycle.state?.arcVersion !== support.arcVersion || !Array.isArray(value.files)
    || !same(value.files.map(({ path, sha256: hash }) => ({ path, sha256: hash })).sort((a, b) => a.path.localeCompare(b.path)),
      [...support.files].sort((a, b) => a.path.localeCompare(b.path)))
    || !same(readdirSync(value.directory).sort(), ['artifact.json', ...support.files.map(file => file.path)].sort())) refuse('old program is not the exact supported immutable closure');
  for (const file of value.files) {
    const current = readFile(join(value.directory, file.path), file.sha256);
    if (![0o444, 0o555].includes(file.mode) || !Number.isSafeInteger(file.bytes) || current.bytes.length !== file.bytes
      || (current.stat.mode & 0o777) !== file.mode) refuse('old artifact file changed');
  }
  if (!same(parse(readFile(join(value.directory, 'lifecycle.json'))), value.lifecycle)) refuse('old lifecycle metadata differs');
  return { ...artifact, value, support };
}

function validatePlan(value) {
  exactKeys(value, ['version', 'kind', 'id', 'home', 'connection', 'appPrincipal', 'organization', 'origin', 'boardSource',
    'config', 'state', 'oldArtifact', 'recoveryArtifact', 'native', 'intent', 'custody', 'terminal'], 'plan');
  if (value.version !== 1 || value.kind !== 'project-rooms-offline-no-effect-plan' || !uuidPattern.test(value.id ?? '')
    || !/^[0-9a-f]{24}$/.test(value.connection ?? '') || !/^prn_[a-zA-Z0-9]+$/.test(value.appPrincipal ?? '')
    || typeof value.organization !== 'string' || !value.organization || typeof value.boardSource !== 'string' || !value.boardSource) refuse('unsupported maintenance plan');
  let origin; try { origin = new URL(value.origin); } catch { refuse('invalid product origin'); }
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== value.origin) refuse('product origin must be exact');
  privateDirectory(value.home);
  for (const key of ['config', 'state', 'oldArtifact', 'recoveryArtifact']) {
    exactKeys(value[key], ['path', 'sha256'], `${key} reference`);
    if (!digestPattern.test(value[key].sha256 ?? '')) refuse('a bound input digest is invalid');
  }
  exactKeys(value.intent, ['id', 'sha256', 'selection', 'operationSha256', 'binding', 'room', 'principal', 'placementSha256', 'session'], 'intent plan');
  if (!uuidPattern.test(value.intent.id ?? '') || !['sha256', 'selection', 'operationSha256', 'placementSha256'].every(key => digestPattern.test(value.intent[key] ?? ''))) refuse('invalid exact intent hashes');
  if (!/^prn_[a-zA-Z0-9]+$/.test(value.intent.principal ?? '')) refuse('invalid exact placement principal');
  return value;
}

function configuration(plan) {
  const bound = readBound(plan.config, { privateFile: true }), value = parse(bound);
  if (value.stateFile !== plan.state.path || value.rh2?.principalId !== plan.appPrincipal || value.rh2.organization !== plan.organization
    || value.rh2.baseUrl?.replace(/\/$/, '') !== plan.origin || value.teams?.source !== plan.boardSource
    || !/^cx[0-9a-f]{24}$/.test(value.source?.namespace ?? '')) refuse('connection/config/public source identity differs');
  const identity = structuredClone(value);
  if (identity.board) delete identity.board.supercode;
  if (identity.source) delete identity.source.program;
  for (const [object, field] of [[identity, 'envFile'], [identity, 'stateFile'], [identity.board, 'root'], [identity.source, 'home'],
    [identity.launch, 'root'], [identity.cards, 'stateFile'], [identity.machines, 'stateFile']]) {
    if (typeof object?.[field] === 'string' && object[field].startsWith('/')) object[field] = canonical(object[field]);
  }
  // Resolve the custody filename for identity only. Its secret bytes are never opened.
  return { ...bound, value, identity: { path: bound.path, state: canonical(value.stateFile), custody: canonical(value.envFile), sha256: sha256(Buffer.from(JSON.stringify(sortJson(identity)))) } };
}

function predecessorInputs(reference, artifact) {
  exactKeys(reference, ['receipt', 'sha256'], 'native predecessor artifact reference');
  const bound = readFile(reference.receipt, reference.sha256, { sealed: true }), value = parse(bound);
  const support = artifact.value.lifecycle.compensation?.predecessors?.find(item => item.revision === value.source?.revision);
  if (!support || value.version !== 1 || value.kind !== 'connection-program-artifact' || value.publisher !== 'open-autonomy'
    || value.app !== 'project-rooms' || value.source.directory !== 'packages/workplace/rooms' || value.entry !== 'main.mjs'
    || value.program !== join(value.directory, value.entry) || dirname(bound.path) !== canonical(value.directory)
    || (lstatSync(value.directory).mode & 0o777) !== 0o555 || value.lifecycle?.protocol !== null
    || value.lifecycle.state?.arcVersion !== support.arcVersion || !Array.isArray(value.files)
    || !same(value.files.map(({ path, sha256: hash }) => ({ path, sha256: hash })).sort((a, b) => a.path.localeCompare(b.path)),
      [...support.files].sort((a, b) => a.path.localeCompare(b.path)))
    || !same(readdirSync(value.directory).sort(), ['artifact.json', ...support.files.map(file => file.path)].sort())) refuse('predecessor is not the exact supported immutable closure');
  const files = value.files.map(file => {
    const current = readFile(join(value.directory, file.path), file.sha256);
    if (![0o444, 0o555].includes(file.mode) || !Number.isSafeInteger(file.bytes) || current.bytes.length !== file.bytes
      || (current.stat.mode & 0o777) !== file.mode) refuse('predecessor artifact file changed');
    return current;
  });
  return { bound, files };
}

function nativeInputs(plan, artifact, config) {
  exactKeys(plan.native, ['generation', 'selection', 'predecessor', 'sourcePrimary', 'sourceMarker', 'sourceJournal', 'sourceCandidate'], 'native input vector');
  const inputs = Object.fromEntries(Object.entries(plan.native).map(([name, reference]) => [name, readBound(reference, { privateFile: true })]));
  const values = Object.fromEntries(Object.entries(inputs).map(([name, bound]) => [name, parse(bound)]));
  const folder = join(plan.home, 'apps', 'connections', plan.connection), generation = values.generation, pending = generation.pending;
  if (inputs.generation.path !== join(folder, 'program-generation.json') || !pending || pending.transaction !== plan.intent.binding.transaction
    || !['activating', 'activated', 'compensating'].includes(pending.phase) || generation.selected !== inputs.selection.path
    || generation.selectedDigest !== inputs.selection.sha256 || pending.selection !== inputs.selection.path || pending.sha256 !== inputs.selection.sha256
    || pending.previous !== inputs.predecessor.path || pending.previousDigest !== inputs.predecessor.sha256) refuse('native generation/reservation changed or is ineligible');
  for (const name of ['selection', 'predecessor']) {
    const selection = values[name];
    if (selection.version !== 1 || selection.kind !== 'connection-program-selection' || selection.home !== plan.home
      || selection.connection !== plan.connection || selection.identity?.connection !== plan.connection
      || selection.identity.organization !== plan.organization || selection.identity.origin !== plan.origin
      || !Array.isArray(selection.programs) || new Set(selection.programs.map(entry => entry.app)).size !== selection.programs.length) refuse('native program selection identity differs');
  }
  if (!same(values.selection.identity, values.predecessor.identity)) refuse('native predecessor connection identity differs');
  const identity = values.selection.identity, grant = identity.grants?.find(item => item.app === 'project-rooms');
  if (identity.issuer !== config.value.rh2.issuer || identity.source !== plan.boardSource
    || identity.teams?.server !== config.value.teams.server || identity.teams?.team !== config.value.teams.team
    || identity.scope && config.value.source.namespace !== `cx${identity.scope}`
    || grant?.principal !== plan.appPrincipal || !same(grant.manifest, parse(readFile(join(artifact.value.directory, 'rh2-app.json'))))
    || !same(grant.teamsManifest, parse(readFile(join(artifact.value.directory, 'teams-app.json'))))
    || identity.grants?.find(item => item.app === 'agents')?.client !== config.value.rh2.agentsRegistration
    || config.value.rh2.cardsPrincipalId && identity.grants?.find(item => item.app === 'cards')?.principal !== config.value.rh2.cardsPrincipalId) refuse('native consented principal/source/session identity differs');
  const selected = values.selection.programs.find(entry => entry.app === 'project-rooms');
  const predecessor = values.predecessor.programs.find(entry => entry.app === 'project-rooms');
  const change = values.selection.changes?.find(change => change.app === 'project-rooms');
  if (!selected || selected.kind !== 'external' || selected.enabled !== true || selected.program !== artifact.value.program
    || selected.artifact?.receipt !== artifact.path || selected.artifact.sha256 !== artifact.sha256 || !same(selected.config, config.identity)
    || !predecessor || predecessor.kind !== 'external' || !same(predecessor.config, config.identity)
    || values.selection.predecessor?.receipt !== inputs.predecessor.path || values.selection.predecessor.sha256 !== inputs.predecessor.sha256
    || !change || change.candidate?.receipt !== artifact.path || change.candidate.sha256 !== artifact.sha256
    || !same(change.predecessor, predecessor.artifact)) refuse('native exact selected/predecessor program vector differs');
  const prior = predecessorInputs(predecessor.artifact, artifact);
  if (predecessor.program !== parse(prior.bound).program) refuse('native predecessor program differs from its artifact');
  if (!digestPattern.test(change.qualification?.sha256 ?? '')) refuse('native qualification digest is absent');
  const qualification = readFile(change.qualification?.receipt, change.qualification?.sha256, { sealed: true });
  const qualified = parse(qualification);
  if (qualified.version !== 1 || qualified.kind !== 'connection-program-qualification' || qualified.protocol !== 1
    || qualified.scope !== 'run-only' || !same(qualified.candidate, change.candidate) || !same(qualified.predecessor, change.predecessor)
    || typeof qualified.evidence?.path !== 'string' || !digestPattern.test(qualified.evidence?.sha256 ?? '')
    || !same(change.qualification.evidence, qualified.evidence)) refuse('native exact-pair qualification differs');
  const evidence = readFile(qualified.evidence.path, qualified.evidence.sha256, { sealed: true });
  Object.assign(inputs, { predecessorArtifact: prior.bound, qualification, qualificationEvidence: evidence });
  prior.files.forEach((file, index) => { inputs[`predecessorFile${index}`] = file; });
  const marker = values.sourceMarker, journal = values.sourceJournal, source = values.selection.source, candidate = values.sourceCandidate;
  const withoutNativeFields = lock => Object.fromEntries(Object.entries(lock ?? {}).filter(([key]) => !['serving_handover', 'retired'].includes(key)));
  if (inputs.sourcePrimary.path !== join(plan.home, 'source-lock.json') || inputs.sourceMarker.path !== join(plan.home, 'source', 'handover.json')
    || inputs.sourceCandidate.path !== join(dirname(inputs.sourceCandidate.path), 'candidate.json')
    || dirname(dirname(inputs.sourceCandidate.path)) !== join(plan.home, 'source', 'handovers')
    || inputs.sourceJournal.path !== join(dirname(inputs.sourceCandidate.path), 'activation.json')
    || marker.transaction !== pending.transaction || marker.journal !== inputs.sourceJournal.path || marker.candidate !== inputs.sourceCandidate.path
    || journal.transaction !== pending.transaction || journal.closed || !['prepared', 'committing'].includes(journal.state)
    || journal.candidate !== inputs.sourceCandidate.path || journal.previous_digest !== inputs.sourcePrimary.sha256
    || typeof journal.previous_text !== 'string' || sha256(Buffer.from(journal.previous_text)) !== inputs.sourcePrimary.sha256
    || source?.published !== false || source.receipt !== inputs.sourceCandidate.path || source.sha256 !== inputs.sourceCandidate.sha256
    || candidate.version !== 1 || candidate.kind !== 'serving-source-candidate' || candidate.base_digest !== inputs.sourcePrimary.sha256
    || !same(withoutNativeFields(candidate.lock), withoutNativeFields(journal.next))
    || !same(journal.next?.retired ?? null, values.sourcePrimary.retired ?? null)
    || journal.next?.serving_handover?.transaction !== pending.transaction
    || journal.next.serving_handover.candidate !== inputs.sourceCandidate.path
    || source.root !== candidate.lock?.root || source.program !== candidate.program || source.node !== candidate.node
    || source.commit !== candidate.lock?.commit) refuse('native source decision is committed, unknown or changed');
  return { inputs, values };
}

function exactIntent(plan, artifact, config, bytes) {
  const doc = jsonDocument(bytes), state = doc.value(doc.root), removed = removeIntent(bytes, plan.intent.id), intent = removed.intent;
  exactKeys(intent, ['selection', 'binding', 'operation', 'signature', 'phase'], 'retained intent');
  exactKeys(intent.binding, ['protocol', 'transaction', 'connection', 'app', 'artifact', 'config', 'state', 'generation'], 'old binding');
  const binding = intent.binding;
  if (state.arcRoomLifecycleVersion !== artifact.support.arcVersion || state.publisherLifecycle?.version !== artifact.support.journalVersion
    || state.namespace !== config.value.source.namespace || intent.phase !== 'unknown' || sha256(removed.originalIntent) !== plan.intent.sha256
    || !same(binding, plan.intent.binding) || binding.protocol !== 1 || binding.connection !== plan.connection || binding.app !== 'project-rooms'
    || binding.artifact !== artifact.sha256 || binding.config !== plan.config.path || binding.state !== plan.state.path
    || !uuidPattern.test(binding.generation ?? '') || !uuidPattern.test(binding.transaction ?? '')) refuse('original intent/binding/state differs');
  const logical = JSON.stringify(Object.fromEntries(Object.entries(binding).filter(([key]) => key !== 'generation').sort(([a], [b]) => a.localeCompare(b))));
  exactKeys(intent.operation, ['method', 'path', 'body'], 'original operation');
  exactKeys(intent.operation.body, ['principalId', 'expectedSeatedBy'], 'original leave body');
  if (intent.selection !== sha256(Buffer.from(logical)) || intent.selection !== plan.intent.selection
    || intent.operation.method !== 'POST' || intent.operation.path !== `/api/v3/rooms/${plan.intent.room}/leave`
    || !/^room_[a-zA-Z0-9]+$/.test(plan.intent.room ?? '') || intent.operation.body.principalId !== plan.intent.principal
    || intent.operation.body.expectedSeatedBy !== plan.appPrincipal
    || intent.signature !== sha256(Buffer.from(JSON.stringify(intent.operation))) || intent.signature !== plan.intent.operationSha256) refuse('original exact conditional leave differs');
  const placement = state.runSeats?.[plan.intent.room]?.[plan.intent.principal];
  exactKeys(placement, ['kind', 'session', 'owner'], 'retained run-placement');
  exactKeys(placement.session, ['reference', 'registration'], 'retained native session');
  exactKeys(placement.session.reference, ['id', 'team'], 'retained native session reference');
  if (!placement || placement.owner !== intent.selection || objectDigest(placement) !== plan.intent.placementSha256
    || !same(placement.session, plan.intent.session) || !['agent', 'session'].includes(placement.kind)
    || placement.session?.registration !== config.value.rh2.agentsRegistration
    || placement.session?.reference?.team !== config.value.teams.team || !uuidPattern.test(placement.session?.reference?.id ?? '')) refuse('original run-placement/session obligation differs');
  return removed;
}

function requireTerminalProof(plan, metadata, originalIntent, custody) {
  return qualifyTerminalRetirement(readTerminalEvidence(plan, metadata, originalIntent), custody);
}

export async function settleNoEffect(planPath) {
  if (!['darwin', 'linux'].includes(process.platform) || !process.getuid) refuse('mandatory local ownership/durability facilities are unavailable');
  const planFile = readFile(planPath, undefined, { privateFile: true }); privateDirectory(dirname(planPath));
  const plan = validatePlan(parse(planFile)), self = readOfflineArtifact(join(directory, 'offline-artifact.json'));
  if (plan.recoveryArtifact.path !== self.path || plan.recoveryArtifact.sha256 !== self.sha256) refuse('plan names another recovery executable');
  // The inherited source-qualified native hold must precede every mutable product input read.
  const custody = await acquireCustody(plan, self.value.maintenance, {path:planFile.path,sha256:planFile.sha256}, self.value.program);
  try {
  const folder = privateDirectory(join(plan.home, 'apps', 'connections', plan.connection));
  const stateFolder = privateDirectory(join(folder, 'project-rooms'));
  if (plan.state.path !== join(stateFolder, 'state.json') || plan.config.path !== join(stateFolder, 'config.json')) refuse('plan state/config are outside the exact connection');
  const lock = join(stateFolder, 'offline-recovery.lock'), token = Buffer.from(`${JSON.stringify({ version: 1, pid: process.pid, nonce: randomUUID(), plan: plan.id, planSha256: planFile.sha256 })}\n`);
  await custody.recheck();
  let fd;
  try { fd = openSync(lock, 'wx', 0o600); } catch (error) { if (error.code === 'EEXIST') refuse('recovery lock is held or needs independently proved owner retirement; no stale stealing'); throw error; }
  try {
    writeFileSync(fd, token); fsyncSync(fd); syncDirectory(stateFolder);
    const artifact = readOldArtifact(plan.oldArtifact, self.value.maintenance), config = configuration(plan);
    const native = nativeInputs(plan, artifact, config);
    custody.assertInputs(native);
    const state = readFile(plan.state.path, undefined, { privateFile: true });
    if ((state.stat.mode & 0o777) !== 0o600) refuse('state mode differs from its supported private format');
    const auditFolder = join(stateFolder, 'offline-recovery'), auditPath = join(auditFolder, `${plan.id}.json`);
    let auditFile = existsSync(auditPath) ? readFile(auditPath, undefined, { privateFile: true }) : null;
    const audit = auditFile ? parse(auditFile) : null;
    if (audit && (audit.version !== 1 || audit.kind !== 'project-rooms-original-no-effect-disposition' || audit.planSha256 !== planFile.sha256
      || !['prepared', 'applied'].includes(audit.phase) || audit.beforeSha256 !== plan.state.sha256
      || audit.oldArtifact?.sha256 !== artifact.sha256 || audit.recoveryArtifact?.sha256 !== self.sha256
      || audit.intentId !== plan.intent.id || audit.transaction !== plan.intent.binding.transaction
      || audit.originalIntent?.sha256 !== plan.intent.sha256)) refuse('retained audit belongs to different inputs');
    if (!audit && state.sha256 !== plan.state.sha256 || audit && ![audit.beforeSha256, audit.afterSha256].includes(state.sha256)) refuse('state differs from exact initial or audited outcome');
    let removal;
    if (state.sha256 === plan.state.sha256) removal = exactIntent(plan, artifact, config, state.bytes);
    else {
      const span = audit.removal;
      if (!span || !Number.isSafeInteger(span.start) || span.start < 0 || !Number.isSafeInteger(span.end) || span.end < span.start
        || span.units !== 'utf16-code-units' || typeof span.bytes !== 'string') refuse('audit removal span is invalid');
      const deleted = Buffer.from(span.bytes, 'base64'), text = state.bytes.toString('utf8'), restored = deleted.toString('utf8');
      if (deleted.toString('base64') !== span.bytes || !Buffer.from(restored).equals(deleted) || restored.length !== span.end - span.start
        || sha256(deleted) !== span.sha256 || span.start > text.length) refuse('audit removal bytes differ');
      const original = Buffer.from(text.slice(0, span.start) + restored + text.slice(span.start));
      if (sha256(original) !== plan.state.sha256) refuse('audit cannot reconstruct the exact original state');
      removal = exactIntent(plan, artifact, config, original);
      if (!removal.after.equals(state.bytes) || !same(removal.removed, span)) refuse('audited state changed outside the one intent');
    }
    if (audit && (!same(audit.oldArtifact, plan.oldArtifact) || !same(audit.recoveryArtifact, plan.recoveryArtifact)
      || audit.originalIntent.encoding !== 'base64' || audit.originalIntent.bytes !== removal.originalIntent.toString('base64')
      || audit.afterSha256 !== sha256(removal.after) || !same(audit.removal, removal.removed))) refuse('audit does not preserve the complete exact original intent and outcome');
    const terminal = requireTerminalProof(plan, self.value.maintenance, removal.originalIntent, custody);
    if (audit && (!same(audit.terminal, terminal) || !same(audit.custody, custody.receipt)))
      refuse('retained audit requires its exact original live custody invocation; no cross-lease replay');
    const recheck = async () => {
      await custody.recheck();
      readFile(planPath, planFile.sha256, { privateFile: true }); readBound(plan.config, { privateFile: true });
      for (const input of Object.values(native.inputs)) {
        const current = readFile(input.path, input.sha256);
        if ((current.stat.mode & 0o777) !== (input.stat.mode & 0o777)) refuse('a retained native input mode changed');
      }
      readOldArtifact(plan.oldArtifact, self.value.maintenance); readOfflineArtifact(self.path, self.sha256);
      if (!same(requireTerminalProof(plan, self.value.maintenance, removal.originalIntent, custody), terminal))
        refuse('original terminal source/history changed during custody');
      if (auditFile) readFile(auditPath,auditFile.sha256,{privateFile:true});
      if (!readFileSync(lock).equals(token)) refuse('recovery lock ownership changed');
    };
    await recheck();
    if (audit && state.sha256 === audit.afterSha256) {
      if (audit.phase !== 'applied') {
        const bytes=Buffer.from(`${JSON.stringify({ ...audit, phase: 'applied' })}\n`);
        durableWrite(auditPath,bytes); auditFile=readFile(auditPath,sha256(bytes),{privateFile:true});
      }
      await recheck(); readFile(plan.state.path, state.sha256, {privateFile:true});
      return { plan: plan.id, disposition: 'original-terminal-no-effect', repeated: true, stateSha256: state.sha256, placementDebtRetained: true };
    }
    if (!removal) refuse('original intent cannot be exactly derived');
    const next = { version: 1, kind: 'project-rooms-original-no-effect-disposition', phase: 'prepared', planSha256: planFile.sha256,
      oldArtifact: plan.oldArtifact, recoveryArtifact: plan.recoveryArtifact, transaction: plan.intent.binding.transaction,
      intentId: plan.intent.id, originalIntent: { encoding: 'base64', bytes: removal.originalIntent.toString('base64'), sha256: sha256(removal.originalIntent) },
      beforeSha256: state.sha256, afterSha256: sha256(removal.after), removal: removal.removed, terminal, custody: custody.receipt };
    if (audit && !same({ ...audit, phase: 'prepared' }, next)) refuse('prepared audit differs from the exact disposition');
    if (!existsSync(auditFolder)) { mkdirSync(auditFolder, { mode: 0o700 }); syncDirectory(stateFolder); }
    privateDirectory(auditFolder);
    if (!audit) {
      const bytes=Buffer.from(`${JSON.stringify(next)}\n`);
      durableWrite(auditPath,bytes,{create:true}); auditFile=readFile(auditPath,sha256(bytes),{privateFile:true});
    }
    await recheck(); readFile(plan.state.path, state.sha256, { privateFile: true });
    durableWrite(plan.state.path, removal.after);
    await recheck(); readFile(plan.state.path, next.afterSha256, { privateFile: true });
    const applied=Buffer.from(`${JSON.stringify({ ...next, phase: 'applied' })}\n`);
    durableWrite(auditPath,applied); auditFile=readFile(auditPath,sha256(applied),{privateFile:true});
    await recheck(); readFile(plan.state.path, next.afterSha256, { privateFile: true });
    return { plan: plan.id, disposition: 'original-terminal-no-effect', repeated: false, stateSha256: next.afterSha256, placementDebtRetained: true };
  } finally {
    closeSync(fd);
    // Only this invocation's exact lock is removed. A failed/crashed owner's lock is not guessed stale.
    if (existsSync(lock) && readFileSync(lock).equals(token)) { unlinkSync(lock); syncDirectory(stateFolder); }
  }
  } finally { custody.finish(); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    if (process.argv.length !== 4 || process.argv[2] !== '--plan') refuse('use --plan PRIVATE_JSON; remote retry/control options are unsupported');
    process.stdout.write(`${JSON.stringify(await settleNoEffect(process.argv[3]))}\n`);
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
