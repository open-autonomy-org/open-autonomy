// Retained publication aliases: native continuity is evidence, never custody or a new OA identity.
import { createHash } from 'node:crypto';

export interface NativeInstance {
  team_id: string; source_id: string; machine_id: string; incarnation_id: string;
  harness: string; native_session_id: string;
}
export interface ContinuityReceipt {
  protocol: 'session-migration.v1'; operation_key: string; generation: number; canonical_session: string;
  source: NativeInstance; instance: NativeInstance;
  final_source_revision: number; final_source_manifest_sha256: string;
  destination_revision: number; destination_manifest_sha256: string; materialization_sha256: string;
  decision_id: string; receipt_id: string;
}
export interface OriginEvidence {
  canonicalSession: string; instance: NativeInstance;
  // Full public native readback and the retained adoption/attempt evidence which qualified it.
  native: unknown; bindingEvidence: string;
}
export interface AliasReconciliation {
  receiptDigest: string; destinationRevision: number; destinationManifest: string; wirePolicy: string;
  checkpoint: { seq: number; digest: string; endedAt?: string }; remoteSeq: number;
  readerRevision?: number;
}
export interface SessionAlias {
  version: 1; receipt: ContinuityReceipt; receiptDigest: string; predecessor: string | null;
  operation: string; generation: number; instance: NativeInstance;
  state: 'pending' | 'verified'; reconciliation?: AliasReconciliation; hold?: string;
  reader?: { ownerNonce: string; connection: string; state: 'replacing' | 'active' | 'retired' | 'unknown' };
}
export class ContinuityPending extends Error {
  constructor(message: string) { super(`Session continuity pending: ${message}`); }
}
export const continuityCanonical = (value: unknown): string => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
export const continuityDigest = (value: unknown): string => createHash('sha256').update(continuityCanonical(value)).digest('hex');
export const sameContinuity = (a: unknown, b: unknown): boolean => continuityCanonical(a) === continuityCanonical(b);
export function continuityOwner(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ContinuityPending('native ownership readback is missing');
  const owner = value as Record<string,unknown>;
  if (!['agent','plain'].includes(String(owner.kind))) throw new ContinuityPending('native ownership kind is unsupported');
  return {kind:owner.kind,agent_id:owner.agent_id,starter:owner.starter};
}
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && !/[\0-\x1f]/.test(v);
const digest = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
export function nativeInstance(value: any): NativeInstance {
  if (!value || !['team_id','source_id','machine_id','incarnation_id','harness','native_session_id'].every(key => text(value[key])))
    throw new ContinuityPending('native source/machine/incarnation/harness/session tuple is incomplete');
  return Object.fromEntries(['team_id','source_id','machine_id','incarnation_id','harness','native_session_id'].map(key => [key, value[key]])) as unknown as NativeInstance;
}
export function continuityReceipt(value: any): ContinuityReceipt {
  if (!value || value.protocol !== 'session-migration.v1' || !text(value.operation_key) || !Number.isSafeInteger(value.generation) || value.generation < 1
    || !text(value.canonical_session) || !text(value.receipt_id) || !text(value.decision_id)
    || !Number.isSafeInteger(value.final_source_revision) || value.final_source_revision < 0
    || !Number.isSafeInteger(value.destination_revision) || value.destination_revision < 0
    || ![value.final_source_manifest_sha256,value.destination_manifest_sha256,value.materialization_sha256].every(digest))
    throw new ContinuityPending('committed receipt lacks its version, exact revisions/manifests or activation decision');
  const source = nativeInstance(value.source), instance = nativeInstance(value.instance);
  if (source.team_id !== instance.team_id || source.harness !== instance.harness
    || sameContinuity(source, instance)) throw new ContinuityPending('receipt does not name distinct compatible native instances');
  // Retain the whole receipt, including future native evidence; its digest makes a changed answer conflict.
  return structuredClone(value);
}
export function checkOriginEvidence(origin: OriginEvidence): void {
  const readback = origin?.native as any;
  if (!origin || !text(origin.canonicalSession) || !text(origin.bindingEvidence)
    || readback?.protocol !== 'session-migration.v1' || readback.canonical_session !== origin.canonicalSession
    || !text(readback.receipt_id) || !readback.owner || !sameContinuity(nativeInstance(readback.source),nativeInstance(origin.instance)))
    throw new ContinuityPending('original provenance lacks its exact public native source readback');
}
export function checkAliasChain(aliases: SessionAlias[] | undefined, origin?: OriginEvidence): void {
  if (origin !== undefined) checkOriginEvidence(origin);
  if (aliases === undefined) return;
  if (!Array.isArray(aliases) || !origin || !text(origin.canonicalSession) || !text(origin.bindingEvidence) || !origin.native)
    throw new ContinuityPending('alias chain has no original source-qualified provenance');
  let previous: SessionAlias | undefined;
  const operations = new Set<string>();
  for (const alias of aliases) {
    const receipt = continuityReceipt(alias?.receipt);
    if (alias.version !== 1 || alias.receiptDigest !== continuityDigest(receipt) || alias.operation !== receipt.operation_key || alias.generation !== receipt.generation
      || !sameContinuity(nativeInstance(alias.instance), nativeInstance(receipt.instance)) || alias.predecessor !== (previous?.receiptDigest ?? null)
      || receipt.canonical_session !== origin.canonicalSession || receipt.generation !== (previous ? previous.generation + 1 : 1)
      || !sameContinuity(nativeInstance(receipt.source), previous ? nativeInstance(previous.instance) : nativeInstance(origin.instance))
      || operations.has(alias.operation) || !['pending','verified'].includes(alias.state) || previous?.state === 'pending')
      throw new ContinuityPending('alias receipt, operation, predecessor or monotonic generation conflicts');
    if (alias.state === 'verified') {
      const r = alias.reconciliation;
      if (!r || r.receiptDigest !== alias.receiptDigest || r.destinationRevision !== receipt.destination_revision
        || r.destinationManifest !== receipt.destination_manifest_sha256 || !digest(r.wirePolicy) || !digest(r.checkpoint?.digest)
        || !Number.isSafeInteger(r.readerRevision) || r.readerRevision! < receipt.destination_revision
        || !Number.isSafeInteger(r.checkpoint.seq) || r.checkpoint.seq < 0 || !Number.isSafeInteger(r.remoteSeq) || r.remoteSeq < r.checkpoint.seq)
        throw new ContinuityPending('verified alias lacks the exact wire-prefix reconciliation');
    } else if (alias.reconciliation) throw new ContinuityPending('pending alias cannot select a reconciled reader');
    if (alias.reader && (!text(alias.reader.ownerNonce) || !text(alias.reader.connection) || !['replacing','active','retired','unknown'].includes(alias.reader.state)))
      throw new ContinuityPending('alias reader retirement identity/state is malformed');
    operations.add(alias.operation); previous = alias;
  }
}
