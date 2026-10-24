#!/usr/bin/env bun
// The account manager in RH2 (supercode ADR 0017, RFC 0020 rows 20-24): its own agent principal, the one the
// organization document declares and seats in the account Room. The owner issues that principal a token at RH2's
// agent-token door and the install's home keeps it (`supercode orchestrator apps install rh2-agent … --profile
// account-manager`); the agent's channel then answers every line of its Room's conversation as that principal, and its
// DM and its call are the same participant.
//
// Environment: PORT (the World's), VO_RH2_URL, VO_RH2_ORGANIZATION, VO_RH2_OWNER_TOKEN, VO_SUPERCODE_BIN,
// VO_ORCHESTRATOR_BIN, VO_AGENT_HOME (the install's home), VOLTER_WORLD_DATA.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const need = (name: string): string => { const v = process.env[name]; if (!v) throw new Error(`world/rh2-agent.ts: ${name} is required`); return v; };
const rh2 = need('VO_RH2_URL').replace(/\/$/, '');
const organization = need('VO_RH2_ORGANIZATION');
const owner = need('VO_RH2_OWNER_TOKEN');
const home = need('VO_AGENT_HOME');
const dir = resolve(need('VOLTER_WORLD_DATA'), 'rh2-agent');
mkdirSync(dir, { recursive: true });
const agent = 'account-manager';
const record = resolve(home, 'apps', `rh2-agent.${agent}.json`);

async function door<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${rh2}/api/v3${path}`, { method, headers: { authorization: `Bearer ${owner}`, 'x-rh2-organization': organization, origin: rh2, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const text = await res.text();
  if (!res.ok) throw new Error(`RH2 ${method} ${path} → HTTP ${res.status} ${text.slice(0, 300)}`);
  return (JSON.parse(text || '{}') as { data: T }).data;
}

// 1. The account manager as the organization document declares it.
const agents = (await door<{ agents: Array<{ principalId: string; address?: string }> }>('GET', `/organizations/${organization}/agents`)).agents;
const principal = agents.find((a) => a.address === `agent:${agent}`)?.principalId;
if (!principal) throw new Error(`the organization declares no agent:${agent}`);

if (!existsSync(record)) {
  // 2. The owner issues it a token; the install's home keeps it for the agent's channel.
  const { token } = await door<{ token: string }>('POST', `/organizations/${organization}/agents/${principal}/tokens`, { label: `${agent}-channel` });
  const tokenFile = resolve(dir, 'agent.token');
  writeFileSync(tokenFile, token, { mode: 0o600 });
  const installed = Bun.spawnSync({ cmd: [need('VO_SUPERCODE_BIN'), 'orchestrator', 'apps', 'install', 'rh2-agent', '--root', home, '--origin', rh2, '--organization', organization, '--principal', principal, '--token-file', tokenFile, '--profile', agent],
    env: { ...process.env, SUPERCODE_ORCHESTRATOR_ENTRY: need('VO_ORCHESTRATOR_BIN') }, stdout: 'pipe', stderr: 'pipe' });
  rmSync(tokenFile, { force: true });
  if (installed.exitCode !== 0 || !existsSync(record)) throw new Error(`apps install rh2-agent: ${installed.stderr.toString().trim().split('\n').at(-1)}`);
}
const installation = JSON.parse(readFileSync(record, 'utf8')) as { principalId: string };

// 3. The owner's grant: the account manager manages its own Room's seats and conversations, so its DM is bound to its
//    main session (RFC 0020 decision 26), as the Agents → Room agents app holds them on arc Floors.
const rooms = await door<{ rooms: Array<{ room?: { roomId: string; key?: string }; roomId?: string; key?: string }> }>('GET', '/rooms');
const room = rooms.rooms.map((r) => r.room ?? r).find((r) => r.key === 'account');
if (!room) throw new Error('no account Room in the organization');
await door('POST', '/grants', { principalId: installation.principalId, actions: ['room.read', 'members.manage', 'conversations.manage'], effect: 'allow',
  resource: { kind: 'room', id: room.roomId, scope: 'exact' }, idempotencyKey: `account-manager-seats-${room.roomId}`, reason: 'the account manager binds its DM in its own Room' });

Bun.serve({ port: Number(need('PORT')), hostname: '127.0.0.1', fetch: () => Response.json({ agent, principalId: installation.principalId, roomId: room.roomId }) });
console.log(`rh2-agent: the account manager is ${installation.principalId} in the account Room ${room.roomId}`);
