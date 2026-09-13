import type { Meta, StoryObj } from '@storybook/html-vite';
import { Agent, Board, Books, DASH_CSS, Overview, Session, Sessions, Team, type DashData } from '../../../packages/backend/src/dash/index';
import { PRESETS } from '../../../packages/backend/src/page/model';
import { render } from '../../../packages/backend/src/ui';
import { NOW, hookline, openAutonomy, pmTail } from './fixtures';
import hlCalls from '../fixtures/hookline-calls.json';
import oaPm from '../fixtures/open-autonomy-pm-session.json';

// The dashboard: the core's, for the team; what a self-host serves. Its own shell and scale, over the SDK's records.
const live = (fx: typeof openAutonomy) => ({ live: [pmTail.key], tail: pmTail, sessions: [{ ...fx.sessions.find((s) => s.key === pmTail.key)!, status: 'live', ended_at: undefined, outcome: undefined, started_at: new Date(NOW - 4 * 60_000).toISOString() }, ...fx.sessions.filter((s) => s.key !== pmTail.key)] });
const TEAM = [{ id: 'owner', name: 'miamiviceroy', github: { id: '2255943', login: 'yueranyuan' }, scopes: ['owner', 'direction', 'release-review'], source: 'Verified on GitHub and Discord at setup.' }];
const base = (d: Partial<DashData>): DashData => ({ brand: 'acme autonomy', viewer: 'owner', visibility: PRESETS.open, now: NOW, ...openAutonomy, team: TEAM as never, ...d } as DashData);
const page = (d: Partial<DashData>, Page: (x: DashData) => unknown = Overview) => `<style>${DASH_CSS}</style>${render(Page(base(d)))}`;

const meta: Meta = { title: 'Core/Dashboard', render: (args) => page(args as never), argTypes: { viewer: { control: 'radio', options: ['public', 'giver', 'team', 'owner'] }, visibility: { control: 'select', options: Object.keys(PRESETS), mapping: PRESETS } } };
export default meta;
type S = StoryObj;

export const OwnerWorkingNow: S = { args: { ...live(openAutonomy), viewer: 'owner' } };
export const TeamBetweenRuns: S = { args: { viewer: 'team' } };
export const PublicUnderRoadmapPreset: S = { args: { viewer: 'public', visibility: PRESETS.roadmap } };
export const GiverUnderStatusPreset: S = { args: { viewer: 'giver', visibility: PRESETS.status, ...hookline } };
export const HooklinePaused: S = { args: { ...hookline, viewer: 'owner', v: { ...hookline.v, control: { desired: { state: 'paused', at: '2026-09-12T20:10:00Z', by: 'key_1', reason: 'holiday' }, observed: { state: 'paused', at: '2026-09-12T20:11:00Z', note: 'scheduled runs paused: pm' } } } } };
export const SessionsPage: S = { render: () => page({ ...live(openAutonomy) }, Sessions) };
export const OneSession: S = { render: () => page({}, (d) => Session({ d, s: (oaPm as any).session })) };
export const BoardPage: S = { render: () => page({}, Board) };
export const BooksPage: S = { render: () => page({ ...hookline, calls: (hlCalls as any).calls ?? [] }, Books) };
export const AgentPage: S = { render: () => page({}, Agent) };
export const TeamPage: S = { render: () => page({}, Team) };
export const Phone: S = { args: { ...live(openAutonomy), viewer: 'owner' }, globals: { viewport: { value: 'mobile1', isRotated: false } } };
