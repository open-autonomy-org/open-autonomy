#!/usr/bin/env bun
// RFC 0020 row 24: the Room's call. The account manager's voice front (supercode's voice pack) for its account Room on
// the rehearsal RH2: an agent's voice, so each run is one call, a thread of the agent (decision 21) — its start is filed
// as a root, main delegates it, and the voice speaks for the session that takes it. Its realtime provider is OpenAI's
// (the twins arc's P3 pack); its RH2 identity is the account manager's agent, its one participant in the call. A run that
// ends (the call ended) is followed by the next, as the voice host keeps a voice.
import { mkdirSync, writeFileSync } from 'node:fs';
import { MACHINE, accountManagerInRh2 } from './lib.ts';

const need = (name: string): string => { const v = process.env[name]; if (!v) throw new Error(`world/voice.ts: ${name} is required`); return v; };
const rh2 = need('VO_RH2_URL').replace(/\/$/, '');
const organization = need('VO_RH2_ORGANIZATION');
// The account manager in the call is its own RH2 agent principal, the same participant that answers its Room's lines and
// holds its DM (world/rh2-agent.ts): the voice runs on the identity the install's home keeps for it.
const { token } = await accountManagerInRh2();
const bin = need('VO_SUPERCODE_BIN');
const dir = `${need('VOLTER_WORLD_DATA')}/voice`;
mkdirSync(dir, { recursive: true });
const agent = `sc:${MACHINE}:agent:account-manager`;

// The agent exists once the install's enrollment (enroll.sh) declared it.
for (let i = 0; ; i++) {
  const shown = Bun.spawnSync({ cmd: [bin, 'agent', 'show', 'account-manager', '--json'], stdout: 'pipe', stderr: 'pipe' });
  if (shown.exitCode === 0 && /main_session/.test(shown.stdout.toString())) break;
  if (i > 300) throw new Error('the account manager was never declared');
  await Bun.sleep(2000);
}
const listing = await (await fetch(`${rh2}/api/v3/rooms`, { headers: { authorization: `Bearer ${token}`, 'x-rh2-organization': organization } })).json() as { data: { rooms: Array<{ roomId: string; key?: string }> } };
const room = listing.data.rooms.find((r) => r.key === 'account');
if (!room) throw new Error('the account manager sits in no account Room');
const credential = await (await fetch(`${need('OPENAI_TWIN_URL')}/_twin/app-credentials`, { method: 'POST' })).json() as { api_key: string };
const tokenFile = `${dir}/rh2-token`;
writeFileSync(tokenFile, token, { mode: 0o600 });
const config = `${dir}/voice.json`;
writeFileSync(config, JSON.stringify({
  name: 'Account manager', agent, voiceId: 'cedar',
  provider: { kind: 'openai', model: 'gpt-realtime-2.1', keyEnv: 'OPENAI_API_KEY' },
  adapter: { kind: 'rh2', url: rh2, roomId: room.roomId, organization, tokenFile },
}, null, 2), { mode: 0o600 });
// The World's port answers with the voice's configuration (its Room, its agent), as the machine service answers.
Bun.serve({ port: Number(need('PORT')), hostname: '127.0.0.1', fetch: () => Response.json({ agent, roomId: room.roomId }) });
console.log(`voice: the account manager's voice for the account Room ${room.roomId}`);

let stopping = false;
let child: ReturnType<typeof Bun.spawn> | undefined;
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => { stopping = true; child?.kill(signal); });
while (!stopping) {
  child = Bun.spawn({ cmd: [bin, 'voice', 'run', '--config', config], env: { ...process.env, OPENAI_API_KEY: credential.api_key, SUPERCODE_VOICE_ENTRY: `${need('VO_SUPERCODE_TREE')}/sdk/voice/bin/voice.mjs` }, stdout: 'inherit', stderr: 'inherit' });
  const code = await child.exited;
  if (stopping) break;
  console.log(`voice: the run ended (${code}); the next call's run starts`);
  await Bun.sleep(5000);
}
