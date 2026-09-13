// The landing page: a project as an outsider meets it, Kickstarter's campaign with GitHub's proof. One page, no
// tabs. What it owns: the cover and the name, the pitch, the ask and the tiers, the promises (the roadmap), the
// backers, and enough proof that the thing is alive: the agent's one word, what it is doing this minute, what it
// last shipped, that every cent is metered. Everything deeper (transcripts, every call, the agent's setup, the
// owner's control) is the dashboard's, a link away for whoever the owner admits.
import { tenseOf, type Roadmap } from '@open-autonomy/sdk/roadmap';
import type { ProjectView, SessionSummary } from '@open-autonomy/backend';
import { fmtAgo, fmtDur, mdToSafeHtml, usd, usd0 } from '@open-autonomy/backend/ui';
import { Foot, Pill, TopBar, at, coverStyle, firstLine, leadParagraphs, nameOf, ownerOf, runwayWords, safeUrl, standingOf } from '@open-autonomy/backend/page/parts';
import { T, FONTS } from '@open-autonomy/backend/page/theme';
import type { Viewer } from '@open-autonomy/backend/page/model';
import { esc } from '@open-autonomy/backend/ui';
import type { Patron, PatronageView } from '../patronage.js';
import { PATRONAGE_STYLES, Tiers, whoNav } from './patronage.js';

export interface LandingData {
  brand: string;
  v: ProjectView;
  sessions: SessionSummary[];
  live: string[];
  roadmap: Roadmap;
  patronage: PatronageView;
  polar: boolean;
  sponsor: string;
  now: number;
  who?: Viewer;
  // Whether this viewer may open the dashboard: the owner's word on the `overview` panel, resolved by the router.
  dashboard: boolean;
}

// The landing page's own sheet, from the core's tokens. Editorial where the dashboard is dense: one wide column
// of story and promises, the ask pinned beside it.
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
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:42px;padding:0 20px;border-radius:999px;border:1.5px solid ${T.accent};background:${T.accent};color:#fff;font-weight:700;font-size:14.5px;white-space:nowrap;cursor:pointer}
.btn:hover{background:${T.accentInk};border-color:${T.accentInk};text-decoration:none}
.btn.quiet{background:#fff;color:${T.accentInk}}
.btn.quiet:hover{background:${T.accentWash}}
.btn.wide{width:100%}
.btn.small{height:32px;padding:0 12px;font-size:13px}
.page{max-width:1120px;margin:0 auto;padding:0 24px 72px}
.cover{height:300px;border-radius:0 0 24px 24px;background-size:cover;background-position:center;position:relative}
.cover:after{content:"";position:absolute;inset:0;border-radius:0 0 24px 24px;background:linear-gradient(180deg,rgba(0,0,0,0) 40%,rgba(0,0,0,.45))}
.ident{display:grid;grid-template-columns:104px minmax(0,1fr);gap:24px;align-items:end;padding:0 12px;margin-top:-44px;position:relative;z-index:1}
.ident .avatar{width:104px;height:104px;border-radius:26px;border:5px solid ${T.wash};background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.1);object-fit:cover}
.ident .who{min-width:0;padding-bottom:2px}
.ident h1{font-family:Fraunces,Georgia,serif;font-size:46px;font-weight:600;letter-spacing:-.02em;line-height:1;font-variation-settings:"opsz" 46}
.lede{padding:18px 12px 0;max-width:68ch}
.lede p{font-size:20px;line-height:1.45;color:${T.ink};font-weight:500}
.lede .built{color:${T.muted};font-size:14px;margin-top:10px}
.lede .built b{color:${T.body};font-weight:600}
.proof{display:flex;flex-wrap:wrap;align-items:center;gap:10px 18px;padding:16px 12px 0;color:${T.muted};font-size:14.5px}
.proof b{color:${T.ink};font-weight:700}
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
.cols{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:36px;margin-top:36px;align-items:start}
.side{position:sticky;top:76px;display:flex;flex-direction:column;gap:16px}
.main{display:flex;flex-direction:column;gap:40px;min-width:0;padding:0 12px}
.sec h2{font-family:Fraunces,Georgia,serif;font-size:26px;font-weight:600;letter-spacing:-.015em;margin-bottom:14px;font-variation-settings:"opsz" 26}
.sec h2 small{font-family:Inter,sans-serif;font-size:13px;font-weight:600;color:${T.muted};letter-spacing:.06em;text-transform:uppercase;margin-left:12px}
.prose{color:${T.body};font-size:16.5px;line-height:1.65}
.prose p+p{margin-top:12px}
.prose b,.prose strong{color:${T.ink}}
.more{display:inline-block;margin-top:12px;color:${T.accentInk};font-weight:600;font-size:14.5px}
.now{background:#1b171d;color:#f2efea;border-radius:20px;padding:22px 24px;position:relative;overflow:hidden;box-shadow:0 18px 40px -24px rgba(27,23,29,.55)}
.now:before{content:"";position:absolute;inset:auto -60px -120px auto;width:280px;height:280px;border-radius:50%;background:radial-gradient(circle, rgba(255,66,77,.32), transparent 65%);pointer-events:none}
.now .head{display:flex;align-items:center;gap:10px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#b9b3ad}
.now .head .p{width:8px;height:8px;border-radius:50%;background:${T.accent};box-shadow:0 0 0 0 rgba(255,66,77,.6);animation:pulse2 1.5s infinite}
.now .head .p.still{background:#6f6a72;animation:none;box-shadow:none}
@keyframes pulse2{0%{box-shadow:0 0 0 0 rgba(255,66,77,.55)}70%{box-shadow:0 0 0 9px rgba(255,66,77,0)}100%{box-shadow:0 0 0 0 rgba(255,66,77,0)}}
.now .line{margin-top:12px;font-family:Fraunces,Georgia,serif;font-size:22px;line-height:1.3;font-weight:500;max-width:52ch}
.now .line b{font-weight:600;color:#fff}
.now .sub{margin-top:10px;color:#b9b3ad;font-size:14px}
.now .sub a{color:#f2efea;font-weight:600}
.now .facts{display:flex;flex-wrap:wrap;gap:8px 22px;margin-top:16px;color:#d9d3cc;font-size:13.5px}
.now .facts b{color:#fff}
.promises{display:grid;grid-template-columns:1fr 1fr;gap:28px}
.promises h3{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${T.muted};margin-bottom:10px}
.rows{display:flex;flex-direction:column}
.row{display:flex;align-items:baseline;gap:14px;padding:11px 0;border-top:1px solid ${T.line}}
.row:first-child{border-top:0;padding-top:0}
.row .t{flex:1;min-width:0;font-weight:500;color:${T.ink}}
.row .n{flex:none;color:${T.muted};font-size:13px;white-space:nowrap}
.row .n.k{color:${T.green};font-weight:600}
.empty{color:${T.muted};font-size:14.5px}
.wall{display:flex;flex-wrap:wrap;gap:8px}
.chip{display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 13px 0 4px;border-radius:999px;border:1px solid ${T.line};background:#fff;font-size:13.5px;font-weight:600}
.chip img{width:28px;height:28px;border-radius:50%}
.chip .ph{width:28px;height:28px;border-radius:50%;background:${T.wash}}
.card{background:${T.panel};border:1px solid ${T.line};border-radius:20px;padding:22px 24px}
.card h2{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${T.muted};margin-bottom:14px}
.ask .big{font-family:Fraunces,Georgia,serif;font-size:40px;font-weight:600;letter-spacing:-.015em;line-height:1;font-variation-settings:"opsz" 40}
.ask .big span{font-size:15px;font-weight:600;color:${T.muted};letter-spacing:0;font-family:Inter,sans-serif}
.ask .line{color:${T.body};font-size:14.5px;margin-top:8px}
.track{height:8px;border-radius:999px;background:${T.wash};margin:14px 0 8px;overflow:hidden}
.track .fill{height:100%;border-radius:999px;background:${T.green}}
.track .fill.warn{background:${T.amber}}
.track .fill.off{background:${T.accent}}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:14px}
.stat{background:${T.wash};border-radius:12px;padding:10px 12px}
.stat .v{font-weight:700;font-size:15px}
.stat .l{color:${T.muted};font-size:12px;margin-top:1px}
.fine{color:${T.muted};font-size:12.5px;margin-top:10px;line-height:1.45}
.fine a{color:${T.accentInk};font-weight:600;white-space:nowrap}
.form{display:flex;flex-direction:column;gap:8px}
.form input{height:38px;border:1px solid ${T.line};border-radius:10px;padding:0 12px;font:inherit;font-size:14px}
.form .fine{color:${T.muted};font-size:12.5px;line-height:1.45}
.foot{margin-top:56px;padding:0 12px;color:${T.muted};font-size:13px;display:flex;gap:16px;flex-wrap:wrap}
${PATRONAGE_STYLES}
@media(max-width:900px){.cols{grid-template-columns:1fr}.side{position:static}.cover{height:180px}.ident{grid-template-columns:76px 1fr;gap:14px;margin-top:-38px}.ident .avatar{width:76px;height:76px;border-radius:20px}.ident h1{font-size:30px}.lede p{font-size:17px}.promises{grid-template-columns:1fr}.main{gap:32px}.sec h2 small{display:block;margin:4px 0 0}.now .line{font-size:19px}}
@media(max-width:480px){.topbar .in{gap:12px;padding:0 14px}.topbar nav{gap:12px;font-size:14px}.brand{font-size:15px}.brand svg{width:20px;height:20px}.btn.small{padding:0 10px}}
`;

const chip = (p: Patron) => <a class="chip" href={safeUrl(p.url) ?? `https://github.com/${encodeURIComponent(p.login)}`}>{safeUrl(p.avatar_url) ? <img src={safeUrl(p.avatar_url)} alt="" /> : <span class="ph" />}{p.name ?? p.login}</a>;

// Proof of life, in one dark strip: what the agent is doing this minute, or what it last did; always the door to
// the dashboard for whoever may open it.
function Now({ d }: { d: LandingData }) {
  const a = d.v.account;
  const standing = standingOf(d.v, d.live);
  const first = d.sessions.find((s) => d.live.includes(s.key));
  const last = d.sessions.find((s) => s.status === 'ended' && s.kind === 'run' && s.report && s.report !== '[SILENT]') ?? d.sessions.find((s) => s.status === 'ended' && s.kind === 'run');
  const shipped = d.roadmap.items.filter((i) => tenseOf(i) === 'past').sort((x, y) => Date.parse(y.done_at ?? '') - Date.parse(x.done_at ?? '') || 0)[0];
  const door = d.dashboard ? <a href={at(a, 'dashboard')}>Open the dashboard →</a> : null;
  let head: string, line: unknown, sub: unknown;
  if (standing === 'paused' || standing === 'requested') {
    head = standing === 'paused' ? 'Paused by the owner' : 'Pause requested';
    line = d.v.control?.desired?.reason ? <>“{d.v.control.desired.reason}”</> : 'The scheduled work is paused.';
    sub = <>{d.v.control?.desired?.at ? `since ${fmtAgo(d.v.control.desired.at, d.now)}` : ''}{last ? ` · last run ${fmtAgo(last.started_at, d.now)}` : ''}</>;
  } else if (first) {
    head = 'Working now';
    line = <>Running <b>{first.source ?? first.kind}</b>{first.item_id ? <> on <b>{d.roadmap.items.find((i) => i.id === first.item_id)?.title ?? first.item_id}</b></> : null}, <b>{fmtDur(first.started_at, undefined, d.now)}</b> in.</>;
    sub = <>{first.turn_count} turns · {usd(first.usd_cents)} metered so far · {door}</>;
  } else if (last) {
    head = 'The last run';
    line = last.report && last.report !== '[SILENT]' ? <>“{firstLine(last.report, 140)}”</> : <>{last.source ?? last.kind} ran {fmtAgo(last.started_at, d.now)}.</>;
    sub = <>{fmtAgo(last.started_at, d.now)} · {usd(last.usd_cents)} metered · {door}</>;
  } else {
    head = 'The workshop';
    line = standing === 'unfunded' ? 'Waiting for its first funds.' : 'Waiting for its first run.';
    sub = door;
  }
  const still = !(first && standing === 'live');
  return (
    <div class="now">
      <div class="head"><span class={`p${still ? ' still' : ''}`} />{head}</div>
      <div class="line">{line}</div>
      <div class="sub">{sub}</div>
      <div class="facts">
        {shipped ? <span>Last shipped <b>{shipped.title}</b>{shipped.done_at ? ` · ${fmtAgo(shipped.done_at, d.now)}` : ''}</span> : null}
        <span>Every call metered · <b>{usd(d.v.consumed_usd_cents)}</b> spent in the open</span>
      </div>
    </div>
  );
}

// The ask: what the books hold and how long it lasts, then the tiers. One card, pinned.
function Ask({ d }: { d: LandingData }) {
  const standing = standingOf(d.v, d.live);
  const runway = d.v.runway_days !== null && Number.isFinite(d.v.runway_days) ? Math.round(d.v.runway_days) : null;
  const goal = d.v.goal_days;
  const frac = runway === null ? 0 : Math.max(0, Math.min(1, runway / goal));
  const tone = standing === 'exhausted' ? 'off' : runway !== null && runway < goal / 3 ? 'warn' : '';
  const monthly = d.patronage.monthly_usd_cents;
  return (
    <div class="card ask" id="ask">
      <div class="big">{monthly > 0 ? <>{usd0(monthly)}<span> a month</span></> : <>{usd(d.v.balance_usd_cents)}<span> in the bank</span></>}</div>
      <div class="line">{standing === 'exhausted' ? 'The balance is spent; the next gift starts the agent again.' : runway === null ? 'No runs yet, so no burn to measure.' : runway > 365 ? 'Over a year of runway at its current burn.' : `About ${runway} days of runway at its current burn; the goal is ${goal}.`}</div>
      <div class="track"><div class={`fill ${tone}`} style={`width:${Math.round(frac * 100)}%`} /></div>
      <div class="stats">
        <div class="stat"><div class="v">{d.patronage.patron_count}</div><div class="l">{d.patronage.patron_count === 1 ? 'patron' : 'patrons'}</div></div>
        <div class="stat"><div class="v">{usd(d.v.granted_in_usd_cents)}</div><div class="l">received</div></div>
        <div class="stat"><div class="v">{usd(d.v.consumed_usd_cents)}</div><div class="l">spent</div></div>
      </div>
      <p class="fine">Every cent is metered on public books.{d.dashboard ? <> <a href={at(d.v.account, 'dashboard', 'books')}>See the books →</a></> : null}</p>
    </div>
  );
}

export function Landing(d: LandingData) {
  const a = d.v.account;
  const standing = standingOf(d.v, d.live);
  const runway = d.v.runway_days !== null && Number.isFinite(d.v.runway_days) ? Math.round(d.v.runway_days) : null;
  const lead = leadParagraphs(d.v.profile.about_md, 2);
  const items = d.roadmap.items;
  const next = items.filter((i) => tenseOf(i) !== 'past').slice(0, 5);
  const shipped = items.filter((i) => tenseOf(i) === 'past').sort((x, y) => Date.parse(y.done_at ?? '') - Date.parse(x.done_at ?? '') || 0).slice(0, 5);
  const schedule = ((): string => { try { const j = JSON.parse(d.v.profile.schedule_json ?? '{}') as { jobs?: Array<{ name?: string; schedule?: string }> }; return (j.jobs ?? []).slice(0, 2).map((x) => `${x.name ?? 'job'} ${x.schedule ?? ''}`.trim()).join(' · '); } catch { return ''; } })();
  return (
    <>
      <TopBar brand={d.brand} nav={whoNav(d.who, at(a))} cta={<a class="btn small" href="#ask">Become a patron</a>} />
      <div class="page">
        <div class="cover" style={coverStyle(d.v.profile.cover_url, a)} />
        <div class="ident">
          {safeUrl(d.v.profile.avatar_url) ? <img class="avatar" src={safeUrl(d.v.profile.avatar_url)} alt="" /> : <div class="avatar" />}
          <div class="who">
            <h1>{nameOf(a)}</h1>
          </div>
        </div>
        <div class="lede">
          <p>{d.v.profile.tagline ?? `${nameOf(a)}, building itself in the open.`}</p>
          {d.v.profile.agent_model ? <div class="built">Built by <b>{d.v.profile.agent_harness === 'hermes' ? 'a Hermes agent' : d.v.profile.agent_harness ?? 'its agent'}</b> on <b>{d.v.profile.agent_model}</b>{schedule ? ` · ${schedule}` : ''}</div> : null}
        </div>
        <div class="proof">
          <Pill standing={standing} />
          <span><b>{d.patronage.patron_count}</b> {d.patronage.patron_count === 1 ? 'patron' : 'patrons'}</span>
          {runway !== null ? <span>{runwayWords(runway)}</span> : null}
          <a href={`https://github.com/${a}`} target="_blank" rel="noopener">github.com/{a} ↗</a>
        </div>
        <div class="cols">
          <div class="main">
            <Now d={d} />
            <section class="sec">
              <h2>About</h2>
              {lead ? <div class="prose" dangerouslySetInnerHTML={{ __html: mdToSafeHtml(lead) }} /> : <p class="empty">This project has not published what it is yet.</p>}
              {(d.v.profile.about_md ?? '').trim().length > lead.length ? <a class="more" href={at(a, 'about')}>Read the whole story →</a> : null}
            </section>
            <section class="sec">
              <h2>The roadmap<small>promises, then proof</small></h2>
              <div class="promises">
                <div><h3>Next up</h3>{next.length ? <ul class="rows">{next.map((i) => <li class="row"><span class="t">{i.title}</span><span class="n">{i.status === 'active' ? 'in progress' : i.release ?? 'planned'}</span></li>)}</ul> : <p class="empty">Nothing promised yet.</p>}</div>
                <div><h3>Recently shipped</h3>{shipped.length ? <ul class="rows">{shipped.map((i) => <li class="row"><span class="t">{i.title}</span><span class="n k">{i.done_at ? fmtAgo(i.done_at, d.now) : 'shipped'}</span></li>)}</ul> : <p class="empty">Nothing shipped yet.</p>}</div>
              </div>
              {d.dashboard ? <a class="more" href={at(a, 'dashboard', 'work')}>The whole board →</a> : null}
            </section>
            <section class="sec">
              <h2>Patrons<small>{d.patronage.patron_count ? `${d.patronage.patron_count} so far` : 'be the first'}</small></h2>
              {d.patronage.patrons.length ? <div class="wall">{d.patronage.patrons.map(chip)}</div> : <p class="empty">No one has backed {nameOf(a)} yet. The first name goes here.</p>}
            </section>
          </div>
          <div class="side">
            <Ask d={d} />
            <Tiers tiers={d.patronage.tiers} owner={ownerOf(a)} account={a} sponsor={d.sponsor} polar={d.polar} burn={d.v.burn_per_day_usd_cents * 30} />
          </div>
        </div>
        <Foot brand={d.brand} />
      </div>
    </>
  );
}

export function landingDocument(title: string, brand: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="preconnect" href="https://fonts.googleapis.com"><link href="${FONTS}" rel="stylesheet"><title>${esc(title)} · ${esc(brand)}</title><style>${LANDING_CSS}</style></head><body>${body}</body></html>`;
}
