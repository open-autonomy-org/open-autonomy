// Shared scripted PM turns. Real Hermes cron/terminal/kanban; deterministic judgment.
import { resolve } from 'node:path';
const beat = resolve(import.meta.dir, '../scrum-beat.ts');
export const scrumHandlers = [
  { id: 'scrum-report', on: { userTextIncludes: 'Run the pm skill', toolResultFor: 'terminal', anyTextIncludes: 'SCRUM_BEAT_DONE' }, respond: { text: 'Scrum reconciled the sourced roadmap and fleet work. The terminal output records the landing or dispatch result. Human commitments and release gates remain explicit.' } },
  { id: 'scrum-act', on: { userTextIncludes: 'Run the pm skill', lastMessageIsToolResult: false }, respond: { toolCalls: { name: 'terminal', arguments: { command: `bun '${beat}'` } } } },
  { id: 'scrum-error', on: { userTextIncludes: 'Run the pm skill', toolResultFor: 'terminal' }, respond: { text: 'Scrum did not finish: inspect the terminal error. Preserve the planning worktree and leave the PM cursor unchanged.' } },
];
