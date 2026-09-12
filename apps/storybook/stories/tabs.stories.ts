import type { Meta, StoryObj } from '@storybook/html-vite';
import { Agent, Books, Item, Session, Sessions, Work } from '../../../packages/backend/src/page/tabs';
import { PRESETS } from '../../../packages/backend/src/page/model';
import { render } from '../../../packages/backend/src/ui';
import { CSS } from '../../../packages/backend/src/page/theme';
import { NOW, hookline, openAutonomy, pmTail } from './fixtures';
import hlCalls from '../fixtures/hookline-calls.json';
import hlItem from '../fixtures/hookline-item.json';
import oaPm from '../fixtures/open-autonomy-pm-session.json';

const meta: Meta = { title: 'Core/Tabs' };
export default meta;
type S = StoryObj;
const base = (fx: typeof openAutonomy, over: Record<string, unknown> = {}) => ({ brand: 'acme autonomy', now: NOW, viewer: 'public', visibility: PRESETS.open, ...fx, ...over });
const doc = (node: unknown) => `<style>${CSS}</style>${render(node)}`;
const liveOa = { live: [pmTail.key], tail: pmTail, sessions: [{ ...openAutonomy.sessions.find((s) => s.key === pmTail.key)!, status: 'live', ended_at: undefined, outcome: undefined, started_at: new Date(NOW - 4 * 60_000).toISOString() }, ...openAutonomy.sessions.filter((s) => s.key !== pmTail.key)] };
const persona = "You are this project's Hermes coordinator and fleet: you keep a self-building repository moving in the open, on a budget its patrons fund through Open Autonomy. The owner sets direction and constraints.";
const howItRuns = 'The PM runs every hour: it reads the repository, the community and the board, plans sourced outcomes, and queues fleet work. The community desk runs every quarter hour and answers people.';

export const WorkBoard: S = { render: () => doc(Work(base(openAutonomy) as never)) };
export const WorkItem: S = { render: () => doc(Item({ d: base(hookline) as never, view: hlItem as never })) };
export const SessionsStream: S = { render: () => doc(Sessions(base(openAutonomy, liveOa) as never)) };
export const OneSession: S = { render: () => doc(Session({ d: base(openAutonomy) as never, s: { ...(oaPm as { session: Record<string, unknown> }).session, turns: ((oaPm as { session: { turns: unknown[] } }).session.turns).slice(-40) } as never })) };
export const BooksAsGiver: S = { render: () => doc(Books({ d: base(hookline, { viewer: 'giver' }) as never, calls: (hlCalls as { calls?: never[] }).calls ?? [] })) };
export const BooksAsOwner: S = { render: () => doc(Books({ d: base(openAutonomy, { viewer: 'owner', visibility: PRESETS.status }) as never, calls: [] })) };
export const AgentAsOwner: S = { render: () => doc(Agent(base(openAutonomy, { viewer: 'owner', v: { ...openAutonomy.v, profile: { ...openAutonomy.v.profile, soul_md: persona, setup_md: howItRuns, agent_skills: 'pm,community,develop,strategy' }, control: { desired: { state: 'running', at: '2026-09-12T20:39:43Z', by: 'key_1' }, observed: { state: 'running', at: '2026-09-12T20:39:47Z' } } } }) as never)) };
export const AgentAsTeam: S = { render: () => doc(Agent(base(openAutonomy, { viewer: 'team' }) as never)) };
