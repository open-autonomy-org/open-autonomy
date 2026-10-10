import type { Meta, StoryObj } from '@storybook/react-vite';
import { OverviewView, type OverviewData } from '@runhuman/workplace/overview/OverviewView';

const page: OverviewData['parts'] = [
  { kind: 'markdown', text: '# Volter\n\nWe build **Volter**, a workplace where people and agents run a company together. Read the [constitution](https://github.com/volter-ai/volter) or give to keep the agents running.' },
  { index: 0, kind: 'runway', options: { kind: 'runway' } },
  { index: 1, kind: 'statement', options: { kind: 'statement' } },
  { kind: 'markdown', text: '## What we are working on' },
  { index: 2, kind: 'updates', options: { kind: 'updates' } }
];
const widgets: Record<number, unknown> = {
  0: { sources: [{ link: 'https://open-autonomy.org/volter-ai/volter-manager/books', name: 'volter-ai/volter-manager', sourceKey: 'manager', system: 'Open Autonomy', model: { summary: { balanceUsdCents: 4_210, burnPerDayUsdCents: 470, goalDays: 30, runwayDays: 9, giveUrl: 'https://open-autonomy.org/give?to=volter-ai/volter-manager' } } }] },
  1: { sources: [{ link: null, name: 'volter-ai/volter-manager', sourceKey: 'manager', system: 'Open Autonomy', model: { statements: [{ key: 's1', title: 'Runway', text: 'We fund the manager month by month; a gift extends it.' }] } }] },
  2: { tasks: [{ roomId: 'room_1', status: 'done', taskId: 't_1', title: 'Alerts reach the Inbox and Slack', updatedAt: '2026-09-30T12:00:00Z' }, { roomId: 'room_1', status: 'done', taskId: 't_2', title: 'Books from Open Autonomy', updatedAt: '2026-09-29T09:00:00Z' }] }
};
const viewer: OverviewData['viewer'] = { joinPolicy: 'request', joinRequested: false, roles: ['public'], seated: false, signedIn: false };

const meta = {
  args: { loadWidget: async (index: number) => widgets[index], overview: { organization: { name: 'Volter', organizationId: 'volter' }, parts: page, viewer }, signInHref: '/login?next=/o/volter' },
  component: OverviewView,
  parameters: { docs: { description: { component: 'GITHUB-PROFILE-README with GRAFANA-DASHBOARD panels. The organization\'s Overview: its Markdown page from its repository, widgets drawn as live panels, each shown only to a viewer who holds its read action, and Join as the policy allows.' } } },
  title: 'Pages/Overview'
} satisfies Meta<typeof OverviewView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Stranger: Story = {};
export const SignedInMayAsk: Story = { args: { onJoin: async () => undefined, overview: { organization: { name: 'Volter', organizationId: 'volter' }, parts: page, viewer: { ...viewer, signedIn: true } } } };
export const Giver: Story = { args: { overview: { organization: { name: 'Volter', organizationId: 'volter' }, parts: page, viewer: { ...viewer, roles: ['public', 'giver'], signedIn: true, joinRequested: true } } } };
export const Member: Story = { args: { onOpenTask: () => undefined, overview: { organization: { name: 'Volter', organizationId: 'volter' }, parts: page, viewer: { ...viewer, roles: ['member'], seated: true, signedIn: true } } } };
