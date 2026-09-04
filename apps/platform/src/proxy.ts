import { error, methodNotAllowed, parseJson, readCappedBody } from './http.js';
import { LedgerClient } from './ledger.js';
import { estimateInputTokensFromBody, MAX_OUTPUT_TOKENS, priceTable, reservePrice, settleCents, worstCaseCents, type ModelPrice, type TokenUsage } from './pricing.js';
import type { Env, KeyClaims, UsageEvent } from './types.js';

// The model rail. A stock provider SDK pointed at this host just works: OpenAI at /v1/chat/completions and
// /v1/responses, Anthropic at /v1/messages. Every call is forwarded to one upstream, the model gateway,
// which speaks both wires and reports each call's real cost. Around the forward: a reservation held
// against the account (the balance hard-stop and the daily rail), then a settle to the reported cost.

export type Route = '/v1/chat/completions' | '/v1/responses' | '/v1/messages';

export function gatewayBase(env: Env): string {
  return (env.MODEL_GATEWAY_URL ?? 'https://api-gateway.merge.dev').replace(/\/$/, '');
}

export async function handleModelCall(req: Request, env: Env, claims: KeyClaims, ctx: ExecutionContext, route: Route): Promise<Response> {
  if (req.method !== 'POST') return methodNotAllowed();
  const bodyText = await readCappedBody(req, Number(env.MAX_BODY_BYTES ?? 1024 * 1024));
  if (bodyText === null) return error('body_too_large', 413);
  const body = parseJson<Record<string, unknown>>(bodyText);
  if (!body) return error('invalid_json', 400);
  const model = typeof body.model === 'string' ? body.model : '';
  if (!claims.models.includes(model)) return error('model_not_allowed', 403);
  const apiKey = env.MODEL_GATEWAY_API_KEY;
  if (!apiKey) return error('provider_not_configured', 503);

  const anthropic = route === '/v1/messages';
  const price: ModelPrice = priceTable(env.MODEL_PRICES_JSON)[model] ?? reservePrice(Number(env.MODEL_GATEWAY_RESERVE_USD_PER_MTOK ?? 30));
  // A bare provider id is mapped to the gateway's "vendor/slug"; an id that already carries a slug passes.
  if (!model.includes('/')) body.model = `${anthropic ? 'anthropic' : 'openai'}/${model}`;
  const outputTokens = boundOutputTokens(body, route);
  if (route === '/v1/chat/completions' && body.stream === true) {
    body.stream_options = { ...(typeof body.stream_options === 'object' && body.stream_options !== null ? body.stream_options : {}), include_usage: true };
  }
  const reserved = worstCaseCents(price, outputTokens, estimateInputTokensFromBody(bodyText));
  const ledger = new LedgerClient(env.LIMITS);
  const requestId = crypto.randomUUID();
  const reservation = await ledger.reserve(requestId, claims.account, claims.kid, reserved, Number(env.MAX_GLOBAL_DAILY_USD_CENTS ?? 5000));
  if (!reservation.ok) return error(reservation.error, reservation.error === 'auth_failed' ? 401 : 402, { account: claims.account, balance_usd_cents: reservation.balance_usd_cents });

  const headers: Record<string, string> = { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' };
  if (anthropic) {
    headers['anthropic-version'] = req.headers.get('anthropic-version') ?? '2023-06-01';
    const beta = req.headers.get('anthropic-beta');
    if (beta) headers['anthropic-beta'] = beta;
  }
  let upstream: Response;
  try {
    upstream = await fetch(`${gatewayBase(env)}${route}`, { method: 'POST', headers, body: JSON.stringify(body) });
  } catch {
    await ledger.release(requestId);
    return error('upstream_unavailable', 502);
  }
  if (!upstream.ok) {
    await ledger.release(requestId);
    return sanitizeUpstream(upstream);
  }

  const out = forwardedHeaders(upstream.headers, anthropic);
  out.set('x-open-autonomy-balance-usd-cents', String(reservation.balance_usd_cents));
  const event = (actual: number, usage: TokenUsage, outcome: UsageEvent['outcome']): UsageEvent => ({ request_id: requestId, model, route, reserved_usd_cents: reserved, actual_usd_cents: actual, input_tokens: usage.input_tokens, output_tokens: usage.output_tokens, outcome });
  if ((upstream.headers.get('content-type') ?? '').includes('text/event-stream')) {
    const [client, meter] = upstream.body!.tee();
    ctx.waitUntil(usageFromSse(meter, anthropic)
      .then((usage) => { const actual = settleCents(price, usage, reserved); return ledger.consume(requestId, actual, event(actual, usage, 'ok')); })
      .catch(() => ledger.consume(requestId, reserved, event(reserved, {}, 'metering_error'))));
    return new Response(client, { status: upstream.status, headers: out });
  }
  const text = await upstream.text();
  const usage = usageFromJson(text);
  const actual = settleCents(price, usage, reserved);
  await ledger.consume(requestId, actual, event(actual, usage, 'ok'));
  return new Response(text, { status: upstream.status, headers: out });
}

// The output cap the request asks for, bounded to the reservation ceiling. Never clamped lower: a low
// ceiling starves reasoning models (see MAX_OUTPUT_TOKENS).
function boundOutputTokens(body: Record<string, unknown>, route: Route): number {
  const key = route === '/v1/responses' ? 'max_output_tokens' : 'max_tokens';
  const alternate = route === '/v1/chat/completions' ? 'max_completion_tokens' : key;
  const requested = typeof body[key] === 'number' ? body[key] as number : typeof body[alternate] === 'number' ? body[alternate] as number : MAX_OUTPUT_TOKENS;
  const bounded = Math.max(1, Math.min(requested, MAX_OUTPUT_TOKENS));
  body[key] = bounded;
  if (alternate !== key) delete body[alternate];
  return bounded;
}

function sanitizeUpstream(upstream: Response): Response {
  if (upstream.status === 429) return error('provider_rate_limited', 429);
  if (upstream.status === 401 || upstream.status === 403) return error('upstream_auth_failed', 502);
  if (upstream.status >= 500) return error('upstream_unavailable', 502);
  return error('provider_rejected_request', 400);
}

function forwardedHeaders(source: Headers, anthropic: boolean): Headers {
  const headers = new Headers();
  headers.set('content-type', source.get('content-type') ?? 'application/json');
  headers.set('cache-control', 'no-store');
  const requestId = source.get(anthropic ? 'anthropic-request-id' : 'x-request-id');
  if (requestId) headers.set(anthropic ? 'anthropic-request-id' : 'x-request-id', requestId);
  return headers;
}

function usageFromRecord(raw: unknown): TokenUsage {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);
  return {
    input_tokens: num(r.input_tokens ?? r.prompt_tokens),
    output_tokens: num(r.output_tokens ?? r.completion_tokens),
    cache_creation_input_tokens: num(r.cache_creation_input_tokens),
    cache_read_input_tokens: num(r.cache_read_input_tokens),
    // The gateway reports the real USD cost here on both wires; authoritative when present.
    cost_usd: num(r.cost),
  };
}

export function usageFromJson(text: string): TokenUsage {
  const parsed = parseJson<{ usage?: unknown }>(text);
  return usageFromRecord(parsed?.usage);
}

// Streaming: the usage arrives in the stream's own events (OpenAI: the final chunk's `usage`, or
// `response.usage`; Anthropic: message_start carries input, message_delta carries output and cost).
export async function usageFromSse(stream: ReadableStream<Uint8Array>, anthropic: boolean): Promise<TokenUsage> {
  const usage: TokenUsage = {};
  const merge = (u: TokenUsage) => { for (const [k, v] of Object.entries(u)) if (v !== undefined) (usage as Record<string, unknown>)[k] = v; };
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (!data || data === '[DONE]') continue;
        const event = parseJson<Record<string, any>>(data);
        if (!event) continue;
        if (anthropic) {
          if (event.type === 'message_start' && event.message?.usage) merge(usageFromRecord(event.message.usage));
          if (event.type === 'message_delta' && event.usage) merge(usageFromRecord(event.usage));
        } else {
          const raw = event.usage ?? event.response?.usage;
          if (raw) merge(usageFromRecord(raw));
        }
      }
    }
  }
  return usage;
}
