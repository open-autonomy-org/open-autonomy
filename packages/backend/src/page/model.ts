import { parseTeamConfig } from '@open-autonomy/sdk/team';
import type { ProjectView } from '../ledger.js';
import { parseDashboardConfig } from '../config.js';

// What composes a project's pages in the core: who is looking and what the owner opened to whom. The core knows
// givers (the books), team and owner (the roster) and everyone else; it knows nothing an app adds around it.
export type Role = 'public' | 'giver' | 'team' | 'owner';
const RANK: Record<Role, number> = { public: 0, giver: 1, team: 2, owner: 3 };
export const sees = (viewer: Role, least: Role): boolean => RANK[viewer] >= RANK[least];

// Who is looking, as an app's identity door names them: a GitHub login, and its account id when the door learned
// it. The core has no door of its own: a bare deployment shows its audience (audience.ts) what the owner opened to it,
// and nothing to anyone else. What a login is to a project comes from the project's own records: the roster in its
// committed config (owner, then any member as team), the books (a giver: whose money it is, never who passed it on).
// A roster member is matched by GitHub account id alone, the one thing a rename keeps; a door that learned no id names
// no owner. Never from a key.
export interface Viewer { login: string; id?: string; volter?: { issuer: string; subject: string } }
/** A viewer's role on a project. A project linked to a workspace takes its team from there (`roster`, company RFC 0024
 *  D10): a viewer signed in with the identity a seat proved is owner or team as that seat says, and config.yaml's
 *  `team:` no longer governs. Unlinked, the roster in config.yaml does. Givers come from the books either way. */
export function roleOf(who: Viewer | undefined, v: Pick<ProjectView, 'profile' | 'envelopes' | 'feed'>, roster: Array<{ identities: { issuer: string; subject: string }[]; scopes: string[] }> | null = null): Role {
  if (!who) return 'public';
  const login = who.login.toLowerCase();
  let mine: { scopes: string[] }[];
  if (roster) {
    mine = who.volter ? roster.filter((m) => m.identities.some((i) => i.issuer === who.volter!.issuer && i.subject === who.volter!.subject)) : [];
  } else {
    let members: ReturnType<typeof parseTeamConfig>['members'] = [];
    try { members = parseTeamConfig(v.profile.config_yaml ?? '').members; } catch { members = []; }
    mine = who.id ? members.filter((m) => m.github?.id === who.id) : [];
  }
  if (mine.some((m) => m.scopes.includes('owner'))) return 'owner';
  if (mine.length) return 'team';
  const gave = [...(v.envelopes ?? []).map((e) => e.from), ...(v.feed ?? []).map((f) => f.from)].some((x) => x?.toLowerCase() === `@${login}`);
  return gave ? 'giver' : 'public';
}

// The owner's word on who sees what: the `dashboard:` section of .open-autonomy/config.yaml beside the bounds, read
// with the rest of the repository's config. `public` is the deployment's audience. Absent, the audience sees the
// roadmap and the books and the team sees the rest: the sessions, the transcripts, the agent. The books and every
// metered call are the audience's under every word (config.ts); a word the parser refuses shows the project to its
// team alone. The word holds on the pages and on the SDK's read doors alike: a closed panel answers 404 to a request
// without the project's own key or an admitted signed-in viewer.
// `statements` are the owner's published word (ADR 0012).
export interface Visibility { overview: Role; work: Role; sessions: Role; transcripts: Role; books: Role; calls: Role; agent: Role; team: Role; statements: Role }
export const PRESETS: Record<'roadmap' | 'open', Visibility> = {
  roadmap: { overview: 'public', work: 'public', sessions: 'team', transcripts: 'team', books: 'public', calls: 'public', agent: 'team', team: 'public', statements: 'public' },
  open:    { overview: 'public', work: 'public', sessions: 'public', transcripts: 'public', books: 'public', calls: 'public', agent: 'public', team: 'public', statements: 'public' },
};
const TEAM_ONLY: Visibility = { overview: 'team', work: 'team', sessions: 'team', transcripts: 'team', books: 'team', calls: 'team', agent: 'team', team: 'team', statements: 'team' };
export const DEFAULT_PRESET = 'roadmap' as const;
export const visibilityOf = (yaml: string | undefined): Visibility => { const c = parseDashboardConfig(yaml ?? ''); return c.invalid ? TEAM_ONLY : { ...PRESETS[c.visibility ?? DEFAULT_PRESET], ...c.panels }; };
// Why the owner's word was refused, for the team's own view of the settings; undefined when it holds.
export const wordRefused = (yaml: string | undefined): string | undefined => parseDashboardConfig(yaml ?? '').invalid;
// Whether the deployment's audience may see a panel of a project, from the config it synced.
export const openTo = (yaml: string | undefined, panel: keyof Visibility): boolean => sees('public', visibilityOf(yaml)[panel]);
// A viewer the project knows no more of than `public` is shown the audience's view only from inside the audience.
export const within = (viewer: Role, audience: boolean): boolean => audience || viewer !== 'public';

// The deployment's front: the grid of its projects. The core's words are "Projects" and how many; the platform's
// are its pitch, its patrons in the figures, and each project's patrons on its card.
export interface DirectorySlots {
  nav?: unknown;                     // links in the top bar (the platform: who is signed in)
  front?: unknown;                   // the words above the figures (the platform: "Fund a project that builds itself.")
  stripe?: unknown;                  // more figures after the core's (the platform: patrons, granted by funders)
  card?: Record<string, unknown>;    // a project's facts line, by account (the platform: patrons, per month)
  after?: unknown;                   // sections below the projects (the platform: how it works, starting a project, questions)
  description?: string;              // what a shared link to the front says
  styles?: string;
}
// A name's page, GitHub's user or org page: what it owns here and what it gave. The core shows projects and the
// giving books; the platform adds how to buy credits or sponsor.
export interface AccountSlots { nav?: unknown; meta?: unknown; side?: unknown; main?: unknown; card?: Record<string, unknown>; styles?: string }
