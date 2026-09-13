// The project: one address, GitHub's frame. Overview is the composed page; each tab is one of its panels at full
// size. Tabs a viewer may not see are not there. An app mounted around the core adds through `slots`, nothing else.
import type { ProjectView, SessionSummary } from '../ledger.js';
import type { Roadmap } from '@open-autonomy/sdk/roadmap';
import { esc } from '../ui.js';
import { About, Foot, Funding, Hero, NextUp, Shipped, Tabs, TopBar, Wall, Workshop, giversOf, standingOf, type Schedule, type SessionTail, type Tab } from './parts.js';
import { CSS, FONTS } from './theme.js';
import { LIVE } from './live.js';
import { PRESETS, sees, type PageSlots, type Role, type Visibility } from './model.js';

export interface ProjectPageData {
  brand: string;
  viewer: Role;
  visibility: Visibility;
  v: ProjectView;
  sessions: SessionSummary[];
  live: string[];
  roadmap: Roadmap;
  tail?: SessionTail;
  daily: number[];
  now: number;
  slots?: PageSlots;
}
export const parseSchedule = (json: string | undefined): Schedule[] => { try { const j = JSON.parse(json ?? '{}') as { jobs?: Schedule[] }; return Array.isArray(j.jobs) ? j.jobs : []; } catch { return []; } };
export const defaults = (d: Partial<ProjectPageData>): Pick<ProjectPageData, 'viewer' | 'visibility'> => ({ viewer: d.viewer ?? 'public', visibility: d.visibility ?? PRESETS.open });

// The frame every tab shares: the bar, the hero, the tabs with their counts.
export function Shell({ d, current, children }: { d: ProjectPageData; current: Tab; children?: unknown }) {
  const standing = standingOf(d.v, d.live);
  const runway = d.v.runway_days !== null && Number.isFinite(d.v.runway_days) ? Math.round(d.v.runway_days) : null;
  const show = (t: Tab): boolean => sees(d.viewer, d.visibility[t]);
  const open = d.roadmap.items.filter((i) => i.status !== 'done').length;
  return (
    <>
      <TopBar brand={d.brand} nav={d.slots?.nav} cta={d.slots?.cta} />
      <div class="page" data-project={d.v.account} data-shape={JSON.stringify([d.live, d.v.control?.desired?.state ?? 'running', d.v.control?.observed?.state ?? '', d.v.exhausted, d.v.funded])}>
        <Hero v={d.v} standing={standing} runwayDays={runway} meta={d.slots?.meta} />
        <Tabs account={d.v.account} current={current} show={show} counts={{ work: open, sessions: d.live.length ? `${d.live.length} live` : d.sessions.length }} />
        {children}
        <Foot brand={d.brand} />
      </div>
    </>
  );
}

export function Overview(d: ProjectPageData) {
  const standing = standingOf(d.v, d.live);
  const runway = d.v.runway_days !== null && Number.isFinite(d.v.runway_days) ? Math.round(d.v.runway_days) : null;
  const givers = giversOf(d.v, d.brand);
  const a = d.v.account;
  return (
    <Shell d={d} current="overview">
      <div class="cols">
        <div class="main">
          <About md={d.v.profile.about_md} account={a} />
          {sees(d.viewer, d.visibility.sessions) ? <Workshop sessions={d.sessions} live={d.live} tail={sees(d.viewer, d.visibility.transcripts) ? d.tail : undefined} schedule={parseSchedule(d.v.profile.schedule_json)} standing={standing} control={d.v.control} daily={d.daily} account={a} now={d.now} /> : null}
          {sees(d.viewer, d.visibility.work) ? <><NextUp roadmap={d.roadmap} account={a} /><Shipped roadmap={d.roadmap} account={a} now={d.now} /></> : null}
          {sees(d.viewer, d.visibility.books) ? <Wall givers={givers} more={d.slots?.wall} title={d.slots?.wallTitle} /> : null}
          {d.slots?.main}
        </div>
        <div class="side">
          {d.slots?.side}
          {sees(d.viewer, d.visibility.books) ? <Funding v={d.v} givers={givers.length} standing={standing} runwayDays={runway} goalDays={d.v.goal_days} /> : null}
        </div>
      </div>
    </Shell>
  );
}
export function document(title: string, brand: string, body: string, styles = ''): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="preconnect" href="https://fonts.googleapis.com"><link href="${FONTS}" rel="stylesheet"><title>${esc(title)} · ${esc(brand)}</title><style>${CSS}${styles}</style></head><body>${body}<script>${LIVE}</script></body></html>`;
}
