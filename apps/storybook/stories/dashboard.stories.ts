import type { Meta, StoryObj } from '@storybook/html-vite';
import { h, render } from 'preact';
import '@volter-ai-dev/supercode-ui/styles.css';
import { DASH_CSS, DashApp, type DashData, type DashPage } from '../../../packages/backend/src/dash/index';
import { PRESETS } from '../../../packages/backend/src/page/model';
import { NOW, hookline, openAutonomy, pmTail } from './fixtures';
import hlCalls from '../fixtures/hookline-calls.json';
import oaPm from '../fixtures/open-autonomy-pm-session.json';

// The dashboard: the core's, for the team; what a self-host serves. Supercode's UI kit over the SDK's records, in
// the kit's own tokens; the shell, the money and the roster are the page's.
const live = (fx: typeof openAutonomy) => ({ live: [pmTail.key], tail: pmTail, sessions: [{ ...fx.sessions.find((s) => s.key === pmTail.key)!, status: 'live', ended_at: undefined, outcome: undefined, started_at: new Date(NOW - 4 * 60_000).toISOString() }, ...fx.sessions.filter((s) => s.key !== pmTail.key)] });
const TEAM = [{ id: 'owner', name: 'miamiviceroy', github: { id: '2255943', login: 'yueranyuan' }, scopes: ['owner', 'direction', 'release-review'], source: 'Verified on GitHub and Discord at setup.' }];
const base = (d: Partial<DashData>): DashData => ({ brand: 'acme autonomy', viewer: 'owner', visibility: PRESETS.open, now: NOW, page: 'overview', ...openAutonomy, roster: { members: TEAM as never, sha: 'abc123', head: 'main', configured: true }, ...d } as DashData);
const mount = (d: Partial<DashData>): HTMLElement => { const el = document.createElement('div'); el.innerHTML = `<style>${DASH_CSS}</style>`; render(h(DashApp, { d: base(d) }), el); return el; };

const meta: Meta = { title: 'Core/Dashboard', render: (args) => mount(args as never), argTypes: { viewer: { control: 'radio', options: ['public', 'giver', 'team', 'owner'] }, visibility: { control: 'select', options: Object.keys(PRESETS), mapping: PRESETS }, page: { control: 'select', options: ['overview', 'sessions', 'board', 'books', 'agent', 'team'] satisfies DashPage[] } } };
export default meta;
type S = StoryObj;

export const OwnerWorkingNow: S = { args: { ...live(openAutonomy), viewer: 'owner' } };
export const TeamBetweenRuns: S = { args: { viewer: 'team' } };
export const PublicUnderRoadmapPreset: S = { args: { viewer: 'public', visibility: PRESETS.roadmap } };
export const GiverUnderStatusPreset: S = { args: { viewer: 'giver', visibility: PRESETS.status, ...hookline } };
export const HooklinePaused: S = { args: { ...hookline, viewer: 'owner', v: { ...hookline.v, control: { desired: { state: 'paused', at: '2026-09-12T20:10:00Z', by: 'key_1', reason: 'holiday' }, observed: { state: 'paused', at: '2026-09-12T20:11:00Z', note: 'scheduled runs paused: pm' } } } } };
export const SessionsPage: S = { args: { ...live(openAutonomy), page: 'sessions' } };
export const OneSession: S = { args: { page: 'sessions', session: (oaPm as any).session } };
export const BoardPage: S = { args: { page: 'board' } };
export const OneItem: S = { args: { page: 'board', item: openAutonomy.roadmap.items.find((i) => i.status !== 'done')?.id } };
export const BooksPage: S = { args: { ...hookline, page: 'books', calls: (hlCalls as any).calls ?? [] } };
export const AgentPage: S = { args: { page: 'agent' } };
export const TeamPage: S = { args: { page: 'team' } };
export const Phone: S = { args: { ...live(openAutonomy), viewer: 'owner' }, globals: { viewport: { value: 'mobile1', isRotated: false } } };
