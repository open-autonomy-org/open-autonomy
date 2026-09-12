// What composes a project's pages: who is looking, what the owner opened to whom, and what the deployment is.
export type Role = 'public' | 'patron' | 'team' | 'owner';
const RANK: Record<Role, number> = { public: 0, patron: 1, team: 2, owner: 3 };
export const sees = (viewer: Role, least: Role): boolean => RANK[viewer] >= RANK[least];

// The owner's committed word on who sees what (`dashboard:` in .open-autonomy/config.yaml). Each tab and each deeper
// thing names the least role that sees it. Controls are always the owner's. On the platform this narrows the page,
// never the truth: the API is public reads. A private deployment makes it private with its own wall.
export interface Visibility { overview: Role; work: Role; sessions: Role; transcripts: Role; books: Role; calls: Role; agent: Role; team: Role }
export const PRESETS: Record<'open' | 'status' | 'private', Visibility> = {
  open:    { overview: 'public', work: 'public', sessions: 'public', transcripts: 'public', books: 'public', calls: 'public', agent: 'public', team: 'public' },
  status:  { overview: 'public', work: 'public', sessions: 'public', transcripts: 'patron', books: 'patron', calls: 'team', agent: 'team', team: 'public' },
  private: { overview: 'team', work: 'team', sessions: 'team', transcripts: 'team', books: 'team', calls: 'team', agent: 'team', team: 'team' },
};

// The deployment: the platform takes money (patrons, tiers, the ask); a self-hosted one may not, and then no rail,
// no wall and no ask exist anywhere, while the books still meter whatever funds it.
export interface Deployment { brand: string; money: boolean; polar: boolean; sponsor: string; explore: boolean }
