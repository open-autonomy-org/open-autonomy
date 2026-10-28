#!/usr/bin/env node
// Seal an explicitly measured publisher transition. Preparation cannot create qualification; independent review judges the evidence.
import { chmodSync, existsSync, lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readArtifact, sha256 } from './prepare.mjs';

const fail = message => { throw new Error(`Project Rooms qualification: ${message}`); };
function sealed(path, expected) {
  const canonical = realpathSync(path), stat = lstatSync(path), bytes = readFileSync(canonical);
  if (canonical !== path || !stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o444) fail('evidence must be a canonical sealed file');
  const hash = sha256(bytes);
  if (expected && expected !== hash) fail(`evidence digest changed: ${path}`);
  return { path: canonical, sha256: hash, bytes };
}

export function qualifyRooms({ candidate, predecessor, evidence, out }) {
  const next = readArtifact(candidate, { verifySource: true }), previous = readArtifact(predecessor, { verifySource: true });
  const capability = next.value.lifecycle?.compensation;
  const supported = capability?.predecessors?.find(row => row.revision === previous.value.source.revision);
  if (capability?.protocol !== 1 || capability?.scope !== 'run-only' || !supported
    || supported.arcVersion !== previous.value.lifecycle?.state?.arcVersion || supported.files.length !== previous.value.files.length
    || supported.files.some(row => previous.value.files.find(file => file.path === row.path)?.sha256 !== row.sha256)) fail('the exact predecessor pair is unsupported');
  const proof = sealed(evidence), measured = JSON.parse(proof.bytes);
  if (measured.version !== 1 || measured.kind !== 'project-rooms-transition-evidence'
    || measured.candidate?.receipt !== next.receipt || measured.candidate?.sha256 !== next.sha256
    || measured.predecessor?.receipt !== previous.receipt || measured.predecessor?.sha256 !== previous.sha256) fail('measured inputs do not bind this exact pair');
  const ack = measured.compensation, binding = ack?.binding;
  if (ack?.ok !== true || ack.status !== 'quiesced' || ack.readiness?.loaded !== true
    || binding?.artifact !== next.sha256 || binding.app !== 'project-rooms'
    || ack.debt?.outstanding !== 0 || ack.debt?.unknown !== 0 || ack.debt?.run !== 0
    || ack.receipt?.quiesced !== true || ack.receipt?.compensated !== true || ack.receipt?.persisted !== true
    || ack.receipt?.runDebt !== 0 || ack.receipt?.predecessor !== previous.sha256
    || JSON.stringify(ack.receipt.binding) !== JSON.stringify(binding)) fail('no exact persisted zero-debt compensation acknowledgement');
  if (measured.predecessorReadback?.revision !== previous.value.source.revision
    || measured.predecessorReadback?.program !== previous.value.program
    || measured.predecessorReadback?.state !== binding.state || measured.predecessorReadback?.currentState !== true) fail('predecessor readback against current state is absent');
  if (!Array.isArray(measured.artifacts) || measured.artifacts.length < 2) fail('raw recording and source/offset map are required');
  for (const artifact of measured.artifacts) sealed(artifact.path, artifact.sha256);
  const value = { version: 1, kind: 'connection-program-qualification', candidate: { receipt: next.receipt, sha256: next.sha256 },
    predecessor: { receipt: previous.receipt, sha256: previous.sha256 }, protocol: 1, scope: 'run-only',
    evidence: { path: proof.path, sha256: proof.sha256 } };
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  if (existsSync(out)) {
    const current = sealed(realpathSync(out));
    if (current.bytes.toString() !== bytes) fail('qualification output already names different inputs');
  } else { writeFileSync(out, bytes, { flag: 'wx', mode: 0o444 }); chmodSync(out, 0o444); }
  return { qualification: realpathSync(out), sha256: sha256(bytes), ...value };
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), options = {};
  for (let i = 0; i < args.length; i++) {
    if (['--candidate', '--predecessor', '--evidence', '--out'].includes(args[i]) && args[i + 1]) options[args[i].slice(2)] = args[++i];
    else fail(`unknown or missing argument ${args[i]}`);
  }
  if (!options.candidate || !options.predecessor || !options.evidence || !options.out) fail('use --candidate RECEIPT --predecessor RECEIPT --evidence SEALED_JSON --out NEW_FILE');
  process.stdout.write(`${JSON.stringify(qualifyRooms(options))}\n`);
}
