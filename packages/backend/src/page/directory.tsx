// The deployment's front: every project it serves, as cards, the ones working now first. A self-host with one
// project is one card; the platform's Explore is this grid with the platform's words and figures in the slots.
import type { DirectoryEntry } from '../ledger.js';
import { usd } from '../ui.js';
import { raw } from 'hono/html';
import { Cover, Foot, Pill, TopBar, at, nameOf, ownerOf, runwayWords, safeUrl, standingOf, type Standing } from './parts.js';
import { MARK_SVG, vortex } from './art.js';
import type { DirectorySlots, Role } from './model.js';

export interface DirectoryPageData { brand: string; viewer: Role; entries: DirectoryEntry[]; now: number; slots?: DirectorySlots }

const ORDER: Record<Standing, number> = { live: 0, running: 1, requested: 2, paused: 3, exhausted: 4, unfunded: 5 };
export const listed = (entries: DirectoryEntry[]): DirectoryEntry[] => entries.filter((e) => e.is_project && e.listed);
export const byStanding = (entries: DirectoryEntry[]): DirectoryEntry[] => [...entries].sort((a, b) => ORDER[standingOf(a, a.live_sessions)] - ORDER[standingOf(b, b.live_sessions)] || a.account.localeCompare(b.account));

// One project at a glance: its drawing (or its cover) with its one word, its name and line, how long its money
// lasts against the owner's goal, and the money in one line.
export function ProjectCard({ e, facts }: { e: DirectoryEntry; facts?: unknown }) {
  const standing = standingOf(e, e.live_sessions);
  const runway = e.runway_days !== null && Number.isFinite(e.runway_days) ? Math.round(e.runway_days) : null;
  const frac = runway === null ? 0 : Math.max(0, Math.min(1, runway / Math.max(1, e.goal_days)));
  const tone = standing === 'exhausted' ? 'off' : runway !== null && runway < e.goal_days / 3 ? 'warn' : '';
  return (
    <a class="pcard" href={at(e.account)}>
      <Cover url={e.profile.cover_url} seed={e.account}><Pill standing={standing} /></Cover>
      <div class="body">
        <div class="top">
          {safeUrl(e.profile.avatar_url) ? <img class="av" src={safeUrl(e.profile.avatar_url)} alt="" /> : null}
          <div><div class="name">{nameOf(e.account)}</div><div class="own">by {ownerOf(e.account)}</div></div>
        </div>
        <p class="tag">{e.profile.tagline ?? 'Building itself in the open.'}</p>
        <div class="meter" title={runway === null ? 'No burn measured yet' : `${runwayWords(runway)} of a ${e.goal_days}-day goal`}><i class={tone} style={`width:${Math.round(frac * 100)}%`} /></div>
        <div class="facts">{facts ?? <span><b>{usd(e.balance_usd_cents)}</b> in the bank</span>}{runway !== null ? <span>{runwayWords(runway)}</span> : null}</div>
      </div>
    </a>
  );
}

// The figures a deployment stands behind: how many projects, how many at work this minute, what they hold and spent.
export function Stripe({ entries, more }: { entries: DirectoryEntry[]; more?: unknown }) {
  const working = entries.filter((e) => e.live_sessions.length).length;
  const held = entries.reduce((s, e) => s + e.balance_usd_cents, 0);
  const spent = entries.reduce((s, e) => s + e.consumed_usd_cents, 0);
  return (
    <div class="stripe">
      <div><span class="n">{entries.length}</span><span class="k">{entries.length === 1 ? 'project' : 'projects'}</span></div>
      <div><span class="n">{working ? <><i class="pulse" />{working}</> : '0'}</span><span class="k">working now</span></div>
      <div><span class="n">{usd(held)}</span><span class="k">in the bank</span></div>
      <div><span class="n">{usd(spent)}</span><span class="k">spent by agents, every call metered</span></div>
      {more}
    </div>
  );
}

export function Directory(d: DirectoryPageData) {
  const projects = byStanding(listed(d.entries));
  return (
    <>
      <TopBar brand={d.brand} nav={d.slots?.nav} />
      <div class="page">
        <div class="front">
          <div class="copy">
            {d.slots?.front ?? <><p class="label">{d.brand}</p><h1>Projects that build themselves.</h1><p class="lede">{projects.length === 1 ? 'One project builds itself here.' : `${projects.length} projects build themselves here.`} Every session they work and every cent they spend is on their pages as it happens.</p></>}
            <Stripe entries={projects} more={d.slots?.stripe} />
          </div>
          <div class="pic">{raw(vortex(d.brand))}<span class="cap tr">Simple<br />rules<br />open<br />books</span>{raw(MARK_SVG)}<span class="cap br">Every call<br />metered<br />as it<br />happens</span></div>
        </div>
        <div class="shelf" id="projects"><h2 class="sech" style="margin:0">Projects</h2><span class="label">{projects.length} {projects.length === 1 ? 'project' : 'projects'}</span></div>
        {projects.length ? <div class="grid">{projects.map((e) => <ProjectCard e={e} facts={d.slots?.card?.[e.account]} />)}</div> : <p class="empty">No project yet. A repository appears here once it has a key and its repository has synced.</p>}
      </div>
      <Foot brand={d.brand} nav={d.slots?.nav} />
    </>
  );
}
