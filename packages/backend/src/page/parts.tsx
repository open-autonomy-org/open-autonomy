// The project page's parts, each a pure function of what the platform holds. Nothing here reads the books; the
// page hands each part the view it already has. Every part has an empty state that says something true.
import { raw } from 'hono/html';
import { tenseOf, type Roadmap, type RoadmapItem } from '@open-autonomy/sdk/roadmap';
import type { AgentControl, ProjectView, SessionSummary } from '../ledger.js';
import type { EnvelopePurpose } from '../ledger.js';
import { LOGO_SVG, fmtAgo, fmtDur, usd } from '../ui.js';

export const nameOf = (account: string): string => account.split('/')[1] ?? account;
export const ownerOf = (account: string): string => account.split('/')[0];
// Addresses follow GitHub's: /name for a login (an org or a person; the books call a person's account `@login`),
// /owner/project for a project, /owner/project/<tab> for its depths. `accountAt` reads an address back.
export const at = (account: string, ...rest: string[]): string => `/${account.replace(/^@/, '').split('/').map(encodeURIComponent).join('/')}${rest.length ? `/${rest.map(encodeURIComponent).join('/')}` : ''}`;
export const accountAt = (owner: string, project?: string): string => (project ? `${owner}/${project}` : `@${owner}`);
// What the project is, as its substrate published it: the first paragraphs of its document.
export function leadParagraphs(md: string | undefined, max = 2): string {
  if (!md) return '';
  return md.split('\n').filter((l) => !/^#/.test(l)).join('\n').trim().split(/\n{2,}/).slice(0, max).join('\n\n').trim();
}
// An earmark's purpose as a sentence: what a gift is for.
export function purposeSentence(account: string, purpose: EnvelopePurpose, roadmap?: Roadmap): string {
  if (purpose.type === 'item') return `the task '${roadmap?.items.find((i) => i.id === purpose.item)?.title ?? purpose.item}'`;
  if (purpose.type === 'models') return `model calls on ${purpose.models.join(', ')}`;
  if (purpose.type === 'model') return 'model calls only';
  return purpose.type === 'any' ? 'anything the agent spends on' : `whatever ${nameOf(account)} needs`;
}

export interface Schedule { name?: string; schedule?: string }

// ---- the top bar -----------------------------------------------------------------------------------------------
export function TopBar({ brand, nav, cta }: { brand: string; nav?: unknown; cta?: unknown }) {
  return (
    <div class="topbar"><div class="in">
      <a href="/" class="brand">{raw(LOGO_SVG)}<span>{brand}</span></a>
      {nav ? <nav>{nav}</nav> : null}
      <span class="grow" />
      {cta}
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
  // A session in flight is the one fact that outranks the books: an agent on its owner's own subscription works
  // with no platform funds at all, and a working agent is working.
  if (live.length) return 'live';
  if (v.exhausted) return 'exhausted';
  if (!v.funded) return 'unfunded';
  return 'running';
}
const STANDING: Record<Standing, { cls: string; word: string }> = {
  live: { cls: 'live', word: 'Working now' }, running: { cls: 'ok', word: 'Running' }, requested: { cls: 'warn', word: 'Pause requested' },
  paused: { cls: 'off', word: 'Paused by the owner' }, exhausted: { cls: 'off', word: 'Spending stopped' }, unfunded: { cls: '', word: 'Not yet funded' },
};
export const Pill = ({ standing }: { standing: Standing }) => <span class={`pill ${STANDING[standing].cls}`}><span class="dot" />{STANDING[standing].word}</span>;

// ---- the hero ---------------------------------------------------------------------------------------------------
// A URL from a record is untrusted: https, or a path on this deployment; no quote, paren, angle bracket, backslash or space.
export const safeUrl = (u: string | undefined): string | undefined => (u && /^(?:https:\/\/|\/(?!\/))[^\s'"()<>\\]*$/.test(u) ? u : undefined);
export function coverStyle(url: string | undefined, seed = ''): string {
  const safe = safeUrl(url);
  if (safe) return `background-image:url('${safe}')`;
  let h = 0; for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = h % 360;
  return `background:radial-gradient(ellipse at ${25 + (hue % 50)}% 45%, hsl(${350 + (hue % 20)} 85% 58%), #2a0f14 75%)`;
}
export const runwayWords = (days: number | null): string | null => (days === null ? null : days > 365 ? 'over a year of runway' : days === 1 ? '1 day of runway' : `${days} days of runway`);
const parseScheduleText = (json: string | undefined): string => { try { const j = JSON.parse(json ?? '{}') as { jobs?: Schedule[] }; const jobs = Array.isArray(j.jobs) ? j.jobs.slice(0, 3) : []; return jobs.length ? ` · ${jobs.map((x) => `${x.name ?? 'job'} ${x.schedule ?? ''}`.trim()).join(' · ')}` : ''; } catch { return ''; } };
export function Header({ v, standing, runwayDays, meta }: { v: ProjectView; standing: Standing; runwayDays: number | null; meta?: unknown }) {
  return (
    <div class="head">
      {safeUrl(v.profile.avatar_url) ? <img class="avatar" src={safeUrl(v.profile.avatar_url)} alt="" /> : <div class="avatar" />}
      <div class="who">
        <h1>{nameOf(v.account)}</h1>
        {v.profile.tagline ? <p class="tag">{v.profile.tagline}</p> : null}
        {v.profile.agent_model ? <p class="built">Built by <b>{v.profile.agent_harness === 'hermes' ? 'a Hermes agent' : v.profile.agent_harness ?? 'its agent'}</b> on <b>{v.profile.agent_model}</b>{parseScheduleText(v.profile.schedule_json)}</p> : null}
        <div class="meta">
          <Pill standing={standing} />
          {meta ?? <span><b data-balance>{usd(v.balance_usd_cents)}</b> balance</span>}
          {runwayDays !== null ? <span>{runwayWords(runwayDays)}</span> : null}
          <a href={`https://github.com/${v.account}`} target="_blank" rel="noopener">{v.account} ↗</a>
        </div>
      </div>
    </div>
  );
}

// ---- the workshop: the live work, in the agent's own words ------------------------------------------------------
// The page's centerpiece. Live: the session and its latest turns as they land. Idle: the last run's own report, when
// the next job fires, and thirty days of spend as texture. Paused: the owner's word. Under it, the recent runs as a
// feed the agent wrote.
export type Turn = { seq?: number; ts?: string; role: string; text?: string; tool?: string; args?: string; result?: string };
export interface SessionTail { key: string; turns: Turn[] }
export const firstLine = (s: string | undefined, max = 140): string => { const l = (s ?? '').split('\n').map((x) => x.trim()).find((x) => x && !/^[#\-*\[]/.test(x)) ?? (s ?? '').trim(); return l.length > max ? `${l.slice(0, max - 1)}…` : l; };
// What a turn says in one line: the agent's words as written; a terminal call as its command; any other tool call
// by name alone; a tool's result by its first line. JSON never reaches the page.
const oneLine = (s: string | undefined, max = 160): string => { const t = (s ?? '').replace(/\s+/g, ' ').trim(); return t.length > max ? `${t.slice(0, max - 1)}…` : t; };
const argOf = (tool: string | undefined, args: string | undefined): string => {
  try { const a = JSON.parse(args ?? '{}') as Record<string, unknown>; const c = a.command ?? a.cmd ?? a.path ?? a.query ?? a.url; return typeof c === 'string' ? c : ''; } catch { return ''; }
};
export const tickerLine = (t: Turn): { role: string; cls: string; text: string; tool: boolean } | null => {
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
export function Workshop({ sessions, live, tail, schedule, standing, control, daily, account, now, feed = true }: { sessions: SessionSummary[]; live: string[]; tail?: SessionTail; schedule: Schedule[]; standing: Standing; control?: AgentControl; daily: number[]; account: string; now: number; feed?: boolean }) {
  const first = sessions.find((s) => live.includes(s.key));
  const last = sessions.find((s) => s.status === 'ended' && s.kind === 'run' && s.report && s.report !== '[SILENT]') ?? sessions.find((s) => s.status === 'ended' && s.kind === 'run');
  const next = schedule[0] ? `${schedule[0].name ?? 'the schedule'} fires ${schedule[0].schedule ?? 'on schedule'}` : undefined;
  const shown = tail && first && tail.key === first.key ? tail.turns : [];
  const turns = shown.map(tickerLine).filter((l): l is NonNullable<typeof l> => !!l).slice(-5);
  const seq = shown.reduce((m, t) => (typeof t.seq === 'number' && t.seq > m ? t.seq : m), -1);
  let body: unknown;
  if (standing === 'paused' || standing === 'requested') {
    const d = control?.desired;
    body = <>
      <div class="head"><span class="pulse still" /><span>{standing === 'paused' ? 'Paused by the owner' : 'Pause requested by the owner'}</span><span class="spacer" /><a href={at(account, 'sessions')}>Every session →</a></div>
      <div class="quote">{d?.reason ? d.reason : standing === 'paused' ? 'The scheduled work is paused.' : 'The run in flight is finishing; then the schedule pauses.'}</div>
      <div class="next">{d?.at ? `since ${fmtAgo(d.at, now)}` : ''}{last ? ` · last run ${fmtAgo(last.started_at, now)}` : ''}</div>
      <Spark daily={daily} />
    </>;
  } else if (first) {
    body = <>
      <div class="head"><span class="pulse" /><span>Live from the workshop</span><span class="spacer" /><a href={at(account, 'sessions', first.key)}>Follow the session →</a></div>
      <div class="sess"><span class="name">{first.source ?? first.kind}</span><span class="sub"><b>{fmtDur(first.started_at, undefined, now)}</b> in · <b data-turns>{first.turn_count}</b> turns · <b>{first.tool_calls}</b> tools · <b data-cents>{usd(first.usd_cents)}</b>{first.item_id ? <> · on <a href={at(account, 'work', first.item_id)} style="color:#f2efea">{first.item_id}</a></> : null}</span></div>
      <ul class="ticker" data-ticker data-account={account} data-session={first.key} data-seq={String(seq)} style={turns.length ? '' : 'display:none'}>{turns.map((l) => <li><span class={`role ${l.cls}`}>{l.role}</span><span class={`line${l.tool ? ' tool' : ''}`}>{l.text}</span></li>)}</ul>
    </>;
  } else if (last) {
    body = <>
      <div class="head"><span class="pulse still" /><span>Last from the workshop</span><span class="spacer" /><a href={at(account, 'sessions', last.key)}>Read the session →</a></div>
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
      {feed && recent.length ? <ul class="feed">{recent.map((s) => <li><span class="when">{fmtAgo(s.started_at, now)}</span><span class="src"><i class={s.outcome === 'failed' ? 'bad' : s.outcome ? '' : 'none'} />{s.source ?? s.kind}</span><span class="said"><a href={at(account, 'sessions', s.key)}>{s.report && s.report !== '[SILENT]' ? firstLine(s.report, 120) : s.quiet_count && s.quiet_count > 1 ? `${s.quiet_count} quiet runs, nothing to report` : 'a quiet run, nothing to report'}</a></span></li>)}</ul> : null}
      {feed ? <a class="more" href={at(account, 'sessions')} style="margin:10px 10px 0">Every session →</a> : null}
    </div>
  );
}

// ---- next up and recently shipped: titles, never specs --------------------------------------------------------
const word = (i: RoadmapItem): string => (i.status === 'active' ? 'in progress' : i.status === 'planned' ? 'planned' : 'proposed');
export function NextUp({ roadmap, account, max = 5 }: { roadmap: Roadmap; account: string; max?: number }) {
  const items = roadmap.items.filter((i) => tenseOf(i) !== 'past');
  const active = items.filter((i) => i.status === 'active'), rest = items.filter((i) => i.status !== 'active');
  const show = [...active, ...rest.filter((i) => i.status === 'planned'), ...rest.filter((i) => i.status !== 'planned')].slice(0, max);
  return (
    <div class="card">
      <h2>Next up</h2>
      {show.length ? <div class="rows">{show.map((i) => <div class="row"><a class="t" href={at(account, 'work', i.id)}>{i.title}</a><span class={`n${i.status === 'active' ? ' k' : ''}`}>{word(i)}</span></div>)}</div> : <p class="empty">Nothing planned yet.</p>}
      {items.length > show.length ? <a class="more" href={at(account, 'work')}>{items.length - show.length} more on the roadmap →</a> : <a class="more" href={at(account, 'work')}>The roadmap →</a>}
    </div>
  );
}
export function Shipped({ roadmap, account, now, max = 5 }: { roadmap: Roadmap; account: string; now: number; max?: number }) {
  const past = roadmap.items.filter((i) => tenseOf(i) === 'past').sort((a, b) => Date.parse(b.done_at ?? '') - Date.parse(a.done_at ?? '') || 0);
  const show = past.slice(0, max);
  return (
    <div class="card">
      <h2>Recently shipped</h2>
      {show.length ? <div class="rows">{show.map((i) => <div class="row"><a class="t" href={at(account, 'work', i.id)}>{i.title}</a><span class="n">{i.release ? `${i.release} · ` : ''}{i.done_at ? fmtAgo(i.done_at, now) : 'shipped'}</span></div>)}</div> : <p class="empty">Nothing shipped yet.</p>}
      {past.length > show.length ? <a class="more" href={at(account, 'work')}>All {past.length} shipped →</a> : null}
    </div>
  );
}

// ---- the budget: what the books hold, how long it lasts ----------------------------------------------------------
export function Budget({ v, standing, runwayDays, goalDays }: { v: ProjectView; standing: Standing; runwayDays: number | null; goalDays: number }) {
  const frac = runwayDays === null ? 0 : Math.max(0, Math.min(1, runwayDays / goalDays));
  const tone = standing === 'exhausted' ? 'off' : runwayDays !== null && runwayDays < goalDays / 3 ? 'warn' : '';
  return (
    <div class="card fund">
      <div class="big"><span data-balance>{usd(v.balance_usd_cents)}</span><span> in the bank</span></div>
      <div class="line">{standing === 'exhausted' ? 'The balance is spent; spending stops until money comes in.' : runwayDays === null ? 'No runs yet, so no burn to measure.' : runwayDays > 365 ? 'Over a year of runway at its current burn.' : `About ${runwayDays} days of runway at its current burn; the goal is ${goalDays}.`}</div>
      <div class="track"><div class={`fill ${tone}`} style={`width:${Math.round(frac * 100)}%`} /></div>
      <div class="stats">
        <div class="stat"><div class="v" data-received>{usd(v.granted_in_usd_cents)}</div><div class="l">put in</div></div>
        <div class="stat"><div class="v" data-spent>{usd(v.consumed_usd_cents)}</div><div class="l">spent</div></div>
        <div class="stat"><div class="v">{goalDays}d</div><div class="l">runway goal</div></div>
      </div>
      <p class="fine">Every spend is metered on these books. <a href={at(v.account, 'books')}>See the books →</a></p>
    </div>
  );
}
export const Foot = ({ brand }: { brand: string }) => <div class="foot"><span>Every spend on these books is metered as it happens. {brand} shows; it does not steer.</span></div>;

// ---- the project's tabs: GitHub's frame -------------------------------------------------------------------------
export type Tab = 'overview' | 'work' | 'sessions' | 'books' | 'agent' | 'team';
export const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Overview' }, { id: 'work', label: 'Work' }, { id: 'sessions', label: 'Sessions' }, { id: 'books', label: 'Books' }, { id: 'agent', label: 'Agent' }, { id: 'team', label: 'Team' },
];
export function Tabs({ account, current, counts, show }: { account: string; current: Tab; counts: Partial<Record<Tab, string | number | undefined>>; show: (t: Tab) => boolean }) {
  return <div class="tabs">{TABS.filter((t) => show(t.id)).map((t) => <a class={t.id === current ? 'on' : ''} href={t.id === 'overview' ? at(account) : at(account, t.id)}>{t.label}{counts[t.id] !== undefined ? <span class="count">{counts[t.id]}</span> : null}</a>)}</div>;
}
