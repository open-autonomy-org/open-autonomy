// Shared native-card selectors. Recovery receives held native records, never an event-stream absence claim.
import { canonical, hash, refuse } from './recovery-journal.mjs';

export function projectRoomKey(config, project) {
  const namespace = config.source?.namespace;
  if (!namespace) return `project-${String(project).toLowerCase().replace(/[^a-z0-9-]+/g, '-')}`.slice(0, 64).replace(/-+$/, '');
  if (!/^cx[0-9a-f]{24}$/.test(namespace)) refuse('invalid connection source namespace');
  const prefix = `project-${namespace}-`;
  return `${prefix}${hash(String(project)).slice(0, Math.min(32, 63 - prefix.length))}`;
}

export const ENDED_LANES = new Set(['done', 'cancelled', 'archived', 'scheduled']);
export const arcRoomExpected = (card, closedLanes = ENDED_LANES) => Boolean(card.started_at)
  && !card.removed && !card.archived && !card.every && !card.subtask_of && !closedLanes.has(card.lane ?? card.status);
export function projectOf(card) {
  const tag = (card.tags ?? []).find(value => typeof value === 'string' && value.startsWith('project:') && value.slice(8).trim());
  const name = tag ? tag.slice(8) : /^\s*\[([^\]]{1,60})\]/.exec(String(card.title ?? ''))?.[1];
  return name && name.trim() ? name.trim().toLowerCase() : null;
}
export function cardHoldOf(card) {
  const blockers = card.blocked_by ?? [];
  const blocked = blockers.some(blocker => blocker.kind === 'card'), waiting = blockers.some(blocker => blocker.kind === 'message');
  return { state: card.paused || waiting ? 'paused' : blocked ? 'blocked' : null };
}
export const activeAgents = card => Array.isArray(card.agents) ? card.agents.filter(agent => agent && typeof agent.id === 'string' && agent.id && agent.state === 'active') : null;
export const worksNow = (card, agent) => !cardHoldOf(card).state
  && ({ implementer: ['running'], reviewer: ['review'] }[agent.role] ?? ['running', 'review']).includes(card.lane ?? card.status);
export const cardRunsNow = card => !cardHoldOf(card).state && ['running', 'review'].includes(card.lane ?? card.status);
export const cardAgentsOf = card => activeAgents(card) === null ? null
  : [...new Set(activeAgents(card).filter(agent => worksNow(card, agent)).map(agent => agent.id))].sort();
export const leadAgentsOf = (card, leadProfiles) => [...new Set((activeAgents(card) ?? [])
  .filter(agent => leadProfiles.has(agent.profile) && worksNow({ ...card, lane: card.archived ? 'archived' : card.lane ?? card.status }, agent)).map(agent => agent.id))].sort();
export function runOf(card) {
  const attempt = Array.isArray(card.attempts) ? card.attempts.at(-1) : null, session = attempt?.session;
  if (!session || attempt.ended_at || session.closed_at || session.detached_at) return null;
  if (typeof session.harness !== 'string' || !session.harness || typeof session.session_id !== 'string' || !session.session_id) return null;
  return { run: `${session.harness}:${session.session_id}`, runSince: typeof attempt.started_at === 'string' ? attempt.started_at : null };
}

// Recovery reads the complete native history. The event projector's runOf()
// intentionally names its latest attempt; it cannot supply this positive cut.
function recoveryRuns(card, pinned) {
  if (!Array.isArray(card.agents) || !Array.isArray(card.attempts) || card.omitted?.attempts != null && card.omitted.attempts !== 0) refuse(`native card ${card.id} has incomplete declaration or run history`);
  for (const agent of card.agents) {
    if (!agent || typeof agent.id !== 'string' || !agent.id || !['active', 'ended'].includes(agent.state)
      || typeof agent.role !== 'string' || !agent.role || !pinned.has(agent.id)) refuse(`native card ${card.id} has an unresolved or unpinned declared identity`);
  }
  const runs = new Set(), attempts = new Set();
  for (const attempt of card.attempts) {
    if (!attempt || typeof attempt !== 'object' || Array.isArray(attempt)
      || typeof attempt.id !== 'string' || !attempt.id || attempts.has(attempt.id)) refuse(`native card ${card.id} has an ambiguous attempt identity`);
    attempts.add(attempt.id);
    const session = attempt.session;
    if (session != null && (typeof session !== 'object' || Array.isArray(session))) refuse(`native card ${card.id} has an unresolved native session`);
    // The full native cardSnapshot publishes session.agent, including agents
    // of old attempts. Pin every name before applying lane/project filters.
    if (session?.agent != null && (typeof session.agent !== 'string' || !session.agent || !pinned.has(session.agent))) refuse(`native card ${card.id} has an unpinned run identity`);
    if (attempt.ended_at != null && (typeof attempt.ended_at !== 'string' || !Number.isFinite(Date.parse(attempt.ended_at)))) refuse(`native card ${card.id} has an unresolved attempt terminal`);
    // cardSnapshot formats SQL run timestamps as ISO strings but preserves
    // native metadata's closed/detached timestamps as integer epoch seconds.
    for (const value of [session?.closed_at, session?.detached_at]) if (value != null
      && !(Number.isSafeInteger(value) && value >= 0)
      && !(typeof value === 'string' && Number.isFinite(Date.parse(value)))) refuse(`native card ${card.id} has an unresolved session terminal`);
    if (attempt.ended_at || session?.closed_at || session?.detached_at) continue;
    if (typeof session?.harness !== 'string' || !session.harness || session.harness.includes(':')
      || typeof session.session_id !== 'string' || !session.session_id
      || /[\u0000-\u0020]/.test(session.harness) || /[\u0000-\u001f]/.test(session.session_id)) refuse(`native card ${card.id} has an unresolved exact run session`);
    runs.add(`${session.harness}:${session.session_id}`);
  }
  return [...runs].sort();
}

/** Only invoked on a fresh live native-owner cut plus the original actual Teams T cut. */
export function positiveDemand({ cards, candidateAgentIds, endedCut, config }) {
  if (!Array.isArray(cards) || !Array.isArray(candidateAgentIds) || !Array.isArray(endedCut)
    || new Set(candidateAgentIds).size !== candidateAgentIds.length || candidateAgentIds.some(id => typeof id !== 'string' || !id)
    || cards.some(card => !card || typeof card !== 'object' || Array.isArray(card) || typeof card.id !== 'string' || !card.id)
    || new Set(cards.map(card => card.id)).size !== cards.length) refuse('native cut has ambiguous cards or candidate identities');
  const pinned = new Map();
  for (const row of endedCut) {
    if (typeof row?.id !== 'string' || !candidateAgentIds.includes(row.id) || typeof row.ended !== 'boolean' || pinned.has(row.id)) refuse('Teams cut is not the exact fixed identity/ended predicate');
    pinned.set(row.id, row.ended);
  }
  if (pinned.size !== candidateAgentIds.length) refuse('Teams cut omits a native candidate identity');
  // Validate the complete candidate/run closure before any negative filter.
  // The native set may also contain historical assignment/event identities
  // which no current card lists; their exact T predicate is still required.
  const runsByCard = new Map(cards.map(card => [card.id, recoveryRuns(card, pinned)]));
  const closed = new Set(config.closedLanes ?? [...ENDED_LANES]), leads = new Set(config.leadProfiles ?? ['lead']);
  const roles = new Map(), runs = [], projects = new Set();
  for (const original of cards) {
    const card = { ...original, lane: original.archived ? 'archived' : original.lane ?? original.status };
    if (!arcRoomExpected(card, closed)) continue;
    const project = projectOf(card);
    if (!project) continue;
    projects.add(project);
    const declared = activeAgents(card).filter(agent => worksNow(card, agent));
    if (declared.some(agent => !pinned.has(agent.id))) refuse(`native card ${card.id} has an unpinned positive identity`);
    const working = declared.filter(agent => !pinned.get(agent.id));
    for (const agent of working) {
      const key = canonical([project, agent.id]), old = roles.get(key);
      const lead = leads.has(agent.profile) || old?.lead === true;
      roles.set(key, { project, agentId: agent.id, lead, answers: lead ? 'all' : 'mentions',
        roleKeys: [...(config.agentRoleKeys ?? ['member'])], cards: [...new Set([...(old?.cards ?? []), card.id])].sort() });
    }
    if (cardRunsNow(card)) {
      // T-ended negates an agent's role above. It does not prove this exact
      // still-linked session absent, so independent run demand stays positive.
      for (const native of runsByCard.get(card.id)) runs.push({ project, cardId: card.id, native, answers: working.some(agent => leads.has(agent.profile)) ? 'all' : 'mentions',
        roleKeys: [...(config.agentRoleKeys ?? ['member'])] });
    }
  }
  return { projects: [...projects].sort(), roles: [...roles.values()].sort((a, b) => canonical(a).localeCompare(canonical(b))),
    runs: runs.sort((a, b) => canonical(a).localeCompare(canonical(b))) };
}
