import { describe, expect, test } from 'bun:test';
import worker from '../src/index.ts';
import { admin, ctx, fund, mintKey, request, requestJson, testEnv, useEnv } from './env.ts';

let n = 0;
const ce = (type: string, subject: string, data: unknown, time?: string) => ({ specversion: '1.0', id: `evt-${++n}`, source: 'test', type: `org.open-autonomy.${type}`, subject, time, data });
const post = (env: ReturnType<typeof testEnv>, token: string, body: unknown) => request(env, '/v1/agent/events', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body });
const KEY = 'cron_abc_20260903_152011';

describe('the development stream: sessions, updates, items', () => {
  test('started → turns (offsets) → ended becomes one session; replayed offsets are ignored; several can be live', async () => {
    const env = useEnv(testEnv());
    const { token } = await mintKey(env);
    expect((await post(env, token, ce('session.started', KEY, { session_kind: 'run', source: 'build-roadmap', title: 'build-roadmap · Sep 03 15:20' }, '2026-09-03T15:20:11Z'))).status).toBe(200);
    expect((await post(env, token, ce('session.started', 'chat-1', { session_kind: 'chat', source: 'discord' }))).status).toBe(200);
    const live = await requestJson(env, '/v1/accounts/acme%2Fapp/sessions');
    expect(live.live.sort()).toEqual([KEY, 'chat-1'].sort());
    expect(live.sessions.length).toBe(2);
    const turns = [
      { ts: '2026-09-03T15:20:12Z', role: 'user', text: 'Work the top open item…' },
      { ts: '2026-09-03T15:20:14Z', role: 'assistant', tool: 'read_file', args: '{"path":"ROADMAP.yml"}' },
      { ts: '2026-09-03T15:20:15Z', role: 'tool', tool: 'read_file', result: '1|# The roadmap…' },
      { role: 'nonsense' },
    ];
    const batch = await post(env, token, [ce('session.turns', KEY, { seq: 0, item_id: 'add', turns }), ce('session.turns', KEY, { seq: 0, turns })]);
    expect(batch.status).toBe(200);
    expect(((await batch.json()) as { results: Array<{ idempotent?: boolean }> }).results[1].idempotent).toBe(true);
    // A chat ends without a verdict; a run ends with one.
    expect((await post(env, token, ce('session.ended', 'chat-1', {}))).status).toBe(200);
    expect((await post(env, token, ce('session.ended', KEY, { outcome: 'done', report: 'Done. add — committed 7d30729.', commit_sha: '7d30729', ended_at: '2026-09-03T15:44:11Z' }))).status).toBe(200);
    const list = await requestJson(env, '/v1/accounts/acme%2Fapp/sessions');
    expect(list.live).toEqual([]);
    const run = list.sessions.find((s: { key: string }) => s.key === KEY);
    expect(run).toMatchObject({ kind: 'run', source: 'build-roadmap', status: 'ended', outcome: 'done', item_id: 'add', commit_sha: '7d30729', turn_count: 3, tool_calls: 1, next_seq: 3 });
    const chat = list.sessions.find((s: { key: string }) => s.key === 'chat-1');
    expect(chat).toMatchObject({ kind: 'chat', status: 'ended' });
    expect(chat.outcome).toBeUndefined();
    const one = await requestJson(env, `/v1/accounts/acme%2Fapp/sessions/${KEY}`);
    expect(one.session.turns.map((t: { seq: number }) => t.seq)).toEqual([0, 1, 2]);
    expect(one.session.started_at).toBe('2026-09-03T15:20:11.000Z');
    expect(one.session.ended_at).toBe('2026-09-03T15:44:11.000Z');
  });

  test('published text is redacted at intake: a .env read aloud, a bearer, a private key never reach the books', async () => {
    const env = useEnv(testEnv());
    const { token } = await mintKey(env);
    await post(env, token, ce('session.started', 's', {}));
    const bearer = ['eyJhbGciOiJIUzI1NiJ9', 'a'.repeat(42)].join('.');
    const discord = ['M' + 'x'.repeat(25), 'GaBcDe', 'y'.repeat(30)].join('.');
    const pem = ['-----BEGIN ', 'OPENSSH PRIVATE KEY-----', '\nb3BlbnNzaC1rZXktdjEAAAAA\n', '-----END ', 'OPENSSH PRIVATE KEY-----'].join('');
    const leak = `OPEN_AUTONOMY_KEY=${bearer}\nDISCORD_BOT_TOKEN="${discord}"\nhello=world`;
    await post(env, token, ce('session.turns', 's', { seq: 0, turns: [{ role: 'tool', tool: 'terminal', result: leak }, { role: 'assistant', tool: 'terminal', args: `curl -H "authorization: Bearer ${bearer}" https://x` }, { role: 'assistant', text: `the bot token is ${discord}\n${pem}` }] }));
    await post(env, token, ce('item.update', 'add', { text: `progress; the key is ${bearer}` }));
    const text = JSON.stringify(await requestJson(env, '/v1/accounts/acme%2Fapp/sessions/s')) + JSON.stringify(await requestJson(env, '/v1/accounts/acme%2Fapp/items/add'));
    expect(text).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(text).not.toContain(discord);
    expect(text).not.toContain('b3BlbnNzaC1rZXktdjEAAAAA');
    expect(text).toContain('OPEN_AUTONOMY_KEY=[redacted]');
    expect(text).toContain('Bearer [redacted]');
    expect(text).toContain('[redacted private key]');
    expect(text).toContain('hello=world');
  });

  test("the account is the key's own; a non-CloudEvent, an unknown type, or an unopened session is refused; admin can drop one", async () => {
    const env = useEnv(testEnv());
    const { token } = await mintKey(env, 'acme/app');
    expect((await post(env, token, ce('session.started', 'k1', { title: 't' }))).status).toBe(200);
    expect((await requestJson(env, '/v1/accounts/acme%2Fapp/sessions')).sessions.length).toBe(1);
    expect((await requestJson(env, '/v1/accounts/other%2Frepo/sessions')).sessions.length).toBe(0);
    expect((await post(env, token, ce('session.turns', 'never-started', { seq: 0, turns: [] }))).status).toBe(404);
    expect((await post(env, token, { kind: 'started', key: 'k9' })).status).toBe(400);
    expect((await post(env, token, ce('exploded', 'k1', {}))).status).toBe(400);
    expect((await request(env, '/v1/agent/events', { method: 'POST', body: ce('session.started', 'k3', {}) })).status).toBe(401);
    expect((await request(env, '/v1/accounts/acme%2Fapp/sessions/nope')).status).toBe(404);
    expect((await request(env, '/admin/accounts/acme%2Fapp/sessions/k1', { method: 'DELETE' })).status).toBe(401);
    expect((await request(env, '/admin/accounts/acme%2Fapp/sessions/k1', { method: 'DELETE', headers: admin })).status).toBe(200);
    expect((await requestJson(env, '/v1/accounts/acme%2Fapp/sessions')).sessions.length).toBe(0);
    expect((await requestJson(env, '/v1/accounts/acme%2Fapp/sessions')).live).toEqual([]);
  });

  test('an item view carries every session, update and settled cent that touched it', async () => {
    const env = useEnv(testEnv());
    await fund(env, 'acme/app', 100);
    const { token } = await mintKey(env);
    const spend = () => request(env, '/v1/chat/completions', { headers: { authorization: `Bearer ${token}` }, body: { model: 'zai/glm-5.3-flash', messages: [] } });
    await spend(); // before any session: unattributed
    await post(env, token, ce('session.started', 'r1', { session_kind: 'run', item_id: 'add' }));
    await spend(); await spend(); // one live session: attributed
    await post(env, token, ce('session.started', 'r2', { session_kind: 'chat' }));
    await spend(); // two live: unattributed
    await post(env, token, ce('session.ended', 'r2', {}));
    await post(env, token, ce('item.update', 'add', { text: 'halfway: the store writes; the id counter next', session: 'r1' }, '2026-09-03T15:30:00Z'));
    await post(env, token, ce('session.ended', 'r1', { outcome: 'done' }));
    await post(env, token, ce('session.started', 'r3', { session_kind: 'run', item_id: 'add' }));
    const item = await requestJson(env, '/v1/accounts/acme%2Fapp/items/add');
    expect(item.sessions.map((s: { key: string }) => s.key)).toEqual(['r3', 'r1']);
    expect(item.live).toEqual(['r3']);
    expect(item.updates.length).toBe(1);
    expect(item.updates[0]).toMatchObject({ item_id: 'add', session: 'r1', ts: '2026-09-03T15:30:00.000Z' });
    expect(item.usd_cents).toBeCloseTo(0.14, 6);
    const audit = await requestJson(env, '/v1/accounts/acme%2Fapp/calls');
    expect(audit.calls.map((c: { session?: string }) => c.session ?? null)).toEqual([null, 'r1', 'r1', null]);
    expect((await requestJson(env, '/v1/accounts/acme%2Fapp/items/nothing')).sessions).toEqual([]);
    expect((await post(env, token, ce('item.update', 'bad:id', { text: 'x' }))).status).toBe(400);
  });

  test('the live channels: a session stream replays after an offset and closes on end; an item stream reports change and closes when nothing is live', async () => {
    const env = useEnv(testEnv());
    const { token } = await mintKey(env);
    await post(env, token, ce('session.started', 'k-sse', { session_kind: 'run', item_id: 'add' }));
    await post(env, token, ce('session.turns', 'k-sse', { seq: 0, turns: [{ role: 'assistant', tool: 'read_file', args: '{}' }, { role: 'tool', tool: 'read_file', result: 'x' }, { role: 'assistant', text: 'ok' }] }));
    await post(env, token, ce('session.ended', 'k-sse', { outcome: 'done', report: 'fine' }));
    const res = await worker.fetch(new Request('https://platform.test/v1/accounts/acme%2Fapp/sessions/k-sse/events', { headers: { 'last-event-id': '0' } }), env, ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const text = await res.text();
    expect(text.startsWith('retry: 3000')).toBe(true);
    expect(text.includes('id: 0\n')).toBe(false);
    expect(text.includes('id: 1\nevent: turn\n')).toBe(true);
    expect(text.includes('id: 2\nevent: turn\n')).toBe(true);
    expect(text.includes('event: status\ndata: {"status":"ended","outcome":"done"')).toBe(true);
    expect((await worker.fetch(new Request('https://platform.test/v1/accounts/acme%2Fapp/sessions/nope/events'), env, ctx)).status).toBe(404);
    const item = await (await worker.fetch(new Request('https://platform.test/v1/accounts/acme%2Fapp/items/add/events'), env, ctx)).text();
    expect(item.includes('event: item\ndata: {"live":[],"sessions":1,"turn_count":3,"updates":0')).toBe(true);
  });
});
