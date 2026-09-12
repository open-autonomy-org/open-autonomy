import type { Meta, StoryObj } from '@storybook/html-vite';
import { Funding, NextUp, Now, Pill, Shipped, Tiers, Wall, type Standing } from '../../../packages/backend/src/page/parts';
import { render } from '../../../packages/backend/src/ui';
import { CSS } from '../../../packages/backend/src/page/theme';
import { NOW, hookline, openAutonomy } from './fixtures';

const wrap = (node: unknown, width = 640) => `<style>${CSS}</style><div style="padding:24px;max-width:${width}px">${render(node)}</div>`;
const meta: Meta = { title: 'Parts' };
export default meta;
type S = StoryObj;

export const Pills: S = { render: () => wrap((['live', 'running', 'requested', 'paused', 'exhausted', 'unfunded'] as Standing[]).map((s) => `<span style="margin-right:10px">${render(Pill({ standing: s }))}</span>`).join('')) };
export const NowLive: S = { render: () => wrap(Now({ sessions: hookline.sessions, live: [hookline.sessions[0].key], schedule: [{ name: 'pm', schedule: 'every 60 min' }], standing: 'live', enc: 'x', now: NOW })) };
export const NowIdle: S = { render: () => wrap(Now({ sessions: openAutonomy.sessions, live: [], schedule: [{ name: 'pm', schedule: 'every 60 min' }], standing: 'running', enc: 'x', now: NOW })) };
export const NowFirstRun: S = { render: () => wrap(Now({ sessions: [], live: [], schedule: [{ name: 'pm', schedule: 'every 60 min' }], standing: 'running', enc: 'x', now: NOW })) };
export const NextUpFive: S = { render: () => wrap(NextUp({ roadmap: openAutonomy.roadmap, enc: 'x' })) };
export const NextUpEmpty: S = { render: () => wrap(NextUp({ roadmap: { schema: 'open-autonomy.timeline.v1', items: [] }, enc: 'x' })) };
export const ShippedFive: S = { render: () => wrap(Shipped({ roadmap: openAutonomy.roadmap, enc: 'x', now: NOW })) };
export const WallThree: S = { render: () => wrap(Wall({ patrons: hookline.patronage.patrons })) };
export const WallEmpty: S = { render: () => wrap(Wall({ patrons: [] })) };
export const FundingFunded: S = { render: () => wrap(Funding({ v: hookline.v, patronage: hookline.patronage, standing: 'running', runwayDays: 33, goalDays: 90 }), 380) };
export const FundingLow: S = { render: () => wrap(Funding({ v: hookline.v, patronage: hookline.patronage, standing: 'running', runwayDays: 9, goalDays: 90 }), 380) };
export const FundingExhausted: S = { render: () => wrap(Funding({ v: { ...hookline.v, balance_usd_cents: 0 }, patronage: hookline.patronage, standing: 'exhausted', runwayDays: 0, goalDays: 90 }), 380) };
export const TiersGitHub: S = { render: () => wrap(Tiers({ tiers: hookline.patronage.tiers, owner: 'open-autonomy-org', account: 'open-autonomy-org/hookline', sponsor: 'open-autonomy-org/open-autonomy', polar: false, burn: 450 }), 380) };
export const TiersPolar: S = { render: () => wrap(Tiers({ tiers: hookline.patronage.tiers, owner: 'open-autonomy-org', account: 'open-autonomy-org/hookline', sponsor: 'open-autonomy-org/open-autonomy', polar: true, burn: 450 }), 380) };
