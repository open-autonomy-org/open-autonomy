import { MobileOverviewWidget } from './MobileOverviewWidget.js';
import { MobileCostControl } from './MobileCostControl.js';
import type { MobileWorkspaceProps } from '@runhuman/workplace/mobile/workspace-types';
function Funding({ context }: { context: Record<string, unknown> }) { return <MobileCostControl {...context.props as MobileWorkspaceProps} />; }
import type { MobileContribution } from '@runhuman/workplace/contributions/types';
import { MobileBooks } from './MobileBooks.js';
export const contribution: MobileContribution = { id: '@open-autonomy/workplace', panels: { usage: Funding }, widgets: { runway: MobileOverviewWidget, books: MobileOverviewWidget, statement: MobileOverviewWidget }, pages: [{ path: '/console/books', label: 'Books', handler: 'readBooks', Component: MobileBooks }] };
