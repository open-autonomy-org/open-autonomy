// The project page's parts, each a pure function of what the platform holds. Nothing here reads the books; the
// page hands each part the view it already has. Every part has an empty state that says something true.
import { raw } from 'hono/html';
import { tenseOf, type Roadmap, type RoadmapItem } from '@open-autonomy/sdk/roadmap';
import type { AgentControl, ProjectView, SessionSummary } from '../ledger.js';
import { LOGO_SVG, fmtAgo, fmtDur, mdToSafeHtml, usd, usd0 } from '../ui.js';
import { leadParagraphs } from '../stream-view.js';

export const nameOf = (account: string): string => account.split('/')[1] ?? account;
export const ownerOf = (account: string): string => account.split('/')[0];

export interface Patron { login: string; name?: string; avatar_url?: string; url?: string; amount_label?: string }
export interface Tier { usd_cents: number; name: string }
export interface Patronage { tiers: Tier[]; patrons: Patron[]; patron_count: number; monthly_usd_cents: number }
// Money never arrives from nobody. A gift on the books names its giver (a funder's login, the org's grants pool, a
// sponsor behind a coupon); each is a patron on the wall whether or not a subscription is behind them.
export function withGivers(p: Patronage, v: Pick<ProjectView, 'envelopes' | 'feed' | 'granted_in_usd_cents'>, brand: string): Patronage {
  const seen = new Set(p.patrons.map((x) => x.login.toLowerCase()));
  const extra: Patron[] = [];
  const add = (who: string | undefined, label?: string) => {
    if (!who) return;
    const login = who.startsWith('@') ? who.slice(1) : who;
    if (seen.has(login.toLowerCase())) return;
    seen.add(login.toLowerCase());
    extra.push(who.includes('/') ? { login, name: who.endsWith('/grants') ? `${brand} grants` : who, url: `https://github.com/${who}` } : { login, avatar_url: `https://github.com/${login}.png`, ...(label ? { amount_label: label } : {}) });
  };
  for (const e of v.envelopes ?? []) add(e.from);
  for (const f of v.feed ?? []) if (f.kind === 'grant' || f.kind === 'mint') { add(f.from); if (f.by) add(f.by); }
  // Money the books hold without a named giver was minted by the deployment's operator: that operator is the giver.
  if (!p.patrons.length && !extra.length && (v as { granted_in_usd_cents?: number }).granted_in_usd_cents! > 0) extra.push({ login: brand, name: brand, url: '/' });
  return { ...p, patrons: [...p.patrons, ...extra], patron_count: p.patron_count + extra.length };
}
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
// An image URL from a repository is untrusted: https only, no quote, paren, angle bracket, backslash or space.
export const safeUrl = (u: string | undefined): string | undefined => (u && /^https:\/\/[^\s'"()<>\\]+$/.test(u) ? u : undefined);
export function coverStyle(url: string | undefined, seed = ''): string {
  const safe = safeUrl(url);
  if (safe) return `background-image:url('${safe}')`;
  let h = 0; for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = h % 360;
  return `background:radial-gradient(ellipse at ${25 + (hue % 50)}% 45%, hsl(${350 + (hue % 20)} 85% 58%), #2a0f14 75%)`;
}
export const runwayWords = (days: number | null): string | null => (days === null ? null : days > 365 ? 'over a year of runway' : days === 1 ? '1 day of runway' : `${days} days of runway`);
const parseScheduleText = (json: string | undefined): string => { try { const j = JSON.parse(json ?? '{}') as { jobs?: Schedule[] }; const jobs = Array.isArray(j.jobs) ? j.jobs.slice(0, 3) : []; return jobs.length ? ` · ${jobs.map((x) => `${x.name ?? 'job'} ${x.schedule ?? ''}`.trim()).join(' · ')}` : ''; } catch { return ''; } };
export function Hero({ v, standing, patronage, runwayDays, quiet = false }: { v: ProjectView; standing: Standing; patronage: Patronage; runwayDays: number | null; quiet?: boolean }) {
  const name = nameOf(v.account);
  return (
    <>
      <div class="cover" style={coverStyle(v.profile.cover_url, v.account)} />
      <div class="hero">
        {safeUrl(v.profile.avatar_url) ? <img class="avatar" src={safeUrl(v.profile.avatar_url)} alt="" /> : <div class="avatar" />}
        <div class="who">
          <h1>{name}</h1>
          <p class="tag">{v.profile.tagline ?? `${v.account}, building itself in the open.`}</p>
          {v.profile.agent_model ? <p class="built">Built by <b>{v.profile.agent_harness === 'hermes' ? 'a Hermes agent' : v.profile.agent_harness ?? 'its agent'}</b> on <b>{v.profile.agent_model}</b>{parseScheduleText(v.profile.schedule_json)}</p> : null}
          <div class="meta">
            <Pill standing={standing} />
            {quiet ? null : <span><b>{patronage.patron_count}</b> {patronage.patron_count === 1 ? 'patron' : 'patrons'}</span>}
            {quiet ? <span><b>{usd(v.balance_usd_cents)}</b> balance</span> : <span><b>{usd0(patronage.monthly_usd_cents)}</b>/mo</span>}
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

// ---- the workshop: the live work, in the agent's own words ------------------------------------------------------
// The page's centerpiece. Live: the session and its latest turns as they land. Idle: the last run's own report, when
// the next job fires, and thirty days of spend as texture. Paused: the owner's word. Under it, the recent runs as a
// feed the agent wrote.
export type Turn = { ts?: string; role: string; text?: string; tool?: string; args?: string; result?: string };
export interface SessionTail { key: string; turns: Turn[] }
const firstLine = (s: string | undefined, max = 140): string => { const l = (s ?? '').split('\n').map((x) => x.trim()).find((x) => x && !/^[#\-*\[]/.test(x)) ?? (s ?? '').trim(); return l.length > max ? `${l.slice(0, max - 1)}…` : l; };
// What a turn says in one line: the agent's words as written; a terminal call as its command; any other tool call
// by name alone; a tool's result by its first line. JSON never reaches the page.
const oneLine = (s: string | undefined, max = 160): string => { const t = (s ?? '').replace(/\s+/g, ' ').trim(); return t.length > max ? `${t.slice(0, max - 1)}…` : t; };
const argOf = (tool: string | undefined, args: string | undefined): string => {
  try { const a = JSON.parse(args ?? '{}') as Record<string, unknown>; const c = a.command ?? a.cmd ?? a.path ?? a.query ?? a.url; return typeof c === 'string' ? c : ''; } catch { return ''; }
};
const tickerLine = (t: Turn): { role: string; cls: string; text: string; tool: boolean } | null => {
  if (t.role === 'assistant' && t.tool) { const a = argOf(t.tool, t.args); return a ? { role: 'agent', cls: 'a', text: oneLine(`${t.tool}: ${a}`), tool: true } : null; }
  if (t.role === 'assistant') return t.text?.trim() ? { role: 'agent', cls: 'a', text: oneLine(t.text.replace(/^#+\s*/gm, '').replace(/\*\*/g, '')), tool: false } : null;
  if (t.role === 'tool') { const r = (t.result ?? '').trim(); if (!r || r.startsWith('{') || r.startsWith('[')) return null; return { role: t.tool ?? 'tool', cls: '', text: oneLine(r.split('\n')[0]), tool: true }; }
  return t.text?.trim() ? { role: t.role, cls: '', text: oneLine(t.text), tool: false } : null;
};
export function Spark({ daily }: { daily: number[] }) {
  const last = daily.slice(-30);
  const max = Math.max(1, ...last);
  const week = last.slice(-7).reduce((a, b) => a + b, 0);
  return (
    <>
      <div class="spark">{last.map((d, i) => <i class={d <= 0 ? 'zero' : i === last.length - 1 ? 'hot' : ''} style={`height:${Math.max(4, Math.round((d / max) * 100))}%`} />)}</div>
      <div class="sparklabel"><span>spend, last {last.length} days</span><span>{usd(week)} this week</span></div>
    </>
  );
}
export function Workshop({ sessions, live, tail, schedule, standing, control, daily, enc, now }: { sessions: SessionSummary[]; live: string[]; tail?: SessionTail; schedule: Schedule[]; standing: Standing; control?: AgentControl; daily: number[]; enc: string; now: number }) {
  const first = sessions.find((s) => live.includes(s.key));
  const last = sessions.find((s) => s.status === 'ended' && s.kind === 'run' && s.report && s.report !== '[SILENT]') ?? sessions.find((s) => s.status === 'ended' && s.kind === 'run');
  const next = schedule[0] ? `${schedule[0].name ?? 'the schedule'} fires ${schedule[0].schedule ?? 'on schedule'}` : undefined;
  const turns = (tail && first && tail.key === first.key ? tail.turns : []).map(tickerLine).filter((l): l is NonNullable<typeof l> => !!l).slice(-5);
  let body: unknown;
  if (standing === 'paused' || standing === 'requested') {
    const d = control?.desired;
    body = <>
      <div class="head"><span class="pulse still" /><span>{standing === 'paused' ? 'Paused by the owner' : 'Pause requested by the owner'}</span><span class="spacer" /><a href={`/p/${enc}/sessions`}>Every session →</a></div>
      <div class="quote">{d?.reason ? d.reason : standing === 'paused' ? 'The scheduled work is paused.' : 'The run in flight is finishing; then the schedule pauses.'}</div>
      <div class="next">{d?.at ? `since ${fmtAgo(d.at, now)}` : ''}{last ? ` · last run ${fmtAgo(last.started_at, now)}` : ''}</div>
      <Spark daily={daily} />
    </>;
  } else if (first) {
    body = <>
      <div class="head"><span class="pulse" /><span>Live from the workshop</span><span class="spacer" /><a href={`/p/${enc}/sessions/${encodeURIComponent(first.key)}`}>Follow the session →</a></div>
      <div class="sess"><span class="name">{first.source ?? first.kind}</span><span class="sub"><b>{fmtDur(first.started_at, undefined, now)}</b> in · <b>{first.turn_count}</b> turns · <b>{first.tool_calls}</b> tools · <b>{usd(first.usd_cents)}</b>{first.item_id ? <> · on <a href={`/p/${enc}/items/${encodeURIComponent(first.item_id)}`} style="color:#f2efea">{first.item_id}</a></> : null}</span></div>
      {turns.length ? <ul class="ticker">{turns.map((l) => <li><span class={`role ${l.cls}`}>{l.role}</span><span class={`line${l.tool ? ' tool' : ''}`}>{l.text}</span></li>)}</ul> : null}
    </>;
  } else if (last) {
    body = <>
      <div class="head"><span class="pulse still" /><span>Last from the workshop</span><span class="spacer" /><a href={`/p/${enc}/sessions/${encodeURIComponent(last.key)}`}>Read the session →</a></div>
      <div class="sess"><span class="name">{last.source ?? last.kind}</span><span class="sub">{fmtAgo(last.started_at, now)} · <b>{last.outcome ?? 'ended'}</b> · {last.turn_count} turns · {usd(last.usd_cents)}</span></div>
      {last.report && last.report !== '[SILENT]' ? <div class="quote">{firstLine(last.report, 200)}</div> : null}
      {next ? <div class="next">{next}</div> : null}
      <Spark daily={daily} />
    </>;
  } else {
    body = <>
      <div class="head"><span class="pulse still" /><span>The workshop</span></div>
      <div class="quote">{schedule.length ? 'Waiting for its first run.' : 'No schedule published yet.'}</div>
      {next ? <div class="next">{next}</div> : null}
    </>;
  }
  // Consecutive quiet runs of one job fold into a single line; the feed is what the agent said, not its heartbeat.
  const quiet = (s: SessionSummary) => !s.report || s.report === '[SILENT]';
  const folded: Array<SessionSummary & { quiet_count?: number }> = [];
  for (const s of sessions.filter((x) => x.status === 'ended' && x.kind === 'run' && !(first && x.key === first.key))) {
    const prev = folded[folded.length - 1];
    if (quiet(s) && prev && quiet(prev) && prev.source === s.source) { prev.quiet_count = (prev.quiet_count ?? 1) + 1; continue; }
    folded.push({ ...s });
    if (folded.length >= 5) break;
  }
  const recent = folded;
  return (
    <div class="card" style="padding:14px">
      <div class="shop">{body}</div>
      {recent.length ? <ul class="feed">{recent.map((s) => <li><span class="when">{fmtAgo(s.started_at, now)}</span><span class="src"><i class={s.outcome === 'failed' ? 'bad' : s.outcome ? '' : 'none'} />{s.source ?? s.kind}</span><span class="said"><a href={`/p/${enc}/sessions/${encodeURIComponent(s.key)}`}>{s.report && s.report !== '[SILENT]' ? firstLine(s.report, 120) : s.quiet_count && s.quiet_count > 1 ? `${s.quiet_count} quiet runs, nothing to report` : 'a quiet run, nothing to report'}</a></span></li>)}</ul> : null}
      <a class="more" href={`/p/${enc}/sessions`} style="margin:10px 10px 0">Every session →</a>
    </div>
  );
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
      {patrons.length ? <div class="wall">{patrons.map((p) => <a class="chip" href={safeUrl(p.url) ?? `https://github.com/${encodeURIComponent(p.login)}`}>{safeUrl(p.avatar_url) ? <img src={safeUrl(p.avatar_url)} alt="" /> : null}{p.name ?? p.login}</a>)}</div> : <p class="empty">No patrons yet. Be the first.</p>}
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
        : <div class="big">{usd(v.balance_usd_cents)}<span> in the bank{patronage.patron_count > 0 ? `, from ${patronage.patron_count} ${patronage.patron_count === 1 ? 'giver' : 'givers'}` : ''}</span></div>}
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
