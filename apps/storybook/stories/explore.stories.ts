import type { Meta, StoryObj } from '@storybook/html-vite';
import { Directory } from '../../../packages/backend/src/page/directory';
import { render } from '../../../packages/backend/src/ui';
import { CSS } from '../../../packages/backend/src/page/theme';
import { directorySlots, whoNav } from '../../../apps/platform/src/page/patronage';
import { NOW, entries, working } from './fixtures';

// The platform's front: the core's directory with the platform's words, figures and patrons in its slots.
const TIERS = [{ name: 'Supporter', usd_cents: 500 }, { name: 'Sponsor', usd_cents: 2500 }, { name: 'Backer', usd_cents: 10000 }];
const patronage = { 'open-autonomy-org/hookline': { tiers: TIERS, patrons: [], patron_count: 3, monthly_usd_cents: 3500, sponsors: [], polar_products: {} } };
const explore = (list = entries) => {
  const slots = { ...directorySlots(list, patronage as never, 'open-autonomy-org/grants'), nav: whoNav(undefined, '/') };
  return `<style>${CSS}${slots.styles ?? ''}</style>${render(Directory({ brand: 'open-autonomy', viewer: 'public', now: NOW, entries: list, slots } as never))}`;
};

const meta: Meta = { title: 'Platform/Explore' };
export default meta;
type S = StoryObj;

export const Explore: S = { render: () => explore() };
export const OneWorkingNow: S = { render: () => explore(working(entries)) };
