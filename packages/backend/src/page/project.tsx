// The project page: one screen for a stranger, every detail a link away. Cover, name, one word on the agent, a funding
// line; the story, what is happening right now, what is next, what shipped, who pays; and the one card that asks.
import type { ProjectView, SessionSummary } from '../ledger.js';
import type { Roadmap } from '@open-autonomy/sdk/roadmap';
import { About, Foot, Funding, Hero, NextUp, Now, Shipped, Tiers, TopBar, Wall, standingOf, ownerOf, type Patronage, type Schedule } from './parts.js';
import { CSS } from './theme.js';

export interface ProjectPageData {
  brand: string;
  v: ProjectView;
  sessions: SessionSummary[];
  live: string[];
  roadmap: Roadmap;
  patronage: Patronage;
  sponsor: string;   // the account whose GitHub Sponsors listing is the org's own
  polar: boolean;    // Polar checkout configured on this deployment
  now: number;
}
export const parseSchedule = (json: string | undefined): Schedule[] => { try { const j = JSON.parse(json ?? '{}') as { jobs?: Schedule[] }; return Array.isArray(j.jobs) ? j.jobs : []; } catch { return []; } };

export function ProjectPage(d: ProjectPageData) {
  const enc = encodeURIComponent(d.v.account);
  const standing = standingOf(d.v, d.live);
  const runway = d.v.runway_days !== null && Number.isFinite(d.v.runway_days) ? Math.round(d.v.runway_days) : null;
  return (
    <>
      <TopBar brand={d.brand} />
      <div class="page">
        <Hero v={d.v} standing={standing} patronage={d.patronage} runwayDays={runway} />
        <div class="cols">
          <div class="main">
            <About md={d.v.profile.about_md} enc={enc} />
            <Now sessions={d.sessions} live={d.live} schedule={parseSchedule(d.v.profile.schedule_json)} standing={standing} control={d.v.control} enc={enc} now={d.now} />
            <NextUp roadmap={d.roadmap} enc={enc} />
            <Shipped roadmap={d.roadmap} enc={enc} now={d.now} />
            <Wall patrons={d.patronage.patrons} />
          </div>
          <div class="side">
            <Funding v={d.v} patronage={d.patronage} standing={standing} runwayDays={runway} goalDays={d.v.goal_days} />
            <Tiers tiers={d.patronage.tiers} owner={ownerOf(d.v.account)} account={d.v.account} sponsor={d.sponsor} polar={d.polar} burn={d.v.burn_per_day_usd_cents * 30} />
          </div>
        </div>
        <Foot enc={enc} />
      </div>
    </>
  );
}
export function projectDocument(d: ProjectPageData, render: (node: unknown) => string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"><title>${d.v.account.split('/')[1] ?? d.v.account} · ${d.brand}</title><style>${CSS}</style></head><body>${render(<ProjectPage {...d} />)}</body></html>`;
}
