// Consume only the existing native parent's qualified maintenance lease. No native transition/control is requested.
import { randomBytes, randomUUID } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { canonical, digestPattern, exactKeys, jsonDocument, readBound, refuse, same, sha256, uuidPattern } from './offline-files.mjs';

const kind = 'connection-native-maintenance-v1';
const parse = bound => { const doc = jsonDocument(bound.bytes); return doc.value(doc.root); };
const incarnation = value => typeof value === 'string' && value.length > 0 && value.length <= 128;
function runtimeOptions(owner, profile, metadata) {
  if (owner.platform !== profile.platform || owner.arch !== profile.arch || !same(owner.execArgv, profile.execArgv))
    refuse('native owner runtime flags/platform are not qualified');
  if (profile.nodeOptionsProfile === null) {
    if (owner.nodeOptions !== null || owner.preload !== null) refuse('native owner has an unsupported preload');
    return;
  }
  const preload = metadata.terminalEvidenceProfiles.find(item => item.profile === profile.nodeOptionsProfile);
  if (!preload || preload.profile !== 'project-rooms-pre-dispatch-refusal-v1' || typeof owner.nodeOptions !== 'string'
    || !owner.nodeOptions.startsWith('--import=file:')) refuse('native owner preload has no qualified source closure');
  let path;
  try { path = fileURLToPath(owner.nodeOptions.slice('--import='.length)); } catch { refuse('native owner preload URL is unsupported'); }
  canonical(path);
  if (owner.nodeOptions !== `--import=${pathToFileURL(path).href}` || path !== join(dirname(path), preload.observer.file))
    refuse('native owner preload options differ from the sole qualified import');
  exactKeys(owner.preload, ['observer','helper','descriptor'], 'native loaded preload closure');
  if (!same(owner.preload.observer, {path,sha256:preload.observer.sha256})
    || !same(owner.preload.helper, {path:join(dirname(path),preload.helper.file),sha256:preload.helper.sha256}))
    refuse('native loaded preload differs from its qualified source vector');
  for (const reference of Object.values(owner.preload)) readBound(reference,{sealed:true});
}
function runtimeFile(reference) {
  exactKeys(reference, ['path','sha256'], 'native runtime reference'); canonical(reference.path);
  const stat = lstatSync(reference.path);
  if (!stat.isFile() || stat.isSymbolicLink() || !digestPattern.test(reference.sha256 ?? '')
    || sha256(readFileSync(reference.path)) !== reference.sha256) refuse('qualified native runtime/source changed');
}
function sourceVector(actual, expected, tree) {
  if (!Array.isArray(actual) || !actual.length || !Array.isArray(expected) || !expected.length) refuse('native source closure is unqualified');
  const unique = new Map();
  for (const reference of actual) {
    runtimeFile(reference);
    const path = relative(tree, reference.path);
    if (!path || isAbsolute(path) || path.split(/[\\/]/).includes('..')) refuse('native source leaves the qualified tree');
    if (unique.has(path) && unique.get(path) !== reference.sha256) refuse('native source has conflicting loaded identities');
    unique.set(path, reference.sha256);
  }
  if (!same([...unique].map(([path, sha256]) => ({path,sha256})).sort((a,b)=>a.path.localeCompare(b.path)),
    [...expected].sort((a,b)=>a.path.localeCompare(b.path)))) refuse('loaded native source vector is not independently qualified');
}

export async function acquireCustody(plan, metadata, planReference, program) {
  exactKeys(plan.custody, ['protocol','sourceProfile'], 'native custody selection');
  if (plan.custody.protocol !== kind || !metadata.custodyProtocols.includes(kind)) refuse('unsupported inherited native custody protocol');
  const profile = metadata.custodySources?.find(item => item.id === plan.custody.sourceProfile);
  if (!profile) refuse('native custody source/runtime has no independently qualified profile');
  if (!process.send || !process.connected || !process.env.SUPERCODE_CONNECTION_MAINTENANCE)
    refuse('offline maintenance must be the existing native owner\'s exact IPC child');
  const environment = parse({bytes:Buffer.from(process.env.SUPERCODE_CONNECTION_MAINTENANCE)});
  exactKeys(environment, ['protocol','kind','lease','invocation','binding','owner'], 'inherited native maintenance');
  const { lease, invocation, binding, owner } = environment;
  const expected = {home:plan.home,connection:plan.connection,transaction:plan.intent.binding.transaction,plan:planReference,
    config:plan.config,state:plan.state,oldArtifact:plan.oldArtifact,recoveryArtifact:plan.recoveryArtifact,...plan.native};
  if (environment.protocol !== 1 || environment.kind !== kind || !uuidPattern.test(lease ?? '') || !uuidPattern.test(invocation ?? '')
    || !same(binding, expected) || owner?.pid !== process.ppid || !incarnation(owner.incarnation))
    refuse('inherited custody does not bind this exact native child, plan and retained transaction');
  canonical(owner.tree); runtimeFile(owner.node); runtimeFile(owner.entry);
  if (owner.node.sha256 !== profile.nodeSha256 || realpathSync(process.execPath) !== owner.node.path
    || sha256(readFileSync(realpathSync(process.execPath))) !== owner.node.sha256
    || owner.entry.path !== join(owner.tree, profile.entry)
    || owner.platform !== process.platform || owner.arch !== process.arch || owner.locking !== profile.locking)
    refuse('native parent entry/runtime is not qualified');
  runtimeOptions(owner, profile, metadata);
  sourceVector(owner.sourceFiles, profile.sources, owner.tree);
  let lost = null, pending = null, finished = false, first = null;
  const fail = error => {
    lost ??= error;
    if (pending) { clearTimeout(pending.timer); const waiter = pending; pending = null; waiter.reject(error); }
  };
  const disconnected = () => fail(new Error('native maintenance IPC closed; durable hold and uncertainty remain'));
  function validate(receipt) {
    exactKeys(receipt, ['type','protocol','kind','lease','invocation','challenge','binding','owner','hold','writers','owners','id'], 'native lease receipt');
    if (receipt.type !== 'supercode-maintenance-lease' || receipt.protocol !== 1 || receipt.kind !== kind
      || receipt.lease !== lease || receipt.invocation !== invocation || !same(receipt.binding, binding) || !same(receipt.owner, owner))
      refuse('live native lease changed its owner, source or binding');
    sourceVector(owner.sourceFiles, profile.sources, owner.tree); runtimeFile(owner.node); runtimeFile(owner.entry);
    runtimeOptions(owner, profile, metadata);
    if (!same(receipt.writers?.live, []) || !Array.isArray(receipt.writers?.retired)) refuse('native writers lack joined terminal receipts');
    for (const retired of receipt.writers.retired) readBound(retired, {privateFile:true});
    const hold = readBound(receipt.hold, {privateFile:true}), held = parse(hold);
    if (hold.path !== join(plan.home,'apps','connections',plan.connection,'maintenance.json') || held.version !== 1
      || held.kind !== 'connection-maintenance' || held.phase !== 'held' || held.lease !== lease || held.invocation !== invocation
      || held.transaction !== binding.transaction || !same(held.binding,binding) || !same(held.owner,owner) || !same(held.writers,receipt.writers)
      || held.maintenanceChild?.pid !== process.pid || !same(held.maintenanceChild.node,owner.node)
      || held.maintenanceChild.entry?.path !== program || !same(held.maintenanceChild.argv,[program,'--plan',planReference.path]))
      refuse('live lease has no exact durable native hold for this invocation');
    runtimeFile(held.maintenanceChild.entry);
    if (!Array.isArray(receipt.owners) || !Array.isArray(profile.owners) || receipt.owners.length !== profile.owners.length)
      refuse('native restart-owner coverage is unqualified');
    if (!Array.isArray(held.owners) || !same(held.owners.map(item=>item.owner),receipt.owners.map(item=>item.owner)))
      refuse('durable native hold names different restart-owner capabilities');
    const observed = new Set();
    for (const acknowledgment of receipt.owners) {
      const capability = acknowledgment.owner, supported = profile.owners.find(item=>item.kind===capability?.kind);
      if (!supported || observed.has(capability.kind) || acknowledgment.version !== 1 || acknowledgment.status !== 'held'
        || acknowledgment.lease !== lease || acknowledgment.transaction !== binding.transaction || acknowledgment.home !== plan.home
        || acknowledgment.connection !== plan.connection || acknowledgment.bindingDigest !== sha256(Buffer.from(JSON.stringify(binding)))
        || !uuidPattern.test(acknowledgment.challenge ?? '') || capability.protocol !== 1 || !Number.isSafeInteger(capability.pid)
        || !incarnation(capability.incarnation) || capability.node?.sha256 !== supported.nodeSha256)
        refuse('native restart owner supplied no exact live source-qualified acknowledgment');
      observed.add(capability.kind); runtimeFile(capability.node); sourceVector(capability.sources,supported.sources,owner.tree);
      runtimeOptions(capability,supported,metadata);
    }
    if (first && (!same(first.hold,receipt.hold) || !same(first.writers,receipt.writers)
      || !same(first.owners.map(item=>item.owner),receipt.owners.map(item=>item.owner)))) refuse('native held owners/writers changed during invocation');
  }
  const message = receipt => {
    if (!pending) return fail(new Error('unsolicited native maintenance receipt'));
    try {
      if (receipt?.id !== pending.id || receipt.challenge !== pending.challenge) refuse('native lease challenge/answer differs');
      if (receipt.type === 'supercode-maintenance-refused') {
        exactKeys(receipt, ['type','protocol','lease','invocation','id','challenge','error'], 'native lease refusal');
        if (receipt.protocol !== 1 || receipt.lease !== lease || receipt.invocation !== invocation || typeof receipt.error !== 'string')
          refuse('native lease refusal binding differs');
        refuse(`native maintenance lease refused: ${receipt.error}`);
      }
      validate(receipt);
      const waiter = pending; pending = null; clearTimeout(waiter.timer); first ??= receipt; waiter.resolve(receipt);
    } catch (error) { fail(error); }
  };
  process.on('message',message); process.on('disconnect',disconnected);
  const recheck = () => {
    if (finished || lost || !process.connected) return Promise.reject(lost ?? new Error('native custody channel is unavailable'));
    if (pending) return Promise.reject(new Error('native custody challenge is already pending'));
    return new Promise((resolve,reject) => {
      const id = randomUUID(), challenge = randomBytes(24).toString('hex');
      const timer = setTimeout(()=>fail(new Error('native custody challenge unanswered; durable hold and uncertainty retained')),8000);
      pending = {id,challenge,timer,resolve,reject};
      process.send({type:'supercode-maintenance-check',protocol:1,lease,invocation,id,challenge},error=>{if(error)fail(error);});
    });
  };
  const finish = () => {
    finished = true;
    if (pending) fail(new Error('native custody invocation ended with a pending challenge'));
    process.off('message',message); process.off('disconnect',disconnected);
    // Closing IPC cannot release custody. The native owner must join this child and independently read its audit first.
    if (process.connected) process.disconnect();
  };
  try { await recheck(); }
  catch (error) { finish(); throw error; }
  return { recheck, finish,
    assertInputs(native) { if (native.values.sourceCandidate.lock?.root !== owner.tree) refuse('native loaded tree differs from the exact retained source candidate'); },
    get receipt() { return {protocol:1,kind,lease,invocation,sourceProfile:profile.id,binding,owner,hold:first.hold,writers:first.writers,owners:first.owners}; },
    get writers() { return first.writers; },
    get owner() { return owner; },
  };
}
