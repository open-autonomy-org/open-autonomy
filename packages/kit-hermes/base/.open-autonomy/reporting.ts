// Publication policy and delivery only. Volter Harness owns native reconstruction and lifecycle.
import { createHash } from 'node:crypto';
import type { NormalizedMessage, SessionDescriptor, SupercodeHarnessClient } from '@volter/supercode-harness-sdk';
import { OpenAutonomy, Session, type SessionEnd, type SessionStart, type Turn } from './sdk/client.ts';
import { startWork, recordWork, measureWork } from './work-ledger.ts';

export interface PublicationPolicy { runs: boolean; chats: boolean; private: string[] }
export function publicationPolicy(value: unknown): PublicationPolicy {
  const p = value ?? {};
  if (typeof p !== 'object' || Array.isArray(p)) throw new Error('publish must be a YAML mapping');
  const v = p as Record<string, unknown>;
  for (const key of ['runs', 'chats']) if (v[key] !== undefined && typeof v[key] !== 'boolean') throw new Error(`publish.${key} must be boolean`);
  if (v.private !== undefined && (!Array.isArray(v.private) || v.private.some(x => typeof x !== 'string' || !x))) throw new Error('publish.private must be a list of session IDs, job IDs or names, or profile names');
  return { runs: v.runs as boolean ?? true, chats: v.chats as boolean ?? false, private: v.private as string[] ?? [] };
}
// A profile named in `private` is an agent whose audience is the team or the owner (ADR 0014): none of its sessions is sent.
export const publishes = (p: PublicationPolicy, d: SessionDescriptor, kind: 'run' | 'chat', jobName?: string): boolean =>
  p[kind === 'run' ? 'runs' : 'chats'] && !(d.profile && p.private.includes(d.profile)) && !p.private.includes(d.locator.session_id) && !(jobName && p.private.includes(jobName)) && !(d.recurrence && p.private.includes(d.recurrence.job_id));

const content = (m: NormalizedMessage): string => typeof m.content === 'string' ? m.content : (m.content ?? []).map(p => typeof p === 'string' ? p : (p as { text?: string })?.text ?? '').join('');
export function turnsOf(m: NormalizedMessage, harness: string): Turn[] {
  // Volter Harness stamps stored Hermes rows with their native ID. Its reconstructed
  // missing-tool placeholders have no native row: never publish them as evidence.
  if (harness === 'hermes' && !m.metadata.hermes_message_id) return [];
  const text = content(m), ts = m.metadata.timestamp ?? m.metadata.ts;
  const stamp = ts && Number.isFinite(Date.parse(ts)) ? { ts } : {};
  if (m.role === 'tool') return [{ ...stamp, role: 'tool', tool: (m.name ?? 'tool').slice(0, 80), ...(text ? { result: text.slice(0, 600) } : {}) }];
  if (m.role === 'assistant') return [
    ...(text.trim() ? [{ ...stamp, role: 'assistant' as const, text: text.slice(0, 2000) }] : []),
    ...(m.tool_calls ?? []).map(c => ({ ...stamp, role: 'assistant' as const, tool: c.function.name.slice(0, 80), ...(c.function.arguments ? { args: c.function.arguments.slice(0, 600) } : {}) })),
  ];
  return m.role === 'user' ? [{ ...stamp, role: 'user', ...(text ? { text: text.slice(0, 2000) } : {}) }] : [];
}
// Match the published wire fields, independent of object-key order or server seq metadata.
/** A live source rewrote its history: the reporter continues it under a new key. */
export class SourceRewritten extends Error { constructor(readonly key: string) { super(`${key}: source history rewritten; continuing under a new key`); } }
const canonical = (t: Turn): string => JSON.stringify([t.role, t.ts, t.text, t.tool, t.args, t.result]);
// The loader answers a tool call that has no result yet with a stand-in, so a replayed transcript stays valid. In a
// live session that is a call still running: its real result comes later, in the same place.
const standIn = (t: Turn | undefined): boolean => t?.role === 'tool' && typeof t.result === 'string' && t.result.startsWith('[no tool result recorded');
// A published stand-in and the result that replaced it are the same turn.
const same = (published: Turn, source: Turn | undefined): boolean => !!source && (canonical(published) === canonical(source) || (standIn(published) && source.role === 'tool'));
// The digest of a transcript prefix is sha256 over its turns' canonical forms joined by newlines. It is folded one turn
// at a time, so no reconciliation holds a session's whole history to compute it.
class PrefixDigest {
  private readonly hash = createHash('sha256');
  count = 0;
  add(turn: Turn): void { this.hash.update((this.count++ ? '\n' : '') + canonical(turn)); }
  digest(): string { return this.hash.copy().digest('hex'); }
}
export interface PublicationCheckpoint { seq: number; digest: string; endedAt?: string }
export type RecordedCompletion = Pick<SessionEnd, 'endedAt' | 'outcome'> & { endedAt: string };
// Media in a source window is read as a reference (its type and size), never its inline bytes: no turn carries media.
const WINDOW = { message_limit: 500, inline_media: 'metadata' as const };
const BATCH = 100;
/** What reconciliations read from their sources since the publisher last reported it (`takeReadVolume`). */
const volume = { reconciled: 0, unchanged: 0, windows: 0, messages: 0 };
export function takeReadVolume(): typeof volume { const taken = { ...volume }; volume.reconciled = volume.unchanged = volume.windows = volume.messages = 0; return taken; }

/** One serialized SDK-to-SDK reconciliation. No clock can end a native session. */
export class TranscriptPublisher {
  private pending?: Promise<PublicationCheckpoint>;
  // The source as the last completed reconciliation found it; an unchanged source has nothing more to publish.
  private observed?: string;
  constructor(private readonly sc: Pick<SupercodeHarnessClient, 'loadWindow'>, private readonly oa: OpenAutonomy,
    private readonly account: string, readonly descriptor: SessionDescriptor, readonly start: SessionStart,
    private checkpoint?: PublicationCheckpoint, private readonly save?: (checkpoint: PublicationCheckpoint) => void) {}

  publish(completion?: RecordedCompletion): Promise<PublicationCheckpoint> {
    if (this.checkpoint?.endedAt) return Promise.resolve(this.checkpoint); // ended and published: append-only, so nothing more can follow
    if (this.pending) return this.pending; // the next observation carries any newer completion
    const work = measureWork('pass', 'publisher.transcript-reconcile', () => this.reconcile(completion));
    this.pending = work;
    void work.finally(() => { this.pending = undefined; }).catch(() => {});
    return work;
  }
  private async readWindow(options: Parameters<SupercodeHarnessClient['loadWindow']>[1]) {
    const finish = startWork('load', 'publisher.window');
    try {
      const page = await this.sc.loadWindow(this.descriptor.locator, options);
      finish({ ok: true, units: { pages: 1, messages: page.session.messages.length } });
      return page;
    } catch (error) { finish({ ok: false }); throw error; }
  }
  // The source in one small read: its message count, its native end and its last message, beside the recorded completion.
  private async fingerprint(completion?: RecordedCompletion): Promise<string> {
    const tail = await this.readWindow({ message_tail: 1, inline_media: 'metadata' });
    const native = tail.session as typeof tail.session & { ended_at?: string | null; end_reason?: string | null };
    const last = tail.session.messages.at(-1);
    return JSON.stringify([tail.window.total_messages, native.ended_at ?? null, native.end_reason ?? null, completion?.endedAt ?? null, completion?.outcome ?? null,
      last ? createHash('sha256').update(JSON.stringify(last)).digest('hex') : null]);
  }
  private async reconcile(completion?: RecordedCompletion): Promise<PublicationCheckpoint> {
    // The platform's key: the session's own id, or a continuation of it (`<id>~<n>`) once its source was rewritten.
    const key = this.start.key;
    const observed = await this.fingerprint(completion);
    if (this.checkpoint && observed === this.observed) { volume.unchanged++; recordWork('pass', 'publisher.transcript-unchanged', { units: { unchanged: 1 } }); return this.checkpoint; }
    volume.reconciled++;
    const remote = await this.oa.session(this.account, key);
    const seq = remote?.next_seq ?? 0;
    // The destination is append-only. When what it holds no longer matches what the source says (an older reporter,
    // a lost acknowledgement), no turn is rewritten. Its retained tail and the saved checkpoint are checked against the
    // source's first `seq` turns as they stream past; every turn after them is new.
    const retained = new Map<number, Turn>();
    let diverged = (!this.checkpoint && seq > (remote?.turns.length ?? 0));
    for (const t of remote?.turns ?? []) { if (t.seq === undefined) diverged = true; else retained.set(t.seq, t); }
    const prefix = new PrefixDigest();
    let atSeq = seq === 0 ? prefix.digest() : undefined, matched = 0;
    const verifyCheckpoint = () => { if (this.checkpoint && this.checkpoint.seq <= seq && prefix.count === this.checkpoint.seq && prefix.digest() !== this.checkpoint.digest) diverged = true; };
    verifyCheckpoint();
    // A live session's calls still running are published once they have their results, never as stand-ins: a run of
    // stand-ins at the end of what has been read is held back until a later turn or the session's end settles it.
    let total = 0, standIns = 0, standInsFrom: { at: number; digest: string } | undefined;
    const fresh: Turn[] = [];
    let session: Session | undefined;
    const destination = async (): Promise<Session> => {
      if (session) return session;
      const opened = remote ? new Session(this.oa, key, seq) : await this.oa.open(this.start);
      if (opened.seq !== seq) throw new Error(`${key}: destination advanced; retry reconciliation`);
      return session = opened;
    };
    // Persist each acknowledged batch. A crash can leave at most one batch to
    // verify against the platform's retained tail, never an unbounded blind gap.
    const send = async (batch: Turn[]) => {
      const to = await destination();
      const finish = startWork('pass', 'publisher.delivery');
      try { await to.turns(batch, this.start.item); finish({ ok: true, units: { messages: batch.length } }); }
      catch (error) { finish({ ok: false }); throw error; }
      for (const t of batch) prefix.add(t);
      if (to.seq !== prefix.count) throw new Error(`${key}: destination acknowledged ${to.seq} turns for ${prefix.count}; retry reconciliation`);
      this.checkpoint = { seq: to.seq, digest: prefix.digest() };
      this.save?.(this.checkpoint);
    };
    let offset = 0, report: string | undefined, nativeCompletion: RecordedCompletion | undefined;
    for (;;) {
      const page = await this.readWindow({ ...WINDOW, message_offset: offset });
      if (page.window.offset !== offset) throw new Error(`${key}: source window moved; retry reconciliation`);
      volume.windows++; volume.messages += page.window.returned;
      for (const turn of page.session.messages.flatMap(m => turnsOf(m, this.descriptor.locator.harness))) {
        const at = total++;
        if (standIn(turn)) { if (!standIns++ && at < seq) standInsFrom = { at, digest: prefix.digest() }; }
        else { standIns = 0; standInsFrom = undefined; }
        if (at < seq) {
          prefix.add(turn);
          verifyCheckpoint();
          const held = retained.get(at);
          if (held) { if (same(held, turn)) matched++; else diverged = true; }
          if (prefix.count === seq) atSeq = prefix.digest();
          continue;
        }
        if (matched !== retained.size) diverged = true; // a retained turn the source's first `seq` turns did not hold
        if (diverged) continue;
        fresh.push(turn);
        while (fresh.length - Math.min(standIns, fresh.length) >= BATCH) await send(fresh.splice(0, BATCH));
      }
      report = page.summary.last_assistant_text || undefined;
      const native = page.session as typeof page.session & { ended_at?: string | null; end_reason?: string | null };
      nativeCompletion = native.ended_at ? {
        endedAt: native.ended_at,
        ...(native.end_reason === 'error' ? { outcome: 'failed' as const } : {}),
      } : undefined;
      offset += page.window.returned;
      if (!page.window.has_newer) break;
      if (!page.window.returned) throw new Error(`${key}: source window did not advance`);
    }
    const ended = completion ?? nativeCompletion;
    if (!ended && standIns) { total -= standIns; fresh.length -= Math.min(standIns, fresh.length); }
    if (seq > total || matched !== retained.size) diverged = true;
    // The digest of the source's first min(seq, total) turns, for a destination settled where it stands.
    const settledDigest = (): string => total >= seq ? atSeq! : standInsFrom && total === standInsFrom.at ? standInsFrom.digest : prefix.digest();
    // A diverged destination keeps what it holds. But a session that has ended is ended: its end is published over the
    // transcript as it stands, so the books never call a finished session live.
    if (diverged) {
      // A destination that is no longer live cannot be reconciled and never will be: the source's earlier turns were
      // rewritten (Hermes compresses a long run) and nothing may be rewritten here. What the platform holds is the
      // record. Settle it at the checkpoint instead of reloading the whole session from the source every minute for
      // the rest of the install's life, which is what retrying a permanent divergence amounts to.
      if (remote && remote.status !== 'live' && ended) {
        const settled: PublicationCheckpoint = { seq, digest: settledDigest(), endedAt: ended?.endedAt ?? remote.ended_at ?? new Date().toISOString() };
        this.checkpoint = settled;
        this.save?.(settled);
        return settled;
      }
      // A live source whose history was rewritten (a harness compacting a long session keeps only what follows the
      // boundary) goes on as a continuation: its published record ends at its last turn, and the source is published
      // again from its first turn under the next key.
      if (!ended && remote) {
        if (remote.status === 'live') await new Session(this.oa, key, seq).end({ endedAt: remote.turns.at(-1)?.ts ?? new Date().toISOString(), item: this.start.item });
        throw new SourceRewritten(key);
      }
      if (!ended || !remote) throw new Error(`${key}: published history changed; append-only destination needs reconciliation`);
      await new Session(this.oa, key, seq).end({ ...ended, report, item: this.start.item });
      const checkpoint: PublicationCheckpoint = { seq, digest: settledDigest(), endedAt: ended.endedAt };
      this.checkpoint = checkpoint;
      this.save?.(checkpoint);
      return checkpoint;
    }
    while (fresh.length) await send(fresh.splice(0, BATCH));
    const to = await destination();
    const checkpoint: PublicationCheckpoint = { seq: to.seq, digest: prefix.digest() };
    if (ended) {
      await to.end({ ...ended, report, item: this.start.item });
      checkpoint.endedAt = ended.endedAt;
    }
    this.checkpoint = checkpoint;
    this.save?.(checkpoint);
    this.observed = observed;
    return checkpoint;
  }
}
