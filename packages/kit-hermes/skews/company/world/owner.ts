#!/usr/bin/env bun
// The owner's own client in the review World: the owner writes to an agent and reads the answers through the session
// service (`harness.v1.sessions.message` / `sessions.inbox`, Supercode's public SDK), from the owner's own mailbox, as a
// channel does. Owner-authored: each line is marked as the owner's (asUser), so the owner's account manager is CC on it.
//
//   bun world/owner.ts send <agent name | sc: address> <text> [--re <message id>]
//   bun world/owner.ts inbox
//   bun world/owner.ts jobs | run <profile | job id>
//   bun world/owner.ts dm <text>          (the account manager's DM in its account Room, RFC 0020 row 22)
import { createRequire } from 'node:module';

const [verb, ...args] = process.argv.slice(2);
const coding = verb === 'jobs' || verb === 'run';
const { SupercodeHarnessClient } = await import(coding ? process.env.VO_CODING_SDK! : process.env.VO_SUPERCODE_SDK!);
const client = new SupercodeHarnessClient({ command: coding ? process.env.VO_CODING_BIN : process.env.VO_SUPERCODE_BIN });
const fromName = 'owner';
try {
  if (verb === 'send') {
    const re = args.indexOf('--re');
    const inReplyTo = re >= 0 ? args.splice(re, 2)[1] : undefined;
    const [to, ...words] = args;
    const address = /^sc:([^:]+):([^:]+):(.+)$/.exec(to);
    const locator = address ? { harness: address[2], session_id: address[3] } : { harness: 'agent', session_id: to };
    const sent = await client.messageSession(locator, words.join(' '), { fromName, senderName: 'Aaron', asUser: true, ...(inReplyTo ? { inReplyTo } : {}) });
    console.log(JSON.stringify(sent, null, 2));
  } else if (verb === 'inbox') {
    const inbox = await client.sessionInbox({ fromName, all: true });
    for (const row of inbox.messages ?? []) {
      const e = row.envelope;
      const from = typeof e.from === 'string' ? e.from : `sc:${e.from?.machine}:${e.from?.harness}:${e.from?.session_id}`;
      console.log(`${e.id}  thread ${e.thread ?? '-'}  re ${e.in_reply_to ?? '-'}  from ${from}\n    ${String(e.body).replace(/\n/g, '\n    ')}`);
    }
  } else if (verb === 'dm') {
    // The account manager's DM in its account Room, as RH2's console opens it: RH2 signs the owner a control token for
    // the session bound to the agent's seat, and the line goes to that session on the Teams server's session channel.
    const rh2 = process.env.VO_RH2_URL!, organization = process.env.VO_RH2_ORGANIZATION!, agent = (await (await import('./lib.ts')).accountManagerInRh2()).principalId;
    const door = async (path: string, body?: unknown) => {
      const res = await fetch(`${rh2}/api/v3${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { authorization: `Bearer ${process.env.VO_RH2_OWNER_TOKEN}`, 'x-rh2-organization': organization, origin: rh2, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const text = await res.text(); if (!res.ok) throw new Error(`RH2 ${path} → HTTP ${res.status} ${text.slice(0, 200)}`);
      return (JSON.parse(text) as { data: any }).data;
    };
    const room = (await door('/rooms')).rooms.find((r: { key?: string }) => r.key === 'account');
    const { token, binding } = await door(`/rooms/${room.roomId}/agents/${agent}/session/token`, { scope: 'control' });
    const { openBrowserSession, sendBrowserTurn } = await import(createRequire(process.env.VO_SUPERCODE_BIN!).resolve('@volter/teams/browser-channel'));
    const channel = await openBrowserSession({ origin: process.env.TEAMS_URL!, teamId: binding.team, sessionId: binding.sessionId, token });
    console.log(`dm → session ${binding.sessionId} (${binding.harness})`);
    console.log(JSON.stringify(await sendBrowserTurn(channel, args.join(' '))));
    channel.close?.();
  } else if (verb === 'jobs' || verb === 'run') {
    // The install's scheduler (the orchestrator on the home): its jobs, or one fired now through its own run verb, as
    // the hour it waits for would fire it.
    const scheduler = { harness: 'orchestrator', homes: { orchestrator: process.env.VO_AGENT_HOME! } };
    if (verb === 'jobs') {
      const { jobs } = await client.listJobs(scheduler);
      for (const job of jobs) console.log(`${job.id}  ${job.profile ?? 'default'}  ${job.schedule?.display ?? ''}  ${String(job.payload?.text ?? '').slice(0, 60)}`);
    } else {
      // A job is named by its profile (ids are new on every boot) or by its id.
      const [named] = args;
      const { jobs } = await client.listJobs(scheduler);
      const job = jobs.find((j: any) => j.id === named) ?? jobs.find((j: any) => (j.profile ?? 'default') === named);
      if (!job) throw new Error(`no job ${named}`);
      console.log(JSON.stringify(await client.runJob({ ...scheduler, id: job.id, ...(job.profile ? { profile: job.profile } : {}) }), null, 2));
    }
  } else {
    console.log('bun world/owner.ts send <agent|address> <text> [--re <id>] | inbox | jobs | run <profile | job id> | dm <text>');
    process.exitCode = 2;
  }
} finally {
  await client.close?.();
}
