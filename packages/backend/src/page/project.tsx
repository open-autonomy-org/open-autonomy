// The project: one address, GitHub's frame, Kickstarter's campaign, Patreon's rhythm. Overview is the composed page;
// each tab is one of its panels at full size. Tabs a viewer may not see are not there.
import type { ProjectView, SessionSummary } from '../ledger.js';
import type { Roadmap } from '@open-autonomy/sdk/roadmap';
import { esc } from '../ui.js';
import { About, Foot, Funding, Hero, NextUp, Shipped, Tabs, Tiers, TopBar, Wall, Workshop, standingOf, ownerOf, withGivers, type Patronage, type Schedule, type SessionTail, type Tab } from './parts.js';
import { CSS, FONTS } from './theme.js';
import { PRESETS, sees, type Deployment, type Role, type Visibility } from './model.js';

export interface ProjectPageData {
  deployment: Deployment;
  viewer: Role;
  visibility: Visibility;
  v: ProjectView;
  sessions: SessionSummary[];
  live: string[];
  roadmap: Roadmap;
  patronage: Patronage;
  tail?: SessionTail;
  daily: number[];
  now: number;
}
export const parseSchedule = (json: string | undefined): Schedule[] => { try { const j = JSON.parse(json ?? '{}') as { jobs?: Schedule[] }; return Array.isArray(j.jobs) ? j.jobs : []; } catch { return []; } };
export const defaults = (d: Partial<ProjectPageData>): Pick<ProjectPageData, 'viewer' | 'visibility'> => ({ viewer: d.viewer ?? 'public', visibility: d.visibility ?? PRESETS.open });

// The frame every tab shares: the bar, the hero, the tabs. Counts on the tabs are GitHub's habit and our proof of life.
export function Shell({ d, current, children }: { d: ProjectPageData; current: Tab; children?: unknown }) {
  const standing = standingOf(d.v, d.live);
  const patronage = d.deployment.money ? withGivers(d.patronage, d.v, d.deployment.brand) : { tiers: [], patrons: [], patron_count: 0, monthly_usd_cents: 0 };
  const runway = d.v.runway_days !== null && Number.isFinite(d.v.runway_days) ? Math.round(d.v.runway_days) : null;
  const show = (t: Tab): boolean => t === 'overview' ? sees(d.viewer, d.visibility.overview) : sees(d.viewer, d.visibility[t]);
  const open = d.roadmap.items.filter((i) => i.status !== 'done').length;
  return (
    <>
      <TopBar brand={d.deployment.brand} cta={d.deployment.money} explore={d.deployment.explore} />
      <div class="page">
        <Hero v={d.v} standing={standing} patronage={patronage} runwayDays={runway} quiet={!d.deployment.money} />
        <Tabs account={d.v.account} current={current} show={show} counts={{ work: open, sessions: d.live.length ? `${d.live.length} live` : d.sessions.length, books: undefined }} />
        {children}
        <Foot brand={d.deployment.brand} />
      </div>
    </>
  );
}

export function Overview(d: ProjectPageData) {
  const standing = standingOf(d.v, d.live);
  const patronage = withGivers(d.patronage, d.v, d.deployment.brand);
  const runway = d.v.runway_days !== null && Number.isFinite(d.v.runway_days) ? Math.round(d.v.runway_days) : null;
  const a = d.v.account;
  return (
    <Shell d={d} current="overview">
      <div class="cols" style={d.deployment.money ? '' : 'grid-template-columns:minmax(0,1fr) 340px'}>
        <div class="main">
          <About md={d.v.profile.about_md} account={a} />
          {sees(d.viewer, d.visibility.sessions) ? <Workshop sessions={d.sessions} live={d.live} tail={sees(d.viewer, d.visibility.transcripts) ? d.tail : undefined} schedule={parseSchedule(d.v.profile.schedule_json)} standing={standing} control={d.v.control} daily={d.daily} account={a} now={d.now} /> : null}
          {sees(d.viewer, d.visibility.work) ? <><NextUp roadmap={d.roadmap} account={a} /><Shipped roadmap={d.roadmap} account={a} now={d.now} /></> : null}
          {d.deployment.money ? <Wall patrons={patronage.patrons} /> : null}
        </div>
        <div class="side">
          {d.deployment.money
            ? <><Funding v={d.v} patronage={patronage} standing={standing} runwayDays={runway} goalDays={d.v.goal_days} /><Tiers tiers={d.patronage.tiers} owner={ownerOf(a)} account={a} sponsor={d.deployment.sponsor} polar={d.deployment.polar} burn={d.v.burn_per_day_usd_cents * 30} /></>
            : sees(d.viewer, d.visibility.books) ? <Funding v={d.v} patronage={patronage} standing={standing} runwayDays={runway} goalDays={d.v.goal_days} ask={false} /> : null}
        </div>
      </div>
    </Shell>
  );
}
export function document(title: string, brand: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="preconnect" href="https://fonts.googleapis.com"><link href="${FONTS}" rel="stylesheet"><title>${esc(title)} · ${esc(brand)}</title><style>${CSS}</style></head><body>${body}</body></html>`;
}
