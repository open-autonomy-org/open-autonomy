import { parseTeamConfig } from '@open-autonomy/sdk/team';
import type { ProjectView } from '../ledger.js';
import { parseDashboardConfig } from '../config.js';

// What composes a project's pages in the core: who is looking and what the owner opened to whom. The core knows
// givers (the books), team and owner (the roster) and everyone else; it knows nothing an app adds around it.
export type Role = 'public' | 'giver' | 'team' | 'owner';
const RANK: Record<Role, number> = { public: 0, giver: 1, team: 2, owner: 3 };
export const sees = (viewer: Role, least: Role): boolean => RANK[viewer] >= RANK[least];

// Who is looking, as an app's identity door names them: a GitHub login, and its account id when the door learned
// it. The core has no door of its own; a self-host serves everyone the public view. What a login is to a project
// comes from the project's own records: the roster in its committed config (owner, then any member as team), the
// books (a giver: whose money it is, never who passed it on). A roster member is matched by GitHub account id alone,
// the one thing a rename keeps; a door that learned no id names no owner. Never from a key.
export interface Viewer { login: string; id?: string }
export function roleOf(who: Viewer | undefined, v: Pick<ProjectView, 'profile' | 'envelopes' | 'feed'>): Role {
  if (!who) return 'public';
  const login = who.login.toLowerCase();
  let members: ReturnType<typeof parseTeamConfig>['members'] = [];
  try { members = parseTeamConfig(v.profile.config_yaml ?? '').members; } catch { members = []; }
  const mine = who.id ? members.filter((m) => m.github?.id === who.id) : [];
  if (mine.some((m) => m.scopes.includes('owner'))) return 'owner';
  if (mine.length) return 'team';
  const gave = [...(v.envelopes ?? []).map((e) => e.from), ...(v.feed ?? []).map((f) => f.from)].some((x) => x?.toLowerCase() === `@${login}`);
  return gave ? 'giver' : 'public';
}

// The owner's word on who sees what: the `dashboard:` section of .open-autonomy/config.yaml beside the bounds, read
// with the rest of the repository's config. Absent, everything is open. Narrowing is composition, never secrecy: on
// the platform the API stays public reads; a private deployment is private by its own wall.
export interface Visibility { overview: Role; work: Role; sessions: Role; transcripts: Role; books: Role; calls: Role; agent: Role; team: Role }
export const PRESETS: Record<'open' | 'status' | 'private', Visibility> = {
  open:    { overview: 'public', work: 'public', sessions: 'public', transcripts: 'public', books: 'public', calls: 'public', agent: 'public', team: 'public' },
  status:  { overview: 'public', work: 'public', sessions: 'public', transcripts: 'giver', books: 'giver', calls: 'team', agent: 'team', team: 'public' },
  private: { overview: 'team', work: 'team', sessions: 'team', transcripts: 'team', books: 'team', calls: 'team', agent: 'team', team: 'team' },
};
export const visibilityOf = (yaml: string | undefined): Visibility => { const c = parseDashboardConfig(yaml ?? ''); return { ...PRESETS[c.visibility ?? 'open'], ...c.panels }; };

// Where an app mounted around the core may add to a page. Every slot is additive and inside the core's layout: an
// app can put a button in the bar or a card in a column; it cannot remove, reorder or rewrite what the core shows.
export interface PageSlots {
  nav?: unknown;      // links in the top bar (the platform: Explore)
  cta?: unknown;      // one button in the top bar (the platform: Become a patron)
  meta?: unknown;     // facts in the hero's line (the platform: patrons, per month)
  side?: unknown;     // cards at the top of Overview's side column (the platform: the ask, the tiers)
  main?: unknown;     // cards after Overview's main column
  wall?: unknown;     // more people on the givers wall (the platform: subscribers)
  wallTitle?: string; // what the wall is called when the app adds to it (the platform: Patrons)
  moneyIn?: unknown;  // rows in the Books' money in (the platform: subscriptions)
  give?: unknown;     // doors in the Books (the platform: give credits, a coupon)
  styles?: string;    // the app's own CSS after the core's: a constant of the app, never computed from input
}

// The deployment's front: the grid of its projects. The core's words are "Projects" and how many; the platform's
// are its pitch, its patrons in the figures, and each project's patrons on its card.
export interface DirectorySlots {
  nav?: unknown;                     // links in the top bar (the platform: who is signed in)
  front?: unknown;                   // the words above the figures (the platform: "Fund a project that builds itself.")
  stripe?: unknown;                  // more figures after the core's (the platform: patrons, granted by funders)
  card?: Record<string, unknown>;    // a project's facts line, by account (the platform: patrons, per month)
  styles?: string;
}
// A name's page, GitHub's user or org page: what it owns here and what it gave. The core shows projects and the
// giving books; the platform adds how to buy credits or sponsor.
export interface AccountSlots { nav?: unknown; meta?: unknown; side?: unknown; main?: unknown; card?: Record<string, unknown>; styles?: string }
