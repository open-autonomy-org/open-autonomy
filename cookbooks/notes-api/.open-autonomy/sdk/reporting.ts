// Publication policy and delivery only. Supercode owns native reconstruction and lifecycle.
import { createHash } from 'node:crypto';
import type { NormalizedMessage, SessionDescriptor, SupercodeHarnessClient } from '@volter-ai-dev/supercode-harness-sdk';
import { OpenAutonomy, Session, type SessionEnd, type SessionStart, type Turn } from './client.ts';

export interface PublicationPolicy { runs: boolean; chats: boolean; private: string[] }
export function publicationPolicy(value: unknown): PublicationPolicy {
  const p = value ?? {};
  if (typeof p !== 'object' || Array.isArray(p)) throw new Error('publish must be a YAML mapping');
  const v = p as Record<string, unknown>;
  for (const key of ['runs', 'chats']) if (v[key] !== undefined && typeof v[key] !== 'boolean') throw new Error(`publish.${key} must be boolean`);
  if (v.private !== undefined && (!Array.isArray(v.private) || v.private.some(x => typeof x !== 'string' || !x))) throw new Error('publish.private must be a list of session/job IDs');
  return { runs: v.runs as boolean ?? true, chats: v.chats as boolean ?? false, private: v.private as string[] ?? [] };
}
export const publishes = (p: PublicationPolicy, d: SessionDescriptor, kind: 'run' | 'chat', jobName?: string): boolean =>
  p[kind === 'run' ? 'runs' : 'chats'] && !p.private.includes(d.locator.session_id) && !(jobName && p.private.includes(jobName)) && !(d.recurrence && p.private.includes(d.recurrence.job_id));

const content = (m: NormalizedMessage): string => typeof m.content === 'string' ? m.content : (m.content ?? []).map(p => typeof p === 'string' ? p : (p as { text?: string })?.text ?? '').join('');
export function turnsOf(m: NormalizedMessage, harness: string): Turn[] {
  // Supercode stamps stored Hermes rows with their native ID. Its reconstructed
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
const canonical = (t: Turn): string => JSON.stringify([t.role, t.ts, t.text, t.tool, t.args, t.result]);
const digest = (turns: Turn[]): string => createHash('sha256').update(turns.map(canonical).join('\n')).digest('hex');
export interface PublicationCheckpoint { seq: number; digest: string; endedAt?: string }
export type RecordedCompletion = Pick<SessionEnd, 'endedAt' | 'outcome'> & { endedAt: string };

/** One serialized SDK-to-SDK reconciliation. No clock can end a native session. */
export class TranscriptPublisher {
  private pending?: Promise<PublicationCheckpoint>;
  constructor(private readonly sc: Pick<SupercodeHarnessClient, 'loadWindow'>, private readonly oa: OpenAutonomy,
    private readonly account: string, readonly descriptor: SessionDescriptor, readonly start: SessionStart,
    private checkpoint?: PublicationCheckpoint, private readonly save?: (checkpoint: PublicationCheckpoint) => void) {}

  publish(completion?: RecordedCompletion): Promise<PublicationCheckpoint> {
    if (this.pending) return this.pending; // the next observation carries any newer completion
    const work = this.reconcile(completion);
    this.pending = work;
    void work.finally(() => { this.pending = undefined; }).catch(() => {});
    return work;
  }
  private async reconcile(completion?: RecordedCompletion): Promise<PublicationCheckpoint> {
    const key = this.descriptor.locator.session_id;
    const turns: Turn[] = [];
    let offset = 0, report: string | undefined, nativeCompletion: RecordedCompletion | undefined;
    for (;;) {
      const page = await this.sc.loadWindow(this.descriptor.locator, { message_offset: offset, message_limit: 500 });
      if (page.window.offset !== offset) throw new Error(`${key}: source window moved; retry reconciliation`);
      turns.push(...page.session.messages.flatMap(m => turnsOf(m, this.descriptor.locator.harness)));
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
    const remote = await this.oa.session(this.account, key);
    const seq = remote?.next_seq ?? 0;
    if (!this.checkpoint && seq > (remote?.turns.length ?? 0)) throw new Error(`${key}: publication checkpoint missing for history outside the destination tail; reconciliation required`);
    if (seq > turns.length || (this.checkpoint && this.checkpoint.seq <= seq && digest(turns.slice(0, this.checkpoint.seq)) !== this.checkpoint.digest)) {
      throw new Error(`${key}: published history changed; append-only destination needs reconciliation`);
    }
    // Also verify the destination's retained tail, including recovery from an old
    // reporter or a lost upload response. Never equate an offset with matching text.
    for (const t of remote?.turns ?? []) {
      if (t.seq === undefined || !turns[t.seq] || canonical(t) !== canonical(turns[t.seq])) throw new Error(`${key}: published history changed; append-only destination needs reconciliation`);
    }
    const session = remote ? new Session(this.oa, key, seq) : await this.oa.open(this.start);
    if (session.seq !== seq) throw new Error(`${key}: destination advanced; retry reconciliation`);
    // Persist each acknowledged batch. A crash can leave at most one batch to
    // verify against the platform's retained tail, never an unbounded blind gap.
    while (session.seq < turns.length) {
      await session.turns(turns.slice(session.seq, session.seq + 100), this.start.item);
      this.checkpoint = { seq: session.seq, digest: digest(turns.slice(0, session.seq)) };
      this.save?.(this.checkpoint);
    }
    const checkpoint: PublicationCheckpoint = { seq: session.seq, digest: digest(turns) };
    const ended = completion ?? nativeCompletion;
    if (ended) {
      await session.end({ ...ended, report, item: this.start.item });
      checkpoint.endedAt = ended.endedAt;
    }
    this.checkpoint = checkpoint;
    this.save?.(checkpoint);
    return checkpoint;
  }
}
