import type { Meta, StoryObj } from '@storybook/html-vite';
import { Overview, defaults, type ProjectPageData } from '../../../packages/backend/src/page/project';
import { PRESETS } from '../../../packages/backend/src/page/model';
import { render } from '../../../packages/backend/src/ui';
import { CSS } from '../../../packages/backend/src/page/theme';
import { NOW, hookline, openAutonomy, pmTail } from './fixtures';

// The core's project page: exactly what a self-hosted deployment serves. No app, no slots.
export const page = (d: Partial<ProjectPageData>, Page: (x: ProjectPageData) => unknown = Overview) => `<style>${CSS}${d.slots?.styles ?? ''}</style>${render(Page({ brand: 'acme autonomy', now: NOW, ...defaults(d), ...d } as ProjectPageData))}`;
export const live = (fx: typeof openAutonomy) => ({ live: [pmTail.key], tail: pmTail, sessions: [{ ...fx.sessions.find((s) => s.key === pmTail.key)!, status: 'live', ended_at: undefined, outcome: undefined, started_at: new Date(NOW - 4 * 60_000).toISOString() }, ...fx.sessions.filter((s) => s.key !== pmTail.key)] });

const meta: Meta = {
  title: 'Core/Project',
  excludeStories: ['page', 'live'],
  render: (args) => page(args as never),
  argTypes: { viewer: { control: 'radio', options: ['public', 'giver', 'team', 'owner'] }, visibility: { control: 'select', options: Object.keys(PRESETS), mapping: PRESETS } },
};
export default meta;
type S = StoryObj;

export const AsOwnerWorkingNow: S = { args: { ...openAutonomy, ...live(openAutonomy), viewer: 'owner', visibility: PRESETS.status } };
export const AsAStranger: S = { args: { ...openAutonomy, viewer: 'public', visibility: PRESETS.open } };
export const StatusPageAsStranger: S = { args: { ...openAutonomy, viewer: 'public', visibility: PRESETS.status } };
export const PrivateAsStranger: S = { args: { ...openAutonomy, viewer: 'public', visibility: PRESETS.private } };
export const Paused: S = { args: { ...hookline, viewer: 'team', visibility: PRESETS.open, v: { ...hookline.v, control: { desired: { state: 'paused', at: '2026-09-12T20:10:00Z', by: 'key_1', reason: 'holiday' }, observed: { state: 'paused', at: '2026-09-12T20:11:00Z', note: 'scheduled runs paused: pm' } } } } };
export const NotYetFunded: S = { args: { ...hookline, viewer: 'public', visibility: PRESETS.open, v: { ...hookline.v, funded: false, granted_in_usd_cents: 0, consumed_usd_cents: 0, balance_usd_cents: 0, runway_days: null, status: 'unfunded' }, sessions: [], roadmap: { schema: hookline.roadmap.schema, items: [] } } };
