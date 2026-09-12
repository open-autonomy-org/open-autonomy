import type { Meta, StoryObj } from '@storybook/html-vite';
import { Directory } from '../../../packages/backend/src/page/directory';
import { Account } from '../../../packages/backend/src/page/account';
import { render } from '../../../packages/backend/src/ui';
import { CSS } from '../../../packages/backend/src/page/theme';
import { NOW, entries, funder, working } from './fixtures';

// The core's front and a name's page: exactly what a self-hosted deployment serves. No app, no slots.
const styled = (s: { styles?: string } | undefined, body: unknown) => `<style>${CSS}${s?.styles ?? ''}</style>${render(body)}`;
export const directory = (d: Record<string, unknown>) => styled(d.slots as never, Directory({ brand: 'acme autonomy', viewer: 'public', now: NOW, entries, ...d } as never));
export const account = (d: Record<string, unknown>) => styled(d.slots as never, Account({ brand: 'acme autonomy', viewer: 'public', now: NOW, entries, ...d } as never));

const meta: Meta = { title: 'Core/Front', excludeStories: ['directory', 'account'] };
export default meta;
type S = StoryObj;

export const Directory_: S = { name: 'Directory', render: () => directory({}) };
export const DirectoryOneWorkingNow: S = { render: () => directory({ entries: working(entries) }) };
export const DirectoryOneProject: S = { render: () => directory({ entries: entries.filter((e) => e.account.endsWith('/open-autonomy')) }) };
export const DirectoryEmpty: S = { render: () => directory({ entries: [] }) };
export const AnOrg: S = { render: () => account({ name: 'open-autonomy-org' }) };
export const AnOrgWorkingNow: S = { render: () => account({ name: 'open-autonomy-org', entries: working(entries) }) };
export const APersonWhoGives: S = { render: () => account({ name: 'octocat', funder }) };
export const APersonWithNothing: S = { render: () => account({ name: 'nobody', funder: { ...funder, found: false } }) };
