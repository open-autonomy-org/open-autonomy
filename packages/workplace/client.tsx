import { UsageFunding } from './UsageFunding.js';
import type { ClientContribution } from '@runhuman/workplace/contributions/types';
import { BooksPage } from './BooksPage.js';
import { OverviewWidget } from './OverviewWidgets.js';
import { OfficeStrip } from './OfficeStrip.js';
export const contribution: ClientContribution = { id: '@open-autonomy/workplace', panels: { usage: UsageFunding, 'floors:strip': OfficeStrip }, pages: [{ path: '/console/books', label: 'Books', icon: 'landmark', handler: 'readBooks', Component: BooksPage }], widgets: { runway: OverviewWidget, books: OverviewWidget, statement: OverviewWidget } };
