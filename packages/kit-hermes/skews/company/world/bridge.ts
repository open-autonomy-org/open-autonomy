#!/usr/bin/env bun
// RFC 0020 row 23: the account's Slack conversation. RH2's channel bridge (runhuman-2 bots/channel-bridge) runs here as a
// service of the review World, against the rehearsal World's RH2 and this World's Slack twin, and is installed the way an
// organization installs it: registered in the organization as an RH2 app, made on Slack as RH2's own distributed app,
// installed by the owner on both sides, and invited to the account's channel. The account Room then opens a Conversation
// linked to that channel, with the account manager answering every line, as the owner would in the console.
//
// Environment: PORT (the World's), SLACK_TWIN_URL, VO_RH2_URL, VO_RH2_ORGANIZATION, VO_RH2_OWNER_TOKEN (the owner's RH2
// session), VO_RH2_ROOT (the runhuman-2 checkout under review); the account manager is its own RH2 agent principal.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { accountManagerInRh2 } from './lib.ts';

const need = (name: string): string => { const v = process.env[name]; if (!v) throw new Error(`world/bridge.ts: ${name} is required`); return v; };
const port = need('PORT');
const slack = need('SLACK_TWIN_URL').replace(/\/$/, '');
const rh2 = need('VO_RH2_URL').replace(/\/$/, '');
const organization = need('VO_RH2_ORGANIZATION');
const owner = need('VO_RH2_OWNER_TOKEN');
// The account manager in RH2: its own agent principal (world/rh2-agent.ts).
const accountManager = (await accountManagerInRh2()).principalId;
const bridgeDir = resolve(need('VO_RH2_ROOT'), 'bots/channel-bridge');
const base = `http://127.0.0.1:${port}`;
// The owner's Slack identity: the person who creates the World's workspace (slack.com/get-started) and acts in it.
const person = 'xoxp-UAARON';

/** One RH2 call as the owner; its `data`, or a thrown refusal. */
async function door<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${rh2}/api/v3${path}`, { method, headers: { authorization: `Bearer ${owner}`, 'x-rh2-organization': organization, origin: rh2, ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const text = await res.text();
  if (!res.ok) throw new Error(`RH2 ${method} ${path} → HTTP ${res.status} ${text.slice(0, 300)}`);
  return (JSON.parse(text) as { data: T }).data;
}
/** One Slack Web API call as the owner. */
async function web<T>(method: string, body: Record<string, string>): Promise<T> {
  const res = await fetch(`${slack}/api/${method}`, { method: 'POST', headers: { authorization: `Bearer ${person}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const answer = await res.json() as T & { ok?: boolean; error?: string };
  if (!answer.ok) throw new Error(`Slack ${method}: ${answer.error ?? res.status}`);
  return answer;
}

// 0. The owner's workspace, created as a person creates one.
const created = await fetch(`${slack}/get-started`, { method: 'POST', headers: { authorization: `Bearer ${person}`, 'content-type': 'application/json' }, body: JSON.stringify({ email: 'aaron@volter.ai', name: 'Aaron' }) });
if (!created.ok) throw new Error(`Slack get-started → HTTP ${created.status}`);
// 1. The bridge registered in the organization as an RH2 app: its events reach it, its install comes back to it.
const registered = await door<{ app: { appId: string; principalId: string }; clientId: string; clientSecret: string }>('POST', '/automation/apps', {
  name: 'Channel bridge', description: 'Keeps a Conversation in step with a Slack channel.', actions: ['organization.read', 'room.read', 'conversation.*'],
  eventKinds: ['conversations.message.posted'], redirectUrls: [`${base}/install/callback`], webhookUrl: `${base}/webhooks`,
});
// 2. RH2's Slack app, as RH2 distributes it: made in RH2's own workspace, its events sent to the bridge.
const made = await (await fetch(`${slack}/_twin/apps`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspace: 'T-rh2', manifest: {
  display_information: { name: 'RH2 Bridge' }, features: { bot_user: { display_name: 'rh2_bridge' } },
  oauth_config: { redirect_urls: [`${base}/slack/oauth`], scopes: { bot: ['chat:write', 'chat:write.customize', 'channels:history', 'channels:read', 'users:read'] } },
  settings: { event_subscriptions: { request_url: `${base}/slack/events`, bot_events: ['message.channels'] } },
} }) })).json() as { ok: boolean; error?: string; credentials: { client_id: string; client_secret: string; signing_secret: string } };
if (!made.ok) throw new Error(`Slack app: ${made.error}`);

// 3. The bridge itself: its Worker under workerd, its Durable Object kept under this World's data.
const persist = resolve(process.env.VOLTER_WORLD_DATA ?? resolve(bridgeDir, '.wrangler'), 'bridge');
mkdirSync(persist, { recursive: true });
const vars = { RH2_BASE_URL: rh2, APP_CLIENT_ID: registered.clientId, APP_CLIENT_SECRET: registered.clientSecret, SLACK_CLIENT_ID: made.credentials.client_id, SLACK_CLIENT_SECRET: made.credentials.client_secret, SLACK_SIGNING_SECRET: made.credentials.signing_secret, SLACK_API_BASE: slack };
const worker = spawn('npx', ['wrangler', 'dev', '--local', '--port', port, '--persist-to', persist, '--show-interactive-dev-session', 'false', ...Object.entries(vars).flatMap(([k, v]) => ['--var', `${k}:${v}`])],
  { cwd: bridgeDir, stdio: 'inherit', env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false', NODE_OPTIONS: '' } });
worker.on('exit', (code) => process.exit(code ?? 1));
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => worker.kill(signal));
for (let i = 0; ; i++) {
  try { await fetch(base); break; } catch { if (i > 240) throw new Error('the bridge did not come up'); await Bun.sleep(500); }
}

// 4. The owner installs it in the organization; RH2 sends them back to the bridge with the one-time code.
const installed = await door<{ redirectTo: string }>('POST', `/automation/apps/${registered.app.appId}/install`, { redirectUri: `${base}/install/callback` });
const back = await fetch(installed.redirectTo, { redirect: 'manual' });
if (back.status !== 303) throw new Error(`RH2 install callback → HTTP ${back.status} ${(await back.text()).slice(0, 200)}`);
// 5. The owner adds it to the workspace; Slack sends them back to the bridge with the code.
const consent = await fetch(`${slack}/oauth/v2/authorize`, { method: 'POST', redirect: 'manual', headers: { authorization: `Bearer ${person}`, 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: made.credentials.client_id, scope: 'chat:write,chat:write.customize,channels:history,channels:read,users:read', redirect_uri: `${base}/slack/oauth`, answer: 'allow' }) });
const added = await fetch(consent.headers.get('location') ?? '');
if (!added.ok) throw new Error(`Slack install callback → HTTP ${added.status} ${(await added.text()).slice(0, 200)}`);
// 6. The account's channel, with the bridge's bot invited.
const { channel } = await web<{ channel: { id: string } }>('conversations.create', { name: 'account-manager' });
const { members } = await web<{ members: Array<{ id: string; is_bot?: boolean; real_name?: string; name?: string }> }>('users.list', {});
const bot = members.find((m) => m.is_bot && /rh2 bridge/i.test(`${m.real_name ?? ''} ${m.name ?? ''}`));
if (!bot) throw new Error('the bridge has no bot user in the workspace');
await web('conversations.invite', { channel: channel.id, users: bot.id });
// 7. The account Room's Slack Conversation, linked to that channel, the account manager answering every line.
const rooms = await door<{ rooms: Array<{ room?: { roomId: string; key?: string }; roomId?: string; key?: string }> }>('GET', '/rooms');
const room = rooms.rooms.map((r) => r.room ?? r).find((r) => r.key === 'account');
if (!room) throw new Error('no account Room in the organization');
// The bridge seated in the Room as a member, as the owner adds it in the console: it finds a channel's Conversation
// among the Rooms it is in, so a line posted in Slack first reaches it.
const seated = await fetch(`${rh2}/api/v3/rooms/${room.roomId}/members`, { method: 'POST', headers: { authorization: `Bearer ${owner}`, 'x-rh2-organization': organization, origin: rh2, 'content-type': 'application/json' }, body: JSON.stringify({ principalId: registered.app.principalId, roleKeys: ['member'] }) });
if (!seated.ok && seated.status !== 409) throw new Error(`RH2 seat the bridge → HTTP ${seated.status} ${(await seated.text()).slice(0, 200)}`);
// (The rehearsal RH2 outlives this World: a Conversation it already holds for the same channel is the one; a link never
// changes, so one naming another channel is refused.)
const url = `https://volter.slack.com/archives/${channel.id}`;
const key = `slack-${channel.id.toLowerCase()}`;
const { conversations } = await door<{ conversations: Array<{ conversationId: string; conversationKey?: string; externalLink?: { url: string } | null }> }>('GET', `/rooms/${room.roomId}/conversations`);
const held = conversations.find((c) => c.conversationKey === key);
if (held && held.externalLink?.url !== url) throw new Error(`the account Room's Slack Conversation is linked to ${held.externalLink?.url}, not ${url}`);
const conversationId = held?.conversationId ?? (await door<{ conversation: { conversationId: string } }>('POST', `/rooms/${room.roomId}/conversations`, {
  key, name: 'Slack', authority: 'collaboration', link: { label: '#account-manager', url },
  participants: [{ principalId: accountManager, answers: 'all' }],
})).conversation.conversationId;
console.log(`bridge: installed; the account Room's Slack Conversation ${conversationId} is linked to #account-manager (${channel.id})`);
