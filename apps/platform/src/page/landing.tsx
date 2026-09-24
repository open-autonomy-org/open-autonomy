// The landing page: a project as an outsider meets it. Product Hunt's top (the icon, the name, the one line, the
// tags, two buttons) over Kickstarter's campaign (the media on the left, the money on the right, the story and the
// promises below, the rewards beside them). The top is the project's own band: its ground colour edge to edge, its
// drawing (or the cover it published) bleeding off the right side. The media is the agent at work, the only picture a self-building project can show: what it is doing this minute and its
// metered days. Everything deeper (transcripts, every call, the agent's setup, the owner's control) is the
// dashboard's, a link away for whoever the owner admits.
import { tenseOf, type Roadmap } from '@open-autonomy/sdk/roadmap';
import type { LandingBase, ProjectView, SessionSummary } from '@open-autonomy/backend';
import { esc, fmtAgo, fmtDur, mdToSafeHtml, render, usd, usd0 } from '@open-autonomy/backend/ui';
import { Foot, Pill, TopBar, at, firstLine, leadParagraphs, nameOf, ownerOf, safeUrl, standingOf } from '@open-autonomy/backend/page/parts';
import { updatesOf } from '@open-autonomy/backend/page/updates';
import { BASE_CSS, DISPLAY, FONTS, T, TEXT } from '@open-autonomy/backend/page/theme';
import { headMeta, type PageMeta } from '@open-autonomy/backend/page/document';
import { art, groundOf, lattice, rings } from '@open-autonomy/backend/page/art';
import { raw } from 'hono/html';
import { sees, type Viewer } from '@open-autonomy/backend/page/model';
import type { Patron, PatronageView } from '../patronage.js';
import { PATRONAGE_STYLES, Tiers, whoNav } from './patronage.js';

export interface LandingData {
  brand: string;
  v: ProjectView;
  sessions: SessionSummary[];
  live: string[];
  roadmap: Roadmap;
  // Metered spend per day, oldest first, as the books emit it.
  daily: number[];
  patronage: PatronageView;
  polar: boolean;
  sponsor: string;
  now: number;
  who?: Viewer;
  // Whether this viewer may open the dashboard: the owner's word on the `overview` panel, resolved by the router.
  dashboard: boolean;
}

// The landing page's own sheet, on the core's parts: an identity band beside the project's drawing, the facts in
// one ruled strip, the agent at work beside the money, then the story, the tiers, the roadmap and the patrons.
export const LANDING_CSS = `${BASE_CSS}
/* The project's own band: full bleed in its ground colour, the words in the container, the drawing (or the cover it
   published) filling the right side out to the viewport's edge. */
.ident{--ground:${T.panel};display:grid;grid-template-columns:minmax(var(--oa-gutter),1fr) minmax(0,calc(var(--oa-wide) * .56)) minmax(0,calc(var(--oa-wide) * .44)) minmax(var(--oa-gutter),1fr);background:var(--ground);border-bottom:1px solid ${T.line}}
.ident[data-ground=stone]{--ground:${T.stone}}.ident[data-ground=lime]{--ground:${T.lime}}.ident[data-ground=lilac]{--ground:${T.lilac}}
.ident .who{grid-column:2;min-width:0;padding:64px 48px 56px 0;align-self:center}
.ident .label{margin-bottom:18px;color:#5d6168}
.ident h1{font:400 clamp(40px,5.6vw,68px)/1 ${DISPLAY};letter-spacing:-.04em;color:#000;overflow-wrap:anywhere}
.ident .tag{font-size:19px;line-height:1.4;color:${T.ink};font-weight:400;margin-top:18px;max-width:34ch}
.ident .acts{display:flex;gap:12px;flex-wrap:wrap;margin-top:30px}
.ident .acts .gh{align-self:center;margin-left:6px;font-size:13.5px;color:${T.body}}
.ident .pic{grid-column:3 / -1;position:relative;min-height:420px;overflow:hidden;color:${T.ink}}
.ident .pic .art,.ident .pic img{position:absolute;inset:0;width:100%;height:100%}
.ident .pic img{object-fit:cover}
.ident .pic .cap{position:absolute;right:var(--oa-gutter);font:500 9px/1.8 ${TEXT};letter-spacing:.3em;text-transform:uppercase;color:${T.body};background:var(--ground);padding:4px 10px}
.ident .pic .cap.t{top:24px}.ident .pic .cap.b{bottom:24px}
.facts-strip{display:flex;align-items:center;flex-wrap:wrap;gap:16px 0;padding:18px 0;border-bottom:1px solid ${T.line}}
.facts-strip>*{padding:0 26px;border-left:1px solid ${T.line}}
.facts-strip>*:first-child{padding-left:0;border-left:0}
.facts-strip .who{display:flex;align-items:center;gap:14px;min-width:0}
.facts-strip .who img{width:44px;height:44px;border-radius:50%;background:${T.stone}}
.facts-strip .who b{display:block;font-weight:500;font-size:15px}
.facts-strip .fig b{display:block;font:400 19px/1.2 ${TEXT}}
.facts-strip small{display:block;color:${T.muted};font-size:12px;margin-top:1px}
.facts-strip .faces{display:flex;align-items:center;gap:12px;margin-left:auto}
.stack{display:inline-flex;align-items:center}
.stack img,.stack .ph{width:30px;height:30px;border-radius:50%;border:2px solid ${T.wash};background:${T.stone};margin-left:-9px;object-fit:cover}
.stack img:first-child,.stack .ph:first-child{margin-left:0}
.hero{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:32px;margin-top:40px;align-items:stretch}
.poster{background:${T.stone};padding:24px 26px 22px;position:relative;overflow:hidden;display:flex;flex-direction:column;min-height:380px}
.poster>.art{position:absolute;inset:0;opacity:.16;pointer-events:none}
.poster>*{position:relative}
.poster .head{display:flex;align-items:center;gap:10px;font:500 10px/1.4 ${TEXT};letter-spacing:.28em;text-transform:uppercase;color:${T.body}}
.poster .head .p{width:8px;height:8px;background:${T.hot};animation:pulse 1.2s steps(2) infinite}
.poster .head .p.still{background:${T.faint};animation:none}
.poster .head .pill{margin-left:auto}
.poster .line{margin-top:16px;font:400 19px/1.45 ${TEXT};color:${T.ink};max-width:60ch}
.poster .line b{font-weight:500;background:${T.lime};padding:0 3px}
.poster .sub{margin-top:12px;color:${T.body};font-size:14px}
.poster .sub a{color:${T.ink};font-weight:500;text-decoration:underline;text-underline-offset:3px}
.chart{flex:1;display:flex;flex-direction:column;justify-content:flex-end;padding-top:28px}
.chart .cap{display:flex;justify-content:space-between;align-items:baseline;gap:12px;color:${T.body};font-size:13px}
.chart .cap b{color:${T.ink};font-weight:500;font-size:14px}
.chart .bars{display:flex;align-items:flex-end;gap:4px;height:96px;flex:1;max-height:160px;margin-top:12px;border-bottom:1px solid ${T.ink}}
.chart .bars i{flex:1;display:block;background:${T.ink};min-height:2px;opacity:.72}
.chart .bars i.hot{background:${T.hot};opacity:1}
.chart .bars i.zero{background:${T.rule};opacity:.5}
.chart .axis{display:flex;justify-content:space-between;color:${T.muted};font:500 9.5px/1.4 ${TEXT};letter-spacing:.24em;text-transform:uppercase;margin-top:8px}
.chart .none{height:96px;margin-top:12px;display:flex;align-items:center;justify-content:center;color:${T.muted};font-size:13.5px}
.poster .facts{display:flex;flex-wrap:wrap;gap:6px 22px;margin-top:18px;color:${T.body};font-size:13.5px}
.poster .facts b{color:${T.ink};font-weight:500}
.ask{border-top:1px solid ${T.ink};padding:18px 0 0;display:flex;flex-direction:column}
.ask .label{margin-bottom:14px}
.ask .money{font:300 44px/1 ${TEXT};letter-spacing:-.03em;color:${T.ink}}
.ask .money span{font-size:16px;font-weight:400;color:${T.body};letter-spacing:0}
.ask .k{color:${T.body};font-size:14px;margin-top:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.ask .days{margin-top:24px;font:300 30px/1 ${TEXT};letter-spacing:-.02em}
.ask .days span{font-size:14.5px;font-weight:400;color:${T.body};letter-spacing:0}
.ask .days.warn{color:${T.amber}}
.ask .days.off{color:#b3420f}
.ask .line{color:${T.body};font-size:13.5px;margin-top:8px}
.track{height:10px;margin:14px 0 0}
.ask .goal{display:flex;justify-content:space-between;color:${T.muted};font-size:12px;margin-top:6px}
.ask .btn{margin-top:auto}
.ask .stats+.btn{margin-top:20px}
.ask .btn+.fine{margin-top:12px}
.sec{padding-top:64px}
.sec>h2{display:flex;align-items:baseline;gap:24px;font:400 26px/1.2 ${DISPLAY};letter-spacing:-.03em;color:#000;margin-bottom:24px}
.sec>h2::after{content:"";flex:1;height:1px;background:${T.rule};align-self:center}
.sec>h2 small{order:2;font:500 9.5px/1.4 ${TEXT};letter-spacing:.3em;text-transform:uppercase;color:${T.muted}}
.about{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:48px;align-items:start}
.about .pic{aspect-ratio:1;background:${T.panel};box-shadow:inset 0 0 0 1px ${T.line}}
.prose{font-size:16px}
.progress{display:flex;height:10px;background:${T.stone};gap:2px}
.progress i{display:block;height:100%}
.progress i.done{background:#b9dd3a}
.progress i.active{background:${T.hot}}
.progress i.ahead{background:${T.rule}}
.legend{display:flex;flex-wrap:wrap;gap:8px 24px;margin-top:12px;font-size:13.5px;color:${T.body}}
.legend b{color:${T.ink};font-weight:500}
.legend i{display:inline-block;width:9px;height:9px;margin-right:8px;vertical-align:0}
.legend i.done{background:#b9dd3a}.legend i.active{background:${T.hot}}.legend i.ahead{background:${T.rule}}
.promises{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:32px}
.promises h3{font:500 10px/1.4 ${TEXT};letter-spacing:.28em;text-transform:uppercase;color:${T.muted};margin-bottom:14px}
.timeline{position:relative;padding-left:26px}
.timeline:before{content:"";position:absolute;left:6px;top:6px;bottom:6px;width:1px;background:${T.rule}}
.timeline .row{position:relative;border-top:0;padding:0 0 16px}
.timeline .row:before{content:"";position:absolute;left:-26px;top:5px;width:13px;height:13px;border-radius:50%;background:${T.lime};box-shadow:0 0 0 4px ${T.wash}}
.timeline .row.hot:before{background:${T.hot}}
.timeline .row.ahead:before{background:${T.stone};box-shadow:0 0 0 4px ${T.wash},inset 0 0 0 1px ${T.rule}}
.timeline .row .t{white-space:normal}
.ups{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.up{display:flex;flex-direction:column;padding:18px 20px;background:${T.panel};border:1px solid ${T.line}}
.up.shipped{border-top:3px solid #b9dd3a}
.up .label{margin-bottom:10px}
.up h3{font-size:16px;font-weight:500;line-height:1.35}
.up .t{color:${T.body};font-size:13.5px;line-height:1.55;margin-top:8px;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
.up .more{margin-top:auto;padding-top:12px}
#updates>.more{margin-top:18px}
.band-cta{display:flex;align-items:center;justify-content:space-between;gap:24px;margin-top:80px;padding:34px 36px;background:${T.lilac}}
.band-cta p{font:400 22px/1.35 ${TEXT};color:${T.ink};max-width:32ch}
.band-cta a{font-size:14px;text-decoration:underline;text-underline-offset:3px}
.foot{margin-top:0}
${PATRONAGE_STYLES}
@media(max-width:900px){.ups{grid-template-columns:1fr}.ident{grid-template-columns:var(--oa-gutter) minmax(0,1fr) var(--oa-gutter)}.ident .who{padding:32px 0 28px}.ident .pic{grid-column:1 / -1;min-height:0;height:180px}.ident .pic .cap.t{top:12px}.ident .pic .cap.b{bottom:12px}.facts-strip>*{padding:0 14px}.facts-strip .faces{margin-left:0}.hero{grid-template-columns:1fr}.poster{min-height:0}.poster .line{font-size:17px}.chart .bars{height:72px}.about{grid-template-columns:1fr}.about .pic,.sec>h2 small{display:none}.promises{grid-template-columns:1fr}.band-cta{flex-direction:column;align-items:flex-start;padding:26px 22px}.sec{padding-top:48px}}
@media(max-width:480px){.ask .money{font-size:38px}}
`;

const av = (p: Patron) => (safeUrl(p.avatar_url) ? <img src={safeUrl(p.avatar_url)} alt="" /> : <span class="ph" />);
const chip = (p: Patron) => <a class="chip" href={safeUrl(p.url) ?? `https://github.com/${encodeURIComponent(p.login)}`}>{av(p)}{p.name ?? p.login}{p.amount_label ? <small>{p.amount_label}</small> : null}</a>;
const runwayOf = (v: ProjectView): number | null => (v.runway_days !== null && Number.isFinite(v.runway_days) ? Math.round(v.runway_days) : null);

// The metered days: one bar per day of spend. The one honest picture of a
// project that builds itself.
function Chart({ d }: { d: LandingData }) {
  const last = d.daily.slice(-30);
  const total = d.daily.reduce((a, b) => a + b, 0);
  const week = last.slice(-7).reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...last);
  return (
    <div class="chart">
      <div class="cap"><span>Metered spend, day by day</span><span><b>{usd(week)}</b> this week · {usd(total)} all time</span></div>
      {last.length ? <>
        <div class="bars">{last.map((c, i) => { const ago = last.length - 1 - i; return <i class={`${c <= 0 ? 'zero' : ago === 0 ? 'hot' : ''}`} style={`height:${Math.max(3, Math.round((c / max) * 100))}%`} title={`${usd(c)}${ago === 0 ? ' today' : ` ${ago} day${ago === 1 ? '' : 's'} ago`}`} />; })}</div>
        <div class="axis"><span>{last.length === 1 ? 'today' : `${last.length - 1} days ago`}</span><span>today</span></div>
      </> : <div class="none">{standingOf(d.v, d.live) === 'unfunded' ? 'The first gift starts the meter.' : 'No metered days yet.'}</div>}
    </div>
  );
}

// The media: the agent at work. What it is doing this minute, or what it last did, over its metered days.
function Poster({ d }: { d: LandingData }) {
  const a = d.v.account;
  const standing = standingOf(d.v, d.live);
  const first = d.sessions.find((s) => d.live.includes(s.key));
  const last = d.sessions.find((s) => s.status === 'ended' && s.kind === 'run' && s.report && s.report !== '[SILENT]') ?? d.sessions.find((s) => s.status === 'ended' && s.kind === 'run');
  const shipped = d.roadmap.items.filter((i) => tenseOf(i) === 'past').sort((x, y) => Date.parse(y.done_at ?? '') - Date.parse(x.done_at ?? '') || 0)[0];
  const runs = d.sessions.filter((s) => s.kind === 'run').length;
  const door = d.dashboard ? <a href={at(a, 'dashboard')}>Open the dashboard →</a> : null;
  let head: string, line: unknown, sub: unknown;
  if (standing === 'paused' || standing === 'requested') {
    head = standing === 'paused' ? 'Paused by the owner' : 'Pause requested';
    line = d.v.control?.desired?.reason ? <>“{d.v.control.desired.reason}”</> : 'The scheduled work is paused.';
    sub = <>{d.v.control?.desired?.at ? `since ${fmtAgo(d.v.control.desired.at, d.now)}` : ''}{last ? ` · last run ${fmtAgo(last.started_at, d.now)}` : ''}{door ? <> · {door}</> : null}</>;
  } else if (first) {
    head = 'Working now';
    line = <>Running <b>{first.source ?? first.kind}</b>{first.item_id ? <> on <b>{d.roadmap.items.find((i) => i.id === first.item_id)?.title ?? first.item_id}</b></> : null}, <b>{fmtDur(first.started_at, undefined, d.now)}</b> in.</>;
    sub = <>{first.turn_count} turns · {usd(first.usd_cents)} metered so far{door ? <> · {door}</> : null}</>;
  } else if (last) {
    head = 'The last run';
    line = last.report && last.report !== '[SILENT]' ? <>“{firstLine(last.report, 150)}”</> : <>{last.source ?? last.kind} ran {fmtAgo(last.started_at, d.now)}.</>;
    sub = <>{fmtAgo(last.started_at, d.now)} · {usd(last.usd_cents)} metered{door ? <> · {door}</> : null}</>;
  } else {
    head = 'The workshop';
    line = standing === 'unfunded' ? 'Waiting for its first funds.' : 'Waiting for its first run.';
    sub = door;
  }
  const still = !(first && standing === 'live');
  return (
    <div class="poster">
      {raw(lattice(`${a}:poster`, 400, 400, false))}
      <div class="head"><span class={`p${still ? ' still' : ''}`} />{head}{standing === 'exhausted' || standing === 'unfunded' ? <Pill standing={standing} /> : null}</div>
      <div class="line">{line}</div>
      <div class="sub">{sub}</div>
      <Chart d={d} />
      <div class="facts">
        {shipped ? <span>Last shipped <b>{shipped.title}</b>{shipped.done_at ? ` · ${fmtAgo(shipped.done_at, d.now)}` : ''}</span> : null}
        <span>{runs ? <><b>{runs}</b> recent runs</> : 'Every call metered'}</span>
      </div>
    </div>
  );
}

// The money, Kickstarter's panel: what comes in a month (or what the books hold), from whom; how long it lasts
// against the owner's goal; the button.
function Ask({ d }: { d: LandingData }) {
  const standing = standingOf(d.v, d.live);
  const runway = runwayOf(d.v);
  const goal = d.v.goal_days;
  const frac = runway === null ? 0 : Math.max(0, Math.min(1, runway / goal));
  const tone = standing === 'exhausted' ? 'off' : runway !== null && runway < goal / 3 ? 'warn' : '';
  const monthly = d.patronage.monthly_usd_cents;
  const n = d.patronage.patron_count;
  const faces = d.patronage.patrons.slice(0, 5);
  return (
    <div class="ask" id="ask">
      <p class="label">{monthly > 0 ? 'Ongoing support' : 'The books'}</p>
      <div class="money">{monthly > 0 ? <>{usd0(monthly)}<span> a month</span></> : <>{usd(d.v.balance_usd_cents)}<span> in the bank</span></>}</div>
      <div class="k">{faces.length ? <span class="stack">{faces.map(av)}</span> : null}<span>{n === 0 ? 'no patrons yet; the first name goes on the wall' : `from ${n} ${n === 1 ? 'patron' : 'patrons'}`}</span></div>
      <div class={`days ${tone}`}>{standing === 'exhausted' ? <>0<span> days of runway</span></> : runway === null ? <>—<span> no burn to measure yet</span></> : runway > 365 ? <>1+<span> year of runway</span></> : <>{runway}<span> {runway === 1 ? 'day' : 'days'} of runway</span></>}</div>
      <div class="line">{standing === 'exhausted' ? 'The balance is spent; nothing on the platform can be spent until money comes in.' : runway === null ? 'No runs yet.' : `at its current burn of ${usd(d.v.burn_per_day_usd_cents)} a day`}</div>
      <div class="track"><div class={`fill ${tone}`} style={`width:${Math.round(frac * 100)}%`} /></div>
      <div class="goal"><span>0</span><span>goal: {goal} days</span></div>
      <div class="stats">
        <div class="stat"><div class="v">{usd(d.v.granted_in_usd_cents)}</div><div class="l">received</div></div>
        <div class="stat"><div class="v">{usd(d.v.consumed_usd_cents)}</div><div class="l">spent</div></div>
        <div class="stat"><div class="v">{usd(d.v.balance_usd_cents)}</div><div class="l">balance</div></div>
      </div>
      <a class="btn wide" href="#tiers">Back this project<span class="arr">→</span></a>
      <p class="fine">Every cent is metered on public books.{d.dashboard ? <> <a href={at(d.v.account, 'dashboard', 'books')}>See the books →</a></> : null}</p>
    </div>
  );
}

// The promises as one bar: shipped, in progress, ahead; then the nearest of each on a timeline.
function Promises({ d }: { d: LandingData }) {
  const a = d.v.account;
  const items = d.roadmap.items;
  const done = items.filter((i) => tenseOf(i) === 'past');
  const active = items.filter((i) => i.status === 'active');
  const ahead = items.filter((i) => tenseOf(i) !== 'past' && i.status !== 'active');
  const total = Math.max(1, items.length);
  const pct = (n: number) => `${(n / total) * 100}%`;
  const next = [...active, ...ahead].slice(0, 5);
  const shipped = done.sort((x, y) => Date.parse(y.done_at ?? '') - Date.parse(x.done_at ?? '') || 0).slice(0, 5);
  return (
    <section class="sec">
      <h2>The roadmap<small>Promises, then proof</small></h2>
      {items.length ? <>
        <div class="progress">{done.length ? <i class="done" style={`width:${pct(done.length)}`} /> : null}{active.length ? <i class="active" style={`width:${pct(active.length)}`} /> : null}{ahead.length ? <i class="ahead" style={`width:${pct(ahead.length)}`} /> : null}</div>
        <div class="legend"><span><i class="done" /><b>{done.length}</b> shipped</span><span><i class="active" /><b>{active.length}</b> in progress</span><span><i class="ahead" /><b>{ahead.length}</b> ahead</span></div>
      </> : null}
      <div class="promises">
        <div><h3>Next up</h3>{next.length ? <ul class="rows timeline">{next.map((i) => <li class={`row ${i.status === 'active' ? 'hot' : 'ahead'}`}><span class="t">{i.title}</span><span class={`n${i.status === 'active' ? ' hot' : ''}`}>{i.status === 'active' ? 'in progress' : i.release ?? 'planned'}</span></li>)}</ul> : <p class="empty">Nothing promised yet.</p>}</div>
        <div><h3>Recently shipped</h3>{shipped.length ? <ul class="rows timeline">{shipped.map((i) => <li class="row"><span class="t">{i.title}</span><span class="n k">{i.done_at ? fmtAgo(i.done_at, d.now) : 'shipped'}</span></li>)}</ul> : <p class="empty">Nothing shipped yet.</p>}</div>
      </div>
      {d.dashboard ? <a class="more" href={at(a, 'dashboard', 'board')}>The whole board<span>→</span></a> : null}
    </section>
  );
}

// What shipped and what the runs reported, newest first; the same list the project's feed serves.
function Updates({ d }: { d: LandingData }) {
  const a = d.v.account;
  const ups = updatesOf(d.sessions, d.roadmap, 6);
  return (
    <section class="sec" id="updates">
      <h2>Recent updates<small>As the agent published them</small></h2>
      {ups.length ? <div class="ups">{ups.map((u) => (
        <article class={`up ${u.kind}`}>
          <p class="label">{fmtAgo(u.ts, d.now)} · {u.kind === 'shipped' ? 'Shipped' : 'Run report'}</p>
          <h3>{u.title}</h3>
          {u.text ? <p class="t">{u.text}</p> : null}
          {u.kind === 'shipped' && u.item && d.dashboard ? <a class="more" href={at(a, 'dashboard', 'board', u.item)}>On the board<span>→</span></a> : null}
        </article>
      ))}</div> : <p class="empty">Nothing published yet. What ships and what each run reports will appear here.</p>}
      <a class="more" href={at(a, 'updates.xml')}>Follow in a feed reader<span>→</span></a>
    </section>
  );
}

// The band's picture: the cover the project published, or its own drawing.
function IdentPic({ d }: { d: LandingData }) {
  const cover = safeUrl(d.v.profile.cover_url);
  return cover ? <img src={cover} alt="" /> : raw(art(d.v.account));
}

export function Landing(d: LandingData) {
  const a = d.v.account;
  const lead = leadParagraphs(d.v.profile.about_md, 3);
  const jobs = ((): string[] => { try { const j = JSON.parse(d.v.profile.schedule_json ?? '{}') as { jobs?: Array<{ name?: string; schedule?: string }> }; return (j.jobs ?? []).slice(0, 3).map((x) => `${x.name ?? 'job'} ${x.schedule ?? ''}`.trim()); } catch { return []; } })();
  const harness = d.v.profile.agent_harness === 'hermes' ? 'Hermes agent' : d.v.profile.agent_harness;
  const runway = runwayOf(d.v);
  const faces = d.patronage.patrons.slice(0, 6);
  return (
    <>
      <TopBar brand={d.brand} nav={whoNav(d.who, at(a))} cta={<a class="btn small" href="#tiers">Back this project</a>} />
      <div class="ident" data-ground={groundOf(a)}>
        <div class="who">
          <p class="label">{[harness, d.v.profile.agent_model, ...jobs].filter(Boolean).join('  /  ')}</p>
          <h1>{nameOf(a)}</h1>
          <p class="tag">{d.v.profile.tagline ?? `${nameOf(a)}, building itself in the open.`}</p>
          <div class="acts">
            <a class="btn" href="#tiers">Back this project<span class="arr">→</span></a>
            {d.dashboard ? <a class="btn quiet" href={at(a, 'dashboard')}>Open the dashboard</a> : null}
            <a class="gh" href={`https://github.com/${a}`} target="_blank" rel="noopener">GitHub ↗</a>
          </div>
        </div>
        <div class="pic"><IdentPic d={d} /><span class="cap t">Built<br />in the<br />open</span><span class="cap b">Every call<br />metered</span></div>
      </div>
      <div class="page">
        <div class="facts-strip">
          <div class="who"><img src={`https://github.com/${encodeURIComponent(ownerOf(a))}.png?size=88`} alt="" /><div><small>Maintained by</small><b>{ownerOf(a)}</b></div></div>
          <div class="fig"><b>{d.patronage.patron_count}</b><small>{d.patronage.patron_count === 1 ? 'patron' : 'patrons'}</small></div>
          <div class="fig"><b>{usd0(d.patronage.monthly_usd_cents)}</b><small>per month</small></div>
          <div class="fig"><b>{runway === null ? '—' : runway > 365 ? '1y+' : `${runway}d`}</b><small>runway</small></div>
          <div class="fig"><b>{usd(d.v.consumed_usd_cents)}</b><small>spent, all metered</small></div>
          {faces.length ? <div class="faces"><span class="stack">{faces.map(av)}</span><small>{d.patronage.patron_count > faces.length ? `+${d.patronage.patron_count - faces.length} more` : 'on the wall'}</small></div> : null}
        </div>
        <div class="hero">
          <Poster d={d} />
          <Ask d={d} />
        </div>
        <section class="sec">
          <h2>About {nameOf(a)}<small>What it is</small></h2>
          <div class="about">
            <div>
              {lead ? <div class="prose" dangerouslySetInnerHTML={{ __html: mdToSafeHtml(lead) }} /> : <p class="empty">This project has not published what it is yet.</p>}
              {(d.v.profile.about_md ?? '').trim().length > lead.length ? <a class="more" href={at(a, 'about')}>Read the whole story<span>→</span></a> : null}
            </div>
            <div class="pic">{raw(rings(`${a}:about`))}</div>
          </div>
        </section>
        <section class="sec" id="tiers">
          <h2>Back the project<small>Every cent on public books</small></h2>
          <Tiers tiers={d.patronage.tiers} owner={ownerOf(a)} account={a} sponsor={d.sponsor} polar={d.polar} burn={d.v.burn_per_day_usd_cents * 30} />
        </section>
        <Promises d={d} />
        <Updates d={d} />
        <section class="sec">
          <h2>Patrons<small>{d.patronage.patron_count ? `${d.patronage.patron_count} so far` : 'Be the first'}</small></h2>
          {d.patronage.patrons.length ? <div class="wall">{d.patronage.patrons.map(chip)}</div> : <p class="empty">No one has backed {nameOf(a)} yet. The first name goes here.</p>}
        </section>
        <div class="band-cta"><p>Software that builds itself, funded by the people who want it.</p><a href="/">Discover more projects on {d.brand} →</a></div>
      </div>
      <Foot brand={d.brand} nav={whoNav(d.who, at(a))} />
    </>
  );
}

// The whole story: the project's document in full, in the landing page's dress, for the reader who wants it all.
export function About(d: LandingData) {
  const a = d.v.account;
  return (
    <>
      <TopBar brand={d.brand} nav={whoNav(d.who, at(a, 'about'))} cta={<a class="btn small" href={at(a)}>{nameOf(a)} →</a>} />
      <div class="ident" data-ground={groundOf(a)}>
        <div class="who"><p class="label">The whole story</p><h1>{nameOf(a)}</h1><p class="tag">{d.v.profile.tagline ?? ''}</p></div>
        <div class="pic"><IdentPic d={d} /></div>
      </div>
      <div class="page">
        {d.v.profile.about_md?.trim() ? <div class="prose" style="margin-top:40px" dangerouslySetInnerHTML={{ __html: mdToSafeHtml(d.v.profile.about_md) }} /> : <p class="empty" style="margin-top:40px">This project has not published what it is yet.</p>}
      </div>
      <Foot brand={d.brand} nav={whoNav(d.who, at(a, 'about'))} />
    </>
  );
}

export function landingDocument(title: string, brand: string, body: string, meta: PageMeta = {}): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="preconnect" href="https://fonts.googleapis.com"><link href="${FONTS}" rel="stylesheet">${headMeta(title, brand, meta)}<style>${LANDING_CSS}</style></head><body>${body}</body></html>`;
}

// The page as the core's router asks for it: the core's records and who is looking, the platform's patronage.
// The dashboard is offered to whoever the owner admits to its overview.
export function landingPage(base: LandingBase, p: { brand: string; patronage: PatronageView; polar: boolean; sponsor: string }): string {
  const d: LandingData = { brand: p.brand, v: base.view, sessions: base.sessions, live: base.live, roadmap: base.roadmap, daily: base.daily, patronage: p.patronage, polar: p.polar, sponsor: p.sponsor, now: base.now, who: base.who, dashboard: sees(base.role, base.visibility.overview) };
  const description = base.view.profile.tagline ?? `${nameOf(base.account)}, building itself in the open. Every session and every cent on public books.`;
  return landingDocument(base.about ? `About · ${nameOf(base.account)}` : nameOf(base.account), p.brand, render(base.about ? About(d) : Landing(d)), { description, feed: at(base.account, 'updates.xml'), ...(sees('public', base.visibility.overview) ? { image: `${base.origin}${at(base.account, 'card.png')}` } : {}) });
}
