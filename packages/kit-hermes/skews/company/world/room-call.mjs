#!/usr/bin/env node
// RFC 0020 row 24: the owner in the account Room's call, as RH2's console puts them there. The owner (the Room's
// manager) gives the account manager its library voice, joins the Room's media with a participant token on their own
// microphone, and wakes the agent; the account manager's voice front (world/voice.ts) joins as the agent's one
// participant and speaks. Prints what RH2's call reads and what the owner heard from the agent's track.
//
//   node world/room-call.mjs [seconds] [spoken line]      (inside the World: VO_RH2_*, VO_SUPERCODE_TREE)
import { createRequire } from 'node:module';

const need = (name) => { const v = process.env[name]; if (!v) throw new Error(`world/room-call.mjs: ${name} is required`); return v; };
const rh2 = need('VO_RH2_URL').replace(/\/$/, ''), organization = need('VO_RH2_ORGANIZATION');
const seconds = Number(process.argv[2] ?? 30);
const { AudioSource, AudioStream, LocalAudioTrack, Room, RoomEvent, TrackPublishOptions, TrackSource } = createRequire(`${need('VO_SUPERCODE_TREE')}/sdk/voice/`)('@livekit/rtc-node');
const door = async (path, body) => {
  const res = await fetch(`${rh2}/api/v3${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { authorization: `Bearer ${need('VO_RH2_OWNER_TOKEN')}`, 'x-rh2-organization': organization, origin: rh2, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const text = await res.text(); if (!res.ok) throw new Error(`RH2 ${path} → HTTP ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text).data : undefined;
};
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
// The account manager in the call: its RH2 agent (its Room chat is the Room-chat installation, which media does not admit).
const agent = (await door(`/organizations/${organization}/agents`)).agents.find((a) => a.address === 'agent:account-manager' || a.displayName === 'Account manager')?.principalId;
if (!agent) throw new Error('the organization has no account-manager agent');
const room = (await door('/rooms')).rooms.map((r) => r.room ?? r).find((r) => r.key === 'account');
const call = `/rooms/${room.roomId}/call`;

// 1. The Room manager gives the agent its voice (the console's voice picker).
const own = (await door(call)).agents.find((a) => a.principalId === agent);
if (!own?.voiceId) await door(`${call}/voice/actions`, { action: 'configure', principalId: agent, voiceId: 'cedar' });
// 2. The owner joins the Room's media, their microphone published.
const token = await door(`/rooms/${room.roomId}/token`, { tabId: 'owner-room-call' });
const media = new Room();
let frames = 0, voiced = 0, peak = 0;
const agentIdentities = new Set();
media.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
  if (!participant.identity.startsWith(`agent:${agent}:`)) return;
  agentIdentities.add(participant.identity);
  void (async () => { for await (const frame of new AudioStream(track)) { frames++; let max = 0; for (const s of frame.data) max = Math.max(max, Math.abs(s)); peak = Math.max(peak, max); if (max > 200) voiced++; } })();
});
// What the agent says, as the console shows it: its speech's text on the call's transcription stream.
const said = [];
media.registerTextStreamHandler('lk.transcription', async (reader, from) => {
  const text = await reader.readAll();
  if (from.identity.startsWith(`agent:${agent}:`)) { said.push(text); console.log(`account manager said: ${text}`); }
});
await media.connect(token.url, token.token, { autoSubscribe: true });
const microphone = new AudioSource(48000, 1);
const options = new TrackPublishOptions(); options.source = TrackSource.SOURCE_MICROPHONE;
await media.localParticipant.publishTrack(LocalAudioTrack.createAudioTrack('owner-microphone', microphone), options);
console.log(`owner: in the account Room's call (${token.identity})`);
// 3. The agent comes into the call; the owner wakes it.
let state;
for (let i = 0; i < 60; i++) { state = await door(call); if (state.agents.find((a) => a.principalId === agent)?.inCall) break; await sleep(2000); }
const joined = state.agents.find((a) => a.principalId === agent);
console.log(`call: the account manager ${joined?.inCall ? 'is in the call' : 'never joined'} (voice ${joined?.voiceId}, mode ${joined?.mode}); people ${state.people.map((p) => p.name).join(', ')}`);
await door(`${call}/voice/actions`, { action: 'mode', principalId: agent, mode: 'awake', expectedControlRevision: joined?.controlRevision });
// 4. The owner speaks to it: the console transcribes its own microphone and publishes the caption on that track.
await sleep(3000);
const trackId = [...media.localParticipant.trackPublications.values()][0]?.sid;
const line = process.argv[3] ?? 'Hey, Account manager, where did we land on the export design?';
const now = Date.now();
await door(`${call}/transcript`, { id: `owner-${now}`, text: line, start: now - 2500, end: now, trackId, final: true });
console.log(`owner said: ${line}`);
await sleep(seconds * 1000);
state = await door(call);
const after = state.agents.find((a) => a.principalId === agent);
const participants = [...media.remoteParticipants.values()].filter((p) => p.identity.startsWith(`agent:${agent}:`)).map((p) => p.identity);
console.log(`call: the account manager's participants ${participants.length} (${participants.join(', ')}); mode ${after?.mode}; runner ${JSON.stringify(state.floor?.runners?.[agent] ?? null)}`);
console.log(`heard: ${frames} frames from the account manager's track (${voiced} voiced, peak ${peak}); ${said.length} spoken lines`);
await media.disconnect();
await microphone.close();
process.exit(0);
