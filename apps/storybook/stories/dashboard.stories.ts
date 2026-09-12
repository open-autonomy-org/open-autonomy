import type { Meta, StoryObj } from '@storybook/html-vite';
import { DashboardPage } from '../../../packages/backend/src/page/dashboard';
import { render } from '../../../packages/backend/src/ui';
import { CSS } from '../../../packages/backend/src/page/theme';
import { NOW, hookline, openAutonomy, pmTail } from './fixtures';

const page = (d: Parameters<typeof DashboardPage>[0]) => `<style>${CSS}</style>${render(DashboardPage(d))}`;
const base = (fx: typeof openAutonomy, over: Record<string, unknown> = {}) => ({ brand: 'open-autonomy', now: NOW, viewer: 'owner', ...fx, ...over });
const meta: Meta = { title: 'Pages/Dashboard', render: (args) => page(args as never), argTypes: { viewer: { control: 'radio', options: ['public', 'patron', 'team', 'owner'] } } };
export default meta;
type S = StoryObj;

export const AsOwner: S = { args: base(openAutonomy, { viewer: 'owner', live: [pmTail.key], tail: pmTail, sessions: [{ ...openAutonomy.sessions.find((s) => s.key === pmTail.key)!, status: 'live', ended_at: undefined, outcome: undefined, started_at: new Date(NOW - 4 * 60_000).toISOString() }, ...openAutonomy.sessions.filter((s) => s.key !== pmTail.key)] }) };
export const AsTeam: S = { args: base(openAutonomy, { viewer: 'team' }) };
export const AsAStranger: S = { args: base(hookline, { viewer: 'public' }) };
export const SelfHostedPaused: S = { args: base(hookline, { viewer: 'owner', v: { ...hookline.v, control: { desired: { state: 'paused', at: '2026-09-12T20:10:00Z', by: 'key_1', reason: 'holiday' }, observed: { state: 'paused', at: '2026-09-12T20:11:00Z', note: 'scheduled runs paused: pm' } } } }) };
