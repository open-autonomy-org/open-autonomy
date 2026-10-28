#!/usr/bin/env node
// VOLTER'S PROJECT ROOMS: Open Autonomy's integration that keeps one Room per project in the organization's Office, as its
// board works (runhuman-2 ADR 0063 decision 3). It reads nothing but the board, as supercode publishes it on Teams' event
// stream (cards with their agents), and owns exactly its `project-*` Rooms: it makes, names, places and closes them through
// the Workplace's public commands with its own installation's token, and brings agents in and out of them with the join
// and leave commands (ADR 0060). It declares nothing the organization's document declares (its Floors, views and
// standing Rooms), never writes who is in a Room any other way, and never writes back to the board.
//
// The board's live cards (started, not a subtask, not scheduled, not archived, not in a closed lane) are worked in their
// project's Room: one Room per project (`projectOf`, the organization's convention) under the key `project-<name>`,
// named for the project, on the Floor the organization's file names it on (ADR 0060 decision 6; before any Floor names an app, `projectFloor`, else the default Floor, in Work),
// below the Floor's divider. The program is the one writer of its Rooms' placement and section: a hand move is put back.
// Its base channel's topic lists the project's live cards and where each stands. A Room's roster is who is in its call
// (RH2 ADR 0063 decision 1): the program puts no person on it, and holds no seat itself. A ticket's people who hold a
// seat in the organization are given access there (its `person:<email>` tags, company RFC 0026 decision 5), their own
// Room grant, as the program's own manager role is its own: a person is on the roster only while in the call. The Room is open while a live card names its project; when none does it
// is closed, its history kept, and it reopens with the project's next live card. A card that names no project is worked
// in no Room.
//
// One board, named by `teams.source` (its event source id): a Teams team carries every board its machines publish. A
// whole snapshot is also the list of what the board still carries. The organization's open-Room threshold asks a person
// to review dormant Rooms; the program never confirms it for them: it closes its own Rooms whose projects have no live
// card and says the refusal once.
// The agents working a live card right now (the board's `card.agents` declarations, active, of an agent Teams has not
// ended, holding a live assignment on the card's Task, in the role its card is in now: its implementer while the card is
// worked (`running`), its reviewer while it is in review, any other role while either; none while the card is paused,
// blocked or waiting, VO-3602: "a project Room holds only the agents working its cards right now") are brought into its
// project's Room: resolved through the Workplace's resolve door to the
// principal supercode's integration declared for that agent (`rh2.agentsRegistration`), and joined: the Workplace's join
// command (`POST /api/v3/rooms/:roomId/join`) seats it with `agentRoleKeys` (default member), joins it to the Room's base
// channel and sends its session the Room's seating message. The project's lead, an agent declared under one of
// `leadProfiles` (default `lead`, Open Autonomy's company profile), holds the conversation: it receives every line of the
// base channel (`answers: all`); every other card agent receives the lines that name it (`answers: mentions`). The
// program is the one writer of its seats' receive setting, and of which agents are in its Rooms: an agent in one that no
// live card of the project names any more, or that Teams ended, leaves (`POST /api/v3/rooms/:roomId/leave`), whoever
// brought it in, unless a person did (its seat's `seatedBy` is a person: their /invite). An agent whose card pauses, blocks or moves to the other role leaves,
// and comes back when its work resumes.
// Each live card's run session is brought in beside them: the session participant the card's open board run links to as
// its work (its Task's `work`, the `card-run` link supercode's integration writes; the owner: "it's actually the link to
// the card that determines what should show a card"), whether the board started that session or a session was adopted
// onto the card. The program may place it only because its custodian handed it to the board by adopting it, a grant
// supercode's integration records for this app (runhuman-2 ADR 0046 decision 6). It is never bound to a card agent's
// seat and gains no agent identity (VO-3751); a run in an agent's current session links that agent, whose seats stay its
// own, and that exact main-session agent is seated in the linked card's project too. It is seated while its card is worked or in review and neither paused nor blocked, under the same rule (every line
// on a card a lead works, else the lines naming it), and leaves when the run ends or the card pauses, blocks or closes;
// the program removes only its additional run placements. Missing links, refused joins and unconfirmed cleanup remain
// owed through backoff and restart, while unrelated placement continues.
// A refused cache write retries each minute. A product mutation requires its journal to persist and re-read first.
//
// Each project Room's rules carry its guidance (runhuman-2 ADR 0063 decision 7, `guidance`, the rules command): what its
// agents are told it is for. Each image or video a live card's agent attaches to the card (the card's published
// `attachments`) is posted once into its project Room's base channel, as this app's own file (ADR 0063 decision 8), with
// a line naming the card: the card stays the one place an update is put. Its bytes are read with the board's own CLI on
// the machine that keeps the board (`supercode workflow --root <board.root> attachment-read …`, a mebibyte at a time, each
// part held to the version the first names); the board's door (`--at`) serves only a session, and this app is none. A
// file attached before the app first read the card's files is not posted, so a backlog never floods a Room.
//
//   node packages/workplace/rooms/main.mjs <config.json>          snapshot, then the board's events
//   node packages/workplace/rooms/main.mjs <config.json> --once   snapshot only
// config: {
//   "teams": { "server": "https://teams.example", "team": "<team id>", "source": "<the board's event_source_… id>", "tokenEnv": "PROJECT_ROOMS_TEAMS_TOKEN" },
//   "rh2": { "baseUrl": "https://workplace.example", "organization": "volter", "tokenEnv": "PROJECT_ROOMS_WORKPLACE_TOKEN", "principalId": "<the installation's prn_…>",
//            "issuer": "<optional: the Workplace's canonical origin>",
//            "agentsRegistration": "<supercode's Agents → Room agents registration's client id, app_…>",
//            "cardsPrincipalId": "<optional: only Tasks supercode's Cards → Tasks registration made are a card's Task>" },
//   "agentRoleKeys": ["member"], "postRoleKeys": ["manager"] (optional),
//   "leadProfiles": ["lead"],
//   "envFile": "<custody env file of KEY=VALUE lines>", "stateFile": "<the program's id map and cursor>",
//   "closedLanes": ["done", "cancelled", "archived", "scheduled"],
//   "projectFloor": "<a Floor the organization's document declares, for the project Rooms; none = its default Floor, Office unless renamed>",
//   "board": { "root": "<the board's home on this machine>", "supercode": "<optional: the supercode CLI, default supercode>" },
//   "guidance": ["<optional: each project Room's guidance, at most four one-line sentences; default PROJECT_GUIDANCE>"]
// }
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { closeSync, fsyncSync, fstatSync, futimesSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createLifecycle, digest } from './lifecycle.mjs';
import { arcRoomExpected, cardHoldOf, projectOf, projectRoomKey, runOf, cardRunsNow, cardAgentsOf, leadAgentsOf as selectLeads } from './demand.mjs';
import { createRoomReceipts } from './room-receipts.mjs';
import { createRecovery } from './recovery.mjs';
import { canonical as canonicalJson, digestValue } from './recovery-journal.mjs';
import { promisify } from 'node:util';
export { projectOf } from './demand.mjs';

// ---- the organization's conventions (volter-org decision 40cbcfe6) and the board's published card --------------------
// A card is seated in its project's Room only once it has started: a prepared card owes no seat. Bump the version when
// this rule or the registry's shape changes: decisions and cards read under the old one are read again from a whole snapshot.
const ARC_ROOM_LIFECYCLE_VERSION = 8;
const bindProjectionState = (config, state) => {
  const namespace = config.source?.namespace;
  if (!namespace) return;
  if (state.namespace !== namespace && (state.namespace || state.cursor || Object.keys(state.cards ?? {}).length)) {
    throw new Error('the state file belongs to another or an unqualified source');
  }
  state.namespace = namespace;
};

const [configPath, flag] = process.argv.slice(2);
const disconnecting = flag === '--disconnect';
if (flag && !['--once', '--disconnect'].includes(flag)) throw new Error('use --once or --disconnect');
if (!configPath) { process.stderr.write('usage: main.mjs <config.json> [--once]\n'); process.exit(1); }
const config = JSON.parse(readFileSync(configPath, 'utf8'));
// Every key the rh2 section may hold (`issuer` is what a connection's generated config names); any other is refused by name.
for (const key of Object.keys(config.rh2 ?? {})) if (!['baseUrl', 'organization', 'tokenEnv', 'principalId', 'agentsRegistration', 'cardsPrincipalId', 'issuer'].includes(key)) {
  process.stderr.write(`project-rooms: unknown config key rh2.${key}\n`); process.exit(1);
}
const shutdown = new AbortController();
let fileReading = new AbortController();
let lifecycle, roomReceipts, recovery, compensationReading = false;
const custody = (name) => {
  if (process.env[name]) return process.env[name];
  if (!config.envFile) return '';
  const line = readFileSync(config.envFile, 'utf8').split('\n').find((entry) => entry.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).replace(/^['"]|['"]$/g, '') : '';
};
const teamsToken = custody(config.teams.tokenEnv).trim();
const rh2Token = custody(config.rh2.tokenEnv).trim();
if (!teamsToken || !rh2Token) { process.stderr.write('project-rooms: a Teams and a Workplace installation token are both needed\n'); process.exit(1); }
// One board, named: with no `teams.source` the app read every board the team carries (rehearsals', fixtures'), whose
// copies of this board's card ids held Rooms open for arcs this board had closed, until the Floor's cleanup threshold
// refused the company's own (volter-org, 2026-10-15: 60 open Rooms, 57 cards owed).
if (!config.teams.source) { process.stderr.write("project-rooms: name the board to mirror as teams.source (its event_source_… id: the board's machine's ~/.config/supercode/teams/board-events/*.json)\n"); process.exit(1); }
const self = config.rh2.principalId;
const base = config.rh2.baseUrl.replace(/\/+$/, '');
const log = (event, data = {}) => process.stdout.write(`${JSON.stringify({ t: new Date().toISOString(), event, ...data })}\n`);
// A log line the disk refuses is lost, never the process: the app's work goes on (flushState says a refused state write).
process.stdout.on('error', () => {});

async function rawDoor(path, { body, method } = {}) {
  const verb = method ?? (body === undefined ? 'GET' : 'POST');
    // Quiesce joins writes rather than aborting them. Every request has its own finite bound.
    const response = await fetch(`${base}${path}`, {
      method: verb, signal: AbortSignal.timeout(9000),
      headers: { accept: 'application/json', authorization: `Bearer ${rh2Token}`, origin: base, 'x-rh2-organization': config.rh2.organization, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw Object.assign(new Error(payload?.error?.message ?? `${response.status}`), { code: payload?.error?.code, details: payload?.error?.details, status: response.status });
    if (!payload || !Object.hasOwn(payload, 'data')) throw new Error('Workplace returned no product acknowledgement');
    return payload.data;
}
function admitProjection() {
  if (!disconnecting && !compensationReading && (!sourceAdmitted || !state.ready || lifecycle?.paused)) throw new Error('the board source has no admitted complete reading or projection is quiesced');
}
async function door(path, { body, method } = {}) {
  admitProjection();
  const verb = method ?? (body === undefined ? 'GET' : 'POST');
  return verb === 'GET' ? rawDoor(path, { body, method }) : lifecycle.mutate({ method: verb, path, body }, () => rawDoor(path, { body, method }));
}
async function placementCommand(action, roomId, body, context = {}) {
  admitProjection();
  if (!roomReceipts) throw new Error('conditional Room placement requires the retained selected-program parent binding');
  return lifecycle.conditional(async () => {
    await roomReceipts.settlePlacement(roomId, body.principalId);
    const originalEffects = action === 'leave' ? roomReceipts.originals(roomId, body.principalId) : [];
    const purpose = action === 'leave' ? 'projection-inverse' : context.run ? 'projection-run' : 'projection-role';
    if (action === 'leave') {
      if (!originalEffects.length) throw new Error('Room withdrawal has no original selected-program server effect');
      const original = roomReceipts.batches().filter(batch => originalEffects.some(ref => ref.namespace === batch.namespace.id));
      const sessions = original.map(batch => batch.input.expectedSession).filter(Boolean);
      if (!sessions.length || sessions.some(session => canonicalJson(session) !== canonicalJson(sessions[0]))) throw new Error('Room withdrawal has no single original exact session');
      body = { ...body, expectedSession: sessions[0] };
    }
    const batch = await roomReceipts.prepare(action, roomId, body, { originalEffects, purpose,
      expected: { context, fieldVector: body } });
    const result = await roomReceipts.dispatch(batch);
    await roomReceipts.finish(batch);
    if (!['applied', 'original-effect-absent'].includes(result.conditional.outcome)) throw Object.assign(new Error(`conditional Room placement refused: ${result.conditional.code}`), { code: result.conditional.code });
    if (action === 'leave') roomReceipts.dispose(batch);
    return result;
  });
}

// ---- the project and its Room ---------------------------------------------------------------------------------------
// A project's Room key: one Room per project.
export const projectKeyOf = (project) => projectRoomKey(config, project);
const titleOf = (card) => (String(card.title ?? card.id).trim() || String(card.id)).slice(0, 500);
// What an arc is, for its line in the project Room's topic: the sentence after its `[project]` prefix and its `<slug>:`, to
// its first parenthesis and at most 60 characters on a word, never the slug alone (the owner, "Rooms are named for what
// they are, not for internal ticket numbers").
const nameOf = (card) => {
  const title = titleOf(card).replace(/^\s*\[[^\]]{1,60}\]\s*/, '');
  const sentence = (/^[^:]{1,60}:\s+(.+)$/s.exec(title)?.[1] ?? title).split(' (')[0].replace(/\s+/g, ' ').trim();
  const cut = sentence.length <= 60 ? sentence : sentence.slice(0, 61).replace(/\s+\S*$/, '').replace(/(?:[,;:.\s]+|\s+(?:a|an|and|by|for|from|in|of|on|the|to|with))+$/i, '');
  const name = cut || title.slice(0, 60);
  return name.charAt(0).toUpperCase() + name.slice(1);
};
const STANDING = { blocked: 'blocked', review: 'in review', running: 'being worked on', todo: 'waiting to start', triage: 'in triage' };
const standingOf = (card) => cardHoldOf(card).state ?? STANDING[card.lane] ?? card.lane ?? null;
// How a card is named where people read it: its readable id (the few words naming its outcome), the board's number
// beside it (the owner: "everywhere I see the card it should be showing the human readable ids"); the number alone only
// for a card with no readable id.
const handleOf = (card) => card.readable ? `${card.readable}${card.ref ? ` (${card.ref})` : ''}` : card.ref ?? card.id;
// The project Room's base channel topic: each live arc, by its handle, what it is and where it stands.
const topicOf = (project, cards) => {
  const lines = cards.map((card) => `${handleOf(card)} ${card.name}${card.standing ? ` (${card.standing})` : ''}`).sort();
  return `${project}: ${lines.join('; ')}`.slice(0, 300);
};
const closedLanes = new Set(config.closedLanes ?? ['done', 'cancelled', 'archived', 'scheduled']);
const live = (card) => arcRoomExpected(card, closedLanes);
const LEAD_PROFILES = new Set(config.leadProfiles ?? ['lead']);
function loadState() {
  try { return JSON.parse(readFileSync(config.stateFile, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return { cursor: null }; throw error; }
}
// The state file is written at most every few seconds, only when what it says changed, and once more on the way out: a
// snapshot of thousands of cards rewrote a multi-megabyte file on every frame and every settle (68 MB/s on the Mac).
// The cursor and the cards owed under it are one write, so an obligation is still kept before its cursor. A write the
// disk refuses (full, unwritable) is said once and tried again each minute while the app keeps working from memory: an
// uncaught refusal ended the process, and with it every change to the Floor until someone started it again.
let written = null, flushing = null, writeRefused = null;
function flushState(strict = false) {
  clearTimeout(flushing); flushing = null;
  const text = `${JSON.stringify(state)}\n`;
  if (text === written) {
    if (strict) {
      const fd = openSync(config.stateFile, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); }
      const directory = openSync(dirname(config.stateFile), 'r'); try { fsyncSync(directory); } finally { closeSync(directory); }
      if (readFileSync(config.stateFile, 'utf8') !== text) throw new Error('persisted projection state differs from memory');
    }
    return;
  }
  const pending = `${config.stateFile}.${process.pid}.tmp`;
  try {
    writeFileSync(pending, text, { mode: 0o600 });
    if (strict) { const fd = openSync(pending, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); } }
    renameSync(pending, config.stateFile);
    if (strict) {
      const fd = openSync(dirname(config.stateFile), 'r'); try { fsyncSync(fd); } finally { closeSync(fd); }
      if (readFileSync(config.stateFile, 'utf8') !== text) throw new Error('projection state did not re-read after persistence');
    }
  } catch (error) {
    try { rmSync(pending, { force: true }); } catch { /* the next write replaces it */ }
    if (writeRefused !== error.code) log('state-write-refused', { code: error.code ?? null, message: String(error.message).slice(0, 200) });
    writeRefused = error.code ?? 'error';
    flushing = setTimeout(flushState, 60_000);
    if (strict) throw error;
    return;
  }
  if (writeRefused) { log('state-write-recovered'); writeRefused = null; }
  written = text;
}
function saveState() { flushing ??= setTimeout(flushState, 5_000); }
// What the app reads of a card, kept while it is owed (a whole card carries its body and history).
const KEPT = ['id', 'ref', 'readable_id', 'title', 'project', 'lane', 'status', 'archived', 'removed', 'every', 'subtask_of', 'started_at', 'tags', 'paused', 'blocked_by', 'workspace', 'agents', 'attachments', 'run', 'runSince'];
/** The native session (`<harness>:<native id>`) the card's open board run works in and when that run started, or null: its
 * latest attempt (`attempts`, supercode sdk/teams/board-events.mjs) while that run has not ended and its session was
 * neither closed nor detached, the same reading as supercode's cardRunOf. The card's Task shows as its `work` the
 * principal supercode's integration links to that session. */
const kept = (card) => {
  const out = Object.fromEntries(KEPT.filter((key) => card[key] !== undefined).map((key) => [key, card[key]]));
  // A card as published names its run by its attempts; one already kept carries `run`.
  if (Array.isArray(card.attempts)) {
    const open = runOf(card);
    delete out.run; delete out.runSince;
    if (open) { out.run = open.run; if (open.runSince) out.runSince = open.runSince; }
  }
  return out;
};
/** What the project pass reads of a card: kept in the registry for every card of the board's latest reading. */
const registryOf = (card) => {
  const lane = card.archived ? 'archived' : card.lane ?? card.status;
  const people = (card.tags ?? []).filter((tag) => typeof tag === 'string' && tag.startsWith('person:')).map((tag) => tag.slice(7).toLowerCase());
  return { agents: cardAgentsOf({ ...card, lane }), files: visibleFilesOf(card), id: card.id, leads: leadAgentsOf(card), live: live({ ...card, lane }),
    name: nameOf(card), people, project: projectOf(card), readable: typeof card.readable_id === 'string' && card.readable_id ? card.readable_id : null, ref: typeof card.ref === 'string' ? card.ref : null,
    // Its open run's session while the card is worked or in review and neither paused nor blocked (cardRunsNow).
    run: cardRunsNow({ ...card, lane }) ? card.run ?? null : null, runSince: card.runSince ?? null, standing: standingOf({ ...card, lane }) };
};

// The Floor the project Rooms sit on, and their section, read once per pass (drain). The organization's file says it
// (runhuman-2 ADR 0060 decision 6, VO-3602): the Floor whose `apps` resolves to this app (its own principal, as RH2 answers),
// in the section it names. Once the file names any app on a Floor, a project Room goes nowhere else, and with no Floor
// naming this app the projects are held until the file does. Before that: `projectFloor` by name, else the
// organization's default Floor (Office unless renamed), in the Work section. The program makes no Floor.
const APP_KEY = JSON.parse(readFileSync(new URL('./rh2-app.json', import.meta.url), 'utf8')).registrationKey;
let projectFloor;
function projectPlace() {
  const name = typeof config.projectFloor === 'string' && config.projectFloor.trim() ? config.projectFloor.trim().slice(0, 120) : null;
  return projectFloor ??= door('/api/v3/floors').then((read) => {
    const floors = read.floors ?? [];
    if (floors.some((floor) => (floor.apps ?? []).length > 0)) {
      for (const floor of floors) {
        // By who it is: RH2 answers the installed app each name resolves to (its principal), whatever the file called it
        // (its id where it has no registration key), else by its manifest's key.
        const named = (floor.apps ?? []).find((entry) => entry.principalId === self || entry.app === APP_KEY);
        if (named) return { floorId: floor.floorId, section: typeof named.section === 'string' ? named.section : '' };
      }
      throw Object.assign(new Error(`the organization's file names no Floor for ${APP_KEY}`), { code: 'floor-not-declared' });
    }
    if (name === null) return { floorId: read.defaultFloorId ?? null, section: 'work' };
    const floor = floors.find((each) => each.name === name);
    if (!floor) throw Object.assign(new Error(`the organization has no Floor named ${name}`), { code: 'floor-not-declared' });
    return { floorId: floor.floorId, section: 'work' };
  }).catch((error) => { projectFloor = undefined; throw error; });
}

// Keyed creation serializes the organization's lookup and creation. Each retry asks for the desired active Room;
// it need not know whether an earlier request arrived or committed, and no receipt lifetime governs the mirror.
async function createRoomOf(project) {
  const { section } = await projectPlace();
  const created = await door('/api/v3/rooms', { body: {
    key: projectKeyOf(project), members: [{ principalId: self, roleKeys: ['manager'] }], name: project, section,
  } });
  if (!created?.room?.roomId) throw new Error('the keyed create returned no Room id');
  state.projects[project] = created.room.roomId; saveState();
  log(created.existing ? 'room-found' : 'room-opened', { project, roomId: created.room.roomId });
  return created.room.roomId;
}

/**
 * Close a project Room of this app's: a Room on no Floor is its members', left rather than closed, and a Room already
 * closed or gone is left. The Room is read first: RH2's active-Room list carries no placements, so a close judged from it
 * would close a Room it must leave. Its agents leave with it; its history stays (a closed Room's own seats may be
 * removed). Answers whether it closed it.
 */
async function closeOwnRoom(roomId) {
  const view = await door(`/api/v3/rooms/${encodeURIComponent(roomId)}`).catch((error) => { if (error.status === 404) return null; throw error; });
  const room = view?.room ?? null;
  if (!room || (room.placements ?? []).length === 0) {
    if (Object.keys(state.runSeats[roomId] ?? {}).length) throw Object.assign(new Error('run placement cleanup still requires this Room'), { code: 'cleanup-pending' });
    return false;
  }
  const closed = room.state === 'active';
  if (closed) await door(`/api/v3/rooms/${encodeURIComponent(roomId)}/close`, { body: { expectedVersion: room.version } });
  if (state.cleanupReady) {
    const pending = [];
    await keepAgentSeats(view, new Map(), { roomId }, { pending });
    if (pending.length) throw Object.assign(new Error(`waiting for ${pending.join('; ')}`), { code: 'cleanup-pending' });
  }
  return closed;
}

// ---- the arcs' agents (ADR 0050 decision 12) ------------------------------------------------------------------------
const AGENT_ROLE_KEYS = config.agentRoleKeys ?? ['member'];
const orgPath = `/api/v3/organizations/${encodeURIComponent(config.rh2.organization)}`;
/** Whether an agent of the card works it right now, in its role: its implementer while the card is worked (`running`),
 * its reviewer while it is in review, any other role while either; none while the card is paused or blocked. */
/** The ids of the agents working the card right now (the board's `card.agents`, active, in the role its card is in now),
 * or null when the card publishes none. */
/** The card's agents declared under a lead profile: the project's lead, which holds its Room's conversation. */
const leadAgentsOf = card => selectLeads(card, LEAD_PROFILES);

// ---- the project Room's guidance and its cards' visible updates (runhuman-2 ADR 0063 decisions 7 and 8) -------------
/** What a project Room's agents are told it is for, unless the app's config says otherwise (volter-org decision "project
 * Rooms are co-working calls: their guidance"). */
export const PROJECT_GUIDANCE = [
  'This Room is the project\'s co-working call: its cards being worked now, and the agents working them.',
  'People may be watching and supervising at any time; work as you would with them in the room.',
  'Share to the Room\'s stage what you\'d share on a co-working call: the thing you\'re building, as a Surface while it runs. Stop each share as soon as it no longer shows live work.',
  'Attach each still update (a screenshot, a recording) to your card; it appears here by itself.'
];
const guidance = Array.isArray(config.guidance) ? config.guidance.map(String).slice(0, 4) : PROJECT_GUIDANCE;
/** A card's images and videos, as its snapshot lists them (`attachments`): what its Room shows of its updates. */
const VISIBLE = /\.(png|jpe?g|gif|webp|svg|avif|mp4|webm|mov|m4v)$/i;
const visibleFilesOf = (card) => (Array.isArray(card.attachments) ? card.attachments : [])
  .filter((file) => file && Number.isSafeInteger(file.id) && typeof file.name === 'string' && (/^(image|video)\//.test(file.content_type ?? '') || VISIBLE.test(file.name)))
  .map((file) => ({ at: file.at ?? null, by: file.by ?? null, contentType: file.content_type ?? null, id: file.id, name: file.name, size: Number(file.size) || 0 }));
const typeOf = (file) => file.contentType && /^(image|video)\//.test(file.contentType) ? file.contentType
  : ({ avif: 'image/avif', gif: 'image/gif', jpeg: 'image/jpeg', jpg: 'image/jpeg', m4v: 'video/mp4', mov: 'video/quicktime', mp4: 'video/mp4', png: 'image/png', svg: 'image/svg+xml', webm: 'video/webm', webp: 'image/webp' })[file.name.split('.').pop().toLowerCase()] ?? 'application/octet-stream';
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const execFileAsync = promisify(execFile);
// A supercode given as its Node script (Windows cannot execute npm's shell shim) runs under supercode's own Node.
const run = (program, args, options) => /\.[cm]?js$/i.test(program)
  ? execFileAsync(process.env.SUPERCODE_NODE_BIN || process.execPath, [program, ...args], options)
  : execFileAsync(program, args, options);
/** A card file's bytes, read with the board's own CLI on the machine that keeps it (`attachment-read`, a mebibyte at a
 * time), never from where the board stores them: each part after the first is held to the version the first names, so a
 * file replaced mid-read is refused rather than spliced. */
const PART_BYTES = 1024 * 1024;
async function cardFileBytes(cardId, file) {
  if (!config.board?.root) throw Object.assign(new Error('name the board to read card files from as board.root (its home on this machine)'), { code: 'board-root-unset' });
  const parts = [];
  let offset = 0, version = null;
  for (;;) {
    const { stdout } = await run(config.board.supercode ?? 'supercode', ['workflow', '--root', config.board.root, 'attachment-read', cardId, String(file.id), '--offset', String(offset), '--length', String(PART_BYTES), ...(version ? ['--version', version] : [])], { timeout: 9000, maxBuffer: 4 * PART_BYTES, signal: fileReading.signal });
    const part = JSON.parse(stdout);
    version ??= part.version;
    parts.push(Buffer.from(part.content_base64 ?? '', 'base64'));
    if (part.eof || !(part.next_offset > offset)) return Buffer.concat(parts);
    offset = part.next_offset;
    if (offset > MAX_FILE_BYTES) throw Object.assign(new Error(`${file.name} is larger than ${MAX_FILE_BYTES} bytes`), { code: 'card-file-too-large' });
  }
}
/** Posts each of the card's images and videos its Room has not shown into the Room's base channel, once: as this app's
 * own file, then a line carrying it that names the card. A file attached before the app first read this card's files is
 * recorded as shown. */
async function repostCardFiles(roomId, conversationId, card) {
  const shown = state.reposted[card.id] ??= { since: Date.now(), ids: [] };
  for (const file of card.files ?? []) {
    if (shown.ids.includes(file.id)) continue;
    const at = file.at ? Date.parse(file.at) : NaN;
    if (!(at >= shown.since - 60_000) || !(at >= state.repostSince)) { shown.ids.push(file.id); saveState(); continue; }
    const where = `${handleOf(card)} ${card.name}`;
    let files = [], body;
    if (file.size > MAX_FILE_BYTES) body = `${where}: ${file.name} was attached to the card (too large to show here; it is on the card).`;
    else {
      const bytes = await cardFileBytes(card.id, file);
      const path = `/api/v3/rooms/${encodeURIComponent(roomId)}/files`;
      const uploaded = await lifecycle.mutate({ method: 'POST', path, bytes: bytes.length, sha256: digest(bytes), contentType: typeOf(file), name: file.name }, async () => {
        const response = await fetch(`${base}${path}`, {
          method: 'POST', body: bytes, signal: AbortSignal.timeout(9000),
          headers: { accept: 'application/json', authorization: `Bearer ${rh2Token}`, origin: base, 'x-rh2-organization': config.rh2.organization, 'content-type': typeOf(file), 'x-rh2-artifact-name-uri': encodeURIComponent(file.name) },
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw Object.assign(new Error(payload?.error?.message ?? `${response.status}`), { code: payload?.error?.code, status: response.status });
        if (!payload || !Object.hasOwn(payload, 'data')) throw new Error('Workplace returned no upload acknowledgement');
        return payload.data;
      });
      files = [uploaded.artifact.artifactId];
      body = `${where}${file.by ? `, from ${file.by}` : ''}: ${file.name}`;
    }
    await door(`/api/v3/rooms/${encodeURIComponent(roomId)}/conversations/${encodeURIComponent(conversationId)}/messages`, {
      body: { body, correlationId: `card-file:${card.id}:${file.id}`, files, kind: 'automation' } });
    shown.ids.push(file.id); saveState();
    log('card-file-posted', { card: card.id, file: file.id, roomId });
  }
}
const agentEnded = (agentId) => state.agents[agentId]?.ended === true;
/** The Workplace principal the supercode integration provided for a Teams agent (the resolve door, by the Agents → Room
 *  agents registration and the agent's id as its reference), or null while it has provided none. Kept once found. */
async function agentPrincipalOf(agentId) {
  if (state.agentPrincipals[agentId]) return state.agentPrincipals[agentId];
  if (!config.rh2.agentsRegistration) return null;
  const query = `registration=${encodeURIComponent(config.rh2.agentsRegistration)}&reference=${encodeURIComponent(agentId)}&kind=agent`;
  const found = await door(`${orgPath}/principals/resolve?${query}`).catch((error) => { if (error.status === 404) return null; throw error; });
  const principalId = found?.principal?.principalId;
  if (typeof principalId !== 'string') return null;
  state.agentPrincipals[agentId] = principalId; saveState();
  return principalId;
}
// The organization's people (its principals of kind human), read once per pass with the organization, and the Room's own.
let passPeople;
async function peopleOf(view) {
  passPeople ??= door(orgPath).then((read) => new Set((read?.members ?? []).filter((member) => member.kind === 'human').map((member) => member.principalId)),
    (error) => { passPeople = undefined; throw error; });
  const people = new Set(await passPeople);
  for (const member of view.members ?? []) if (member.kind === 'human') people.add(member.principalId);
  return people;
}
/**
 * Brings `wanted` (agent id → `{ roleKeys, answers }`) into the Room `view` shows with the Workplace's join command, each
 * with `answers` its receive setting in the base channel (`all` or `mentions`; none, the Room's rule), joined again when
 * someone changed it. Any other agent in the Room leaves by the leave command, unless a person brought it in (its seat's
 * `seatedBy` is a person of the organization: their /invite), or `mayUnseat` is false. Leaving waits for a whole board reading, and for every wanted agent to be resolved (an
 * unresolved one may be a joined one). An agent the integration has not provided yet is refused as `agent-not-provided`,
 * so it is tried again on the app's backoff. Who is in the Room is its roster, the Room read's `members` (RH2 ADR 0063
 * decision 1).
 */
// The run sessions said once as not placeable (keepAgentSeats), by principal and refusal.
const unplaced = new Set();
const sameSession = (a, b) => a?.registration === b?.registration && a?.reference && b?.reference
  && JSON.stringify(Object.entries(a.reference).sort()) === JSON.stringify(Object.entries(b.reference).sort());
async function keepAgentSeats(view, wanted, label, { unresolved = [], mayUnseat = true, held = [], sessions = new Map(), pending = [] } = {}) {
  const roomId = view.room.roomId, missing = [...unresolved], principals = new Set(held);
  const members = new Map((view.members ?? []).map(member => [member.principalId, member]));
  const base = view.conversations?.find(item => item.conversationId === view.room.defaultConversationId);
  const receives = new Map((base?.agentParticipants ?? []).map(participant => [participant.principalId, participant.answers]));
  const placements = state.runSeats[roomId] ??= {};
  const borrowed = state.borrowedRunSeats[roomId] ??= {};
  const people = await peopleOf(view);
  // Role and run demand stay separate; only their placement/receive requirement is combined.
  const roles = new Map();
  for (const [agentId, demand] of wanted) {
    const principalId = await agentPrincipalOf(agentId);
    if (!principalId) { missing.push(agentId); continue; }
    roles.set(principalId, { ...demand, agentId }); principals.add(principalId);
  }
  for (const principalId of Object.keys(borrowed)) if (!members.has(principalId) || borrowed[principalId] === self) {
    // Older state mistook our role seat for an independent placement when its role ended before its run.
    // The roster still owns seater provenance; a self-borrowed marker must never exempt our seat from cleanup.
    delete borrowed[principalId]; saveState();
  }
  const desired = new Map(roles);
  for (const [principalId, demand] of sessions) {
    const role = desired.get(principalId);
    desired.set(principalId, { ...demand, ...(role ?? {}), answers: role?.answers === 'all' || demand.answers === 'all' ? 'all' : 'mentions' });
    principals.add(principalId);
  }
  for (const [principalId, demand] of desired) {
    const member = members.get(principalId), role = roles.has(principalId), run = sessions.get(principalId);
    // Reuse a run's pre-existing seat as-is. Neither its placer nor its receive setting belongs to this demand.
    if (member && (people.has(member.seatedBy) || !role && member.seatedBy !== self && !placements[principalId])) {
      if (!role) { borrowed[principalId] = member.seatedBy ?? null; saveState(); }
      if (run && !sameSession(member.sessionBinding, run.session)) pending.push(`${run.card}: its seat has not reached the linked session`);
      continue;
    }
    if (member && member.seatedBy !== self && placements[principalId]) {
      delete placements[principalId]; borrowed[principalId] = member.seatedBy ?? null; saveState();
      if (run && !sameSession(member.sessionBinding, run.session)) pending.push(`${run.card}: its seat has not reached the linked session`);
      continue;
    }
    if (run && (!member || member.seatedBy === self) && !placements[principalId]) {
      // Keep the intent before the effect: an answer lost to restart still leaves a conditional cleanup obligation.
      // A role-owned seat also owes cleanup when the last role ends while run demand still keeps it here.
      placements[principalId] = { kind: run.kind, session: run.session, owner: lifecycle.selection }; flushState(true);
    }
    if (member && (!run || sameSession(member.sessionBinding, run.session)) && (!base || receives.get(principalId) === demand.answers)
      && (!run || placements[principalId]?.owner === lifecycle.selection && (placements[principalId].receipt || placements[principalId].lineage))) continue;
    // Existing-member session and receive rewrites have the same durable obligation as a new join.
    if (run) flushState(true);
    try {
      const placed = await placementCommand('join', roomId, { principalId, roleKeys: demand.roleKeys, answers: demand.answers,
        ...(config.postRoleKeys ? { postRoleKeys: config.postRoleKeys } : {}),
        ...(run ? { expectedSession: run.session } : {}),
        ...(!member ? { preserveExisting: true } : { expectedSeatedBy: self }) }, { run: run ?? null });
      if (placed.seatedBy !== self) {
        if (placements[principalId]) delete placements[principalId];
        borrowed[principalId] = placed.seatedBy ?? null; saveState();
      } else if (run && placements[principalId]?.owner === lifecycle.selection) {
        placements[principalId].receipt = { namespace: placed.conditional.namespace, operationId: placed.conditional.operationId };
        flushState(true);
      }
      log(member ? 'participant-receives' : 'participant-joined', { ...label, principalId, roomId, card: run?.card ?? null, answers: demand.answers });
    } catch (error) {
      if (role && ['principal-unknown', 'principal-not-active', 'seat-unavailable'].includes(error.code)) delete state.agentPrincipals[demand.agentId];
      if (!run) { missing.push(demand.agentId); pending.push(`${demand.agentId}: ${error.code ?? 'join failed'}`); continue; }
      pending.push(`${run.card}: its run session (${error.code ?? 'join failed'})`);
      const key = `${principalId}:${error.code ?? error.message}`;
      if (!unplaced.has(key)) { unplaced.add(key); log('session-not-placed', { ...label, card: run.card, principalId, roomId, code: error.code ?? null }); }
    }
  }
  if (mayUnseat && !missing.length && state.cleanupReady) {
    const leaving = new Map([...members.values()].filter(member => !principals.has(member.principalId)
      && member.seatedBy === self && !Object.hasOwn(borrowed, member.principalId)
      && (member.kind === 'agent' || member.kind === 'session' && placements[member.principalId])).map(member => [member.principalId, member]));
    for (const [principalId, placement] of Object.entries(placements)) if (!principals.has(principalId)) leaving.set(principalId, { ...placement, principalId, seatedBy: self });
    for (const [principalId, member] of leaving) {
      try {
        // A successful conditional leave proves removal, absence, or replacement. A refusal proves none of them.
        await placementCommand('leave', roomId, { principalId, expectedSeatedBy: self });
        delete placements[principalId]; saveState();
        log('participant-left', { ...label, principalId, roomId });
      } catch (error) {
        pending.push(`${principalId}: cleanup (${error.code ?? 'leave failed'})`);
        log('participant-leave-pending', { ...label, principalId, roomId, code: error.code ?? null });
      }
    }
  }
  if (!Object.keys(placements).length) delete state.runSeats[roomId];
  if (!Object.keys(borrowed).length) delete state.borrowedRunSeats[roomId];
  saveState();
  if (missing.length) throw Object.assign(new Error(`the supercode integration has provided no Workplace agent yet for ${missing.join(', ')}`), { code: 'agent-not-provided' });
}
// The card's Task (by the correlation the Cards → Tasks registration makes it under), read once per pass with the Task
// directory: its live agent assignments say which of the card's agents still work it.
let passTasks;
const cardCorrelation = (cardId) => config.source?.namespace
  ? `card:${config.source.namespace}:${createHash('sha256').update(JSON.stringify([config.teams.source, cardId])).digest('hex')}`
  : `card:${config.teams.source}:${cardId}`.slice(0, 256);
async function taskOfCard(cardId) {
  passTasks ??= door('/api/v3/tasks').then((read) => {
    if (!Array.isArray(read?.tasks)) throw new Error('the Task directory returned no task list');
    return read.tasks;
  }, (error) => { passTasks = undefined; throw error; });
  const correlation = cardCorrelation(cardId);
  const matches = (await passTasks).filter((task) => task.correlationId === correlation && (!config.rh2.cardsPrincipalId || task.createdByPrincipalId === config.rh2.cardsPrincipalId));
  return matches.length === 1 ? matches[0] : null;
}
/**
 * The project's agents, from its live arcs: each active declaration of an agent Teams has not ended whose Workplace agent
 * holds a live assignment on its card's Task, the lead's receiving every line and every other's the lines naming it. An
 * arc that publishes no declarations, or whose Task is not found exactly once, says nothing of who is seated: no seat
 * leaves while one does. `waiting` names each arc whose Task or an agent's assignment on it is not there yet (the
 * supercode integration makes them on its own turns): the project stays owed until every one is seated.
 */
async function projectAgentsOf(project, cards) {
  const wanted = new Map(), unresolved = [], waiting = [], held = [], sessions = new Map();
  let mayUnseat = true;
  for (const card of cards) {
    const task = card.run || Array.isArray(card.agents) ? await taskOfCard(card.id) : null;
    // Work must name this run, this provider and its exact session representation. A stale Task link is not demand.
    if (card.run) {
      const work = (task?.work ?? []).filter(each => typeof each?.principalId === 'string'
        && ['session', 'agent'].includes(each.kind) && each.source?.registration === config.rh2.agentsRegistration
        && each.source?.reference?.native === card.run && each.session?.registration === config.rh2.agentsRegistration);
      if (!work.length) waiting.push(`${card.id}: its exact run session`);
      for (const each of work) {
        const answers = card.leads?.length || sessions.get(each.principalId)?.answers === 'all' ? 'all' : 'mentions';
        sessions.set(each.principalId, { answers, card: card.id, native: card.run, roleKeys: AGENT_ROLE_KEYS, session: each.session, kind: each.kind });
      }
    }
    if (!Array.isArray(card.agents)) { mayUnseat = false; continue; }
    if (!task) { mayUnseat = false; if (card.agents.some((agentId) => !agentEnded(agentId))) waiting.push(`${card.id}: its Task`); continue; }
    const assigned = new Set((task.assignedAgents ?? []).map((agent) => agent.principalId));
    for (const agentId of card.agents) {
      if (agentEnded(agentId)) continue;
      const principalId = await agentPrincipalOf(agentId);
      if (!principalId) { unresolved.push(agentId); continue; }
      if (!assigned.has(principalId)) { waiting.push(`${card.id}: ${agentId}'s assignment`); held.push(principalId); continue; }
      const lead = card.leads?.includes(agentId) || wanted.get(agentId)?.answers === 'all';
      wanted.set(agentId, { answers: lead ? 'all' : 'mentions', roleKeys: AGENT_ROLE_KEYS });
    }
  }
  return { held, mayUnseat, sessions, unresolved, waiting, wanted };
}

/**
 * One project's Room as its live arcs say: open, named for the project, in the project Floor's Work section,
 * its topic their list, their agents joined. With no live arc it is closed (closeOwnRoom), only once the board's
 * whole list has been read, and only a Room this app opened for the project.
 */
async function keepProject(project) {
  const cards = Object.values(state.cards).filter((card) => card.live && card.project === project);
  const label = { project };
  let roomId = state.projects[project];
  if (!cards.length) {
    if (!state.cleanupReady || !roomId) return;
    if (await closeOwnRoom(roomId)) log('room-closed', { ...label, roomId });
    return;
  }
  roomId ??= await createRoomOf(project);
  const view = await door(`/api/v3/rooms/${encodeURIComponent(roomId)}`).catch((error) => { if (error.status === 404) return null; throw error; });
  if (!view) { delete state.projects[project]; saveState(); throw new Error('the known Room disappeared; retry its stable key'); }
  const room = view.room;
  let version = room.version;
  if (room.state !== 'active') {
    const reopened = await door(`/api/v3/rooms/${encodeURIComponent(roomId)}/reopen`, { body: { expectedVersion: version } }).catch((error) => { if (error.code === 'room-key-held') { delete state.projects[project]; saveState(); } throw error; });
    version = reopened?.room?.version ?? version + 1; log('room-reopened', { ...label, roomId });
  }
  const { floorId, section } = await projectPlace();
  if (room.name !== project || (room.section ?? '') !== section) { const renamed = await door(`/api/v3/rooms/${encodeURIComponent(roomId)}`, { body: { expectedVersion: version, name: project, section }, method: 'PATCH' }); version = renamed.room.version; log('room-renamed', { ...label, roomId }); }
  // The Room's base channel (its default Conversation, named after it) carries the project's arcs; the app opens no other.
  const baseChannel = view.conversations?.find((item) => item.conversationId === room.defaultConversationId);
  const topic = topicOf(project, cards);
  if (baseChannel && baseChannel.topic !== topic) await door(`/api/v3/rooms/${encodeURIComponent(roomId)}/conversations/${encodeURIComponent(baseChannel.conversationId)}/topic`, { body: { topic }, method: 'PUT' });
  // Its guidance (ADR 0063 decision 7), set with the rules command whenever it differs. A project Room is permanent, so its
  // agents stay in its call until removed (RH2's own rule for a permanent Room).
  if (JSON.stringify(room.rules?.guidance ?? []) !== JSON.stringify(guidance)) {
    await door(`/api/v3/rooms/${encodeURIComponent(roomId)}/rules`, { body: { expectedRevision: room.rules?.revision ?? 0, guidance }, method: 'PUT' });
    log('room-guidance-set', { ...label, roomId });
  }
  // Placement has one writer, this app: the Room is on the project Floor alone, and a placement made by hand is taken back.
  if (floorId === null) throw new Error('the organization has no default Floor to place the Room on');
  const placed = (room.placements ?? []).map((placement) => placement.floorId);
  // A Room on no Floor is placed by its members' agreement: while a request is open the app asks nothing more.
  const asking = placed.length === 0 ? (await door(`/api/v3/rooms/${encodeURIComponent(roomId)}/placement-requests`)).request : null;
  if (!placed.includes(floorId) && !asking) { await door(`/api/v3/rooms/${encodeURIComponent(roomId)}/placements`, { body: { floorId } }); log('room-placed', { ...label, roomId, floorId }); }
  for (const other of placed.filter((each) => each !== floorId)) { await door(`/api/v3/rooms/${encodeURIComponent(roomId)}/placements/remove`, { body: { floorId: other } }); log('room-unplaced', { ...label, roomId, floorId: other }); }
  // The arcs' people (company RFC 0026 decision 5): a `person:<email>` tag (a Jira ticket's reporter and commenters, kept
  // on the arc by ztrack's Jira sync) gives that person access to the Room, where they hold a seat in the organization: the
  // Workplace's grant to read and speak in it, never presence (RH2 ADR 0063 decision 1: they are on its roster only while
  // in its call). Given once per Room (`state.roomAccess`), so a person a manager removes stays removed. A person with no
  // organization seat is given nothing: the organization decides, never a ticket.
  const people = [...new Set(cards.flatMap((card) => card.people ?? []))];
  if (people.length) {
    const organization = await door(orgPath);
    const seated = new Set((organization.seats ?? []).filter((seat) => (seat.state ?? 'active') === 'active').map((seat) => seat.principalId));
    const byEmail = new Map((organization.members ?? []).filter((member) => seated.has(member.principalId)).map((member) => [String(member.address ?? '').replace(/^human:/, '').toLowerCase(), member.principalId]));
    state.roomAccess ??= {};
    const given = new Set(state.roomAccess[roomId] ?? []);
    for (const email of people) {
      const principalId = byEmail.get(email);
      if (!principalId || given.has(principalId)) continue;
      await door(`/api/v3/rooms/${encodeURIComponent(roomId)}/members`, { body: { principalId, roleKeys: ['member'] } });
      given.add(principalId); state.roomAccess[roomId] = [...given]; saveState();
      log('room-access-given', { ...label, roomId, principalId });
    }
  }
  const { held, mayUnseat, sessions, unresolved, waiting, wanted } = await projectAgentsOf(project, cards);
  await keepAgentSeats(view, wanted, label, { held, mayUnseat, pending: waiting, sessions, unresolved });
  // Each card's new images and videos, in the Room's base channel (ADR 0063 decision 8).
  if (baseChannel) for (const card of cards) await repostCardFiles(roomId, baseChannel.conversationId, card);
  // Seated what can be; what waits keeps the project owed, tried again on the app's backoff (keepOwedProjects).
  if (waiting.length) throw Object.assign(new Error(`waiting for ${waiting.slice(0, 5).join('; ')}`), { code: 'seats-pending' });
}

// A card whose reading changed owes its project a pass (keepProject); the project it named before is owed by the frame
// that moved it. A card removed from the board owes the project the registry last read for it.
function applyCard(card) {
  if (!sourceAdmitted || !state.ready) return false;
  const project = state.cards[card.id]?.project ?? projectOf(card);
  if (project) { state.projectsOwed[project] = true; saveState(); }
  return true;
}

// ---- Teams' published Task events ------------------------------------------------------------------------------------
// Teams bounds each reading of its event stream: a long snapshot (or resumed stream) ends a reading with
// snapshot_continue / stream_continue and a signed cursor, and the next reading resumes there. follow() is the whole
// stream across its readings, as supercode's own client reads it.
// Every wait on the event stream is bounded, each by what shows that reading is alive:
// - its connect: the answer's headers within STREAM_CONNECT_MS;
// - its bytes: anything at all (Teams writes a heartbeat comment every 15 s) within STREAM_SILENT_MS;
// - while a snapshot is unfinished, its progress: a snapshot frame within SNAPSHOT_STALL_MS. Heartbeats do not count: a
//   stream that keeps heartbeating but never finishes its snapshot would otherwise stop every pass for good (16:13Z:
//   a continuation the app did not read).
// A wait the server asks for before reconnecting is honoured up to STREAM_RETRY_MAX_MS. A bound ends the reading as a
// stream that failed, and the loop connects again.
const STREAM_CONNECT_MS = 30_000;
const STREAM_SILENT_MS = 90_000;
const SNAPSHOT_STALL_MS = 90_000;
const STREAM_RETRY_MAX_MS = 10 * 60_000;
let snapshotOpen = false;
function readingBounds(connection) {
  let connect = setTimeout(() => connection.abort(new Error(`the event stream did not answer within ${STREAM_CONNECT_MS / 1000} s`)), STREAM_CONNECT_MS);
  let silent = null, stall = null;
  const quiet = () => { clearTimeout(silent); silent = setTimeout(() => { log('event-stream-silent', { silentSeconds: STREAM_SILENT_MS / 1000 }); connection.abort(new Error(`the event stream said nothing for ${STREAM_SILENT_MS / 1000} s`)); }, STREAM_SILENT_MS); };
  const progress = () => { clearTimeout(stall); stall = snapshotOpen ? setTimeout(() => { log('event-snapshot-stalled', { stalledSeconds: SNAPSHOT_STALL_MS / 1000 }); connection.abort(new Error(`the snapshot made no progress for ${SNAPSHOT_STALL_MS / 1000} s`)); }, SNAPSHOT_STALL_MS) : null; };
  return {
    answered() { clearTimeout(connect); connect = null; quiet(); progress(); },
    bytes() { quiet(); },
    frame(type) {
      if (type === 'snapshot_begin') snapshotOpen = true;
      if (type === 'snapshot_end') snapshotOpen = false;
      if (String(type).startsWith('snapshot_')) progress();
    },
    done() { clearTimeout(connect); clearTimeout(silent); clearTimeout(stall); },
  };
}
async function* follow(after, recovery = false) {
  let from = after, continuation = false;
  for (;;) {
    let next = null;
    for await (const frame of followReading(from, continuation, recovery)) {
      if ((frame.type === 'snapshot_continue' || frame.type === 'stream_continue') && typeof frame.cursor === 'string') { next = frame.cursor; break; }
      yield frame;
    }
    if (!next || stopping) return;
    from = next; continuation = true;
  }
}
async function* followReading(after, continuation, recovery = false) {
  // Agent events are the team's own, under no board's source, so the stream names no source and the board's cards are
  // kept by their resource id (the loop below): an arc's agents are unseated when Teams ends them.
  const kinds = 'task.created,task.changed,task.started,task.review_requested,task.changes_requested,task.completed,task.cancelled,task.reopened,task.blocked,task.unblocked,task.paused,task.resumed,task.assigned,task.linked,task.unlinked,task.commented,task.specified,agent.declared,agent.changed,agent.reassigned,agent.reparented,agent.ended';
  const url = `${config.teams.server.replace(/\/+$/, '')}/api/v1/teams/${encodeURIComponent(config.teams.team)}/events?kinds=${kinds}${after ? `&after=${encodeURIComponent(after)}` : ''}`;
  // This connection's own end beside the app's, which its bounds (readingBounds) use to end a reading that hangs.
  const connection = new AbortController();
  connection.signal.addEventListener('abort', () => { if (!recovery) { sourceAdmitted = false; lifecycle?.announce(); } }, { once: true });
  stream = { connection, heardAt: Date.now() };
  // a fresh reading (no cursor) is a snapshot from its start; a continuation of one carries it on
  if (!after) snapshotOpen = true;
  const bounds = readingBounds(connection);
  try {
    const response = await fetch(url, { signal: AbortSignal.any([shutdown.signal, connection.signal]), redirect: 'manual', headers: { accept: 'text/event-stream', authorization: `Bearer ${teamsToken}`, 'x-supercode-caller': 'open-autonomy-project-rooms' } });
    bounds.answered(); stream.heardAt = Date.now();
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})), header = response.headers.get('retry-after');
      const headerMs = header === null ? 0 : /^\d+(?:\.\d+)?$/.test(header) ? Number(header) * 1000 : Math.max(0, Date.parse(header) - Date.now());
      const bodyMs = Number(payload?.error?.details?.retry_after_seconds) * 1000;
      const retryMs = Math.min(Math.max(Number.isFinite(headerMs) ? headerMs : 0, Number.isFinite(bodyMs) ? bodyMs : 0) || 60_000, STREAM_RETRY_MAX_MS);
      throw Object.assign(new Error(payload?.error?.message ?? `Teams events ${response.status}`), { status: response.status, retryMs });
    }
    if (!recovery) {
      sourceAdmitted = true;
      lifecycle?.announce();
      if (after && !continuation) void drain();
    }
    let buffer = '';
    for await (const chunk of response.body.pipeThrough(new TextDecoderStream())) {
      stream.heardAt = Date.now(); bounds.bytes();
      buffer += chunk; let at;
      while ((at = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, at); buffer = buffer.slice(at + 2);
        const data = block.split('\n').filter((line) => line.startsWith('data: ')).map((line) => line.slice(6)).join('\n');
        if (data) { const frame = JSON.parse(data); bounds.frame(frame?.type); yield frame; }
      }
    }
  } finally {
    bounds.done();
    if (!recovery) { sourceAdmitted = false; lifecycle?.announce(); }
  }
}

const state = loadState();
bindProjectionState(config,state);
// A project → its Room; the projects owed a pass (keepProject); when each was last kept.
state.projects ??= {}; state.projectsOwed ??= {}; state.projectsKept ??= {};
state.pending ??= {};
state.agents ??= {}; state.agentPrincipals ??= {}; // Teams agent → { ended }; → its Workplace principal (resolve door)
state.runSeats ??= {}; // Room → exact run placements (including unresolved join/leave effects)
state.borrowedRunSeats ??= {}; // Pre-existing run seats, which this projection never takes over
for (const [roomId, ids] of Object.entries(state.seatedSessions ?? {})) {
  const seats = state.runSeats[roomId] ??= {};
  for (const id of ids) seats[id] ??= { kind: 'session' };
}
delete state.seatedSessions;
// Each card's files its Room has shown (or that predate its first reading of them), and when the app first reposted any:
// a file attached before then is never posted.
state.reposted ??= {}; state.repostSince ??= Date.now();
const source = JSON.stringify([config.teams.server, config.teams.team, config.teams.source ?? null]);
if (state.source && state.source !== source) throw new Error('this state file belongs to another board source');
// Registry entries identify keys actually observed from this source, including cards later absent from a snapshot.
// Old caches carry no source provenance; obtain it from a fresh snapshot rather than adopting other boards' keys.
if (!state.cards) { state.cards = {}; state.cursor = null; state.ready = false; state.pending = {}; }
state.source = source;
// Positive card events may settle after an empty completed list. Only a non-empty baseline authorizes closure.
state.cleanupReady ??= Boolean(state.ready && state.cursor);
if (state.arcRoomLifecycleVersion !== ARC_ROOM_LIFECYCLE_VERSION) {
  // The project Rooms' identities are kept; the card registry is read again from the snapshot, and no old decision
  // authorizes a mutation before that snapshot has completed (the sweep closes a kept Room whose project has no live card).
  state.cursor = null; state.ready = false; state.cleanupReady = false;
  state.pending = {}; state.projectsOwed = {}; state.cards = {};
  state.arcRoomLifecycleVersion = ARC_ROOM_LIFECYCLE_VERSION;
}
delete state.creating; delete state.legacyCreates; delete state.unkept; delete state.rooms; delete state.settled; delete state.floors;
saveState();
let sweepRequested = true;
/**
 * The minute's sweep over the organization's open Rooms: a Room this app opened for a project that has no live arc any
 * more is owed its close. Run demand and unfinished placements are read again each minute: their RH2 representation
 * can change without a native card event. Other live projects are kept again hourly.
 */
async function sweepRooms() {
  if (!sourceAdmitted || !state.ready || !state.cleanupReady) return;
  const answer = await door('/api/v3/rooms?state=active');
  if (!Array.isArray(answer.rooms)) throw new Error('the active Room list returned no Rooms array');
  const open = new Set(answer.rooms.filter((room) => room.state === 'active').map((room) => room.roomId));
  const liveProjects = new Set(Object.values(state.cards).filter((card) => card.live && card.project).map((card) => card.project));
  const runProjects = new Set(Object.values(state.cards).filter(card => card.live && card.project && card.run).map(card => card.project));
  for (const [project, roomId] of Object.entries(state.projects)) {
    if (Object.keys(state.runSeats[roomId] ?? {}).length || Object.values(state.borrowedRunSeats[roomId] ?? {}).includes(self)
      || open.has(roomId) && !liveProjects.has(project)) state.projectsOwed[project] = true;
  }
  for (const project of liveProjects) if (runProjects.has(project) || Date.now() - (state.projectsKept[project] ?? 0) >= 3_600_000) state.projectsOwed[project] = true;
  saveState();
}
let stopping = false, sourceAdmitted = false;
// The event stream connected now (follow): its own end, when it was last heard, and whether it has ended.
let stream = null, readingDone = Promise.resolve(), endReading;
function invalidateSource() {
  sourceAdmitted = false; state.ready = false; state.cleanupReady = false; state.cursor = null; flushState(); lifecycle?.announce();
}

// A card RH2 refuses waits before it is tried again (a minute, doubling to an hour), unless a newer version of it arrives.
// Newer is what the app reads of the card (`kept`), compared by value: every resync re-delivers each card as a new object
// with the same content, and comparing objects let each resync retry every refused card at once (351 of 805 refusals in
// one day's log came before their stated delay).
const backoff = new Map();
const versionOf = (card) => JSON.stringify(kept(card));
function postpone(card, version = versionOf(card)) {
  const delay = Math.min(2 * (backoff.get(card.id)?.delay ?? 30_000), 3_600_000);
  backoff.set(card.id, { version, delay, until: Date.now() + delay });
  return delay;
}
// A card settles once its project owes the pass its reading asks for (applyCard); the pass itself is the project's.
function settle(card) {
  if (!applyCard(card)) return;
  backoff.delete(card.id); standings.delete(card.id);
  if (state.pending[card.id] && versionOf(state.pending[card.id]) === versionOf(card)) { delete state.pending[card.id]; saveState(); }
}
// Each owed project's pass, each on its own backoff when RH2 refuses it.
async function keepOwedProjects() {
  for (const project of Object.keys(state.projectsOwed)) {
    if (stopping || lifecycle?.paused || !sourceAdmitted || !state.ready) return;
    const id = `project:${project}`, held = backoff.get(id);
    if (held && held.until > Date.now()) continue;
    try {
      await keepProject(project);
      delete state.projectsOwed[project]; state.projectsKept[project] = Date.now(); saveState();
      backoff.delete(id); standings.delete(id);
      log('project-current', { project });
    } catch (error) { refused(id, error, postpone({ id }, 'project')); }
  }
}
// A refusal is said when a card's standing changes, never on each retry of the same one (the log had grown to 44 MB of
// identical `card-pending` lines). A refusal about the app's installation or the organization's Floors rather than the
// card (app-consent-required, room-limit-warning) is said for all the cards it holds at once (passSummary).
const standings = new Map(); // card id → its current refusal: { code, message, details }
function refused(id, error, delay) {
  const code = error.code ?? null, message = String(error.message).slice(0, 200);
  const details = code === 'room-limit-warning' && error.details ? { openRooms: error.details.openRooms, maxOpen: error.details.maxOpen, dormantRooms: error.details.dormantRooms } : null;
  const held = standings.get(id);
  standings.set(id, { code, message, details });
  if (held?.code === code && held.message === message) return;
  if (code !== 'app-consent-required' && code !== 'room-limit-warning') log('card-pending', { card: id, code, message, retryInSeconds: delay / 1000 });
}
const CONSENT = 'This program\'s Workplace installation lacks a grant its manifest (packages/workplace/rooms/rh2-app.json) requests: closing, reopening, renaming or writing a topic needs room.manage. A human administrator of the organization approves the app\'s pending permission update in the Workplace (its installed apps: Project Rooms); an installation token cannot.';
let passSaid = '';
/** The installation's and organization's refusals, said when the cards they hold change, and the pass's heartbeat. */
function passSummary() {
  const byCode = new Map();
  for (const [id, standing] of standings) { const held = byCode.get(standing.code) ?? { cards: [], ...standing }; held.cards.push(id); byCode.set(standing.code, held); }
  const consent = byCode.get('app-consent-required'), limit = byCode.get('room-limit-warning');
  const now = JSON.stringify([consent?.cards ?? [], limit?.cards ?? [], limit?.details?.openRooms ?? null]);
  if (now !== passSaid) {
    passSaid = now;
    if (consent) log('app-consent-required', { cards: consent.cards.length, sample: consent.cards.slice(0, 5), principalId: self, organization: config.rh2.organization, message: CONSENT });
    if (limit) log('room-limit-warning', { cards: limit.cards.length, sample: limit.cards.slice(0, 5), message: limit.message, ...(limit.details ?? {}) });
  }
  heartbeat({ owed: Object.keys(state.pending).length, projectsOwed: Object.keys(state.projectsOwed).length, refused: Object.fromEntries([...byCode].map(([code, held]) => [code ?? 'error', held.cards.length])) });
}
/** A pass finished: said without a log line. machine-health's `service.deaf` reads the log's age, and a healthy app can
 *  have nothing to log for hours (every card held on backoff, a quiet board), so a finished pass moves the log's
 *  modification time (the file behind stdout, when it is one) and nothing is appended to it. Only a pass that finished
 *  does: a pass stuck on a call, a blocked process or a stream that went silent (`retrying` ends it) leaves the log's age
 *  growing, so silence past `maxSilentMin` is a hang again. What the pass found is in `<stateFile>.heartbeat.json`,
 *  replaced each time (its size is fixed), for whoever reads why it is quiet. */
let logIsFile;
function heartbeat(found) {
  const now = new Date();
  try {
    logIsFile ??= fstatSync(1).isFile();
    if (logIsFile) futimesSync(1, now, now);
  } catch { logIsFile = false; }
  try {
    const file = `${config.stateFile}.heartbeat.json`, pending = `${file}.${process.pid}.tmp`;
    writeFileSync(pending, `${JSON.stringify({ at: now.toISOString(), pid: process.pid, ...found,
      stream: stream ? { open: !stream.ended, heardAt: new Date(stream.heardAt).toISOString() } : null })}\n`);
    renameSync(pending, file);
  } catch { /* the log's time above is the heartbeat; this file only says why it is quiet */ }
}
const due = (id, card) => {
  const held = backoff.get(id); return !held || held.version !== versionOf(card) || held.until <= Date.now();
};
// Reading never waits on RH2: Teams drops a reader that falls behind (`slow_reader`) and the snapshot starts over, so a
// frame only records its card as owed (persisted with the cursor), and the owed cards are settled beside the reader. A
// pass runs until every owed card has been tried as it now stands, so a whole snapshot settles without waiting for more
// traffic; a card that failed is tried again on a later pass (the next frame, or the minute's retry), never spun on.
let draining;
function drain() {
  draining ??= (async () => {
    if (lifecycle?.paused || !sourceAdmitted || !state.ready) return;
    projectFloor = undefined; passTasks = undefined; passPeople = undefined;
    const tried = new Map();
    for (let next; !stopping && !lifecycle?.paused && sourceAdmitted && state.ready && (next = Object.entries(state.pending).find(([id, card]) => tried.get(id) !== versionOf(card) && due(id, card)));) {
      tried.set(next[0], versionOf(next[1]));
      settle(next[1]);
    }
    const sweeping = sweepRequested && sourceAdmitted && state.ready && state.cleanupReady;
    if (sweeping) {
      sweepRequested = false;
      try { await sweepRooms(); } catch (error) { sweepRequested = true; log('room-sweep-failed', { message: String(error.message).slice(0, 200) }); }
    }
    await keepOwedProjects();
    passSummary();
  })().finally(() => { draining = undefined; });
  return draining;
}
lifecycle = createLifecycle({ state, configPath, statePath: config.stateFile, persist: () => flushState(true), log,
  readiness: () => ({ loaded: true, sourceAdmitted: Boolean(sourceAdmitted && state.ready && !lifecycle?.paused),
    placementOwed: Object.keys(state.pending).length + Object.keys(state.projectsOwed).length }),
  pause: async () => {
    stream?.connection.abort(new Error('projection quiescing'));
    fileReading.abort(new Error('projection quiescing'));
    await readingDone; await draining;
    sourceAdmitted = false; flushState(true);
  },
  resume: () => { fileReading = new AbortController(); },
  recover: async request => {
    if (!recovery) throw new Error('the exact selected recovery owner is unavailable');
    compensationReading = true;
    try { return await recovery.recover(request); }
    finally { compensationReading = false; sourceAdmitted = false; }
  },
  acceptLineage: request => recovery.acceptLineage(request),
  adoptLineage: actual => recovery.adoptLineage(actual),
  roomDebt: () => roomReceipts?.debt() ?? { unknown: 0, unreadable: 0, unclosed: 0 },
  parentDisconnected: error => { stopping = true; if (error) process.exitCode = 1; },
});
if (lifecycle.binding) {
  roomReceipts = createRoomReceipts({ journal: lifecycle.journal, selection: lifecycle.selection, binding: lifecycle.binding,
    source: { connection: lifecycle.binding.connection, namespace: config.source?.namespace ?? null, source: config.teams.source },
    actor: self, organization: config.rh2.organization, transport: rawDoor });
  recovery = createRecovery({ journal: lifecycle.journal, owner: lifecycle.owner, rooms: roomReceipts,
    binding: lifecycle.binding, selection: lifecycle.selection, config, configDigest: digestValue(config),
    state, actor: self, persist: () => flushState(true) });
}
lifecycle.announce();
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  stopping = true;
  void lifecycle.quiesce().then(() => { shutdown.abort(); }, error => {
    log('quiesce-failed', { message: error.message }); process.exitCode = 1; shutdown.abort();
  });
});

// the minute's retry; the stream's own bounds (readingBounds) end a reading that hangs
if (disconnecting) {
  const previousCleanup = state.cleanupReady;
  try {
    const who = await door('/api/v3/session/test');
    if (who.principalId !== self) throw new Error('the connection credential names another app');
    state.cleanupReady = true;
    const pending = [];
    for (const roomId of new Set([...Object.values(state.projects), ...Object.keys(state.runSeats)])) {
      try {
        const view = await door(`/api/v3/rooms/${encodeURIComponent(roomId)}`);
        await keepAgentSeats(view, new Map(), { roomId }, { pending });
      } catch (error) { pending.push(`${roomId}: ${error.code ?? 'cleanup failed'}`); }
    }
    if (pending.length) throw Object.assign(new Error(`${pending.length} Room withdrawals remain owed`), { code: 'withdrawal-pending' });
    const debt = lifecycle.debt();
    if (debt.outstanding || debt.unknown || debt.run) throw Object.assign(new Error('unanswered product effects or run placements retain withdrawal debt'), { code: 'withdrawal-pending' });
    state.disconnectedAt = new Date().toISOString(); log('projection-withdrawn');
  } catch (error) { log('withdrawal-pending', { code: error.code ?? null, message: String(error.message).slice(0, 200) }); process.exitCode = 1; }
  finally { state.cleanupReady = previousCleanup; flushState(); }
  if (writeRefused) process.exitCode = 1;
  process.exit(process.exitCode ?? 0);
}

const retrying = setInterval(() => { sweepRequested = true; void drain(); }, 60_000);
while (!stopping) {
  if (lifecycle.paused) { await new Promise(resolve => setTimeout(resolve, 100)); continue; }
  if (state.streamRetryAt > Date.now()) { await new Promise((resolve) => setTimeout(resolve, Math.min(5000, state.streamRetryAt - Date.now()))); continue; }
  let named = null, snapshotBegun = false;
  if (!state.cursor || flag === '--once') { named = new Set(); state.ready = false; state.cleanupReady = false; state.pending = {}; saveState(); lifecycle.announce(); }
  await drain();
  if (lifecycle.paused || stopping) continue;
  readingDone = new Promise(resolve => { endReading = resolve; });
  try {
    // A connection with no cursor is answered with the board's whole list first. Only such a list, read to its end,
    // says what the board no longer carries; a resumed stream names only what changed.
    const after = flag === '--once' ? null : state.cursor;
    for await (const frame of follow(after)) {
      if (stopping || lifecycle.paused) break;
      if (frame.type === 'snapshot_begin') { snapshotBegun = true; named = new Set(); state.ready = false; state.cleanupReady = false; state.pending = {}; state.cursor = null; saveState(); lifecycle.announce(); }
      if (frame.type === 'resync_required' || frame.type === 'access_revoked') { invalidateSource(); log(frame.type, { reason: frame.reason }); break; }
      const event = frame.data;
      if ((frame.type === 'snapshot_item' || frame.type === 'event') && event?.resource?.kind === 'task' && event.data?.card
        && (!config.teams.source || String(event.resource.id).startsWith(`${config.teams.source}:`))) {
        const card = kept(event.data.card), was = state.cards[card.id]?.project ?? null;
        state.pending[card.id] = card;
        state.cards[card.id] = registryOf(card);
        // A card that moved to another project leaves the one it named before.
        if (was && was !== state.cards[card.id].project) state.projectsOwed[was] = true;
        named?.add(card.id);
      }
      if ((frame.type === 'snapshot_item' || frame.type === 'event') && event?.resource?.kind === 'agent' && typeof event.data?.id === 'string') {
        const ended = event.data.state === 'ended', was = state.agents[event.data.id]?.ended === true;
        state.agents[event.data.id] = { ended };
        // An agent Teams ended leaves the Room of every live arc that names it.
        if (ended !== was) for (const held of Object.values(state.cards)) if (held.live && held.project && held.agents?.includes(event.data.id)) state.projectsOwed[held.project] = true;
      }
      if (frame.type === 'snapshot_end' && named) {
        if (!snapshotBegun) throw new Error('a complete board reading needs its snapshot begin before its end');
        state.ready = true; state.cleanupReady = named.size > 0;
        if (named.size) {
          for (const card of Object.values(state.cards)) if (!named.has(card.id)) {
            card.live = false; state.pending[card.id] = { id: card.id, removed: true };
          }
          sweepRequested = true;
          state.cursor = frame.cursor ?? null;
        } else { state.cursor = null; }
        log(named.size ? 'snapshot-read' : 'snapshot-empty', { cards: named.size });
        named = null;
      } else if (!named && state.ready && state.cleanupReady && frame.cursor) state.cursor = frame.cursor;
      saveState(state);
      if (frame.type === 'snapshot_end') { flushState(true); lifecycle.announce(); }
      if (flag === '--once' && frame.type === 'snapshot_end') { await drain(); stopping = true; break; }
      void drain();
    }
  } catch (error) {
    sourceAdmitted = false; lifecycle.announce();
    if (stream) stream.ended = true;
    // HTTP authentication/access refusal invalidates the baseline as an explicit revocation frame does.
    if (!lifecycle.paused && (named || [401, 403, 409].includes(error.status))) invalidateSource();
    if (error.status === 429) { state.streamRetryAt = Date.now() + error.retryMs + 250; flushState(); }
    if (!lifecycle.paused && !stopping) log('event-stream-failed', { message: String(error.message).slice(0, 200) });
  }
  if (stream) stream.ended = true;
  sourceAdmitted = false; lifecycle.announce();
  if (named && !lifecycle.paused) invalidateSource();
  endReading();
  if (!stopping && !lifecycle.paused) await new Promise((resolve) => setTimeout(resolve, 5000));
}
clearInterval(retrying);
await lifecycle.quiesce();
flushState(true);
if (process.connected) process.disconnect();
