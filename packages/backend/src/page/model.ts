// What composes a project's pages in the core: who is looking and what the owner opened to whom. The core knows
// givers (the books), team and owner (the roster) and everyone else; it knows nothing an app adds around it.
export type Role = 'public' | 'giver' | 'team' | 'owner';
const RANK: Record<Role, number> = { public: 0, giver: 1, team: 2, owner: 3 };
export const sees = (viewer: Role, least: Role): boolean => RANK[viewer] >= RANK[least];

// The owner's word on who sees what. Proposed home: a `dashboard:` section in .open-autonomy/config.yaml beside the
// bounds; the platform does not read it yet, so today every deployment renders the `open` preset. Narrowing is
// composition, never secrecy: on the platform the API stays public reads; a private deployment is private by its own wall.
export interface Visibility { overview: Role; work: Role; sessions: Role; transcripts: Role; books: Role; calls: Role; agent: Role; team: Role }
export const PRESETS: Record<'open' | 'status' | 'private', Visibility> = {
  open:    { overview: 'public', work: 'public', sessions: 'public', transcripts: 'public', books: 'public', calls: 'public', agent: 'public', team: 'public' },
  status:  { overview: 'public', work: 'public', sessions: 'public', transcripts: 'giver', books: 'giver', calls: 'team', agent: 'team', team: 'public' },
  private: { overview: 'team', work: 'team', sessions: 'team', transcripts: 'team', books: 'team', calls: 'team', agent: 'team', team: 'team' },
};

// Where an app mounted around the core may add to a page. Every slot is additive and inside the core's layout: an
// app can put a button in the bar or a card in a column; it cannot remove, reorder or rewrite what the core shows.
export interface PageSlots {
  nav?: unknown;      // links in the top bar (the platform: Explore)
  cta?: unknown;      // one button in the top bar (the platform: Become a patron)
  meta?: unknown;     // facts in the hero's line (the platform: patrons, per month)
  side?: unknown;     // cards at the top of Overview's side column (the platform: the ask, the tiers)
  main?: unknown;     // cards after Overview's main column
  wall?: unknown;     // more people on the givers wall (the platform: subscribers)
  moneyIn?: unknown;  // rows in the Books' money in (the platform: subscriptions)
  give?: unknown;     // doors in the Books (the platform: give credits, a coupon)
  styles?: string;    // the app's own CSS, after the core's
}
