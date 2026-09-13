import type { Meta, StoryObj } from '@storybook/html-vite';
import { Budget, NextUp, Pill, Shipped, Workshop, type Standing } from '../../../packages/backend/src/page/parts';
import { render } from '../../../packages/backend/src/ui';
import { CSS } from '../../../packages/backend/src/page/theme';
import { NOW, hookline, openAutonomy, pmTail } from './fixtures';

const wrap = (node: unknown, width = 640) => `<style>${CSS}</style><div style="padding:24px;max-width:${width}px">${render(node)}</div>`;
const meta: Meta = { title: 'Core/Parts' };
export default meta;
type S = StoryObj;

export const Pills: S = { render: () => wrap((['live', 'running', 'requested', 'paused', 'exhausted', 'unfunded'] as Standing[]).map((s) => `<span style="margin-right:10px">${render(Pill({ standing: s }))}</span>`).join('')) };
export const WorkshopLive: S = { render: () => wrap(Workshop({ sessions: [{ ...openAutonomy.sessions.find((x) => x.key === pmTail.key)!, status: 'live', started_at: new Date(NOW - 4 * 60_000).toISOString() }, ...openAutonomy.sessions], live: [pmTail.key], tail: pmTail, schedule: [{ name: 'pm', schedule: 'every 60 min' }], standing: 'live', daily: openAutonomy.daily, account: 'acme/app', now: NOW }), 700) };
export const WorkshopIdle: S = { render: () => wrap(Workshop({ sessions: openAutonomy.sessions, live: [], schedule: [{ name: 'pm', schedule: 'every 60 min' }], standing: 'running', daily: openAutonomy.daily, account: 'acme/app', now: NOW }), 700) };
export const WorkshopPaused: S = { render: () => wrap(Workshop({ sessions: hookline.sessions, live: [], schedule: [], standing: 'paused', control: { desired: { state: 'paused', at: '2026-09-12T19:00:00Z', by: 'k', reason: 'holiday' } }, daily: hookline.daily, account: 'acme/app', now: NOW }), 700) };
export const WorkshopFirstRun: S = { render: () => wrap(Workshop({ sessions: [], live: [], schedule: [{ name: 'pm', schedule: 'every 60 min' }], standing: 'running', daily: [], account: 'acme/app', now: NOW }), 700) };
export const NextUpFive: S = { render: () => wrap(NextUp({ roadmap: openAutonomy.roadmap, account: 'acme/app' })) };
export const NextUpEmpty: S = { render: () => wrap(NextUp({ roadmap: { schema: 'open-autonomy.timeline.v1', items: [] }, account: 'acme/app' })) };
export const ShippedFive: S = { render: () => wrap(Shipped({ roadmap: openAutonomy.roadmap, account: 'acme/app', now: NOW })) };
export const BudgetFunded: S = { render: () => wrap(Budget({ v: hookline.v, standing: 'running', runwayDays: 33, goalDays: 90 }), 380) };
export const BudgetLow: S = { render: () => wrap(Budget({ v: hookline.v, standing: 'running', runwayDays: 9, goalDays: 90 }), 380) };
export const BudgetExhausted: S = { render: () => wrap(Budget({ v: { ...hookline.v, balance_usd_cents: 0 }, standing: 'exhausted', runwayDays: 0, goalDays: 90 }), 380) };
