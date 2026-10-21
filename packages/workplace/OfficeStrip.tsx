import type { InboxTaskRecord, TaskRecord } from '@runhuman/workplace/api';
import { useContributionRead } from '@runhuman/workplace/contributions/reader';

type Asked = Pick<InboxTaskRecord, 'actionable' | 'returns' | 'status' | 'target' | 'taskId'>;
type Card = Pick<TaskRecord, 'key' | 'status'> & { blockedBy?: readonly { open: boolean; task?: string | null }[] };
/** A machine as supercode's Machines registration publishes it (`info.linked`, `info.revokedAt`). */
type Machine = { info: { linked?: unknown; revokedAt?: unknown } };

/** Asked of the viewer: an open Task in their Inbox they may answer now, put to them or to a role they hold (the Room
 * page's own test of a Task waiting on its reader). Work open to any member, or to an organization, is not. */
export const askedOfViewer = (task: Asked): boolean => task.actionable === true && (task.status === 'todo' || task.status === 'running')
  && (task.target?.kind === 'principal' || task.target?.kind === 'room-role');

/** What waits on the viewer, by kind: what is asked of them (askedOfViewer) by the answer it takes, a yes or no (a grant),
 * a choice among named options (a decision) or anything else (an ask); and the board's cards (Tasks a board's record
 * keys) held by an open Blocker on one of those asks. A card blocked on another card, or paused (a pause names no one it
 * waits on), waits on no one here. */
export function waitingKinds(inbox: readonly Asked[], tasks: readonly Card[]): { grants: number; decisions: number; asks: number; blocked: number } {
  const asked = inbox.filter(askedOfViewer), ids = new Set(asked.map(task => task.taskId));
  const grants = asked.filter(task => task.returns?.type === 'boolean').length;
  const decisions = asked.filter(task => task.returns?.type !== 'boolean' && (task.returns?.enum?.length ?? 0) > 0).length;
  const blocked = tasks.filter(task => task.key && !['done', 'cancelled'].includes(task.status)
    && (task.blockedBy ?? []).some(blocker => blocker.open && blocker.task != null && ids.has(blocker.task))).length;
  return { asks: asked.length - grants - decisions, blocked, decisions, grants };
}
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * The Office's strip (the Floor's `floors:strip` slot; the owner's layout, "Waiting on you: 2 grants · 1 decision"): what
 * waits on the viewer by kind (waitingKinds), the asks opening their Inbox and the blocked cards the Tasks page, then how
 * many of the organization's machines are up (supercode's Machines registration's `linked`, a revoked machine not
 * counted), opening Machines. Read-only: it counts what the Workplace's reads already hold and keeps no copy.
 */
export function OfficeStrip({ context }: { context: Record<string, unknown> }): React.ReactElement {
  const inbox = useContributionRead<{ tasks: InboxTaskRecord[] }>('/api/v3/human-self/inbox', 30_000);
  const directory = useContributionRead<{ tasks: TaskRecord[] }>('/api/v3/tasks', 30_000);
  const machinesRead = useContributionRead<{ machines: Machine[] }>('/api/v3/machines', 30_000);
  const onOpen = typeof context.onOpen === 'function' ? context.onOpen as (href: string) => void : undefined;
  const link = (href: string, content: React.ReactNode) => <a href={href} onClick={event => {
    if (!onOpen || event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault(); onOpen(href);
  }}>{content}</a>;
  const kinds = inbox.data && directory.data ? waitingKinds(inbox.data.tasks, directory.data.tasks) : undefined;
  const asked = kinds ? [kinds.grants && plural(kinds.grants, 'grant', 'grants'), kinds.decisions && plural(kinds.decisions, 'decision', 'decisions'), kinds.asks && plural(kinds.asks, 'ask', 'asks')].filter(Boolean) : [];
  const machines = (machinesRead.data?.machines ?? []).filter(machine => typeof machine.info.revokedAt !== 'string');
  const up = machines.filter(machine => machine.info.linked === true).length;
  return <>
    {kinds && (asked.length || kinds.blocked ? <span>Waiting on you: {asked.length > 0 && link('/console/inbox', asked.join(' · '))}{asked.length > 0 && kinds.blocked > 0 && ' · '}{kinds.blocked > 0 && link('/console/tasks', plural(kinds.blocked, 'blocked card', 'blocked cards'))}</span>
      : <span>Nothing waits on you</span>)}
    {!machinesRead.denied && machines.length > 0 && link('/console/machines', <>Machines up <strong>{up} of {machines.length}</strong></>)}
  </>;
}
