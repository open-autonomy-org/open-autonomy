#!/usr/bin/env bun
// A person speaks in the agent's channel on the Discord twin (`bun world/run.ts say <text…>`): posted as the user
// `alice`, which the twin dispatches to the connected bot as a human's message; the agent answers as itself.
import { HOME_CHANNEL, api, need } from './lib.ts';

const text = process.argv.slice(2).join(' ');
if (!text) { console.error('usage: bun world/run.ts say <text…>'); process.exit(2); }
const r = await api(need('DISCORD_TWIN_URL'), { authorization: 'User alice' }).post(`/api/v10/channels/${HOME_CHANNEL}/messages`, { content: text });
if (r.status !== 200) throw new Error(`discord twin: say → ${r.status} ${r.text.slice(0, 200)}`);
console.log(`alice, in the channel: ${text}`);
