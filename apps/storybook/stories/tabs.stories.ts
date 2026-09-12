import type { Meta, StoryObj } from '@storybook/html-vite';
import { Agent, Books, Item, Session, Sessions, Work } from '../../../packages/backend/src/page/tabs';
import { PRESETS } from '../../../packages/backend/src/page/model';
import { render } from '../../../packages/backend/src/ui';
import { CSS } from '../../../packages/backend/src/page/theme';
import { NOW, hookline, openAutonomy, pmTail } from './fixtures';
import { PLATFORM, SELF_HOST, page } from './project.stories';
import hlCalls from '../fixtures/hookline-calls.json';
import hlItem from '../fixtures/hookline-item.json';
import oaPm from '../fixtures/open-autonomy-pm-session.json';

const meta: Meta = { title: 'Project/Tabs' };
export default meta;
type S = StoryObj;
const d = (fx: typeof openAutonomy, over: Record<string, unknown> = {}) => ({ deployment: PLATFORM, now: NOW, viewer: 'public', visibility: PRESETS.open, ...fx, ...over }) as never;
const doc = (html: string) => `<style>${CSS}</style>${html}`;

export const WorkBoard: S = { render: () => page(d(openAutonomy), Work) };
export const WorkItem: S = { render: () => doc(render(Item({ d: d(hookline), view: hlItem as never }))) };
export const SessionsStream: S = { render: () => page(d(openAutonomy, { live: [pmTail.key], tail: pmTail, sessions: [{ ...openAutonomy.sessions.find((s) => s.key === pmTail.key)!, status: 'live', ended_at: undefined, outcome: undefined, started_at: new Date(NOW - 4 * 60_000).toISOString() }, ...openAutonomy.sessions.filter((s) => s.key !== pmTail.key)] }), Sessions) };
export const OneSession: S = { render: () => doc(render(Session({ d: d(openAutonomy), s: { ...(oaPm as any).session, turns: (oaPm as any).session.turns.slice(-40) } }))) };
export const BooksOnThePlatform: S = { render: () => doc(render(Books({ d: d(hookline, { deployment: { ...PLATFORM, polar: true }, viewer: 'patron' }), calls: (hlCalls as any).calls ?? [] }))) };
export const BooksSelfHosted: S = { render: () => doc(render(Books({ d: d(openAutonomy, { deployment: SELF_HOST, viewer: 'owner', visibility: PRESETS.status }), calls: [] }))) };
export const AgentAsOwner: S = { render: () => page(d(openAutonomy, { viewer: 'owner', v: { ...openAutonomy.v, profile: { ...openAutonomy.v.profile, soul_md: 'You are this project\'s Hermes coordinator and fleet: you keep a self-building repository moving in the open, on a budget its patrons fund through Open Autonomy. The owner sets direction and constraints.', setup_md: 'The PM runs every hour: it reads the repository, the community and the board, plans sourced outcomes, and queues fleet work. The community desk runs every quarter hour and answers people.', agent_skills: 'pm,community,develop,strategy' }, control: { desired: { state: 'running', at: '2026-09-12T20:39:43Z', by: 'key_1' }, observed: { state: 'running', at: '2026-09-12T20:39:47Z' } } } }), Agent) };
export const AgentAsTeam: S = { render: () => page(d(openAutonomy, { viewer: 'team' }), Agent) };
