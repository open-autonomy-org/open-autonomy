// The project page's parts, each a pure function of what the platform holds. Nothing here reads the books; the
// page hands each part the view it already has. Every part has an empty state that says something true.
import { raw } from 'hono/html';
import { tenseOf, type Roadmap, type RoadmapItem } from '@open-autonomy/sdk/roadmap';
import type { AgentControl, ProjectView, SessionSummary } from '../ledger.js';
import { LOGO_SVG, fmtAgo, fmtDur, mdToSafeHtml, usd, usd0 } from '../ui.js';
import { leadParagraphs } from '../stream-view.js';

export const nameOf = (account: string): string => account.split('/')[1] ?? account;
export const ownerOf = (account: string): string => account.split('/')[0];

export interface Patron { login: string; name?: string; avatar_url?: string; url?: string }
export interface Tier { usd_cents: number; name: string }
export interface Patronage { tiers: Tier[]; patrons: Patron[]; patron_count: number; monthly_usd_cents: number }
export interface Schedule { name?: string; schedule?: string }

// ---- the top bar -----------------------------------------------------------------------------------------------
export function TopBar({ brand, cta = true }: { brand: string; cta?: boolean }) {
  return (
    <div class="topbar"><div class="in">
      <a href="/" class="brand">{raw(LOGO_SVG)}<span>{brand}</span></a>
      <nav><a href="/explore">Explore</a></nav>
      <span class="grow" />
      {cta ? <a class="btn small" href="#patron">Become a patron</a> : null}
    </div></div>
  );
}

// ---- the one word on the agent ----------------------------------------------------------------------------------
export type Standing = 'live' | 'running' | 'requested' | 'paused' | 'exhausted' | 'unfunded';
export function standingOf(v: Pick<ProjectView, 'funded' | 'exhausted' | 'control'>, live: string[]): Standing {
  const desired = v.control?.desired?.state ?? 'running', observed = v.control?.observed?.state;
  if (desired === 'paused' && observed === 'paused') return 'paused';
  if (desired === 'paused') return 'requested';
  if (observed === 'paused') return 'paused';
  if (v.exhausted) return 'exhausted';
  if (!v.funded) return 'unfunded';
  return live.length ? 'live' : 'running';
}
const STANDING: Record<Standing, { cls: string; word: string }> = {
  live: { cls: 'live', word: 'Working now' }, running: { cls: 'ok', word: 'Running' }, requested: { cls: 'warn', word: 'Pause requested' },
  paused: { cls: 'off', word: 'Paused by the owner' }, exhausted: { cls: 'off', word: 'Spending stopped' }, unfunded: { cls: '', word: 'Not yet funded' },
};
export const Pill = ({ standing }: { standing: Standing }) => <span class={`pill ${STANDING[standing].cls}`}><span class="dot" />{STANDING[standing].word}</span>;

// ---- the hero ---------------------------------------------------------------------------------------------------
export function coverStyle(url: string | undefined, seed = ''): string {
  if (url) return `background-image:url('${url.replace(/'/g, '%27')}')`;
  let h = 0; for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = h % 360;
  return `background:radial-gradient(ellipse at ${25 + (hue % 50)}% 45%, hsl(${350 + (hue % 20)} 85% 58%), #2a0f14 75%)`;
}
export const runwayWords = (days: number | null): string | null => (days === null ? null : days > 365 ? 'over a year of runway' : days === 1 ? '1 day of runway' : `${days} days of runway`);
export function Hero({ v, standing, patronage, runwayDays }: { v: ProjectView; standing: Standing; patronage: Patronage; runwayDays: number | null }) {
  const name = nameOf(v.account);
  return (
    <>
      <div class="cover" style={coverStyle(v.profile.cover_url, v.account)} />
      <div class="hero">
        {v.profile.avatar_url ? <img class="avatar" src={v.profile.avatar_url} alt="" /> : <div class="avatar" />}
        <div class="who">
          <h1>{name}</h1>
          <p class="tag">{v.profile.tagline ?? `${v.account}, building itself in the open.`}</p>
          <div class="meta">
            <Pill standing={standing} />
            <span><b>{patronage.patron_count}</b> {patronage.patron_count === 1 ? 'patron' : 'patrons'}</span>
            <span><b>{usd0(patronage.monthly_usd_cents)}</b>/mo</span>
            {runwayDays !== null ? <span>{runwayWords(runwayDays)}</span> : null}
            <a href={`https://github.com/${v.account}`} target="_blank" rel="noopener">{v.account} ↗</a>
          </div>
        </div>
      </div>
    </>
  );
}

// ---- about: the lead paragraph, the rest a page ------------------------------------------------------------------
export function About({ md, enc }: { md?: string; enc: string }) {
  const lead = leadParagraphs(md, 1);
  return (
    <div class="card">
      <h2>About</h2>
      {lead ? <div class="prose" dangerouslySetInnerHTML={{ __html: mdToSafeHtml(lead) }} /> : <p class="empty">This project has not published what it is yet.</p>}
      {(md ?? '').trim().length > lead.length ? <a class="more" href={`/p/${enc}/about`}>Read more →</a> : null}
    </div>
  );
}

// ---- right now: one line ----------------------------------------------------------------------------------------
export function Now({ sessions, live, schedule, standing, control, enc, now }: { sessions: SessionSummary[]; live: string[]; schedule: Schedule[]; standing: Standing; control?: AgentControl; enc: string; now: number }) {
  const first = sessions.find((s) => live.includes(s.key));
  const last = sessions.find((s) => s.status === 'ended' && s.kind === 'run');
  let line: unknown;
  if (standing === 'paused' || standing === 'requested') {
    const d = control?.desired;
    line = <><span class="what">{standing === 'paused' ? 'Paused' : 'Pause requested'}</span><span class="sub">{d?.at ? fmtAgo(d.at, now) : ''}{d?.reason ? ` · ${d.reason}` : ''}{standing === 'requested' ? ' · a run is finishing' : ''}</span></>;
  } else if (first) {
    line = <><span class="what"><a href={`/p/${enc}/sessions/${encodeURIComponent(first.key)}`}>{first.source ?? first.kind}</a></span><span class="sub">running for {fmtDur(first.started_at, undefined, now)}{first.item_id ? <> · on <a href={`/p/${enc}/items/${encodeURIComponent(first.item_id)}`}>{first.item_id}</a></> : null} · {first.turn_count} turns</span></>;
  } else if (last) {
    line = <><span class="what"><a href={`/p/${enc}/sessions/${encodeURIComponent(last.key)}`}>{last.source ?? last.kind}</a></span><span class="sub">{fmtAgo(last.started_at, now)} · {last.outcome ?? 'ended'}{schedule[0] ? ` · ${schedule[0].name ?? 'the schedule'} fires ${schedule[0].schedule ?? 'on schedule'}` : ''}</span></>;
  } else if (schedule.length) {
    line = <><span class="what">Waiting for its first run</span><span class="sub">{schedule.map((j) => `${j.name ?? 'job'} fires ${j.schedule ?? '?'}`).join(' · ')}</span></>;
  } else {
    line = <span class="empty">No schedule published yet.</span>;
  }
  return <div class="card"><h2>Right now</h2><div class="now">{line}</div><a class="more" href={`/p/${enc}/sessions`}>Every session →</a></div>;
}

// ---- next up and recently shipped: titles, never specs --------------------------------------------------------
const word = (i: RoadmapItem): string => (i.status === 'active' ? 'in progress' : i.status === 'planned' ? 'planned' : 'proposed');
export function NextUp({ roadmap, enc, max = 5 }: { roadmap: Roadmap; enc: string; max?: number }) {
  const items = roadmap.items.filter((i) => tenseOf(i) !== 'past');
  const active = items.filter((i) => i.status === 'active'), rest = items.filter((i) => i.status !== 'active');
  const show = [...active, ...rest.filter((i) => i.status === 'planned'), ...rest.filter((i) => i.status !== 'planned')].slice(0, max);
  return (
    <div class="card">
      <h2>Next up</h2>
      {show.length ? <div class="rows">{show.map((i) => <div class="row"><a class="t" href={`/p/${enc}/items/${encodeURIComponent(i.id)}`}>{i.title}</a><span class={`n${i.status === 'active' ? ' k' : ''}`}>{word(i)}</span></div>)}</div> : <p class="empty">Nothing planned yet.</p>}
      {items.length > show.length ? <a class="more" href={`/p/${enc}/roadmap`}>{items.length - show.length} more on the roadmap →</a> : <a class="more" href={`/p/${enc}/roadmap`}>The roadmap →</a>}
    </div>
  );
}
export function Shipped({ roadmap, enc, now, max = 5 }: { roadmap: Roadmap; enc: string; now: number; max?: number }) {
  const past = roadmap.items.filter((i) => tenseOf(i) === 'past').sort((a, b) => Date.parse(b.done_at ?? '') - Date.parse(a.done_at ?? '') || 0);
  const show = past.slice(0, max);
  return (
    <div class="card">
      <h2>Recently shipped</h2>
      {show.length ? <div class="rows">{show.map((i) => <div class="row"><a class="t" href={`/p/${enc}/items/${encodeURIComponent(i.id)}`}>{i.title}</a><span class="n">{i.release ? `${i.release} · ` : ''}{i.done_at ? fmtAgo(i.done_at, now) : 'shipped'}</span></div>)}</div> : <p class="empty">Nothing shipped yet.</p>}
      {past.length > show.length ? <a class="more" href={`/p/${enc}/roadmap?view=releases`}>All {past.length} shipped →</a> : null}
    </div>
  );
}

// ---- patrons wall ----------------------------------------------------------------------------------------------
export function Wall({ patrons }: { patrons: Patron[] }) {
  return (
    <div class="card">
      <h2>Patrons</h2>
      {patrons.length ? <div class="wall">{patrons.map((p) => <a class="chip" href={p.url ?? `https://github.com/${p.login}`}>{p.avatar_url ? <img src={p.avatar_url} alt="" /> : null}{p.name ?? p.login}</a>)}</div> : <p class="empty">No patrons yet. Be the first.</p>}
    </div>
  );
}

// ---- funding: the one card that asks ----------------------------------------------------------------------------
export function Funding({ v, patronage, standing, runwayDays, goalDays }: { v: ProjectView; patronage: Patronage; standing: Standing; runwayDays: number | null; goalDays: number }) {
  const frac = runwayDays === null ? 0 : Math.max(0, Math.min(1, runwayDays / goalDays));
  const tone = standing === 'exhausted' ? 'off' : runwayDays !== null && runwayDays < goalDays / 3 ? 'warn' : '';
  return (
    <div class="card fund" id="patron">
      {patronage.monthly_usd_cents > 0
        ? <div class="big">{usd0(patronage.monthly_usd_cents)}<span>/mo from {patronage.patron_count} {patronage.patron_count === 1 ? 'patron' : 'patrons'}</span></div>
        : <div class="big">{usd(v.balance_usd_cents)}<span> in the bank{v.granted_in_usd_cents > 0 ? ', from grants' : ''}</span></div>}
      <div class="line">{standing === 'exhausted' ? 'The balance is spent. The next gift starts the agent again.' : runwayDays === null ? 'No runs yet, so no burn to measure.' : runwayDays > 365 ? `Over a year of runway at its current burn.` : `About ${runwayDays} days of runway at its current burn; the goal is ${goalDays}.`}</div>
      <div class="track"><div class={`fill ${tone}`} style={`width:${Math.round(frac * 100)}%`} /></div>
      <div class="stats">
        {patronage.monthly_usd_cents > 0 ? <div class="stat"><div class="v">{usd(v.balance_usd_cents)}</div><div class="l">balance</div></div> : <div class="stat"><div class="v">{patronage.patron_count}</div><div class="l">{patronage.patron_count === 1 ? 'patron' : 'patrons'}</div></div>}
        <div class="stat"><div class="v">{usd(v.granted_in_usd_cents)}</div><div class="l">received</div></div>
        <div class="stat"><div class="v">{usd(v.consumed_usd_cents)}</div><div class="l">spent</div></div>
      </div>
      <a class="btn wide" href="#tiers">Become a patron</a>
      <p class="fine">Every spend is metered on public books. <a href={`/p/${encodeURIComponent(v.account)}/books`}>See the books →</a></p>
    </div>
  );
}
export function Tiers({ tiers, owner, account, sponsor, polar, burn }: { tiers: Tier[]; owner: string; account: string; sponsor: string; polar: boolean; burn: number }) {
  const days = (t: Tier) => (burn > 0 ? Math.round(t.usd_cents / burn) : null);
  return (
    <div class="card" id="tiers">
      <h2>Become a patron</h2>
      {polar ? <div class="tiers">{tiers.map((t, i) => {
        const d = days(t);
        return (
          <div class={`tier${i === 1 ? ' feat' : ''}`}>
            <div class="th"><span class="tn">{t.name}</span><span class="tp">{usd0(t.usd_cents)} <span>/mo</span></span></div>
            <p>On the patrons wall{d !== null ? `; about ${d} day${d === 1 ? '' : 's'} of runway each month` : ''}.</p>
            <form method="post" action="/v1/patrons/checkout"><input type="hidden" name="account" value={account} /><input type="hidden" name="tier" value={String(i)} /><button class={`btn${i === 1 ? '' : ' quiet'}`} type="submit" name="interval" value="month">Join for {usd0(t.usd_cents)}/mo</button></form>
          </div>
        );
      })}</div> : <>
        <div class="ladder">{tiers.map((t) => { const d = days(t); return <div class="rung"><span class="tn">{t.name}<span>On the patrons wall{d !== null ? `; about ${d} day${d === 1 ? '' : 's'} of runway a month` : ''}</span></span><span class="tp">{usd0(t.usd_cents)} <span>/mo</span></span></div>; })}</div>
        <a class="btn wide" href={`https://github.com/sponsors/${owner}`}>Sponsor on GitHub</a>
        {account !== sponsor ? <p class="fine" style="margin-top:10px">GitHub Sponsors funds {owner}'s pool; grants reach this project from there.</p> : null}
      </>}
      <details class="more">
        <summary>Other ways to give</summary>
        <div class="body">
          <form class="form" method="post" action={`/p/${encodeURIComponent(account)}/give`}>
            <input name="key" placeholder="your funder key" autocomplete="off" />
            <input name="usd_cents" type="number" min={1} placeholder="cents" />
            <input name="note" placeholder="a word, optional" maxlength={280} />
            <button class="btn quiet" type="submit">Give grant credits</button>
            <p class="fine">Funders hold grant credits on their own books and give them to a project they believe in.</p>
          </form>
          <form class="form" method="post" action={`/p/${encodeURIComponent(account)}/redeem`}>
            <input name="code" placeholder="sponsor coupon" autocomplete="off" />
            <button class="btn quiet" type="submit">Redeem</button>
          </form>
        </div>
      </details>
    </div>
  );
}
export const Foot = ({ enc }: { enc: string }) => <div class="foot"><a href={`/p/${enc}/books`}>The books</a><a href={`/p/${enc}/roadmap`}>Roadmap</a><a href={`/p/${enc}/sessions`}>Sessions</a><a href={`/p/${enc}/setup`}>The agent</a><a href={`/p/${enc}/team`}>Team</a></div>;
