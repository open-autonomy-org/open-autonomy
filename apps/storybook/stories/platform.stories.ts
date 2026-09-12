import type { Meta, StoryObj } from '@storybook/html-vite';
import { Overview } from '../../../packages/backend/src/page/project';
import { Books } from '../../../packages/backend/src/page/tabs';
import { PRESETS } from '../../../packages/backend/src/page/model';
import { render } from '../../../packages/backend/src/ui';
import { CSS } from '../../../packages/backend/src/page/theme';
import { projectSlots } from '../../../apps/platform/src/page/patronage';
import { NOW, hookline, openAutonomy, pmTail } from './fixtures';
import { live } from './project.stories';
import hlCalls from '../fixtures/hookline-calls.json';

// The platform: the same core pages with the platform's slots filled. Its patrons are subscribers and sponsors; a
// giver on the books is already on the wall by the core's own hand.
const TIERS = [{ name: 'Supporter', usd_cents: 500 }, { name: 'Sponsor', usd_cents: 2500 }, { name: 'Backer', usd_cents: 10000 }];
const none = { tiers: TIERS, patrons: [], patron_count: 0, monthly_usd_cents: 0, sponsors: [], polar_products: {} };
const three = { ...none, patrons: [{ kind: 'sponsor', login: 'octocat', name: 'The Octocat', avatar_url: 'https://avatars.githubusercontent.com/u/583231?v=4', amount_label: '$25/mo' }, { kind: 'project', login: 'yueranyuan', avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4', amount_label: '$5/mo' }, { kind: 'funder', login: 'alice', amount_label: '$5 grant credits' }], patron_count: 3, monthly_usd_cents: 3500 };
const slots = (fx: typeof openAutonomy, patronage: typeof none, polar: boolean) => projectSlots({ account: fx.v.account, patronage: patronage as never, polar, sponsor: 'open-autonomy-org/open-autonomy', burnPerMonth: fx.v.burn_per_day_usd_cents * 30, roadmap: fx.roadmap });
const page = (d: Record<string, unknown>, Page: (x: never) => unknown = Overview as never) => { const s = (d.slots as { styles?: string } | undefined)?.styles ?? ''; return `<style>${CSS}${s}</style>${render(Page({ brand: 'open-autonomy', now: NOW, viewer: 'public', visibility: PRESETS.open, ...d } as never))}`; };

const meta: Meta = { title: 'Platform/Project', render: (args) => page(args as never), argTypes: { viewer: { control: 'radio', options: ['public', 'giver', 'team', 'owner'] } } };
export default meta;
type S = StoryObj;

export const OurOwnToday: S = { args: { ...openAutonomy, slots: slots(openAutonomy, none, false) } };
export const OurOwnWorkingNow: S = { args: { ...openAutonomy, ...live(openAutonomy), slots: slots(openAutonomy, none, false) } };
export const HooklineWithPatrons: S = { args: { ...hookline, viewer: 'giver', slots: slots(hookline, three, true) } };
export const HooklineSpendingStopped: S = { args: { ...hookline, v: { ...hookline.v, exhausted: true, balance_usd_cents: 0, runway_days: 0, status: 'low' }, slots: slots(hookline, three, true) } };
export const BooksWithSubscribers: S = { render: () => { const d = { ...hookline, brand: 'open-autonomy', now: NOW, viewer: 'giver', visibility: PRESETS.open, slots: slots(hookline, three, true) }; return `<style>${CSS}${d.slots.styles}</style>${render(Books({ d: d as never, calls: (hlCalls as any).calls ?? [] }))}`; } };
