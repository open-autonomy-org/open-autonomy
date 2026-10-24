import type { Meta, StoryObj } from '@storybook/react-vite';
import { CostControl } from './CostControl.js';

const days = Array.from({ length: 14 }, (_, index) => ({ key: `2026-10-${String(index + 1).padStart(2, '0')}`, usdCents: [420, 510, 380, 0, 260, 640, 590][index % 7]! }));
const meta = {
  args: {
    now: '2026-10-14T12:00:00Z',
    sources: [{ sourceKey: 'manager', name: 'volter-ai/volter-manager', system: 'Open Autonomy', link: 'https://open-autonomy.org/volter-ai/volter-manager/dashboard/books', summary: { balanceUsdCents: 4_210, burnPerDayUsdCents: 470, runwayDays: 9 },
      limits: [{ key: 'day', window: 'day', usdCents: 500, used: { usdCents: 410, calls: 83 } }, { key: 'hour-opus', window: 'hour', model: 'claude-opus-5-5', calls: 120, used: { usdCents: 0, calls: 131 } }], days }],
    calls: [
      { usageId: 'u1', principalId: 'agent-1', roomId: 'room-1', taskId: 'task-intake', provider: 'runhuman', model: '@cf/meta/llama-4-scout', inputTokens: 1200, cachedTokens: 0, outputTokens: 400, costUsd: 0.0123, at: '2026-10-12T10:00:00Z' },
      { usageId: 'u2', principalId: 'agent-1', roomId: 'room-1', taskId: 'task-intake', provider: 'runhuman', model: 'e2b/sandbox', inputTokens: 0, cachedTokens: 0, outputTokens: 0, costUsd: 0.31, at: '2026-10-12T11:00:00Z' },
      { usageId: 'u3', principalId: 'agent-2', roomId: 'room-2', taskId: null, provider: 'runhuman', model: '@cf/meta/llama-4-scout', inputTokens: 900, cachedTokens: 0, outputTokens: 300, costUsd: 0.009, at: '2026-10-13T09:00:00Z' }
    ],
    taskTitles: { 'task-intake': 'Review intake flow' }
  },
  component: CostControl,
  parameters: { docs: { description: { component: 'VERCEL-SPEND-MANAGEMENT. Usage as cost control: the month\'s spend, burn and projected end, each limit and its use, and spend by project, resource and Task, all from what the buying endpoints measured.' } } },
  title: 'Pages/Usage/Cost control'
} satisfies Meta<typeof CostControl>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ThisMonth: Story = {};
export const NoLimits: Story = { args: { sources: [], calls: [] } };
