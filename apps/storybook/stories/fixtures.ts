// Real records from the live platform, captured 2026-09-12, shaped as the page receives them.
import { tenseOf, type Roadmap } from '@open-autonomy/sdk/roadmap';
import type { ProjectView, SessionSummary } from '../../../packages/backend/src/ledger';
import type { Patronage } from '../../../packages/backend/src/page/parts';
import oaBooks from '../fixtures/open-autonomy-books.json';
import oaSessions from '../fixtures/open-autonomy-sessions.json';
import oaRoadmap from '../fixtures/open-autonomy-roadmap.json';
import hlBooks from '../fixtures/hookline-books.json';
import hlSessions from '../fixtures/hookline-sessions.json';
import hlRoadmap from '../fixtures/hookline-roadmap.json';

export const NOW = Date.parse('2026-09-12T21:40:00Z');
const ABOUT = `Open Autonomy is a way to run self-building technologies: projects whose agents keep working their board for months, in the open, funded by the people who want them to exist. It is four pieces. The **platform** holds each project's funds, meters every spend as it happens, takes money in, and shows the books, the roadmap, the sessions and the audit trail so a stranger can see the work continuing and where the money went.\n\n**Starter kits** are complete repositories that run themselves out of the box with the SDK wired in; the Hermes kit is the first.`;

function view(books: any, extra: Partial<ProjectView>): ProjectView {
  return {
    account: books.account, is_project: true, listed: true, moderation: 'listed', goal_days: 90,
    profile: { tagline: 'Tools for sustained autonomous agentic development: a checked-in agent that works the roadmap, a meter that keeps it running in the open, and public books that show where every call went.', avatar_url: 'https://avatars.githubusercontent.com/u/324310069?v=4', about_md: ABOUT, schedule_json: JSON.stringify({ jobs: [{ name: 'pm', schedule: 'every 60 min' }, { name: 'community', schedule: 'every 15 min' }] }) },
    funded: books.funded, exhausted: books.paused ?? books.exhausted ?? false,
    balance_usd_cents: books.balance_usd_cents, granted_in_usd_cents: books.granted_in_usd_cents, granted_out_usd_cents: books.granted_out_usd_cents, consumed_usd_cents: books.consumed_usd_cents,
    burn_per_day_usd_cents: books.burn_per_day_usd_cents, runway_days: books.runway_days, runway_confident: books.runway_confident,
    live_sessions: [], status: books.funded ? (books.runway_days !== null && books.runway_days < 14 ? 'low' : 'funded') : 'unfunded',
    found: true, bounds: books.bounds, usable_usd_cents: books.usable_usd_cents, envelopes: books.envelopes ?? [], feed: [],
    ...extra,
  } as ProjectView;
}
const road = (r: any): Roadmap => ({ schema: r.revision.roadmap.schema, items: r.revision.roadmap.items.map((i: any) => ({ ...i, tense: i.tense ?? tenseOf(i), acceptance: i.acceptance ?? [] })) });

export const openAutonomy = {
  v: view(oaBooks, {}), sessions: (oaSessions as any).sessions as SessionSummary[], live: [] as string[], roadmap: road(oaRoadmap),
  patronage: { tiers: [{ name: 'Supporter', usd_cents: 500 }, { name: 'Sponsor', usd_cents: 2500 }, { name: 'Backer', usd_cents: 10000 }], patrons: [], patron_count: 0, monthly_usd_cents: 0 } as Patronage,
};
export const hookline = {
  v: view(hlBooks, { profile: { tagline: 'A webhook desk that answers every hook with a receipt, built by its own agent.', avatar_url: 'https://avatars.githubusercontent.com/u/324310069?v=4', about_md: 'Hookline is a webhook desk: every hook that lands gets a receipt, a place, and an answer. Its agent builds it in the open on the Open Autonomy platform.', schedule_json: JSON.stringify({ jobs: [{ name: 'pm', schedule: 'every 60 min' }] }) } }),
  sessions: (hlSessions as any).sessions as SessionSummary[], live: [] as string[], roadmap: road(hlRoadmap),
  patronage: { tiers: [{ name: 'Supporter', usd_cents: 500 }, { name: 'Sponsor', usd_cents: 2500 }, { name: 'Backer', usd_cents: 10000 }], patrons: [{ login: 'octocat', name: 'The Octocat', avatar_url: 'https://avatars.githubusercontent.com/u/583231?v=4' }, { login: 'yueranyuan', avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4' }, { login: 'alice' }], patron_count: 3, monthly_usd_cents: 3500 } as Patronage,
};
