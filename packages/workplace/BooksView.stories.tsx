import type { Meta, StoryObj } from '@storybook/react-vite';
import { BooksView, type BooksSource } from './BooksView.js';

const now = new Date('2026-10-01T18:00:00Z');
const days = Array.from({ length: 30 }, (_, index) => ({ key: `2026-09-${String(index + 2).padStart(2, '0')}`, usdCents: [180, 220, 140, 0, 90, 310, 260][index % 7]!, calls: [40, 52, 30, 0, 21, 75, 60][index % 7]! }));
const source: BooksSource = {
  sourceKey: 'volter-ai-volter-manager', name: 'volter-ai/volter-manager', system: 'Open Autonomy', link: 'https://open-autonomy.org/volter-ai/volter-manager/books', observedAt: '2026-10-01T17:55:00Z',
  model: {
    summary: { account: 'volter-ai/volter-manager', standing: 'Running', balanceUsdCents: 4_210, inUsdCents: 25_000, outUsdCents: 0, spentUsdCents: 20_790, burnPerDayUsdCents: 470, runwayDays: 9, runwayConfident: true, goalDays: 30, freeze: null, canFreeze: true, giveUrl: 'https://open-autonomy.org/give?to=volter-ai/volter-manager' },
    flows: [
      { key: 'f1', at: '2026-09-20T12:00:00Z', direction: 'in', party: 'yueranyuan', what: 'a grant · “September runway”', usdCents: 15_000 },
      { key: 'f2', at: '2026-09-01T09:00:00Z', direction: 'in', party: 'the operator', what: 'credits', usdCents: 10_000 }
    ],
    envelopes: [{ key: 'e1', purpose: 'for model calls', from: '@yueranyuan', balanceUsdCents: 2_000 }],
    limits: [{ key: 'l1', window: 'day', usdCents: 500, used: { usdCents: 410, calls: 83, tokens: 0 } }, { key: 'l2', window: 'hour', model: 'claude-opus-5-5', calls: 120, used: { usdCents: 0, calls: 31, tokens: 0 } }],
    statements: [{ key: 's1', title: 'Runway', text: 'We fund the manager month by month; a gift extends it.', at: '2026-09-28T10:00:00Z' }],
    daily: days
  }
};

const meta = {
  args: { controls: [], now, onFreeze: async () => undefined, sources: [source] },
  component: BooksView,
  decorators: [Story => <div style={{ maxWidth: 1100, padding: 16 }}><Story /></div>],
  parameters: { docs: { description: { component: 'OPEN-AUTONOMY-BOOKS. The organization\'s books as its funding integration (Open Autonomy) last published them: the ledger, the spending freeze, daily metered spend, caps and their use, money in and out, earmarks and the owner\'s statements.' } } },
  title: 'Pages/Books'
} satisfies Meta<typeof BooksView>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Runway under a third of its goal; a cap at 82%. */
export const RunwayLow: Story = {};
/** A freeze asked, waiting for Open Autonomy. */
export const FreezeAsked: Story = { args: { controls: [{ action: 'freeze', controlId: 'control_000000000000000000000002', note: null, requestedAt: '2026-10-01T17:59:00Z', sourceKey: source.sourceKey, state: 'requested', targetKey: source.model.summary.account }] } };
/** Spending frozen. */
export const Frozen: Story = { args: { sources: [{ ...source, model: { ...source.model, summary: { ...source.model.summary, freeze: { at: '2026-10-01T17:59:30Z', by: 'Workplace · Aaron', reason: 'runaway loop in the nightly job' } } } }] } };
/** No funding system linked yet. */
export const NothingPublished: Story = { args: { sources: [] } };
