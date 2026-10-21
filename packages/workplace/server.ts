import type { ServerContribution } from '@runhuman/workplace/contributions/server-types';
const list = (model: Record<string, unknown>, name: string): Array<Record<string, unknown>> => Array.isArray(model[name]) ? model[name] as Array<Record<string, unknown>> : [];
export const contribution: ServerContribution = { id: '@open-autonomy/workplace', kinds: { books: {
    // Legacy giver identities remain a private accepted field during publisher upgrades; they confer no authority.
    privateFields: ["givers"], lists: { daily: 400, envelopes: 200, flows: 500, givers: 1000, limits: 100, statements: 100 }, objects: ["summary"],
    read: "books.read", actions: ["freeze", "unfreeze"],
    // What an admin reads on a Workplace install page for these actions (runhuman-2 ADR 0055 decision 1).
    noun: "books, statements and runway",
    descriptions: { "books.read": "Read published books, statements and runway", "books.publish": "Publish books, statements and runway", "books.control": "Freeze and unfreeze book accounts, and retire published books" },
    publish: "books.publish", control: "books.control",
    allows(model, targetKey, action) {
      const summary = (model.summary ?? {}) as { account?: unknown; canFreeze?: unknown; freeze?: unknown };
      if (summary.account !== targetKey || summary.canFreeze !== true) return false;
      return action === "freeze" ? summary.freeze === null || summary.freeze === undefined : action === "unfreeze" ? summary.freeze !== null && summary.freeze !== undefined : false;
    }
  } },
widgets: {runway: { action: 'books.read', kind: 'books', fields: ['summary', 'daily', 'statements'] }, books: { action: 'books.read', kind: 'books', fields: ['summary', 'daily', 'statements'] }, statement: { action: 'books.read', kind: 'books', fields: ['summary', 'daily', 'statements'] }},
defaultWidgets: ['runway', 'books', 'statement'], pages: [{ path: '/console/books', handler: 'readBooks' }],
// Office is this integration's view of the shared Rooms, using Workplace's ordinary view vocabulary.
// Retain the floor key so saved routes and organization view settings continue to resolve.
views: { floor: {
  name: 'Office', icon: 'layout-grid', source: 'rooms', scope: 'floors', visibility: 'public',
  groupings: [{ key: 'category', label: 'Category', by: 'category' }], order: 'position',
  row: { marks: ['unread', 'mentions', 'in-call'], children: ['conversations', 'call'] },
  actions: ['open'],
} } };
