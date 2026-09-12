import type { Meta, StoryObj } from '@storybook/html-vite';
import { Overview, defaults, type ProjectPageData } from '../../../packages/backend/src/page/project';
import { PRESETS } from '../../../packages/backend/src/page/model';
import { render } from '../../../packages/backend/src/ui';
import { CSS } from '../../../packages/backend/src/page/theme';
import { NOW, hookline, openAutonomy, pmTail } from './fixtures';

export const PLATFORM = { brand: 'open-autonomy', money: true, polar: false, sponsor: 'open-autonomy-org/open-autonomy', explore: true };
export const SELF_HOST = { brand: 'acme autonomy', money: false, polar: false, sponsor: '', explore: false };
export const page = (d: Partial<ProjectPageData>, Page: (x: ProjectPageData) => unknown = Overview) => `<style>${CSS}</style>${render(Page({ deployment: PLATFORM, now: NOW, ...defaults(d), ...d } as ProjectPageData))}`;
const live = (fx: typeof openAutonomy) => ({ live: [pmTail.key], tail: pmTail, sessions: [{ ...fx.sessions.find((s) => s.key === pmTail.key)!, status: 'live', ended_at: undefined, outcome: undefined, started_at: new Date(NOW - 4 * 60_000).toISOString() }, ...fx.sessions.filter((s) => s.key !== pmTail.key)] });

const meta: Meta = {
  title: 'Project/Overview',
  render: (args) => page(args as never),
  argTypes: { viewer: { control: 'radio', options: ['public', 'patron', 'team', 'owner'] }, visibility: { control: 'select', options: Object.keys(PRESETS), mapping: PRESETS } },
};
export default meta;
type S = StoryObj;

export const PlatformToday: S = { args: { ...openAutonomy, viewer: 'public', visibility: PRESETS.open } };
export const PlatformWorkingNow: S = { args: { ...openAutonomy, ...live(openAutonomy), viewer: 'public', visibility: PRESETS.open } };
export const PlatformWithPatrons: S = { args: { ...hookline, deployment: { ...PLATFORM, polar: true }, viewer: 'patron', visibility: PRESETS.open } };
export const PlatformPaused: S = { args: { ...hookline, deployment: { ...PLATFORM, polar: true }, viewer: 'public', visibility: PRESETS.open, v: { ...hookline.v, control: { desired: { state: 'paused', at: '2026-09-12T20:10:00Z', by: 'key_1', reason: 'holiday' }, observed: { state: 'paused', at: '2026-09-12T20:11:00Z', note: 'scheduled runs paused: pm' } } } } };
export const PlatformSpendingStopped: S = { args: { ...hookline, deployment: { ...PLATFORM, polar: true }, viewer: 'public', visibility: PRESETS.open, v: { ...hookline.v, exhausted: true, balance_usd_cents: 0, runway_days: 0, status: 'low' } } };
export const SelfHostedAsOwner: S = { args: { ...openAutonomy, ...live(openAutonomy), deployment: SELF_HOST, viewer: 'owner', visibility: PRESETS.status } };
export const SelfHostedStatusPageAsStranger: S = { args: { ...openAutonomy, deployment: SELF_HOST, viewer: 'public', visibility: PRESETS.status } };
export const PrivateDeploymentAsStranger: S = { args: { ...openAutonomy, deployment: SELF_HOST, viewer: 'public', visibility: PRESETS.private } };
export const NotYetFunded: S = { args: { ...hookline, viewer: 'public', visibility: PRESETS.open, v: { ...hookline.v, funded: false, granted_in_usd_cents: 0, consumed_usd_cents: 0, balance_usd_cents: 0, runway_days: null, status: 'unfunded' }, sessions: [], roadmap: { schema: hookline.roadmap.schema, items: [] }, patronage: { ...hookline.patronage, patrons: [], patron_count: 0, monthly_usd_cents: 0 } } };
