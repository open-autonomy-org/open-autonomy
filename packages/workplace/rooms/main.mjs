#!/usr/bin/env node
// VOLTER'S PROJECT ROOMS: the Open Autonomy integration's program that keeps the organization's Office Floor as its board
// works (runhuman-2 ADR 0056 decision 1; RH2 ADR 0050 decisions 11 and 12: an organization's bespoke Rooms are its
// integration, written through the Workplace's own doors). Workplace and supercode know nothing of it: it reads the board
// as supercode publishes it on Teams' event stream (cards with their agents) and shapes Rooms through the Workplace's
// public commands with its own installation's token, as Terraform shapes a cloud through its API: it makes, names, places
// and closes its Rooms, and brings agents in and out of them with the join and leave commands (runhuman-2 ADR 0060). It
// never writes who is in a Room any other way, and never writes back to the board.
//
// The board's live cards (started, not a subtask, not scheduled, not archived, not in a closed lane) are worked in their
// project's Room: one Room per project (`projectOf`, the organization's convention) under the key `project-<name>`,
// named for the project, on the Office Floor (`projectFloor`, else the organization's default Floor) in its Work section,
// below the Floor's divider. The program is the one writer of its Rooms' placement and section: a hand move is put back.
// Its base channel's topic lists the project's live cards and where each stands. A Room is who is in its call (ADR 0060):
// the program puts no person in it. A ticket's people who hold a seat in the organization are given a seat there (its
// `person:<email>` tags, company RFC 0026 decision 5), which, like its own manager seat and the Floor's grants, is access:
// a person is in the Room only while in its call. The Room is open while a live card names its project; when none does it is closed, its
// history kept, and it reopens with the project's next live card. A card that names no project is worked in no Room. An
// open Room under a card's key (`arc-…`, one Room per card) is closed by the minute's sweep.
//
// One board, named by `teams.source` (its event source id): a Teams team carries every board its machines publish. A
// whole snapshot is also the list of what the board still carries. The organization's open-Room threshold asks a person
// to review dormant Rooms; the program never confirms it for them: it closes its own Rooms whose projects have no live
// card and says the refusal once.
// Each live card's agents (the board's `card.agents` declarations, active, of an agent Teams has not ended, holding a live
// assignment on the card's Task) are seated in its project's Room: resolved through the Workplace's resolve door to the
// principal supercode's integration declared for that agent (`rh2.agentsRegistration`), and joined: the Workplace's join
// command (`POST /api/v3/rooms/:roomId/join`) seats it with `agentRoleKeys` (default member), joins it to the Room's base
// channel and sends its session the Room's seating message (VO-3151). The project's lead, an agent declared under one of
// `leadProfiles` (default `lead`, Open Autonomy's company
// profile), holds the conversation: it receives every line of the base channel (`answers: all`); every other card agent
// receives the lines that name it (`answers: mentions`). The program is the one writer of its seats' receive setting. An
// agent it joined (or one of `rh2.adoptSeatsOf` did, before) that no live card of the project names any more, or that
// Teams ended, leaves (`POST /api/v3/rooms/:roomId/leave`). A state write the disk refuses is retried each minute while the
// program works from memory.
//
//   node packages/workplace/rooms/main.mjs <config.json>          snapshot, then the board's events
//   node packages/workplace/rooms/main.mjs <config.json> --once   snapshot only
// config: {
//   "teams": { "server": "https://teams.example", "team": "<team id>", "source": "<the board's event_source_… id>", "tokenEnv": "PROJECT_ROOMS_TEAMS_TOKEN" },
//   "rh2": { "baseUrl": "https://workplace.example", "organization": "volter", "tokenEnv": "PROJECT_ROOMS_WORKPLACE_TOKEN", "principalId": "<the installation's prn_…>",
//            "issuer": "<optional: the Workplace's canonical origin>",
//            "agentsRegistration": "<supercode's Agents → Room agents registration's client id, app_…>", "adoptSeatsOf": ["<prn_… of the app that seated agents before>"],
//            "cardsPrincipalId": "<optional: only Tasks supercode's Cards → Tasks registration made are a card's Task>" },
//   "agentRoleKeys": ["member"], "postRoleKeys": ["manager"] (optional),
//   "leadProfiles": ["lead"],
//   "envFile": "<custody env file of KEY=VALUE lines>", "stateFile": "<the program's id map and cursor>",
//   "closedLanes": ["done", "cancelled", "archived", "scheduled"],
//   "projectFloor": "<the Floor the project Rooms sit on; none = the organization's default Floor, Office unless renamed>"
// }
import { createHash } from 'node:crypto';
import { fstatSync, futimesSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';

// ---- the organization's conventions (volter-org decision 40cbcfe6) and the board's published card --------------------
// A card is seated in its project's Room only once it has started: a prepared card owes no seat. Bump the version when
// this rule changes: decisions taken under the old one are read again from a whole snapshot.
const ARC_ROOM_LIFECYCLE_VERSION = 3;
const ENDED_LANES = new Set(['done', 'cancelled', 'archived', 'scheduled']);
const arcRoomExpected = (card, closedLanes = ENDED_LANES) => Boolean(card.started_at)
  && !card.removed && !card.archived && !card.every && !card.subtask_of && !closedLanes.has(card.lane ?? card.status);
// A card's project, the organization's convention: a `project:<name>` tag, else its title's `[name]` prefix (every open
// card carries one: `[twins]`, `[voice]`, `[workplace]`…), lower case; null when the card names none.
export const projectOf = (card) => {
  const tag = (card.tags ?? []).find((value) => typeof value === 'string' && value.startsWith('project:') && value.slice(8).trim());
  const name = tag ? tag.slice(8) : /^\s*\[([^\]]{1,60})\]/.exec(String(card.title ?? ''))?.[1];
  return name && name.trim() ? name.trim().toLowerCase() : null;
};
// The board publishes only its active blockers, naming a card or a message: a card waiting on either stands so.
const cardHoldOf = (card) => {
  const blockers = card.blocked_by ?? [];
  const blocked = blockers.some((blocker) => blocker.kind === 'card'), waiting = blockers.some((blocker) => blocker.kind === 'message');
  return { state: card.paused || waiting ? 'paused' : blocked ? 'blocked' : null };
};
// A key the program writes in the Workplace, scoped to its connection when its config names one (`source.namespace`).
const projectionKey = (config, kind, identity) => {
  const namespace = config.source?.namespace;
  if (!namespace) return `${kind}-${String(identity).toLowerCase().replace(/[^a-z0-9-]+/g, '-')}`.slice(0, 64).replace(/-+$/, '');
  if (!/^cx[0-9a-f]{24}$/.test(namespace)) throw new Error('invalid connection source namespace');
  return `${kind}-${namespace}-${createHash('sha256').update(String(identity)).digest('hex').slice(0, 32)}`;
};
const bindProjectionState = (config, state) => {
  const namespace = config.source?.namespace;
  if (!namespace) return;
  if (state.namespace !== namespace && (state.namespace || state.cursor || Object.keys(state.cards ?? {}).length)) {
    throw new Error('the state file belongs to another or an unqualified source');
  }
  state.namespace = namespace;
};

const [configPath, flag] = process.argv.slice(2);
if (!configPath) { process.stderr.write('usage: main.mjs <config.json> [--once]\n'); process.exit(1); }
const config = JSON.parse(readFileSync(configPath, 'utf8'));
// Every key the rh2 section may hold (`issuer` is what a connection's generated config names); any other is refused by name.
for (const key of Object.keys(config.rh2 ?? {})) if (!['baseUrl', 'organization', 'tokenEnv', 'principalId', 'agentsRegistration', 'adoptSeatsOf', 'cardsPrincipalId', 'issuer'].includes(key)) {
  process.stderr.write(`project-rooms: unknown config key rh2.${key}\n`); process.exit(1);
}
const shutdown = new AbortController();
process.on('SIGTERM',()=>shutdown.abort());process.on('SIGINT',()=>shutdown.abort());
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

async function door(path, { body, method } = {}) {
  if (!sourceAdmitted || !state.ready) throw new Error('the board source has no admitted complete reading');
  const response = await fetch(`${base}${path}`, {
    method: method ?? (body === undefined ? 'GET' : 'POST'), signal: AbortSignal.any([shutdown.signal, AbortSignal.timeout(9000)]),
    headers: { accept: 'application/json', authorization: `Bearer ${rh2Token}`, origin: base, 'x-rh2-organization': config.rh2.organization, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json().catch(() => ({}));
  // A refusal's details travel with it: the cleanup warning's are the counts and the Rooms of oldest activity it asks
  // someone to review, which the log otherwise loses.
  if (!response.ok) throw Object.assign(new Error(payload?.error?.message ?? `${response.status}`), { code: payload?.error?.code, details: payload?.error?.details, status: response.status });
  return payload.data;
}

// ---- the project and its Room ---------------------------------------------------------------------------------------
// A card's key in the app's registry (`state.cards`). The app opens no Room under it; one found active is closed (sweepRooms).
export const cardKeyOf = (cardId) => projectionKey(config, 'arc', cardId);
// A project's Room key: one Room per project.
export const projectKeyOf = (project) => projectionKey(config, 'project', project);
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
// The project Room's base channel topic: each live arc, by the board's reference, what it is and where it stands.
const topicOf = (project, cards) => {
  const lines = cards.map((card) => `${card.ref ?? card.id} ${card.name}${card.standing ? ` (${card.standing})` : ''}`).sort();
  return `${project}: ${lines.join('; ')}`.slice(0, 300);
};
const closedLanes = new Set(config.closedLanes ?? ['done', 'cancelled', 'archived', 'scheduled']);
const live = (card) => arcRoomExpected(card, closedLanes);
const LEAD_PROFILES = new Set(config.leadProfiles ?? ['lead']);
function loadState() {
  try { return JSON.parse(readFileSync(config.stateFile, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return { floors: {}, cursor: null }; throw error; }
}
// The state file is written at most every few seconds, only when what it says changed, and once more on the way out: a
// snapshot of thousands of cards rewrote a multi-megabyte file on every frame and every settle (68 MB/s on the Mac).
// The cursor and the cards owed under it are one write, so an obligation is still kept before its cursor. A write the
// disk refuses (full, unwritable) is said once and tried again each minute while the app keeps working from memory: an
// uncaught refusal ended the process, and with it every change to the Floor until someone started it again.
let written = null, flushing = null, writeRefused = null;
function flushState() {
  clearTimeout(flushing); flushing = null;
  const text = `${JSON.stringify(state)}\n`;
  if (text === written) return;
  const pending = `${config.stateFile}.${process.pid}.tmp`;
  try {
    writeFileSync(pending, text, { mode: 0o600 });
    renameSync(pending, config.stateFile);
  } catch (error) {
    try { rmSync(pending, { force: true }); } catch { /* the next write replaces it */ }
    if (writeRefused !== error.code) log('state-write-refused', { code: error.code ?? null, message: String(error.message).slice(0, 200) });
    writeRefused = error.code ?? 'error';
    flushing = setTimeout(flushState, 60_000);
    return;
  }
  if (writeRefused) { log('state-write-recovered'); writeRefused = null; }
  written = text;
}
function saveState() { flushing ??= setTimeout(flushState, 5_000); }
// What the app reads of a card, kept while it is owed (a whole card carries its body and history).
const KEPT = ['id', 'ref', 'title', 'project', 'lane', 'status', 'archived', 'removed', 'every', 'subtask_of', 'started_at', 'tags', 'paused', 'blocked_by', 'workspace', 'agents'];
const kept = (card) => Object.fromEntries(KEPT.filter((key) => card[key] !== undefined).map((key) => [key, card[key]]));
/** What the project pass reads of a card: kept in the registry for every card of the board's latest reading. */
const registryOf = (card) => {
  const lane = card.archived ? 'archived' : card.lane ?? card.status;
  const people = (card.tags ?? []).filter((tag) => typeof tag === 'string' && tag.startsWith('person:')).map((tag) => tag.slice(7).toLowerCase());
  return { agents: cardAgentsOf(card), id: card.id, leads: leadAgentsOf(card), live: live({ ...card, lane }),
    name: nameOf(card), people, project: projectOf(card), ref: typeof card.ref === 'string' ? card.ref : null, standing: standingOf({ ...card, lane }) };
};

// The Floor the project Rooms sit on, read once per pass (drain): `projectFloor` by name (made when missing), else the
// organization's default Floor (Office unless renamed).
let projectFloor;
async function projectFloorId() {
  const name = typeof config.projectFloor === 'string' && config.projectFloor.trim() ? config.projectFloor.trim().slice(0, 120) : null;
  if (name === null) return projectFloor ??= door('/api/v3/floors').then((read) => read.defaultFloorId ?? null, (error) => { projectFloor = undefined; throw error; });
  if (state.floors[name]) return state.floors[name];
  const listed = (await door('/api/v3/floors')).floors.find((floor) => floor.name === name);
  const floorId = listed?.floorId ?? (await door('/api/v3/floors', { body: { name } })).floorId;
  state.floors[name] = floorId; saveState();
  if (!listed) log('floor-made', { floorId, name });
  return floorId;
}

// Keyed creation serializes the organization's lookup and creation. Each retry asks for the desired active Room;
// it need not know whether an earlier request arrived or committed, and no receipt lifetime governs the mirror.
async function createRoomOf(project) {
  const created = await door('/api/v3/rooms', { body: {
    key: projectKeyOf(project), members: [{ principalId: self, roleKeys: ['manager'] }], name: project, section: 'work',
  } });
  if (!created?.room?.roomId) throw new Error('the keyed create returned no Room id');
  state.projects[project] = created.room.roomId; saveState();
  log(created.existing ? 'room-found' : 'room-opened', { project, roomId: created.room.roomId });
  return created.room.roomId;
}

/**
 * Close a Room of this app's, by the one rule every close follows: a Room on no Floor is its members', left rather than
 * closed, and a Room already closed or gone is left. The Room is read first (`view`, when the caller has just read it):
 * RH2's active-Room list carries no placements, so a close judged from it would close a Room it must leave. Its agents
 * leave with it; its history stays (a closed Room's own seats may be removed). Answers whether it closed it.
 */
async function closeOwnRoom(roomId, view = null) {
  view ??= await door(`/api/v3/rooms/${encodeURIComponent(roomId)}`).catch((error) => { if (error.status === 404) return null; throw error; });
  const room = view?.room ?? null;
  if (!room || (room.placements ?? []).length === 0) return false;
  const closed = room.state === 'active';
  if (closed) await door(`/api/v3/rooms/${encodeURIComponent(roomId)}/close`, { body: { expectedVersion: room.version } });
  if (state.cleanupReady) await keepAgentSeats(view, new Map(), { roomId });
  return closed;
}

// ---- the arcs' agents (ADR 0050 decision 12) ------------------------------------------------------------------------
const AGENT_ROLE_KEYS = config.agentRoleKeys ?? ['member'];
// Whose agent seats this app keeps: its own, and those the app that seated them before made (taken over at cutover).
const seaters = new Set([self, ...(config.rh2.adoptSeatsOf ?? [])]);
const orgPath = `/api/v3/organizations/${encodeURIComponent(config.rh2.organization)}`;
const activeAgents = (card) => Array.isArray(card.agents) ? card.agents.filter((agent) => agent && typeof agent.id === 'string' && agent.id && agent.state === 'active') : null;
/** The ids of the agents a card declares active (the board's `card.agents`), or null when the card publishes none. */
function cardAgentsOf(card) {
  const agents = activeAgents(card);
  return agents === null ? null : [...new Set(agents.map((agent) => agent.id))].sort();
}
/** The card's agents declared under a lead profile: the project's lead, which holds its Room's conversation. */
function leadAgentsOf(card) {
  return [...new Set((activeAgents(card) ?? []).filter((agent) => LEAD_PROFILES.has(agent.profile)).map((agent) => agent.id))].sort();
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
/**
 * Brings `wanted` (agent id → `{ roleKeys, answers }`) into the Room `view` shows with the Workplace's join command, each
 * with `answers` its receive setting in the base channel (`all` or `mentions`; none, the Room's rule), joined again when
 * someone changed it. An agent this app (or an adopted seater) joined that is no longer wanted leaves by the leave command,
 * unless `mayUnseat` is false. Leaving waits for a whole board reading, and for every wanted agent to be resolved (an
 * unresolved one may be a joined one). An agent the integration has not provided yet is refused as `agent-not-provided`,
 * so it is tried again on the app's backoff. Who is in the Room is its members brought in (ADR 0060, `broughtIn`): any
 * other seat of an agent (one it took by acting, a members write, the organization document's) is access, and the join
 * brings it in.
 */
async function keepAgentSeats(view, wanted, label, { unresolved = [], mayUnseat = true } = {}) {
  const roomId = view.room.roomId, missing = [...unresolved], principals = new Set();
  const inRoom = new Set((view.members ?? []).filter((member) => member.broughtIn === true).map((member) => member.principalId));
  const base = view.conversations?.find((item) => item.conversationId === view.room.defaultConversationId);
  const receives = new Map((base?.agentParticipants ?? []).map((participant) => [participant.principalId, participant.answers]));
  const room = `/api/v3/rooms/${encodeURIComponent(roomId)}`;
  for (const [agentId, { answers, roleKeys }] of wanted) {
    const principalId = await agentPrincipalOf(agentId);
    if (!principalId) { missing.push(agentId); continue; }
    principals.add(principalId);
    const joined = inRoom.has(principalId);
    if (joined && (!answers || !base || receives.get(principalId) === answers)) continue;
    try {
      await door(`${room}/join`, { body: { principalId, roleKeys, ...(answers ? { answers } : {}), ...(config.postRoleKeys ? { postRoleKeys: config.postRoleKeys } : {}) } });
    } catch (error) {
      // A principal that no longer stands (ended in the Workplace) is resolved again next time.
      if (['principal-unknown', 'principal-not-active', 'seat-unavailable'].includes(error.code)) delete state.agentPrincipals[agentId];
      throw error;
    }
    log(joined ? 'agent-receives' : 'agent-joined', { ...label, agent: agentId, principalId, roomId, ...(answers ? { answers } : {}) });
  }
  if (mayUnseat && !missing.length && state.cleanupReady) {
    for (const member of view.members ?? []) {
      if (member.kind !== 'agent' || principals.has(member.principalId) || !seaters.has(member.seatedBy)) continue;
      await door(`${room}/leave`, { body: { principalId: member.principalId, expectedSeatedBy: member.seatedBy } });
      log('agent-left', { ...label, principalId: member.principalId, roomId });
    }
  }
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
  const wanted = new Map(), unresolved = [], waiting = [];
  let mayUnseat = true;
  for (const card of cards) {
    if (!Array.isArray(card.agents)) { mayUnseat = false; continue; }
    const task = await taskOfCard(card.id);
    if (!task) { mayUnseat = false; if (card.agents.some((agentId) => !agentEnded(agentId))) waiting.push(`${card.id}: its Task`); continue; }
    const assigned = new Set((task.assignedAgents ?? []).map((agent) => agent.principalId));
    for (const agentId of card.agents) {
      if (agentEnded(agentId)) continue;
      const principalId = await agentPrincipalOf(agentId);
      if (!principalId) { unresolved.push(agentId); continue; }
      if (!assigned.has(principalId)) { waiting.push(`${card.id}: ${agentId}'s assignment`); continue; }
      const lead = card.leads?.includes(agentId) || wanted.get(agentId)?.answers === 'all';
      wanted.set(agentId, { answers: lead ? 'all' : 'mentions', roleKeys: AGENT_ROLE_KEYS });
    }
  }
  return { mayUnseat, unresolved, waiting, wanted };
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
  if (room.name !== project || room.section !== 'work') { const renamed = await door(`/api/v3/rooms/${encodeURIComponent(roomId)}`, { body: { expectedVersion: version, name: project, section: 'work' }, method: 'PATCH' }); version = renamed.room.version; log('room-renamed', { ...label, roomId }); }
  // The Room's base channel (its default Conversation, named after it) carries the project's arcs; the app opens no other.
  const baseChannel = view.conversations?.find((item) => item.conversationId === room.defaultConversationId);
  const topic = topicOf(project, cards);
  if (baseChannel && baseChannel.topic !== topic) await door(`/api/v3/rooms/${encodeURIComponent(roomId)}/conversations/${encodeURIComponent(baseChannel.conversationId)}/topic`, { body: { topic }, method: 'PUT' });
  // Placement has one writer, this app: the Room is on the project Floor alone, and a placement made by hand is taken back.
  const floorId = await projectFloorId();
  if (floorId === null) throw new Error('the organization has no default Floor to place the Room on');
  const placed = (room.placements ?? []).map((placement) => placement.floorId);
  // A Room on no Floor is placed by its members' agreement: while a request is open the app asks nothing more.
  const asking = placed.length === 0 ? (await door(`/api/v3/rooms/${encodeURIComponent(roomId)}/placement-requests`)).request : null;
  if (!placed.includes(floorId) && !asking) { await door(`/api/v3/rooms/${encodeURIComponent(roomId)}/placements`, { body: { floorId } }); log('room-placed', { ...label, roomId, floorId }); }
  for (const other of placed.filter((each) => each !== floorId)) { await door(`/api/v3/rooms/${encodeURIComponent(roomId)}/placements/remove`, { body: { floorId: other } }); log('room-unplaced', { ...label, roomId, floorId: other }); }
  // The arcs' people (company RFC 0026 decision 5): a `person:<email>` tag (a Jira ticket's reporter and commenters, kept
  // on the arc by ztrack's Jira sync) gives that person a seat in the Room, where they hold a seat in the organization: the
  // Workplace's access to read and speak in it, never presence (ADR 0060: they are in the Room only while in its call, and
  // are never listed as in it for this seat). A person with no seat is not seated: the organization decides, never a ticket.
  const people = [...new Set(cards.flatMap((card) => card.people ?? []))];
  if (people.length) {
    const organization = await door(orgPath);
    const seated = new Set((organization.seats ?? []).filter((seat) => (seat.state ?? 'active') === 'active').map((seat) => seat.principalId));
    const byEmail = new Map((organization.members ?? []).filter((member) => seated.has(member.principalId)).map((member) => [String(member.address ?? '').replace(/^human:/, '').toLowerCase(), member.principalId]));
    const holding = new Set((view.members ?? []).map((member) => member.principalId ?? member.principal?.principalId));
    for (const email of people) {
      const principalId = byEmail.get(email);
      if (!principalId || holding.has(principalId)) continue;
      await door(`/api/v3/rooms/${encodeURIComponent(roomId)}/members`, { body: { principalId, roleKeys: ['member'] } });
      log('room-access-given', { ...label, roomId, principalId });
    }
  }
  const { mayUnseat, unresolved, waiting, wanted } = await projectAgentsOf(project, cards);
  await keepAgentSeats(view, wanted, label, { mayUnseat, unresolved });
  // Seated what can be; what waits keeps the project owed, tried again on the app's backoff (keepOwedProjects).
  if (waiting.length) throw Object.assign(new Error(`waiting for ${waiting.slice(0, 5).join('; ')}`), { code: 'seats-pending' });
}

// A card whose reading changed owes its project a pass (keepProject); the project it named before is owed by the frame
// that moved it. A card removed from the board owes the project the registry last read for it.
function applyCard(card) {
  if (!sourceAdmitted || !state.ready) return false;
  const project = state.cards[cardKeyOf(card.id)]?.project ?? projectOf(card);
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
async function* follow(after) {
  let from = after, continuation = false;
  for (;;) {
    let next = null;
    for await (const frame of followReading(from, continuation)) {
      if ((frame.type === 'snapshot_continue' || frame.type === 'stream_continue') && typeof frame.cursor === 'string') { next = frame.cursor; break; }
      yield frame;
    }
    if (!next || stopping) return;
    from = next; continuation = true;
  }
}
async function* followReading(after, continuation) {
  // Agent events are the team's own, under no board's source, so the stream names no source and the board's cards are
  // kept by their resource id (the loop below): an arc's agents are unseated when Teams ends them.
  const kinds = 'task.created,task.changed,task.started,task.review_requested,task.changes_requested,task.completed,task.cancelled,task.reopened,task.blocked,task.unblocked,task.paused,task.resumed,task.assigned,task.linked,task.unlinked,task.commented,task.specified,agent.declared,agent.changed,agent.reassigned,agent.reparented,agent.ended';
  const url = `${config.teams.server.replace(/\/+$/, '')}/api/v1/teams/${encodeURIComponent(config.teams.team)}/events?kinds=${kinds}${after ? `&after=${encodeURIComponent(after)}` : ''}`;
  // This connection's own end beside the app's, which its bounds (readingBounds) use to end a reading that hangs.
  const connection = new AbortController();
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
    sourceAdmitted = true;
    if (after && !continuation) void drain();
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
  } finally { bounds.done(); }
}

const state = loadState();
bindProjectionState(config,state);
// A project → its Room; the projects owed a pass (keepProject); when each was last kept.
state.projects ??= {}; state.projectsOwed ??= {}; state.projectsKept ??= {};
state.floors ??= {}; state.pending ??= {};
state.agents ??= {}; state.agentPrincipals ??= {}; // Teams agent → { ended }; → its Workplace principal (resolve door)
const source = JSON.stringify([config.teams.server, config.teams.team, config.teams.source ?? null]);
if (state.source && state.source !== source) throw new Error('this state file belongs to another board source');
// Registry entries identify keys actually observed from this source, including cards later absent from a snapshot.
// Old caches carry no source provenance; obtain it from a fresh snapshot rather than adopting other boards' keys.
if (!state.cards) { state.cards = {}; state.cursor = null; state.ready = false; state.pending = {}; }
state.source = source;
// Positive card events may settle after an empty completed list. Only a non-empty baseline authorizes closure.
state.cleanupReady ??= Boolean(state.ready && state.cursor);
if (state.arcRoomLifecycleVersion !== ARC_ROOM_LIFECYCLE_VERSION) {
  // Keep the source-key registry and Room/Floor identities, including absent cards needed by the later sweep.
  // No old lifecycle decision authorizes a mutation before the ordinary snapshot has completed.
  state.cursor = null; state.ready = false; state.cleanupReady = false;
  state.pending = {}; state.projectsOwed = {};
  for (const card of Object.values(state.cards)) delete card.live;
  state.arcRoomLifecycleVersion = ARC_ROOM_LIFECYCLE_VERSION;
}
delete state.creating; delete state.legacyCreates; delete state.unkept; delete state.rooms; delete state.settled;
saveState();
let sweepRequested = true;
/**
 * The minute's sweep over the organization's open Rooms: a Room under this app's card key is closed (the board's arcs are
 * worked in their project's Room), a Room this app opened for a project that has no live arc any more is owed its close,
 * and each project with a live arc is kept again hourly.
 */
async function sweepRooms() {
  if (!sourceAdmitted || !state.ready || !state.cleanupReady) return;
  const answer = await door('/api/v3/rooms?state=active');
  if (!Array.isArray(answer.rooms)) throw new Error('the active Room list returned no Rooms array');
  for (const room of answer.rooms) {
    if (!sourceAdmitted || !state.ready || !state.cleanupReady) return;
    if (room.state === 'active' && ownCardKey(room.key)) await closeStray(room);
  }
  const open = new Set(answer.rooms.filter((room) => room.state === 'active').map((room) => room.roomId));
  const liveProjects = new Set(Object.values(state.cards).filter((card) => card.live && card.project).map((card) => card.project));
  for (const [project, roomId] of Object.entries(state.projects)) if (open.has(roomId) && !liveProjects.has(project)) state.projectsOwed[project] = true;
  for (const project of liveProjects) if (Date.now() - (state.projectsKept[project] ?? 0) >= 3_600_000) state.projectsOwed[project] = true;
  saveState();
}
// This app's card keys (`cardKeyOf`): `arc-<card id>` without a connection namespace, `arc-<namespace>-<digest>` with
// one. An open Room under one is the app's to close; a Room of any other key is not its.
const ownCardKey = (key) => typeof key === 'string' && key.startsWith(config.source?.namespace ? `arc-${config.source.namespace}-` : 'arc-');
const strayBackoff = new Map();
async function closeStray(room) {
  const held = strayBackoff.get(room.roomId);
  if (held && held.until > Date.now()) return;
  try {
    // read first: the active-Room list carries no placements, and a Room on no Floor is its members' (closeOwnRoom)
    if (await closeOwnRoom(room.roomId)) log('stray-room-closed', { key: room.key, roomId: room.roomId });
    strayBackoff.delete(room.roomId); standings.delete(`room:${room.roomId}`);
  } catch (error) {
    sweepRequested = true;
    const delay = Math.min(2 * (held?.delay ?? 30_000), 3_600_000);
    strayBackoff.set(room.roomId, { delay, until: Date.now() + delay });
    refused(`room:${room.roomId}`, error, delay);
  }
}
let stopping = false, sourceAdmitted = false;
// The event stream connected now (follow): its own end, when it was last heard, and whether it has ended.
let stream = null;
function invalidateSource() {
  sourceAdmitted = false; state.ready = false; state.cleanupReady = false; state.cursor = null; flushState();
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stopping = true; flushState(); process.exit(0); });
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
    if (stopping || !sourceAdmitted || !state.ready) return;
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
    if (!sourceAdmitted || !state.ready) return;
    projectFloor = undefined; passTasks = undefined;
    const tried = new Map();
    for (let next; !stopping && sourceAdmitted && state.ready && (next = Object.entries(state.pending).find(([id, card]) => tried.get(id) !== versionOf(card) && due(id, card)));) {
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
// the minute's retry; the stream's own bounds (readingBounds) end a reading that hangs
const retrying = setInterval(() => { sweepRequested = true; void drain(); }, 60_000);
while (!stopping) {
  if (state.streamRetryAt > Date.now()) { await new Promise((resolve) => setTimeout(resolve, Math.min(5000, state.streamRetryAt - Date.now()))); continue; }
  let named = null;
  if (!state.cursor || flag === '--once') { named = new Set(); state.ready = false; state.cleanupReady = false; state.pending = {}; saveState(); }
  await drain();
  try {
    // A connection with no cursor is answered with the board's whole list first. Only such a list, read to its end,
    // says what the board no longer carries; a resumed stream names only what changed.
    const after = flag === '--once' ? null : state.cursor;
    for await (const frame of follow(after)) {
      if (stopping) break;
      if (frame.type === 'snapshot_begin') { named = new Set(); state.ready = false; state.cleanupReady = false; state.pending = {}; state.cursor = null; saveState(); }
      if (frame.type === 'resync_required' || frame.type === 'access_revoked') { invalidateSource(); log(frame.type, { reason: frame.reason }); break; }
      const event = frame.data;
      if ((frame.type === 'snapshot_item' || frame.type === 'event') && event?.resource?.kind === 'task' && event.data?.card
        && (!config.teams.source || String(event.resource.id).startsWith(`${config.teams.source}:`))) {
        const card = kept(event.data.card), key = cardKeyOf(card.id), was = state.cards[key]?.project ?? null;
        state.pending[card.id] = card;
        state.cards[key] = registryOf(card);
        // A card that moved to another project leaves the one it named before.
        if (was && was !== state.cards[key].project) state.projectsOwed[was] = true;
        named?.add(card.id);
      }
      if ((frame.type === 'snapshot_item' || frame.type === 'event') && event?.resource?.kind === 'agent' && typeof event.data?.id === 'string') {
        const ended = event.data.state === 'ended', was = state.agents[event.data.id]?.ended === true;
        state.agents[event.data.id] = { ended };
        // An agent Teams ended leaves the Room of every live arc that names it.
        if (ended !== was) for (const held of Object.values(state.cards)) if (held.live && held.project && held.agents?.includes(event.data.id)) state.projectsOwed[held.project] = true;
      }
      if (frame.type === 'snapshot_end' && named) {
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
      if (flag === '--once' && frame.type === 'snapshot_end') { await drain(); stopping = true; break; }
      void drain();
    }
  } catch (error) {
    if (stream) stream.ended = true;
    // HTTP authentication/access refusal invalidates the baseline as an explicit revocation frame does.
    if (named || [401, 403, 409].includes(error.status)) invalidateSource();
    if (error.status === 429) { state.streamRetryAt = Date.now() + error.retryMs + 250; flushState(); }
    log('event-stream-failed', { message: String(error.message).slice(0, 200) });
  }
  if (stream) stream.ended = true;
  sourceAdmitted = false;
  if (named) invalidateSource();
  if (!stopping) await new Promise((resolve) => setTimeout(resolve, 5000));
}
clearInterval(retrying);
await draining;
flushState();
