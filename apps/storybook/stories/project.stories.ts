import type { Meta, StoryObj } from '@storybook/html-vite';
import { ProjectPage } from '../../../packages/backend/src/page/project';
import { render } from '../../../packages/backend/src/ui';
import { CSS } from '../../../packages/backend/src/page/theme';
import { NOW, hookline, openAutonomy } from './fixtures';

const page = (d: Parameters<typeof ProjectPage>[0]) => `<style>${CSS}</style>${render(ProjectPage(d))}`;
const base = (fx: typeof openAutonomy, over: Record<string, unknown> = {}) => ({ brand: 'open-autonomy', sponsor: 'open-autonomy-org/open-autonomy', polar: false, now: NOW, ...fx, ...over });

const meta: Meta = { title: 'Pages/Project', render: (args) => page(args as never) };
export default meta;
type S = StoryObj;

export const OpenAutonomyToday: S = { args: base(openAutonomy) };
export const HooklineWithPatrons: S = { args: base(hookline, { polar: true }) };
export const WorkingNow: S = { args: base(hookline, { live: [hookline.sessions[0]?.key], polar: true }) };
export const PausedByTheOwner: S = { args: base(hookline, { v: { ...hookline.v, control: { desired: { state: 'paused', at: '2026-09-12T20:10:00Z', by: 'key_1', reason: 'holiday' }, observed: { state: 'paused', at: '2026-09-12T20:11:00Z', note: 'scheduled runs paused: pm' } } } }) };
export const PauseRequested: S = { args: base(hookline, { live: [hookline.sessions[0]?.key], v: { ...hookline.v, control: { desired: { state: 'paused', at: '2026-09-12T21:38:00Z', by: 'key_1' }, observed: { state: 'running', at: '2026-09-12T21:39:00Z', note: 'pausing: a run is live' } } } }) };
export const SpendingStopped: S = { args: base(hookline, { v: { ...hookline.v, exhausted: true, balance_usd_cents: 0, runway_days: 0, status: 'low' } }) };
export const NotYetFunded: S = { args: base(hookline, { v: { ...hookline.v, funded: false, granted_in_usd_cents: 0, consumed_usd_cents: 0, balance_usd_cents: 0, runway_days: null, status: 'unfunded' }, sessions: [], roadmap: { schema: hookline.roadmap.schema, items: [] }, patronage: { ...hookline.patronage, patrons: [], patron_count: 0, monthly_usd_cents: 0 } }) };
