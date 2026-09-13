// The landing page: a project as an outsider meets it. Product Hunt's top (the icon, the name, the one line, the
// tags, two buttons) over Kickstarter's campaign (the media on the left, the money on the right, the story and the
// promises below, the rewards beside them). No cover band: software has no honest picture for one. The media is
// the agent at work, the only picture a self-building project can show: what it is doing this minute and its
// metered days. Everything deeper (transcripts, every call, the agent's setup, the owner's control) is the
// dashboard's, a link away for whoever the owner admits.
import { tenseOf, type Roadmap } from '@open-autonomy/sdk/roadmap';
import type { LandingBase, ProjectView, SessionSummary } from '@open-autonomy/backend';
import { esc, fmtAgo, fmtDur, mdToSafeHtml, render, usd, usd0 } from '@open-autonomy/backend/ui';
import { Foot, Pill, TopBar, at, firstLine, leadParagraphs, nameOf, ownerOf, safeUrl, standingOf } from '@open-autonomy/backend/page/parts';
import { T, FONTS } from '@open-autonomy/backend/page/theme';
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

// The landing page's own sheet, from the core's tokens. The hero is a poster and a money panel; the rest is one
// wide column of story and promises with the rewards pinned beside it.
export const LANDING_CSS = `
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:${T.wash};color:${T.ink};font:15.5px/1.55 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
a:hover{text-decoration:underline;text-underline-offset:3px}
h1,h2,h3,p,ul,ol{margin:0}
ul,ol{padding:0;list-style:none}
.topbar{background:${T.panel};border-bottom:1px solid ${T.line};position:sticky;top:0;z-index:5}
.topbar .in{max-width:1120px;margin:0 auto;padding:0 24px;height:60px;display:flex;align-items:center;gap:22px}
.brand{display:flex;align-items:center;gap:9px;font-weight:800;font-size:17px;letter-spacing:-.01em;white-space:nowrap}
.brand svg{width:24px;height:24px}
.topbar nav{display:flex;gap:18px;color:${T.muted};font-weight:500;white-space:nowrap}
.topbar .grow{flex:1}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:44px;padding:0 22px;border-radius:12px;border:1.5px solid ${T.accent};background:${T.accent};color:#fff;font-weight:700;font-size:15px;white-space:nowrap;cursor:pointer}
.btn:hover{background:${T.accentInk};border-color:${T.accentInk};text-decoration:none}
.btn.quiet{background:#fff;color:${T.ink};border-color:${T.line}}
.btn.quiet:hover{background:${T.wash}}
.btn.wide{width:100%}
.btn.small{height:32px;padding:0 12px;font-size:13px;border-radius:999px}
.page{max-width:1120px;margin:0 auto;padding:0 24px 72px}
.ident{display:grid;grid-template-columns:88px minmax(0,1fr) auto;gap:22px;align-items:center;padding:36px 12px 0}
.ident .avatar{width:88px;height:88px;border-radius:22px;border:1px solid ${T.line};background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.06);object-fit:cover}
.ident .who{min-width:0}
.ident h1{font-family:Fraunces,Georgia,serif;font-size:40px;font-weight:600;letter-spacing:-.02em;line-height:1.05;font-variation-settings:"opsz" 40}
.ident .tag{font-size:17px;line-height:1.4;color:${T.body};margin-top:6px;max-width:70ch}
.ident .tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
.ident .tags span{display:inline-flex;align-items:center;height:26px;padding:0 10px;border-radius:8px;background:#fff;border:1px solid ${T.line};font-size:12.5px;font-weight:600;color:${T.body}}
.ident .tags span.k{background:${T.wash}}
.ident .acts{display:flex;gap:10px;align-self:center}
.pill{display:inline-flex;align-items:center;gap:7px;height:30px;padding:0 12px 0 10px;border-radius:999px;font-size:13px;font-weight:600;background:${T.wash};color:${T.body};border:1px solid ${T.line}}
.pill .dot{width:8px;height:8px;border-radius:50%;background:${T.gray}}
.pill.live{background:${T.greenWash};color:${T.green};border-color:transparent}
.pill.live .dot{background:${T.green};box-shadow:0 0 0 0 rgba(10,135,84,.5);animation:pulse 1.6s infinite}
.pill.ok .dot{background:${T.green}}
.pill.warn{background:${T.amberWash};color:${T.amber};border-color:transparent}
.pill.warn .dot{background:${T.amber}}
.pill.off{background:${T.accentWash};color:${T.accentInk};border-color:transparent}
.pill.off .dot{background:${T.accent}}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(10,135,84,.45)}70%{box-shadow:0 0 0 8px rgba(10,135,84,0)}100%{box-shadow:0 0 0 0 rgba(10,135,84,0)}}
.hero{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:24px;margin-top:28px;align-items:stretch}
.poster{background:#1b171d;color:#f2efea;border-radius:22px;padding:26px 28px 24px;position:relative;overflow:hidden;box-shadow:0 24px 50px -28px rgba(27,23,29,.6);display:flex;flex-direction:column;min-height:380px}
.poster:before{content:"";position:absolute;inset:auto -80px -160px auto;width:360px;height:360px;border-radius:50%;background:radial-gradient(circle, rgba(255,66,77,.34), transparent 65%);pointer-events:none}
.poster .head{display:flex;align-items:center;gap:10px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#b9b3ad}
.poster .head .p{width:8px;height:8px;border-radius:50%;background:${T.accent};box-shadow:0 0 0 0 rgba(255,66,77,.6);animation:pulse2 1.5s infinite}
.poster .head .p.still{background:#6f6a72;animation:none;box-shadow:none}
.poster .head .pill{margin-left:auto;height:26px;font-size:12px}
@keyframes pulse2{0%{box-shadow:0 0 0 0 rgba(255,66,77,.55)}70%{box-shadow:0 0 0 9px rgba(255,66,77,0)}100%{box-shadow:0 0 0 0 rgba(255,66,77,0)}}
.poster .line{margin-top:14px;font-family:Fraunces,Georgia,serif;font-size:27px;line-height:1.25;font-weight:500;max-width:30ch;font-variation-settings:"opsz" 27}
.poster .line b{font-weight:600;color:#fff}
.poster .sub{margin-top:10px;color:#b9b3ad;font-size:14px}
.poster .sub a{color:#f2efea;font-weight:600}
.chart{flex:1;display:flex;flex-direction:column;justify-content:flex-end;padding-top:26px;position:relative}
.chart .cap{display:flex;justify-content:space-between;align-items:baseline;color:#b9b3ad;font-size:12.5px;letter-spacing:.02em}
.chart .cap b{color:#fff;font-weight:700;font-size:14px}
.chart .bars{display:flex;align-items:flex-end;gap:4px;height:96px;flex:1;max-height:170px;margin-top:10px;border-bottom:1px solid rgba(255,255,255,.12);padding-bottom:1px}
.chart .bars i{flex:1;display:block;background:rgba(255,66,77,.32);border-radius:3px 3px 0 0;min-height:3px;position:relative}
.chart .bars i.hot{background:${T.accent}}
.chart .bars i.zero{background:rgba(255,255,255,.08)}
.chart .axis{display:flex;justify-content:space-between;color:#8f8891;font-size:11.5px;margin-top:6px}
.chart .none{height:96px;margin-top:10px;border:1px dashed rgba(255,255,255,.16);border-radius:10px;display:flex;align-items:center;justify-content:center;color:#8f8891;font-size:13.5px}
.poster .facts{display:flex;flex-wrap:wrap;gap:6px 22px;margin-top:16px;color:#d9d3cc;font-size:13.5px}
.poster .facts b{color:#fff}
.ask{background:${T.panel};border:1px solid ${T.line};border-radius:22px;padding:26px 26px 24px;display:flex;flex-direction:column}
.ask .money{font-family:Fraunces,Georgia,serif;font-size:46px;font-weight:600;letter-spacing:-.02em;line-height:1;color:${T.green};font-variation-settings:"opsz" 46}
.ask .money span{font-size:16px;font-weight:600;color:${T.muted};letter-spacing:0;font-family:Inter,sans-serif}
.ask .k{color:${T.body};font-size:14.5px;margin-top:8px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.stack{display:inline-flex;align-items:center}
.stack img,.stack .ph{width:26px;height:26px;border-radius:50%;border:2px solid #fff;background:${T.wash};margin-left:-8px;object-fit:cover}
.stack img:first-child,.stack .ph:first-child{margin-left:0}
.ask .days{margin-top:22px;font-family:Fraunces,Georgia,serif;font-size:34px;font-weight:600;letter-spacing:-.015em;line-height:1;font-variation-settings:"opsz" 34}
.ask .days span{font-size:15px;font-weight:600;color:${T.muted};letter-spacing:0;font-family:Inter,sans-serif}
.ask .days.warn{color:${T.amber}}
.ask .days.off{color:${T.accentInk}}
.ask .line{color:${T.body};font-size:14px;margin-top:6px}
.track{height:10px;border-radius:999px;background:${T.wash};margin:12px 0 0;overflow:hidden}
.track .fill{height:100%;border-radius:999px;background:${T.green}}
.track .fill.warn{background:${T.amber}}
.track .fill.off{background:${T.accent}}
.ask .goal{display:flex;justify-content:space-between;color:${T.muted};font-size:12px;margin-top:6px}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:18px}
.stat{background:${T.wash};border-radius:12px;padding:10px 12px}
.stat .v{font-weight:700;font-size:15px}
.stat .l{color:${T.muted};font-size:12px;margin-top:1px}
.ask .btn{margin-top:auto}
.ask .btn+.fine{margin-top:12px}
.fine{color:${T.muted};font-size:12.5px;margin-top:10px;line-height:1.45}
.fine a{color:${T.accentInk};font-weight:600;white-space:nowrap}
.cols{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:36px;margin-top:48px;align-items:start}
.side{position:sticky;top:76px;display:flex;flex-direction:column;gap:16px}
.main{display:flex;flex-direction:column;gap:44px;min-width:0;padding:0 12px}
.sec h2{font-family:Fraunces,Georgia,serif;font-size:26px;font-weight:600;letter-spacing:-.015em;margin-bottom:14px;font-variation-settings:"opsz" 26}
.sec h2 small{font-family:Inter,sans-serif;font-size:13px;font-weight:600;color:${T.muted};letter-spacing:.06em;text-transform:uppercase;margin-left:12px}
.prose{color:${T.body};font-size:16.5px;line-height:1.65}
.prose p+p{margin-top:12px}
.prose b,.prose strong{color:${T.ink}}
.more{display:inline-block;margin-top:12px;color:${T.accentInk};font-weight:600;font-size:14.5px}
.progress{display:flex;height:14px;border-radius:999px;overflow:hidden;background:${T.line};gap:2px}
.progress i{display:block;height:100%}
.progress i.done{background:${T.green}}
.progress i.active{background:${T.accent}}
.progress i.ahead{background:${T.faint}}
.legend{display:flex;flex-wrap:wrap;gap:8px 20px;margin-top:10px;font-size:13.5px;color:${T.body}}
.legend b{color:${T.ink};font-weight:700}
.legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:7px;vertical-align:-1px}
.legend i.done{background:${T.green}}
.legend i.active{background:${T.accent}}
.legend i.ahead{background:${T.faint}}
.promises{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:22px}
.promises h3{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${T.muted};margin-bottom:10px}
.rows{display:flex;flex-direction:column}
.row{display:flex;align-items:baseline;gap:14px;padding:11px 0;border-top:1px solid ${T.line}}
.row:first-child{border-top:0;padding-top:0}
.row .t{flex:1;min-width:0;font-weight:500;color:${T.ink}}
.row .n{flex:none;color:${T.muted};font-size:13px;white-space:nowrap}
.row .n.k{color:${T.green};font-weight:600}
.row .n.hot{color:${T.accentInk};font-weight:600}
.empty{color:${T.muted};font-size:14.5px}
.wall{display:flex;flex-wrap:wrap;gap:10px}
.chip{display:inline-flex;align-items:center;gap:10px;height:44px;padding:0 16px 0 5px;border-radius:999px;border:1px solid ${T.line};background:#fff;font-size:14px;font-weight:600}
.chip img{width:34px;height:34px;border-radius:50%}
.chip .ph{width:34px;height:34px;border-radius:50%;background:${T.wash}}
.chip small{color:${T.muted};font-weight:500;font-size:12.5px}
.card{background:${T.panel};border:1px solid ${T.line};border-radius:20px;padding:22px 24px}
.card h2{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${T.muted};margin-bottom:14px}
.form{display:flex;flex-direction:column;gap:8px}
.form input{height:38px;border:1px solid ${T.line};border-radius:10px;padding:0 12px;font:inherit;font-size:14px}
.form .fine{color:${T.muted};font-size:12.5px;line-height:1.45}
.foot{margin-top:56px;padding:0 12px;color:${T.muted};font-size:13px;display:flex;gap:16px;flex-wrap:wrap}
${PATRONAGE_STYLES}
@media(max-width:900px){.ident{grid-template-columns:64px 1fr;gap:14px;padding-top:24px}.ident .avatar{width:64px;height:64px;border-radius:16px}.ident h1{font-size:30px}.ident .tag{font-size:15.5px}.ident .acts{grid-column:1/-1;flex-wrap:wrap}.ident .acts .btn{flex:1}.hero{grid-template-columns:1fr;margin-top:22px}.poster{min-height:0;padding:22px 20px 20px}.poster .line{font-size:22px}.chart .bars{height:72px}.cols{grid-template-columns:1fr;margin-top:36px}.side{position:static}.promises{grid-template-columns:1fr}.main{gap:34px}.sec h2 small{display:block;margin:4px 0 0}}
@media(max-width:480px){.topbar .in{gap:12px;padding:0 14px}.topbar nav{gap:12px;font-size:14px}.brand{font-size:15px}.brand svg{width:20px;height:20px}.topbar .btn.small{display:none}.ask{padding:20px 18px}.ask .money{font-size:38px}}
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
      <div class="money">{monthly > 0 ? <>{usd0(monthly)}<span> a month</span></> : <>{usd(d.v.balance_usd_cents)}<span> in the bank</span></>}</div>
      <div class="k">{faces.length ? <span class="stack">{faces.map(av)}</span> : null}<span>{n === 0 ? 'no patrons yet; the first name goes on the wall' : `from ${n} ${n === 1 ? 'patron' : 'patrons'}`}</span></div>
      <div class={`days ${tone}`}>{standing === 'exhausted' ? <>0<span> days of runway</span></> : runway === null ? <>—<span> no burn to measure yet</span></> : runway > 365 ? <>1+<span> year of runway</span></> : <>{runway}<span> {runway === 1 ? 'day' : 'days'} of runway</span></>}</div>
      <div class="line">{standing === 'exhausted' ? 'The balance is spent; the next gift starts the agent again.' : runway === null ? 'No runs yet.' : `at its current burn of ${usd(d.v.burn_per_day_usd_cents)} a day`}</div>
      <div class="track"><div class={`fill ${tone}`} style={`width:${Math.round(frac * 100)}%`} /></div>
      <div class="goal"><span>0</span><span>goal: {goal} days</span></div>
      <div class="stats">
        <div class="stat"><div class="v">{usd(d.v.granted_in_usd_cents)}</div><div class="l">received</div></div>
        <div class="stat"><div class="v">{usd(d.v.consumed_usd_cents)}</div><div class="l">spent</div></div>
        <div class="stat"><div class="v">{usd(d.v.balance_usd_cents)}</div><div class="l">balance</div></div>
      </div>
      <a class="btn wide" href="#tiers">Back this project</a>
      <p class="fine">Every cent is metered on public books.{d.dashboard ? <> <a href={at(d.v.account, 'dashboard', 'books')}>See the books →</a></> : null}</p>
    </div>
  );
}

// The promises as one bar: shipped, in progress, ahead; then the nearest of each.
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
      <h2>The roadmap<small>promises, then proof</small></h2>
      {items.length ? <>
        <div class="progress">{done.length ? <i class="done" style={`width:${pct(done.length)}`} /> : null}{active.length ? <i class="active" style={`width:${pct(active.length)}`} /> : null}{ahead.length ? <i class="ahead" style={`width:${pct(ahead.length)}`} /> : null}</div>
        <div class="legend"><span><i class="done" /><b>{done.length}</b> shipped</span><span><i class="active" /><b>{active.length}</b> in progress</span><span><i class="ahead" /><b>{ahead.length}</b> ahead</span></div>
      </> : null}
      <div class="promises">
        <div><h3>Next up</h3>{next.length ? <ul class="rows">{next.map((i) => <li class="row"><span class="t">{i.title}</span><span class={`n${i.status === 'active' ? ' hot' : ''}`}>{i.status === 'active' ? 'in progress' : i.release ?? 'planned'}</span></li>)}</ul> : <p class="empty">Nothing promised yet.</p>}</div>
        <div><h3>Recently shipped</h3>{shipped.length ? <ul class="rows">{shipped.map((i) => <li class="row"><span class="t">{i.title}</span><span class="n k">{i.done_at ? fmtAgo(i.done_at, d.now) : 'shipped'}</span></li>)}</ul> : <p class="empty">Nothing shipped yet.</p>}</div>
      </div>
      {d.dashboard ? <a class="more" href={at(a, 'dashboard', 'board')}>The whole board →</a> : null}
    </section>
  );
}

export function Landing(d: LandingData) {
  const a = d.v.account;
  const lead = leadParagraphs(d.v.profile.about_md, 2);
  const jobs = ((): string[] => { try { const j = JSON.parse(d.v.profile.schedule_json ?? '{}') as { jobs?: Array<{ name?: string; schedule?: string }> }; return (j.jobs ?? []).slice(0, 3).map((x) => `${x.name ?? 'job'} ${x.schedule ?? ''}`.trim()); } catch { return []; } })();
  const harness = d.v.profile.agent_harness === 'hermes' ? 'Hermes agent' : d.v.profile.agent_harness;
  return (
    <>
      <TopBar brand={d.brand} nav={whoNav(d.who, at(a))} cta={<a class="btn small" href="#ask">Back this project</a>} />
      <div class="page">
        <div class="ident">
          {safeUrl(d.v.profile.avatar_url) ? <img class="avatar" src={safeUrl(d.v.profile.avatar_url)} alt="" /> : <div class="avatar" />}
          <div class="who">
            <h1>{nameOf(a)}</h1>
            <p class="tag">{d.v.profile.tagline ?? `${nameOf(a)}, building itself in the open.`}</p>
            <div class="tags">
              <span class="k">by {ownerOf(a)}</span>
              {harness ? <span>{harness}</span> : null}
              {d.v.profile.agent_model ? <span>{d.v.profile.agent_model}</span> : null}
              {jobs.map((j) => <span>{j}</span>)}
            </div>
          </div>
          <div class="acts">
            <a class="btn quiet" href={`https://github.com/${a}`} target="_blank" rel="noopener">GitHub ↗</a>
            <a class="btn" href="#tiers">Back this project</a>
          </div>
        </div>
        <div class="hero">
          <Poster d={d} />
          <Ask d={d} />
        </div>
        <div class="cols">
          <div class="main">
            <section class="sec">
              <h2>About</h2>
              {lead ? <div class="prose" dangerouslySetInnerHTML={{ __html: mdToSafeHtml(lead) }} /> : <p class="empty">This project has not published what it is yet.</p>}
              {(d.v.profile.about_md ?? '').trim().length > lead.length ? <a class="more" href={at(a, 'about')}>Read the whole story →</a> : null}
            </section>
            <Promises d={d} />
            <section class="sec">
              <h2>Patrons<small>{d.patronage.patron_count ? `${d.patronage.patron_count} so far` : 'be the first'}</small></h2>
              {d.patronage.patrons.length ? <div class="wall">{d.patronage.patrons.map(chip)}</div> : <p class="empty">No one has backed {nameOf(a)} yet. The first name goes here.</p>}
            </section>
          </div>
          <div class="side">
            <Tiers tiers={d.patronage.tiers} owner={ownerOf(a)} account={a} sponsor={d.sponsor} polar={d.polar} burn={d.v.burn_per_day_usd_cents * 30} />
          </div>
        </div>
        <Foot brand={d.brand} />
      </div>
    </>
  );
}

// The whole story: the project's document in full, in the landing page's dress, for the reader who wants it all.
export function About(d: LandingData) {
  const a = d.v.account;
  return (
    <>
      <TopBar brand={d.brand} nav={whoNav(d.who, at(a, 'about'))} cta={<a class="btn small" href={at(a)}>{nameOf(a)} →</a>} />
      <div class="page">
        <div class="ident">
          {safeUrl(d.v.profile.avatar_url) ? <img class="avatar" src={safeUrl(d.v.profile.avatar_url)} alt="" /> : <div class="avatar" />}
          <div class="who"><h1>{nameOf(a)}</h1><p class="tag">{d.v.profile.tagline ?? ''}</p></div>
        </div>
        <div class="main" style="max-width:76ch;margin-top:32px">
          {d.v.profile.about_md?.trim() ? <div class="prose" dangerouslySetInnerHTML={{ __html: mdToSafeHtml(d.v.profile.about_md) }} /> : <p class="empty">This project has not published what it is yet.</p>}
        </div>
        <Foot brand={d.brand} />
      </div>
    </>
  );
}

export function landingDocument(title: string, brand: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="preconnect" href="https://fonts.googleapis.com"><link href="${FONTS}" rel="stylesheet"><title>${esc(title)} · ${esc(brand)}</title><style>${LANDING_CSS}</style></head><body>${body}</body></html>`;
}

// The page as the core's router asks for it: the core's records and who is looking, the platform's patronage.
// The dashboard is offered to whoever the owner admits to its overview.
export function landingPage(base: LandingBase, p: { brand: string; patronage: PatronageView; polar: boolean; sponsor: string }): string {
  const d: LandingData = { brand: p.brand, v: base.view, sessions: base.sessions, live: base.live, roadmap: base.roadmap, daily: base.daily, patronage: p.patronage, polar: p.polar, sponsor: p.sponsor, now: base.now, who: base.who, dashboard: sees(base.role, base.visibility.overview) };
  return landingDocument(base.about ? `About · ${nameOf(base.account)}` : nameOf(base.account), p.brand, render(base.about ? About(d) : Landing(d)));
}
