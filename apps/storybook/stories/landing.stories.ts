import type { Meta, StoryObj } from '@storybook/html-vite';
import { LANDING_CSS, Landing, type LandingData } from '../../../apps/platform/src/page/landing';
import { render } from '../../../packages/backend/src/ui';
import { NOW, hookline, openAutonomy, pmTail } from './fixtures';

// The landing page: the platform's, for outsiders. One page, no tabs; the dashboard is a link away.
const TIERS = [{ name: 'Supporter', usd_cents: 500 }, { name: 'Sponsor', usd_cents: 2500 }, { name: 'Backer', usd_cents: 10000 }];
const none = { tiers: TIERS, patrons: [], patron_count: 0, monthly_usd_cents: 0, sponsors: [], polar_products: {} };
const three = { ...none, patrons: [
  { kind: 'sponsor', login: 'octocat', name: 'The Octocat', avatar_url: 'https://avatars.githubusercontent.com/u/583231?v=4', amount_label: '$25/mo' },
  { kind: 'project', login: 'yueranyuan', avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4', amount_label: '$5/mo' },
  { kind: 'funder', login: 'alice', amount_label: '$5 grant credits' },
], patron_count: 3, monthly_usd_cents: 3500 };
const live = (fx: typeof openAutonomy) => ({ live: [pmTail.key], sessions: [{ ...fx.sessions.find((s) => s.key === pmTail.key)!, status: 'live', ended_at: undefined, outcome: undefined, started_at: new Date(NOW - 4 * 60_000).toISOString() }, ...fx.sessions.filter((s) => s.key !== pmTail.key)] });
const page = (d: Partial<LandingData>) => `<style>${LANDING_CSS}</style>${render(Landing({ brand: 'open-autonomy', now: NOW, polar: false, sponsor: 'open-autonomy-org/open-autonomy', patronage: none as never, dashboard: true, ...d } as LandingData))}`;

const meta: Meta = { title: 'Platform/Landing', render: (args) => page(args as never), argTypes: { dashboard: { control: 'boolean' }, polar: { control: 'boolean' } } };
export default meta;
type S = StoryObj;

export const OurOwnWorkingNow: S = { args: { ...openAutonomy, ...live(openAutonomy) } };
export const OurOwnBetweenRuns: S = { args: { ...openAutonomy } };
export const HooklineWithPatrons: S = { args: { ...hookline, patronage: three, polar: true } };
export const HooklinePaused: S = { args: { ...hookline, patronage: three, v: { ...hookline.v, control: { desired: { state: 'paused', at: '2026-09-12T20:10:00Z', by: 'key_1', reason: 'holiday' }, observed: { state: 'paused', at: '2026-09-12T20:11:00Z' } } } } };
export const NotYetFunded: S = { args: { ...hookline, v: { ...hookline.v, funded: false, granted_in_usd_cents: 0, consumed_usd_cents: 0, balance_usd_cents: 0, runway_days: null, status: 'unfunded' }, sessions: [], roadmap: { schema: hookline.roadmap.schema, items: [] } } };
export const NoDashboardForStrangers: S = { args: { ...hookline, patronage: three, dashboard: false } };
export const Phone: S = { args: { ...openAutonomy, ...live(openAutonomy), patronage: three }, globals: { viewport: { value: 'mobile1', isRotated: false } } };
