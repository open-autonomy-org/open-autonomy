import type { Meta, StoryObj } from '@storybook/react-vite';
import { MeteredSpend } from './MeteredSpend.js';

const meta = {
  args: {
    weekStart: '2026-09-28T00:00:00.000Z',
    sources: [{ days: [{ key: '2026-09-28', usdCents: 412 }, { key: '2026-09-29', usdCents: 380 }, { key: '2026-09-30', usdCents: 515 }, { key: '2026-10-01', usdCents: 233 }], link: 'https://open-autonomy.org/volter-ai/volter-manager/books', name: 'volter-ai/volter-manager', sourceKey: 'volter-ai-volter-manager', system: 'Open Autonomy' }]
  },
  component: MeteredSpend,
  decorators: [Story => <div style={{ maxWidth: 900, padding: 16 }}><Story /></div>],
  parameters: { docs: { description: { component: 'VERCEL-USAGE-SPEND. On Usage, beside the week\'s people, agents and tasks: the money each funding system\'s own endpoint measured buying calls, day by day, as its integration published it.' } } },
  title: 'Components/Organization/Metered spend'
} satisfies Meta<typeof MeteredSpend>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Open Autonomy's metering proxy, this week. */
export const OneFundingSystem: Story = {};
