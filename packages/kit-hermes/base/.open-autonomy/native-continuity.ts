// Public native continuity readback and bounded revision paging. No native private store or copied path is authority.
import type { NormalizedMessage, RequestOptions, SessionDescriptor, SupercodeHarnessClient } from '@volter/supercode-harness-sdk';
import type { WindowReader, TranscriptWindow } from './reporting.ts';
import { ContinuityPending, continuityReceipt, continuityDigest, nativeInstance, sameContinuity,
  checkOriginEvidence, type ContinuityReceipt, type NativeInstance, type OriginEvidence } from './session-continuity.ts';

export interface ContinuityReadback {
  protocol: 'session-migration.v1'; canonical_session: string; active_instance: NativeInstance | null;
  pending_key: string | null; receipt: ContinuityReceipt | null;
  provenance: { source: NativeInstance; source_origin: {canonical_session:string;instance:NativeInstance;owner:unknown}; source_receipt: {revision:number;manifest_sha256:string}; materialization: { locator: SessionDescriptor['locator'] } } | null;
}
interface RevisionPage {
  version: 1; context: { team_id: string }; revision: number; instance: NativeInstance | null;
  descriptor: { id: string; coverage: { completeness: string } };
  messages: Array<{ source_id: string; value: NormalizedMessage }>; before_cursor: string | null;
}
// This adapter checks capability presence for older installed SDKs. Absence never supplies a receipt.
interface ContinuitySdk {
  sessionOrigin(query: { harness: string; native_session_id: string },options?: RequestOptions): Promise<unknown>;
  sessionContinuity(query: { session: string; generation?: number },options?: RequestOptions): Promise<ContinuityReadback>;
  sessionRevisionWindow(query: { session: string; revision?: number; tail?: number; before?: string },options?: RequestOptions): Promise<RevisionPage>;
}
const sdkOf = (sc: SupercodeHarnessClient): ContinuitySdk | undefined => {
  const api = sc as unknown as ContinuitySdk;
  return ['sessionOrigin','sessionContinuity','sessionRevisionWindow'].every(key => typeof (api as any)[key] === 'function') ? api : undefined;
};
export class NativeContinuity {
  constructor(private readonly sc: SupercodeHarnessClient) {}
  get available(): boolean { return Boolean(sdkOf(this.sc)); }
  async read(session: string,options?: RequestOptions): Promise<ContinuityReadback | undefined> {
    const api = sdkOf(this.sc); if (!api) return undefined;
    let observed: ContinuityReadback;
    try { observed = await api.sessionContinuity({session},options); }
    catch (error) {
      const rpc = error as {code?:unknown;method?:unknown};
      if (rpc?.code === -32601 && rpc.method === 'harness.v1.sessions.continuity') return undefined;
      throw error;
    }
    if (observed?.protocol !== 'session-migration.v1' || typeof observed.canonical_session !== 'string')
      throw new ContinuityPending('selected native source did not return its versioned canonical family');
    if (observed.pending_key) throw new ContinuityPending(`native family has pending operation ${observed.pending_key}`);
    if (observed.receipt) {
      const receipt = continuityReceipt(observed.receipt);
      if (receipt.canonical_session !== observed.canonical_session || !observed.active_instance
        || !sameContinuity(nativeInstance(receipt.instance),nativeInstance(observed.active_instance))
        || !observed.provenance || !sameContinuity(nativeInstance(observed.provenance.source),nativeInstance(receipt.source)))
        throw new ContinuityPending('committed receipt differs from selected native family/provenance');
      const provenance = observed.provenance;
      if (!provenance || provenance.source_origin?.canonical_session !== receipt.canonical_session
        || !sameContinuity(nativeInstance(provenance.source_origin.instance),nativeInstance(receipt.source))
        || provenance.source_receipt?.revision !== receipt.final_source_revision
        || provenance.source_receipt.manifest_sha256 !== receipt.final_source_manifest_sha256
        || continuityDigest(provenance.materialization) !== receipt.materialization_sha256)
        throw new ContinuityPending('committed receipt lacks its exact retained native origin/capture/materialization readback');
    }
    return observed;
  }
  async origin(d: SessionDescriptor,evidence: string,options?: RequestOptions): Promise<OriginEvidence | undefined> {
    const api = sdkOf(this.sc); if (!api) return undefined;
    const observed: any = await api.sessionOrigin({harness:d.locator.harness,native_session_id:d.locator.session_id},options);
    const origin: OriginEvidence = {canonicalSession:observed?.canonical_session,instance:nativeInstance(observed?.source),native:observed,bindingEvidence:evidence};
    checkOriginEvidence(origin);
    if (origin.instance.harness !== d.locator.harness || origin.instance.native_session_id !== d.locator.session_id)
      throw new ContinuityPending('public source qualification differs from the selected descriptor');
    return origin;
  }
  async assertCurrent(receipt: ContinuityReceipt,options?: RequestOptions): Promise<void> {
    const now = await this.read(receipt.canonical_session,options);
    if (!now?.receipt || continuityDigest(now.receipt) !== continuityDigest(receipt))
      throw new ContinuityPending('committed family receipt changed or became unavailable');
  }
  async revisionReader(receipt: ContinuityReceipt,reader: SupercodeHarnessClient,latest: boolean,options?: RequestOptions): Promise<{reader:WindowReader;revision:number}> {
    const api = sdkOf(reader); if (!api) throw new ContinuityPending('selected SDK lacks exact destination revision windows');
    const instance = nativeInstance(receipt.instance), session = receipt.canonical_session;
    let revision = latest ? undefined : receipt.destination_revision;
    const inspect = (page: RevisionPage): void => {
      if (page?.version !== 1 || !Number.isSafeInteger(page.revision) || page.revision < receipt.destination_revision
        || (revision !== undefined && page.revision !== revision) || page.context?.team_id !== instance.team_id
        || page.descriptor?.id !== session || page.descriptor.coverage?.completeness !== 'complete'
        || !page.instance || !sameContinuity(nativeInstance(page.instance),instance)
        || !Array.isArray(page.messages) || page.messages.some(message => message.source_id !== instance.source_id || !message.value))
        throw new ContinuityPending('destination revision is incomplete, advanced or belongs to another exact native instance');
      revision ??= page.revision;
    };
    // The public door pages backward. Retain only cursor/count/digest plans, then stream oldest first without holding
    // the transcript. Every replayed page must still be the exact immutable revision the native owner returned.
    const pages: Array<{before?:string;count:number;digest:string;offset:number}> = [];
    const cursors = new Set<string>(); let before: string | undefined, total = 0;
    for (;;) {
      const page = await api.sessionRevisionWindow({session,...(before ? {before} : {revision}),tail:500},options); inspect(page);
      pages.push({before,count:page.messages.length,digest:continuityDigest(page.messages),offset:0}); total += page.messages.length;
      if (!page.before_cursor) break;
      if (!page.messages.length || cursors.has(page.before_cursor)) throw new ContinuityPending('destination revision cursor did not advance');
      before = page.before_cursor; cursors.add(before);
    }
    pages.reverse(); let offset = 0;
    for (const page of pages) { page.offset = offset; offset += page.count; }
    const selectedRevision = revision!;
    const window = (page: RevisionPage,offset: number): TranscriptWindow => {
      const messages = page.messages.map(message => message.value), last = [...messages].reverse().find(message => message.role === 'assistant');
      const text = typeof last?.content === 'string' ? last.content : undefined;
      return {session:{messages},summary:{last_assistant_text:text},window:{offset,returned:messages.length,total_messages:total,has_newer:offset+messages.length<total}};
    };
    return {revision:selectedRevision,reader:{loadWindow:async (_locator,query = {}) => {
      if (query.message_tail !== undefined) {
        const page = await api.sessionRevisionWindow({session,revision:selectedRevision,tail:query.message_tail},options); inspect(page);
        return window(page,Math.max(0,total-page.messages.length));
      }
      const planned = pages.find(page => page.offset === (query.message_offset ?? 0));
      if (!planned) throw new ContinuityPending('transcript offset is outside the pinned destination revision plan');
      const page = await api.sessionRevisionWindow({session,...(planned.before ? {before:planned.before} : {revision:selectedRevision}),tail:500},options); inspect(page);
      if (page.messages.length !== planned.count || continuityDigest(page.messages) !== planned.digest)
        throw new ContinuityPending('immutable destination revision page changed');
      return window(page,planned.offset);
    }}};
  }
}
