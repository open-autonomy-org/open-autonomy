import { expect, test } from 'bun:test';
import type { NormalizedMessage, SessionDescriptor, SessionLoadResult } from '@volter-ai-dev/supercode-harness-sdk';
import { OpenAutonomy, Session, type SessionRecord, type Turn } from '../src/client.ts';
import { publicationPolicy, publishes, TranscriptPublisher, turnsOf } from '../src/reporting.ts';

const descriptor = { locator: { harness: 'hermes', session_id: 'cron-fixture', storage: { kind: 'sqlite', path: '/fixture/state.db', selector: 'cron-fixture' } }, trigger: 'cron', cwd: '/fixture', title: null, model: null, updated_at_ms: null, message_count: null } as SessionDescriptor;
const message = (i: number): NormalizedMessage => ({ role: i % 2 ? 'assistant' : 'user', content: `message ${i}`, metadata: { hermes_message_id: String(i + 1) } });
const completion = { endedAt: '2026-09-09T12:00:00Z', outcome: 'done' as const };
function fixture(count: number) {
  let messages = Array.from({ length: count }, (_, i) => message(i));
  let record: SessionRecord | undefined, reject = '', lost = false;
  const batches: number[] = [], reads: number[] = [], events: string[] = [];
  const fetch = async (input: any, init?: RequestInit): Promise<Response> => {
    if (!init?.method) return new Response(JSON.stringify({ session: record ? { ...record, turns: record.turns.slice(-400) } : undefined }), { status: record ? 200 : 404 });
    const [event] = JSON.parse(init.body as string), kind = event.type.split('.').pop();
    events.push(kind);
    if (reject === kind) return new Response(JSON.stringify({ ok: false, results: [{ ok: false }] }), { status: 503 });
    if (kind === 'started') record ??= { key: 'cron-fixture', account: 'fixture/repo', next_seq: 0, status: 'live', turns: [] } as unknown as SessionRecord;
    if (kind === 'turns') {
      batches.push(event.data.turns.length);
      expect(event.data.turns.length).toBeLessThanOrEqual(100);
      if (event.data.seq >= record!.next_seq) {
        record!.turns.push(...event.data.turns.map((t: Turn, i: number) => ({ ...t, seq: event.data.seq + i })));
        record!.next_seq = event.data.seq + event.data.turns.length;
      }
      if (lost) { lost = false; throw new Error('response lost after acceptance'); }
    }
    if (kind === 'ended') { record!.status = 'ended'; record!.outcome = event.data.outcome; }
    return new Response(JSON.stringify({ ok: true, results: [{ ok: true, session: record }] }));
  };
  const oa = new OpenAutonomy({ baseUrl: 'http://fixture.invalid/v1', key: 'synthetic', fetch: fetch as typeof globalThis.fetch });
  const sc = { loadWindow: async (_: unknown, options: any): Promise<SessionLoadResult> => {
    const offset = options.message_offset, page = messages.slice(offset, offset + options.message_limit);
    reads.push(offset);
    return { session: { messages: page }, summary: { last_assistant_text: 'final native report' }, window: { offset, returned: page.length, has_newer: offset + page.length < messages.length } } as SessionLoadResult;
  } };
  const publisher = () => new TranscriptPublisher(sc, oa, 'fixture/repo', descriptor, { key: 'cron-fixture', kind: 'run' });
  return { oa, sc, publisher, batches, reads, events, record: () => record!, reject: (kind: string) => { reject = kind; }, lose: () => { lost = true; }, append: () => messages.push(message(messages.length)), rewrite: () => { messages[0] = { ...message(0), content: 'corrected source' }; } };
}

test('native windows drain past 5000 messages; a quiet run stays open until recorded completion', async () => {
  const f = fixture(5103), p = f.publisher();
  await p.publish();
  expect(f.record().next_seq).toBe(5103);
  expect(f.reads).toContain(5000);
  await p.publish();
  expect(f.events).not.toContain('ended');
  f.append();
  const checkpoint = await p.publish(completion);
  expect(checkpoint.seq).toBe(5104);
  expect(f.record().status).toBe('ended');
  expect(f.events.at(-1)).toBe('ended');
  expect(f.record().turns.at(-1)?.text).toBe('message 5103');
});

test('rejected uploads and end events remain retryable, never silently acknowledged', async () => {
  const f = fixture(130), p = f.publisher();
  f.reject('turns');
  await expect(p.publish(completion)).rejects.toThrow('acknowledgment');
  expect(f.record().next_seq).toBe(0);
  expect(f.events).not.toContain('ended');
  f.reject('ended');
  await expect(p.publish(completion)).rejects.toThrow('acknowledgment');
  expect(f.record().next_seq).toBe(130);
  expect(f.record().status).toBe('live');
  f.reject('');
  await p.publish(completion);
  expect(f.record().next_seq).toBe(130);
  expect(f.record().status).toBe('ended');
});

test('response lost after acceptance and reporter restart reconcile the server offset without duplicates', async () => {
  const f = fixture(5010);
  f.lose();
  await expect(f.publisher().publish()).rejects.toThrow('response lost');
  expect(f.record().next_seq).toBe(100);
  await f.publisher().publish(completion);
  expect(f.record().turns.length).toBe(5010);
  expect(new Set(f.record().turns.map(t => t.seq)).size).toBe(5010);
});

test('rewritten published history is reported instead of silently skipping or appending incorrect offsets', async () => {
  const f = fixture(8), p = f.publisher();
  await p.publish();
  f.rewrite();
  await expect(p.publish(completion)).rejects.toThrow('published history changed');
  expect(f.record().next_seq).toBe(8);
  expect(f.record().status).toBe('live');
  await expect(f.publisher().publish(completion)).rejects.toThrow('published history changed');
});

test('completion concurrent with a blocked upload cannot overtake it', async () => {
  const f = fixture(2);
  let release!: () => void;
  const wait = new Promise<void>(r => { release = r; });
  const sc = { loadWindow: async (...args: Parameters<typeof f.sc.loadWindow>) => { await wait; return f.sc.loadWindow(...args); } };
  const p = new TranscriptPublisher(sc, f.oa, 'fixture/repo', descriptor, { key: 'cron-fixture' });
  const pending = p.publish();
  const ending = p.publish(completion);
  expect(f.events).toEqual([]);
  release(); await Promise.all([pending, ending]);
  expect(f.events).not.toContain('ended');
  await p.publish(completion);
  expect(f.events.at(-1)).toBe('ended');
});

test('native missing-tool reconstructions are not published as real tool results', () => {
  expect(turnsOf({ role: 'tool', content: 'synthetic result', metadata: {} }, 'hermes')).toEqual([]);
  expect(turnsOf({ role: 'tool', content: 'actual result', metadata: { hermes_message_id: '7' } }, 'hermes')).toHaveLength(1);
});

test('standard YAML privacy forms work and malformed policy fails closed', () => {
  for (const text of ['publish:\n  private: [cron-fixture]', 'publish:\n  private:\n    - "cron-fixture"']) {
    const cfg = Bun.YAML.parse(text) as any;
    expect(publishes(publicationPolicy(cfg.publish), descriptor, 'run')).toBe(false);
  }
  expect(publishes(publicationPolicy({ private: ['pm'] }), descriptor, 'run', 'pm')).toBe(false);
  expect(() => publicationPolicy({ private: 'cron-fixture' })).toThrow();
  expect(() => publicationPolicy({ runs: 'false' })).toThrow();
  expect(publishes(publicationPolicy({ chats: false }), descriptor, 'chat')).toBe(false);
});

test('a failed platform read is not treated as a missing session', async () => {
  const oa = new OpenAutonomy({ baseUrl: 'http://fixture.invalid/v1', key: 'synthetic', fetch: (async (_input: RequestInfo | URL) => new Response('', { status: 503 })) as typeof globalThis.fetch });
  await expect(oa.resume('id', 'fixture/repo', { key: 'id' })).rejects.toThrow('read session');
  await expect(new Session(oa, 'id', 0).end()).rejects.toThrow('acknowledgment');
});
