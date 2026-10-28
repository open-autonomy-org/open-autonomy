// Read an allowlisted original non-dispatch observer history. Native launch/retirement authority is qualified separately.
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { exactKeys, jsonDocument, privateDirectory, readBound, readFile, refuse, same, sha256, uuidPattern } from './offline-files.mjs';

const parse = bound => { const doc = jsonDocument(bound.bytes); return doc.value(doc.root); };
const reference = bound => ({ path: bound.path, sha256: bound.sha256 });
const commonKeys = ['version','profile','launch','observer','helper','descriptor','pid','binding','sequence','previousSha256','at'];

function originalUnknown(bytes) {
  const doc = jsonDocument(bytes), phase = doc.field(doc.root, 'phase'), value = doc.value(phase);
  if (!['dispatched', 'unknown'].includes(value)) refuse('observer intent has an unsupported phase');
  // The allowlisted old lifecycle changes this token after the synthetic response; no other byte may differ.
  return Buffer.from(doc.text.slice(0, phase.start) + '"unknown"' + doc.text.slice(phase.end));
}

export function readTerminalEvidence(plan, metadata, originalIntent) {
  exactKeys(plan.terminal, ['profile', 'refusal'], 'terminal evidence');
  const profile = metadata.terminalEvidenceProfiles.find(item => item.profile === plan.terminal.profile);
  if (!profile || profile.profile !== 'project-rooms-pre-dispatch-refusal-v1') refuse('unsupported original terminal evidence profile');
  const refusal = readBound(plan.terminal.refusal, { sealed: true }), named = parse(refusal);
  if (named.kind !== 'project-rooms-pre-dispatch-refusal' || named.profile !== profile.profile) refuse('terminal reference is not an original pre-dispatch refusal');
  const observer = readBound(named.observer, { sealed: true }), helper = readBound(named.helper, { sealed: true });
  if (observer.sha256 !== profile.observer?.sha256 || helper.sha256 !== profile.helper?.sha256
    || observer.path !== join(dirname(observer.path), profile.observer.file)
    || helper.path !== join(dirname(observer.path), profile.helper.file)) refuse('observer source closure is not allowlisted');
  const descriptor = readBound(named.descriptor, { sealed: true }), described = parse(descriptor);
  exactKeys(described, ['version','kind','home','connection','transaction','program','artifact','config','state','origin','organization','principal','operation','output'], 'observer descriptor');
  if (described.version !== 1 || described.kind !== 'project-rooms-pre-dispatch-observer' || described.home !== plan.home
    || described.connection !== plan.connection || described.transaction !== plan.intent.binding.transaction
    || !same(described.artifact, plan.oldArtifact) || described.config !== plan.config.path || described.state !== plan.state.path
    || described.origin !== plan.origin || described.organization !== plan.organization || described.principal !== plan.appPrincipal)
    refuse('observer descriptor differs from this exact original attempt');
  const current = jsonDocument(originalIntent), intent = current.value(current.root);
  const oldArtifact = parse(readBound(plan.oldArtifact, { sealed: true }));
  if (!same(described.operation, intent.operation) || described.program !== oldArtifact.program)
    refuse('observer descriptor names another original program or operation');
  const launch = readBound(named.launch, { privateFile: true }), launched = parse(launch);
  const environmentBinding = parse({ bytes: Buffer.from(launched.environment?.SUPERCODE_CONNECTION_PROGRAM_BINDING ?? '') });
  const oldEntry = oldArtifact.files.find(file => file.path === oldArtifact.entry);
  if (launched.version !== 1 || launched.kind !== 'connection-program-launch' || !uuidPattern.test(launched.id ?? '')
    || launched.startupGate !== 'supercode-program-launch-v1'
    || launched.pid !== named.pid || !same(launched.binding, plan.intent.binding)
    || !same(launched.observerConfig, reference(descriptor)) || !same(launched.config, plan.config)
    || launched.state !== plan.state.path || !same(launched.artifact, { receipt: plan.oldArtifact.path, sha256: plan.oldArtifact.sha256 })
    || !same(launched.entry, { path: described.program, sha256: oldEntry?.sha256 })
    || !same(launched.argv, [described.program, plan.config.path]) || !same(launched.execArgv, [])
    || launched.nodeOptions !== `--import=${pathToFileURL(observer.path).href}`
    || !same(environmentBinding, plan.intent.binding)
    || launched.environment?.VO3773_ROOMS_OBSERVER_CONFIG !== descriptor.path)
    refuse('observer has no exact native startup provenance');
  const folder = privateDirectory(described.output), names = readdirSync(folder).sort();
  if (!names.length || names.some((name, index) => name !== `${String(index).padStart(6, '0')}.json`)
    || refusal.path !== join(folder, `${String(named.sequence).padStart(6, '0')}.json`)) refuse('observer history is incomplete or names another output');
  const records = [], attempts = new Map(); let previous = null, qualifying = 0;
  for (let index = 0; index < names.length; index++) {
    const bound = readFile(join(folder, names[index]), undefined, { sealed: true }), value = parse(bound);
    if (value.version !== 1 || value.profile !== profile.profile || value.pid !== named.pid || value.sequence !== index
      || value.previousSha256 !== previous || !same(value.binding, plan.intent.binding) || !same(value.launch, reference(launch))
      || !same(value.observer, reference(observer)) || !same(value.helper, reference(helper)) || !same(value.descriptor, reference(descriptor))
      || typeof value.at !== 'string' || !Number.isFinite(Date.parse(value.at))) refuse('observer history binding, order or source differs');
    if (index === 0) {
      exactKeys(value, [...commonKeys, 'kind'], 'observer ready event');
      if (value.kind !== 'project-rooms-pre-dispatch-observer-ready') refuse('observer was not installed before the original module');
    } else if (value.kind === 'project-rooms-pre-dispatch-malformed') {
      exactKeys(value, [...commonKeys, 'kind','endpoint','reason','outcome'], 'blocked malformed event');
      if (!same(value.endpoint, { origin: plan.origin, path: intent.operation.path })
        || value.reason !== 'request-or-durable-intent-did-not-match-qualified-shape' || !same(value.outcome, { dispatched: false }))
        refuse('malformed-attempt history differs from the allowlisted observer');
    } else if (value.kind === 'project-rooms-pre-dispatch-refusal') {
      exactKeys(value, [...commonKeys,'kind','intentId','attempt','originalIntent','stateRead','request','outcome'], 'original refusal event');
      exactKeys(value.originalIntent, ['encoding','bytes','sha256'], 'observer original intent');
      const bytes = Buffer.from(value.originalIntent.bytes, 'base64');
      if (value.intentId !== plan.intent.id || value.originalIntent.encoding !== 'base64'
        || bytes.toString('base64') !== value.originalIntent.bytes || sha256(bytes) !== value.originalIntent.sha256
        || !originalUnknown(bytes).equals(originalIntent) || value.stateRead?.path !== plan.state.path
        || !/^[0-9a-f]{64}$/.test(value.stateRead?.sha256 ?? '')) refuse('observer did not durably capture this exact original intent');
      const expectedAttempt = (attempts.get(value.intentId) ?? 0) + 1; attempts.set(value.intentId, expectedAttempt);
      if (value.attempt !== expectedAttempt || !same(value.request, { url: plan.origin + intent.operation.path, method: 'POST',
        body: JSON.stringify(intent.operation.body), headers: { accept: 'application/json', 'content-type': 'application/json',
          origin: plan.origin, 'x-rh2-organization': plan.organization, authorizationScheme: 'Bearer' } })
        || !same(value.outcome, { status: 503, code: 'vo3773-owned-pre-dispatch-refusal', dispatched: false }))
        refuse('original refusal request semantics or repeated-attempt history differs');
      qualifying++;
    } else refuse('observer history includes an unsupported event');
    previous = bound.sha256; records.push(bound);
  }
  if (!qualifying || records[named.sequence]?.sha256 !== refusal.sha256) refuse('no exact original refusal belongs to the complete invocation history');
  return { profile: profile.profile, refusal, observer, helper, descriptor, launch, records,
    evidence: { profile: profile.profile, refusal: reference(refusal), launch: reference(launch), observer: reference(observer),
      helper: reference(helper), descriptor: reference(descriptor), history: records.map(reference), placementDebtRetained: true } };
}

export function qualifyTerminalRetirement(evidence, custody) {
  const launched = parse(evidence.launch), matches = [];
  if (!same(launched.node, custody.owner.node) || !same(launched.owner, {pid:custody.owner.pid,incarnation:custody.owner.incarnation}))
    refuse('original startup and joined retirement do not belong to this qualified native runtime/incarnation');
  if (custody.owner.preload && (!same(custody.owner.preload.observer, {path:evidence.observer.path,sha256:evidence.observer.sha256})
    || !same(custody.owner.preload.helper, {path:evidence.helper.path,sha256:evidence.helper.sha256})
    || !same(custody.owner.preload.descriptor, {path:evidence.descriptor.path,sha256:evidence.descriptor.sha256})))
    refuse('native inherited preload does not bind this original observer and descriptor');
  for (const reference of custody.writers.retired) {
    const bound = readBound(reference, {privateFile:true}), retired = parse(bound);
    if (!same(retired.launch, {path:evidence.launch.path,sha256:evidence.launch.sha256})) continue;
    if (retired.version !== 1 || retired.kind !== 'connection-program-retirement' || retired.pid !== launched.pid
      || !same(retired.binding,launched.binding) || !same(retired.owner,launched.owner)
      || !(retired.code === null || Number.isSafeInteger(retired.code)) || !(retired.signal === null || typeof retired.signal === 'string')
      || retired.code === null && retired.signal === null || !Number.isFinite(Date.parse(retired.closedAt ?? '')))
      refuse('original observer invocation has no exact joined native retirement');
    matches.push(bound);
  }
  if (matches.length !== 1) refuse('original observer invocation is not uniquely retired by the qualified native owner');
  return {...evidence.evidence,retirement:{path:matches[0].path,sha256:matches[0].sha256}};
}
