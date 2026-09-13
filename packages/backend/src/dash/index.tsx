// The dashboard: a project's work as its team reads it. Not a landing page and not a terminal: a console over what
// the substrate publishes through the SDK, dense enough to answer "what is it doing, what did it do, what did it
// cost, what is next" on one screen, with each depth one click away. The owner's `dashboard:` block decides which
// panels a role sees, and whether the public sees any of it; a self-host serves this and nothing else.
import { tenseOf, type Roadmap, type RoadmapItem } from '@open-autonomy/sdk/roadmap';
import type { TeamMember } from '@open-autonomy/sdk/team';
import type { AgentControl, CallRecord, Envelope, Flow, ProjectView, SessionRecord, SessionSummary } from '../ledger.js';
import { LOGO_SVG, esc, fmtAgo, fmtDur, fmtWhen, mdToSafeHtml, shortSha, usd } from '../ui.js';
import { raw } from 'hono/html';
import { sees, type Role, type Visibility } from '../page/model.js';
import { at, firstLine, nameOf, safeUrl, standingOf, tickerLine, type Schedule, type SessionTail, type Standing, type Turn } from '../page/parts.js';
import { T, FONTS } from '../page/theme.js';
import { LIVE } from '../page/live.js';

export type DashPage = 'overview' | 'sessions' | 'board' | 'books' | 'agent' | 'team';
export interface DashData {
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
  calls?: CallRecord[];
  team?: TeamMember[];
}

// The dashboard's own sheet: an app shell, a compact scale, tables. The tokens are the core's; the structure is not
// the landing page's, on purpose.
export const DASH_CSS = `
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:${T.wash};color:${T.ink};font:13.5px/1.5 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
a:hover{text-decoration:underline;text-underline-offset:3px}
h1,h2,h3,p,ul,ol{margin:0}
ul,ol{padding:0;list-style:none}
.shell{display:grid;grid-template-columns:232px minmax(0,1fr);min-height:100vh}
.rail{background:${T.panel};border-right:1px solid ${T.line};padding:18px 14px;display:flex;flex-direction:column;gap:18px;position:sticky;top:0;height:100vh}
.rail .brand{display:flex;align-items:center;gap:8px;font-weight:800;font-size:14px;letter-spacing:-.01em;color:${T.muted};padding:0 8px}
.rail .brand svg{width:18px;height:18px}
.rail .proj{padding:0 8px}
.rail .proj .n{font-family:Fraunces,Georgia,serif;font-size:22px;font-weight:600;letter-spacing:-.015em;line-height:1.1}
.rail .proj .o{color:${T.muted};font-size:12.5px;margin-top:2px}
.rail nav{display:flex;flex-direction:column;gap:2px}
.rail nav a{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border-radius:9px;font-weight:600;font-size:13.5px;color:${T.body}}
.rail nav a:hover{background:${T.wash};text-decoration:none}
.rail nav a.on{background:${T.ink};color:#fff}
.rail nav a .c{font-size:11.5px;font-weight:600;color:${T.muted};background:${T.wash};border-radius:999px;padding:1px 7px}
.rail nav a.on .c{background:rgba(255,255,255,.18);color:#fff}
.rail .role{margin-top:auto;padding:10px 12px;border-radius:10px;background:${T.wash};font-size:12px;color:${T.muted};line-height:1.45}
.rail .role b{color:${T.body};display:block;font-size:12.5px}
.rail .role a{color:${T.accentInk};font-weight:600}
.body{padding:0 28px 48px;min-width:0}
.top{display:flex;align-items:center;gap:14px;height:56px;border-bottom:1px solid ${T.line};margin:0 -28px 22px;padding:0 28px;background:${T.panel};position:sticky;top:0;z-index:4}
.top h1{font-size:15px;font-weight:700}
.top .grow{flex:1}
.top .facts{display:flex;gap:18px;color:${T.muted};font-size:12.5px;white-space:nowrap}
.top .facts b{color:${T.ink};font-weight:700}
.pill{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px 0 8px;border-radius:999px;font-size:12px;font-weight:600;background:${T.wash};color:${T.body};border:1px solid ${T.line}}
.pill .dot{width:7px;height:7px;border-radius:50%;background:${T.gray}}
.pill.live{background:${T.greenWash};color:${T.green};border-color:transparent}
.pill.live .dot{background:${T.green};animation:pulse 1.6s infinite}
.pill.ok .dot{background:${T.green}}
.pill.warn{background:${T.amberWash};color:${T.amber};border-color:transparent}
.pill.warn .dot{background:${T.amber}}
.pill.off{background:${T.accentWash};color:${T.accentInk};border-color:transparent}
.pill.off .dot{background:${T.accent}}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(10,135,84,.45)}70%{box-shadow:0 0 0 7px rgba(10,135,84,0)}100%{box-shadow:0 0 0 0 rgba(10,135,84,0)}}
.grid{display:grid;grid-template-columns:repeat(12,1fr);gap:16px}
.two{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:16px;align-items:start}
.two .col{display:flex;flex-direction:column;gap:16px;min-width:0}
.two .panel{grid-column:auto}
.span4{grid-column:span 4}.span6{grid-column:span 6}.span8{grid-column:span 8}.span12{grid-column:span 12}
.panel{background:${T.panel};border:1px solid ${T.line};border-radius:14px;padding:16px 18px;min-width:0}
.panel>h2{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:11.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${T.muted};margin-bottom:12px}
.panel>h2 a{font-size:12px;letter-spacing:0;text-transform:none;font-weight:600;color:${T.accentInk}}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.kpi{background:${T.wash};border-radius:10px;padding:10px 12px}
.kpi .v{font-family:Fraunces,Georgia,serif;font-size:22px;font-weight:600;letter-spacing:-.01em;line-height:1.1}
.kpi .l{color:${T.muted};font-size:11.5px;margin-top:3px}
.kpi .v.ok{color:${T.green}}.kpi .v.warn{color:${T.amber}}.kpi .v.off{color:${T.accentInk}}
.live{display:flex;flex-direction:column;gap:10px}
.run{border:1px solid ${T.line};border-radius:12px;padding:12px 14px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 14px;align-items:start}
.run.hot{border-color:rgba(10,135,84,.45);box-shadow:0 0 0 3px ${T.greenWash}}
.run .n{font-weight:700;font-size:14px}
.run .n span{color:${T.muted};font-weight:500;font-size:12.5px;margin-left:8px}
.run .m{color:${T.muted};font-size:12.5px;white-space:nowrap;text-align:right}
.run .m b{color:${T.ink}}
.tick{grid-column:1/-1;margin:4px 0 0;display:flex;flex-direction:column;gap:3px;font:12px/1.45 "SF Mono",SFMono-Regular,Menlo,Consolas,monospace;color:${T.body}}
.tick li{display:grid;grid-template-columns:64px minmax(0,1fr);gap:10px}
.tick .role{color:${T.muted};font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;padding-top:2px}
.tick .role.a{color:${T.accentInk}}
.tick .line{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tick .line.tool{color:${T.muted}}
.tick .line.tool:before{content:"▸ ";color:${T.accent}}
.table{width:100%;border-collapse:collapse;font-size:13px}
.table th{text-align:left;color:${T.muted};font-weight:600;font-size:11px;letter-spacing:.05em;text-transform:uppercase;padding:0 12px 8px 0;border-bottom:1px solid ${T.line};white-space:nowrap}
.table td{padding:8px 12px 8px 0;border-bottom:1px solid ${T.line};vertical-align:top}
.table tr:last-child td{border-bottom:0}
.table th:last-child,.table td:last-child{padding-right:0}
.table td.n,.table th.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.table td.mono{font:12px "SF Mono",SFMono-Regular,Menlo,monospace;color:${T.body}}
.table td.clip{max-width:360px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tw{overflow-x:auto;margin:0 -4px;padding:0 4px}
.table .ok{color:${T.green};font-weight:600}.table .bad{color:${T.accentInk};font-weight:600}.table .none{color:${T.muted}}
.spark{display:flex;align-items:flex-end;gap:2px;height:44px;margin-top:6px}
.spark i{flex:1;display:block;background:rgba(255,66,77,.28);border-radius:2px 2px 0 0;min-height:2px}
.spark i.hot{background:${T.accent}}
.spark i.zero{background:${T.line}}
.sparklabel{display:flex;justify-content:space-between;color:${T.muted};font-size:11.5px;margin-top:5px}
.board{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.board h3{font-size:11.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${T.muted};margin-bottom:8px}
.brief{border:1px solid ${T.line};border-radius:10px;padding:10px 12px;margin-bottom:8px;background:#fff}
.brief .t{font-weight:600;font-size:13px;line-height:1.35}
.brief .m{color:${T.muted};font-size:12px;margin-top:3px}
.brief.hot{border-color:${T.accent};box-shadow:0 6px 18px -14px rgba(255,66,77,.5)}
.rows{display:flex;flex-direction:column}
.row{display:flex;align-items:baseline;gap:12px;padding:8px 0;border-top:1px solid ${T.line}}
.row:first-child{border-top:0;padding-top:0}
.row .t{flex:1;min-width:0;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.row .n{flex:none;color:${T.muted};font-size:12px;white-space:nowrap}
.empty{color:${T.muted};font-size:13px}
.prose{color:${T.body};font-size:13.5px;line-height:1.6}
.prose p+p{margin-top:8px}
.turns{display:flex;flex-direction:column;font:12.5px/1.5 "SF Mono",SFMono-Regular,Menlo,monospace}
.turns li{display:grid;grid-template-columns:76px minmax(0,1fr);gap:12px;padding:7px 0;border-top:1px solid ${T.line}}
.turns li:first-child{border-top:0}
.turns .role{color:${T.muted};font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;padding-top:2px}
.turns .role.a{color:${T.accentInk}}
.turns .body{white-space:pre-wrap;word-break:break-word}
.turns .body.tool{color:${T.muted}}
.form{display:flex;flex-direction:column;gap:8px}
.form input,.form textarea,.form select{border:1px solid ${T.line};border-radius:9px;padding:8px 11px;font:inherit;font-size:13px}
.btn{display:inline-flex;align-items:center;justify-content:center;height:36px;padding:0 16px;border-radius:999px;border:1.5px solid ${T.accent};background:${T.accent};color:#fff;font-weight:700;font-size:13px;cursor:pointer;white-space:nowrap}
.btn.quiet{background:#fff;color:${T.accentInk}}
.fine{color:${T.muted};font-size:12px;line-height:1.45;margin-top:8px}
.chip{display:inline-flex;align-items:center;gap:7px;height:30px;padding:0 11px 0 3px;border-radius:999px;border:1px solid ${T.line};background:#fff;font-size:12.5px;font-weight:600;margin:0 6px 6px 0}
.chip img{width:24px;height:24px;border-radius:50%}
@media(max-width:980px){.shell{grid-template-columns:1fr}.rail{position:static;height:auto;flex-direction:row;flex-wrap:wrap;align-items:center;gap:10px 14px;padding:12px 16px}.rail .proj .n{font-size:17px}.rail nav{flex-direction:row;flex-wrap:wrap;gap:4px}.rail .role{margin:0;width:100%}.body{padding:0 16px 40px}.top{margin:0 -16px 16px;padding:0 16px;height:auto;min-height:48px;flex-wrap:wrap;gap:8px 14px;padding-top:8px;padding-bottom:8px}.grid{grid-template-columns:1fr}.two{grid-template-columns:1fr}.span4,.span6,.span8,.span12{grid-column:span 1}.kpis{grid-template-columns:repeat(2,1fr)}.board{grid-template-columns:1fr}.table td.clip{max-width:180px}}
`;

const PAGES: Array<{ id: DashPage; label: string; panel: keyof Visibility }> = [
  { id: 'overview', label: 'Overview', panel: 'overview' }, { id: 'sessions', label: 'Sessions', panel: 'sessions' }, { id: 'board', label: 'Board', panel: 'work' },
  { id: 'books', label: 'Books', panel: 'books' }, { id: 'agent', label: 'Agent', panel: 'agent' }, { id: 'team', label: 'Team', panel: 'team' },
];
const ROLE_WORDS: Record<Role, string> = { public: 'Public view', giver: 'Giver view', team: 'Team view', owner: 'Owner view' };
const href = (a: string, p: DashPage) => (p === 'overview' ? at(a, 'dashboard') : at(a, 'dashboard', p));
const runway = (v: ProjectView) => (v.runway_days !== null && Number.isFinite(v.runway_days) ? Math.round(v.runway_days) : null);
const Pill = ({ standing }: { standing: Standing }) => { const w: Record<Standing, [string, string]> = { live: ['live', 'Working now'], running: ['ok', 'Running'], requested: ['warn', 'Pause requested'], paused: ['off', 'Paused by the owner'], exhausted: ['off', 'Spending stopped'], unfunded: ['', 'Not yet funded'] }; return <span class={`pill ${w[standing][0]}`}><span class="dot" />{w[standing][1]}</span>; };

// The shell every page shares: the rail with the project and the panels this role may open, the top strip with
// the facts that matter every minute, and the role the page is drawn for.
export function Shell({ d, page, title, children }: { d: DashData; page: DashPage; title: string; children?: unknown }) {
  const a = d.v.account;
  const standing = standingOf(d.v, d.live);
  const open = d.roadmap.items.filter((i) => tenseOf(i) !== 'past').length;
  const counts: Partial<Record<DashPage, string | number>> = { sessions: d.live.length ? `${d.live.length} live` : undefined, board: open || undefined };
  const rw = runway(d.v);
  const today = d.daily.length ? d.daily[d.daily.length - 1] : 0;
  return (
    <div class="shell" data-project={a} data-shape={JSON.stringify([d.live, d.v.control?.desired?.state ?? 'running', d.v.control?.observed?.state ?? '', 0])}>
      <aside class="rail">
        <a class="brand" href="/">{raw(LOGO_SVG)}<span>{d.brand}</span></a>
        <div class="proj"><div class="n">{nameOf(a)}</div><div class="o">{a}</div></div>
        <nav>{PAGES.filter((p) => sees(d.viewer, d.visibility[p.panel])).map((p) => <a class={p.id === page ? 'on' : ''} href={href(a, p.id)}>{p.label}{counts[p.id] !== undefined ? <span class="c">{counts[p.id]}</span> : null}</a>)}</nav>
        <div class="role"><b>{ROLE_WORDS[d.viewer]}</b>{d.viewer === 'public' ? 'What the owner opened to everyone.' : d.viewer === 'owner' ? 'Everything, and the one control.' : 'What the owner opened to the team.'} <a href={at(a)}>Project page →</a></div>
      </aside>
      <div class="body">
        <div class="top">
          <h1>{title}</h1>
          <Pill standing={standing} />
          <span class="grow" />
          <div class="facts">
            <span><b data-balance>{usd(d.v.balance_usd_cents)}</b> in the bank</span>
            {rw !== null ? <span><b>{rw > 365 ? '1y+' : `${rw}d`}</b> runway</span> : null}
            <span><b>{usd(today)}</b> today</span>
            <span><b data-spent>{usd(d.v.consumed_usd_cents)}</b> spent</span>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---- the panels ----------------------------------------------------------------------------------------------------
function Now({ d, tail }: { d: DashData; tail?: SessionTail }) {
  const a = d.v.account;
  const live = d.sessions.filter((s) => d.live.includes(s.key));
  const title = (s: SessionSummary) => (s.item_id ? d.roadmap.items.find((i) => i.id === s.item_id)?.title : undefined);
  const schedule = ((): Schedule[] => { try { const j = JSON.parse(d.v.profile.schedule_json ?? '{}') as { jobs?: Schedule[] }; return Array.isArray(j.jobs) ? j.jobs : []; } catch { return []; } })();
  return (
    <div class="panel">
      <h2>Now<a href={href(a, 'sessions')}>Every session →</a></h2>
      {live.length ? <div class="live">{live.map((s) => {
        const turns = tail && tail.key === s.key ? tail.turns.map(tickerLine).filter((l): l is NonNullable<typeof l> => !!l).slice(-4) : [];
        const seq = tail && tail.key === s.key ? tail.turns.reduce((m, t) => (typeof t.seq === 'number' && t.seq > m ? t.seq : m), -1) : -1;
        return (
          <div class="run hot">
            <div><div class="n"><a href={at(a, 'dashboard', 'sessions', s.key)}>{s.source ?? s.kind}</a>{title(s) ? <span>on {title(s)}</span> : null}</div><div class="m" style="text-align:left;margin-top:2px">started {fmtAgo(s.started_at, d.now)}</div></div>
            <div class="m"><b data-turns>{s.turn_count}</b> turns · <b>{s.tool_calls}</b> tools · <b data-cents>{usd(s.usd_cents)}</b></div>
            {tail && tail.key === s.key ? <ul class="tick" data-ticker data-account={a} data-session={s.key} data-seq={String(seq)}>{turns.map((l) => <li><span class={`role ${l.cls}`}>{l.role}</span><span class={`line${l.tool ? ' tool' : ''}`}>{l.text}</span></li>)}</ul> : null}
          </div>
        );
      })}</div> : <p class="empty">Nothing running this minute.{schedule[0] ? ` ${schedule[0].name ?? 'The schedule'} fires ${schedule[0].schedule ?? 'on schedule'}.` : ''}</p>}
    </div>
  );
}
function Spend({ d }: { d: DashData }) {
  const last = d.daily.slice(-30); const max = Math.max(1, ...last); const week = last.slice(-7).reduce((x, y) => x + y, 0);
  const rw = runway(d.v); const tone = rw === null ? '' : rw < d.v.goal_days / 3 ? 'warn' : 'ok';
  return (
    <div class="panel">
      <h2>Spend<a href={href(d.v.account, 'books')}>Books →</a></h2>
      <div class="kpis" style="grid-template-columns:1fr 1fr">
        <div class="kpi"><div class="v">{usd(week)}</div><div class="l">this week</div></div>
        <div class="kpi"><div class={`v ${tone}`}>{rw === null ? '—' : rw > 365 ? '1y+' : `${rw}d`}</div><div class="l">runway · goal {d.v.goal_days}d</div></div>
      </div>
      <div class="spark">{last.map((x, i) => <i class={x <= 0 ? 'zero' : i === last.length - 1 ? 'hot' : ''} style={`height:${Math.max(4, Math.round((x / max) * 100))}%`} />)}</div>
      <div class="sparklabel"><span>last {last.length} days</span><span>burn {usd(d.v.burn_per_day_usd_cents)}/day</span></div>
    </div>
  );
}
const outcome = (s: SessionSummary) => (s.status === 'live' ? <span class="ok">live</span> : s.outcome === 'failed' ? <span class="bad">failed</span> : s.outcome === 'done' ? <span class="ok">done</span> : <span class="none">quiet</span>);
function Runs({ d, max = 8, title = 'Recent runs' }: { d: DashData; max?: number; title?: string }) {
  const a = d.v.account;
  const rows = d.sessions.filter((s) => !d.live.includes(s.key)).slice(0, max);
  return (
    <div class="panel">
      <h2>{title}<a href={href(a, 'sessions')}>All {d.sessions.length} →</a></h2>
      {rows.length ? <div class="tw"><table class="table"><thead><tr><th>When</th><th>Job</th><th>Said</th><th>Outcome</th><th class="n">Turns</th><th class="n">Cost</th></tr></thead><tbody>
        {rows.map((s) => <tr><td style="white-space:nowrap">{fmtAgo(s.started_at, d.now)}</td><td><b>{s.source ?? s.kind}</b></td><td class="clip"><a href={at(a, 'dashboard', 'sessions', s.key)}>{s.report && s.report !== '[SILENT]' ? firstLine(s.report, 120) : <span class="none">nothing to report</span>}</a></td><td>{outcome(s)}</td><td class="n">{s.turn_count}</td><td class="n">{usd(s.usd_cents)}</td></tr>)}
      </tbody></table></div> : <p class="empty">No runs yet.</p>}
    </div>
  );
}
function NextUp({ d }: { d: DashData }) {
  const items = d.roadmap.items;
  const present = items.filter((i) => tenseOf(i) === 'present'); const future = items.filter((i) => tenseOf(i) === 'future').slice(0, 6);
  return (
    <div class="panel">
      <h2>Board<a href={href(d.v.account, 'board')}>Whole board →</a></h2>
      <div class="kpis" style="grid-template-columns:repeat(3,1fr);margin-bottom:12px">
        <div class="kpi"><div class="v">{present.length}</div><div class="l">in progress</div></div>
        <div class="kpi"><div class="v">{future.length}</div><div class="l">promised</div></div>
        <div class="kpi"><div class="v">{items.filter((i) => tenseOf(i) === 'past').length}</div><div class="l">shipped</div></div>
      </div>
      {present.length || future.length ? <ul class="rows">{[...present, ...future].slice(0, 7).map((i) => <li class="row"><span class="t"><a href={at(d.v.account, 'dashboard', 'board', i.id)}>{i.title}</a></span><span class="n">{i.status === 'active' ? 'in progress' : i.status}</span></li>)}</ul> : <p class="empty">Nothing on the board.</p>}
    </div>
  );
}
function AgentCard({ d }: { d: DashData }) {
  const c = d.v.control; const desired = c?.desired?.state ?? 'running';
  return (
    <div class="panel">
      <h2>Agent<a href={href(d.v.account, 'agent')}>Details →</a></h2>
      <ul class="rows">
        <li class="row"><span class="t">{d.v.profile.agent_harness ?? 'harness'}</span><span class="n">{d.v.profile.agent_model ?? 'model'}</span></li>
        <li class="row"><span class="t">last said</span><span class="n">{c?.observed ? `${c.observed.state} · ${fmtAgo(c.observed.at, d.now)}` : 'nothing yet'}</span></li>
        {c?.desired ? <li class="row"><span class="t">owner asked</span><span class="n">{c.desired.state} · {fmtAgo(c.desired.at, d.now)}</span></li> : null}
      </ul>
      {sees(d.viewer, 'owner') ? <form class="form" method="post" action={`${at(d.v.account)}/state`} style="margin-top:12px"><input name="reason" placeholder={desired === 'paused' ? 'why resume (optional)' : 'why pause (optional)'} maxlength={400} /><button class={`btn${desired === 'paused' ? '' : ' quiet'}`} type="submit" name="state" value={desired === 'paused' ? 'running' : 'paused'}>{desired === 'paused' ? 'Resume the agent' : 'Pause the agent'}</button></form> : null}
    </div>
  );
}

// ---- the pages -----------------------------------------------------------------------------------------------------
export function Overview(d: DashData) {
  return (
    <Shell d={d} page="overview" title="Overview">
      <div class="two">
        <div class="col"><Now d={d} tail={sees(d.viewer, d.visibility.transcripts) ? d.tail : undefined} /><Runs d={d} /></div>
        <div class="col"><Spend d={d} /><NextUp d={d} />{sees(d.viewer, d.visibility.agent) ? <AgentCard d={d} /> : null}</div>
      </div>
    </Shell>
  );
}
export function Sessions(d: DashData) {
  const a = d.v.account;
  return (
    <Shell d={d} page="sessions" title="Sessions">
      <div class="two">
        <div class="col"><Now d={d} tail={sees(d.viewer, d.visibility.transcripts) ? d.tail : undefined} /></div>
        <div class="col"><Spend d={d} /></div>
      </div>
      <div class="grid" style="margin-top:16px">
        <div class="panel span12"><h2>Every session</h2>
          <div class="tw"><table class="table"><thead><tr><th>When</th><th>Job</th><th>On</th><th>Said</th><th>Outcome</th><th class="n">Turns</th><th class="n">Cost</th></tr></thead><tbody>
            {d.sessions.filter((s) => !d.live.includes(s.key)).map((s) => <tr><td style="white-space:nowrap">{fmtAgo(s.started_at, d.now)}</td><td><b>{s.source ?? s.kind}</b>{s.kind !== 'run' ? <span class="none"> · chat</span> : null}</td><td>{s.item_id ? <a href={at(a, 'dashboard', 'board', s.item_id)}>{s.item_id}</a> : <span class="none">—</span>}</td><td class="clip"><a href={at(a, 'dashboard', 'sessions', s.key)}>{s.report && s.report !== '[SILENT]' ? firstLine(s.report, 110) : <span class="none">nothing to report</span>}</a></td><td>{outcome(s)}</td><td class="n">{s.turn_count}</td><td class="n">{usd(s.usd_cents)}</td></tr>)}
          </tbody></table></div>
        </div>
      </div>
    </Shell>
  );
}
export function Session({ d, s }: { d: DashData; s: SessionRecord }) {
  const a = d.v.account;
  const line = (t: Turn) => t.role === 'assistant' && t.tool ? { role: 'agent', cls: 'a', body: `${t.tool}${t.args ? ` ${t.args}` : ''}`, tool: true } : t.role === 'assistant' ? { role: 'agent', cls: 'a', body: t.text ?? '', tool: false } : t.role === 'tool' ? { role: t.tool ?? 'tool', cls: '', body: t.result ?? '', tool: true } : { role: t.role, cls: '', body: t.text ?? '', tool: false };
  const seq = s.turns.reduce((m, t) => (typeof t.seq === 'number' && t.seq > m ? t.seq : m), -1);
  return (
    <Shell d={d} page="sessions" title={`${s.source ?? s.kind} · ${fmtWhen(s.started_at)}`}>
      <div class="grid">
        <div class="panel span8"><h2>Transcript · <span data-turns>{s.turns.length}</span> turns{s.status === 'live' ? <span class="pill live"><span class="dot" />live</span> : null}</h2>
          {s.report && s.report !== '[SILENT]' ? <div class="prose" style="margin-bottom:14px" dangerouslySetInnerHTML={{ __html: mdToSafeHtml(s.report) }} /> : null}
          <ul class="turns" data-transcript data-account={a} data-session={s.key} data-seq={String(seq)}>{s.turns.map((t) => { const l = line(t); return <li><span class={`role ${l.cls}`}>{l.role}</span><span class={`body${l.tool ? ' tool' : ''}`}>{l.body}</span></li>; })}</ul>
        </div>
        <div class="panel span4"><h2>This session</h2>
          <div class="kpis" style="grid-template-columns:1fr 1fr"><div class="kpi"><div class="v" data-cents>{usd(s.usd_cents)}</div><div class="l">metered</div></div><div class="kpi"><div class="v">{s.calls}</div><div class="l">model calls</div></div></div>
          <ul class="rows" style="margin-top:12px">
            <li class="row"><span class="t">status</span><span class="n">{s.status}{s.outcome ? ` · ${s.outcome}` : ''}</span></li>
            <li class="row"><span class="t">ran</span><span class="n">{fmtDur(s.started_at, s.ended_at, d.now)}</span></li>
            {s.item_id ? <li class="row"><span class="t">on</span><span class="n"><a href={at(a, 'dashboard', 'board', s.item_id)}>{s.item_id}</a></span></li> : null}
            {s.commit_sha ? <li class="row"><span class="t">landed as</span><span class="n">{shortSha(s.commit_sha)}</span></li> : null}
            {s.model_provider ? <li class="row"><span class="t">paid by</span><span class="n">{s.model_provider === 'open-autonomy' ? 'the project' : s.model_provider}</span></li> : null}
          </ul>
        </div>
      </div>
    </Shell>
  );
}
const brief = (i: RoadmapItem, a: string, now: number, hot = false) => (
  <div class={`brief${hot ? ' hot' : ''}`}>
    <div class="t"><a href={at(a, 'dashboard', 'board', i.id)}>{i.title}</a></div>
    <div class="m">{i.status === 'active' ? 'in progress' : i.status}{i.by ? ` · ${i.by}` : ''}{i.release ? ` · ${i.release}` : ''}{i.done_at ? ` · ${fmtAgo(i.done_at, now)}` : i.started_at ? ` · since ${fmtAgo(i.started_at, now)}` : ''}{i.commit ? ` · ${shortSha(i.commit)}` : ''}</div>
  </div>
);
export function Board(d: DashData) {
  const a = d.v.account; const items = d.roadmap.items;
  const future = items.filter((i) => tenseOf(i) === 'future'), present = items.filter((i) => tenseOf(i) === 'present'), past = items.filter((i) => tenseOf(i) === 'past').sort((x, y) => Date.parse(y.done_at ?? '') - Date.parse(x.done_at ?? '') || 0);
  return (
    <Shell d={d} page="board" title="Board">
      <div class="panel"><div class="board">
        <div><h3>Promised · {future.length}</h3>{future.length ? future.map((i) => brief(i, a, d.now)) : <p class="empty">Nothing promised.</p>}</div>
        <div><h3>In progress · {present.length}</h3>{present.length ? present.map((i) => brief(i, a, d.now, i.status === 'active')) : <p class="empty">Nothing in progress.</p>}</div>
        <div><h3>Shipped · {past.length}</h3>{past.slice(0, 15).map((i) => brief(i, a, d.now))}{past.length > 15 ? <details><summary class="fine">The other {past.length - 15}</summary>{past.slice(15).map((i) => brief(i, a, d.now))}</details> : null}</div>
      </div></div>
    </Shell>
  );
}
export function Books(d: DashData) {
  const a = d.v.account; const gifts = (d.v.feed ?? []).filter((f: Flow) => f.kind === 'grant' || f.kind === 'mint');
  return (
    <Shell d={d} page="books" title="Books">
      <div class="grid">
        <div class="panel span12"><h2>The ledger</h2><div class="kpis">
          <div class="kpi"><div class="v">{usd(d.v.granted_in_usd_cents)}</div><div class="l">put in</div></div>
          <div class="kpi"><div class="v">{usd(d.v.consumed_usd_cents)}</div><div class="l">spent, every cent metered</div></div>
          <div class="kpi"><div class="v">{usd(d.v.balance_usd_cents)}</div><div class="l">balance</div></div>
          <div class="kpi"><div class="v">{usd(d.v.burn_per_day_usd_cents)}</div><div class="l">burn a day</div></div>
        </div></div>
        <div class="panel span6"><h2>Money in</h2>{gifts.length ? <table class="table"><thead><tr><th>When</th><th>From</th><th>What</th><th class="n">Amount</th></tr></thead><tbody>{gifts.map((g) => <tr><td style="white-space:nowrap">{fmtAgo(g.ts, d.now)}</td><td>{g.from ? g.from.replace(/^@/, '') : 'the operator'}</td><td>{g.kind === 'grant' ? 'a grant' : 'added'}{g.note ? ` · “${g.note}”` : ''}{g.by ? ` · passed on by ${g.by}` : ''}</td><td class="n ok">+{usd(g.amount_usd_cents)}</td></tr>)}</tbody></table> : <p class="empty">Nothing put in yet.</p>}</div>
        <div class="panel span6"><h2>Earmarked · the owner's bounds</h2>
          {d.v.envelopes.length ? <ul class="rows">{d.v.envelopes.map((e: Envelope) => <li class="row"><span class="t">{e.purpose.type === 'item' ? `for ${e.purpose.item}` : e.purpose.type === 'models' ? `for ${e.purpose.models.join(', ')}` : e.purpose.type === 'model' ? 'for model calls' : 'for anything'}{e.from ? ` · from ${e.from}` : ''}</span><span class="n">{usd(e.balance_usd_cents)} left</span></li>)}</ul> : <p class="empty">No earmarks.</p>}
          <ul class="rows" style="margin-top:14px">{d.v.bounds.models.length ? <li class="row"><span class="t">models</span><span class="n">{d.v.bounds.models.join(', ')}</span></li> : null}{d.v.bounds.limits.map((l) => <li class="row"><span class="t">{l.model ? `${l.model} · ` : ''}{l.usd_cents !== undefined ? `${usd(l.usd_cents)} a ${l.window}` : l.calls !== undefined ? `${l.calls} calls a ${l.window}` : `${l.tokens} tokens a ${l.window}`}</span><span class="n">{l.usd_cents !== undefined ? `${usd(l.used.usd_cents)} used` : l.calls !== undefined ? `${l.used.calls} used` : `${l.used.tokens} used`}</span></li>)}</ul>
        </div>
        {sees(d.viewer, d.visibility.calls) ? <div class="panel span12"><h2>Every metered call</h2>{d.calls?.length ? <div class="tw"><table class="table"><thead><tr><th>When</th><th>What</th><th>Session</th><th class="n">Cost</th></tr></thead><tbody>{d.calls.map((c) => <tr><td style="white-space:nowrap">{fmtAgo(c.ts, d.now)}</td><td>{c.rail === 'card' ? `card · ${c.merchant ?? ''}` : c.rail === 'partner' ? 'partner' : c.model ?? 'model'}</td><td class="mono">{c.session ? <a href={at(a, 'dashboard', 'sessions', c.session)}>{c.session.slice(0, 28)}</a> : '—'}</td><td class="n">{usd(c.usd_cents)}</td></tr>)}</tbody></table></div> : <p class="empty">No calls yet.</p>}</div> : null}
      </div>
    </Shell>
  );
}
export function Agent(d: DashData) {
  const schedule = ((): Schedule[] => { try { const j = JSON.parse(d.v.profile.schedule_json ?? '{}') as { jobs?: Schedule[] }; return Array.isArray(j.jobs) ? j.jobs : []; } catch { return []; } })();
  const rt = ((): { mode?: string; kit?: string; executor?: string; host?: string } | undefined => { try { return JSON.parse(d.v.profile.agent_runtime ?? ''); } catch { return undefined; } })();
  const skills = (d.v.profile.agent_skills ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return (
    <Shell d={d} page="agent" title="Agent">
      <div class="grid">
        <div class="span4"><AgentCard d={d} /></div>
        <div class="panel span4"><h2>Runs on</h2><ul class="rows">
          {schedule.map((j) => <li class="row"><span class="t">{j.name ?? 'job'}</span><span class="n">fires {j.schedule ?? '?'}</span></li>)}
          {rt?.mode ? <li class="row"><span class="t">{rt.mode === 'container' ? 'in a container' : 'bare on a host'}</span><span class="n">{[rt.executor, rt.host].filter(Boolean).join(' · ') || '—'}</span></li> : null}
          {rt?.kit ? <li class="row"><span class="t">kit</span><span class="n">{rt.kit}</span></li> : null}
          {skills.length ? <li class="row"><span class="t">skills</span><span class="n">{skills.join(' · ')}</span></li> : null}
        </ul></div>
        <div class="panel span4"><h2>Who it is</h2>{d.v.profile.soul_md ? <div class="prose" dangerouslySetInnerHTML={{ __html: mdToSafeHtml(firstLine(d.v.profile.soul_md, 600)) }} /> : <p class="empty">Not published yet.</p>}</div>
        <div class="panel span12"><h2>How it runs</h2>{d.v.profile.setup_md ? <div class="prose" dangerouslySetInnerHTML={{ __html: mdToSafeHtml(d.v.profile.setup_md) }} /> : <p class="empty">Not published yet.</p>}</div>
      </div>
    </Shell>
  );
}
export function Team(d: DashData) {
  const LABELS: Record<string, string> = { owner: 'Owner', direction: 'Project direction', moderation: 'Moderation', 'release-review': 'Release review' };
  return (
    <Shell d={d} page="team" title="Team">
      <div class="grid">
        <div class="panel span8"><h2>The roster<span class="fine" style="margin:0;text-transform:none;letter-spacing:0">from the committed config</span></h2>
          {d.team?.length ? <table class="table"><thead><tr><th>Person</th><th>Accounts</th><th>Authority</th></tr></thead><tbody>{d.team.map((m) => <tr><td><b>{m.name}</b></td><td>{m.github ? <a class="chip" href={`https://github.com/${encodeURIComponent(m.github.login)}`}><img src={`https://github.com/${encodeURIComponent(m.github.login)}.png?size=48`} alt="" />@{m.github.login}</a> : null}{m.discord ? <span class="chip">Discord · {m.discord.name}</span> : null}</td><td>{m.scopes.length ? m.scopes.map((x) => LABELS[x] ?? x).join(' · ') : 'Contributor'}</td></tr>)}</tbody></table> : <p class="empty">No team recorded yet.</p>}
        </div>
        <div class="panel span4"><h2>Changing it</h2><p class="fine" style="margin:0">The roster lives in <code>.open-autonomy/config.yaml</code>; an owner edits it on the project page's Team door, which opens a pull request. Release authority still requires human review of the specific release.</p></div>
      </div>
    </Shell>
  );
}
export function dashDocument(title: string, brand: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="preconnect" href="https://fonts.googleapis.com"><link href="${FONTS}" rel="stylesheet"><title>${esc(title)} · ${esc(brand)}</title><style>${DASH_CSS}</style></head><body>${body}<script>${LIVE}</script></body></html>`;
}
