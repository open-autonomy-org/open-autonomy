import { describe, expect, test } from 'bun:test';
import { admin, fund, mintKey, request, requestJson, settle, testEnv, useEnv } from './env.ts';

describe('the model rail: reserve, forward, settle to the reported cost, audit', () => {
  test('both wires forward to the gateway and settle the reported cost as fractional cents', async () => {
    const env = useEnv(testEnv());
    await fund(env, 'acme/app', 100);
    const { token } = await mintKey(env);
    const chat = await request(env, '/v1/chat/completions', { headers: { authorization: `Bearer ${token}` }, body: { model: 'zai/glm-5.3-flash', messages: [{ role: 'user', content: 'hi' }] } });
    expect(chat.status).toBe(200);
    expect(chat.headers.get('x-open-autonomy-balance-usd-cents')).toBeTruthy();
    const messages = await request(env, '/v1/messages', { headers: { 'x-api-key': token, 'anthropic-version': '2023-06-01' }, body: { model: 'zai/glm-5.3-flash', max_tokens: 100, messages: [{ role: 'user', content: 'hi' }] } });
    expect(messages.status).toBe(200);
    expect(env.gateway.calls.map((c) => c.route)).toEqual(['/v1/chat/completions', '/v1/messages']);
    expect(env.gateway.calls[0].headers.get('authorization')).toBe('Bearer gw-key');
    expect(env.gateway.calls[1].headers.get('anthropic-version')).toBe('2023-06-01');
    // The reservation held the roomy output ceiling, and the settle was the gateway's cost: 0.07¢ each.
    expect(env.gateway.calls[0].body.max_tokens).toBe(65536);
    const f = await requestJson(env, '/v1/accounts/acme%2Fapp');
    expect(f.consumed_usd_cents).toBeCloseTo(0.14, 6);
    expect(f.balance_usd_cents).toBeCloseTo(99.86, 6);
    expect(f.calls_total).toBe(2);
    const audit = await requestJson(env, '/v1/accounts/acme%2Fapp/calls');
    expect(audit.calls.length).toBe(2);
    expect(audit.calls[0]).toMatchObject({ rail: 'model', model: 'zai/glm-5.3-flash', route: '/v1/messages', usd_cents: 0.07, input_tokens: 10, output_tokens: 5 });
  });

  test('a bare provider id is mapped to the gateway slug; a low output cap is kept, a huge one bounded', async () => {
    const env = useEnv(testEnv());
    // Unlisted models reserve at the conservative ceiling (~$2 for a full output window), so fund more.
    await fund(env, 'acme/app', 10000);
    const { token } = await mintKey(env, 'acme/app', ['gpt-5-mini', 'claude-haiku-4-5']);
    await request(env, '/v1/chat/completions', { headers: { authorization: `Bearer ${token}` }, body: { model: 'gpt-5-mini', max_completion_tokens: 200000, messages: [] } });
    await request(env, '/v1/messages', { headers: { authorization: `Bearer ${token}` }, body: { model: 'claude-haiku-4-5', max_tokens: 1024, messages: [] } });
    expect(env.gateway.calls[0].body).toMatchObject({ model: 'openai/gpt-5-mini', max_tokens: 65536 });
    expect(env.gateway.calls[0].body.max_completion_tokens).toBeUndefined();
    expect(env.gateway.calls[1].body).toMatchObject({ model: 'anthropic/claude-haiku-4-5', max_tokens: 1024 });
  });

  test('the balance is the hard-stop and the daily rail bounds a runaway; a refused call spends nothing', async () => {
    const env = useEnv(testEnv());
    await fund(env, 'acme/app', 1); // one cent: below any reservation
    const { token } = await mintKey(env);
    const refused = await request(env, '/v1/chat/completions', { headers: { authorization: `Bearer ${token}` }, body: { model: 'zai/glm-5.3-flash', messages: [] } });
    expect(refused.status).toBe(402);
    expect((await refused.json() as { error: { code: string } }).error.code).toBe('account_balance_exhausted');
    expect(env.gateway.calls.length).toBe(0);
    await fund(env, 'acme/app', 100000);
    env.MAX_GLOBAL_DAILY_USD_CENTS = '5';
    const railed = await request(env, '/v1/chat/completions', { headers: { authorization: `Bearer ${token}` }, body: { model: 'zai/glm-5.3-flash', messages: [] } });
    expect((await railed.json() as { error: { code: string } }).error.code).toBe('global_daily_spend_limit_reached');
    expect((await requestJson(env, '/admin/reset-daily', { headers: admin, method: 'POST' })).ok).toBe(true);
    expect((await requestJson(env, '/v1/accounts/acme%2Fapp')).consumed_usd_cents).toBe(0);
  });

  test('a gateway error releases the reservation and is sanitized; a network failure too', async () => {
    const env = useEnv(testEnv({ respond: () => new Response('{"error":"upstream said something with a key in it"}', { status: 500 }) }));
    await fund(env, 'acme/app', 100);
    const { token } = await mintKey(env);
    const res = await request(env, '/v1/chat/completions', { headers: { authorization: `Bearer ${token}` }, body: { model: 'zai/glm-5.3-flash', messages: [] } });
    expect(res.status).toBe(502);
    expect((await res.text()).includes('upstream said')).toBe(false);
    env.gateway.respond = () => { throw new Error('connection refused'); };
    expect((await request(env, '/v1/chat/completions', { headers: { authorization: `Bearer ${token}` }, body: { model: 'zai/glm-5.3-flash', messages: [] } })).status).toBe(502);
    const f = await requestJson(env, '/v1/accounts/acme%2Fapp');
    expect(f.consumed_usd_cents).toBe(0);
    expect(f.reserved_usd_cents).toBe(0);
  });

  test('a streamed answer is metered from the stream itself, after the client has it', async () => {
    const sse = ['data: {"choices":[{"delta":{"content":"hel"}}]}', 'data: {"choices":[{"delta":{"content":"lo"}}]}', 'data: {"choices":[],"usage":{"prompt_tokens":12,"completion_tokens":3,"cost":0.0012}}', 'data: [DONE]'].map((l) => `${l}\n\n`).join('');
    const env = useEnv(testEnv({ respond: () => new Response(sse, { headers: { 'content-type': 'text/event-stream' } }) }));
    await fund(env, 'acme/app', 100);
    const { token } = await mintKey(env);
    const res = await request(env, '/v1/chat/completions', { headers: { authorization: `Bearer ${token}` }, body: { model: 'zai/glm-5.3-flash', stream: true, messages: [] } });
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect((await res.text()).includes('"content":"lo"')).toBe(true);
    expect(env.gateway.calls[0].body.stream_options).toEqual({ include_usage: true });
    await settle();
    expect((await requestJson(env, '/v1/accounts/acme%2Fapp')).consumed_usd_cents).toBeCloseTo(0.12, 6);
    // The Anthropic wire's stream carries usage in message_start and message_delta.
    const a = ['event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":20}}}', 'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":7,"cost":0.002}}'].map((l) => `${l}\n\n`).join('');
    env.gateway.respond = () => new Response(a, { headers: { 'content-type': 'text/event-stream' } });
    await request(env, '/v1/messages', { headers: { authorization: `Bearer ${token}` }, body: { model: 'zai/glm-5.3-flash', stream: true, max_tokens: 50, messages: [] } });
    await settle();
    const audit = await requestJson(env, '/v1/accounts/acme%2Fapp/calls');
    expect(audit.calls[0]).toMatchObject({ route: '/v1/messages', input_tokens: 20, output_tokens: 7, usd_cents: 0.2 });
  });

  test('/v1/models lists the key\'s models for a stock SDK', async () => {
    const env = useEnv(testEnv());
    const { token } = await mintKey(env, 'acme/app', ['zai/glm-5.3-flash', 'gpt-5-mini']);
    const models = await requestJson(env, '/v1/models', { headers: { authorization: `Bearer ${token}` } });
    expect(models.data.map((m: { id: string }) => m.id)).toEqual(['zai/glm-5.3-flash', 'gpt-5-mini']);
  });
});
