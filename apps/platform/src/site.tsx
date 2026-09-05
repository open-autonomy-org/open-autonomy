import { raw } from 'hono/html';
import type { Roadmap } from '@open-autonomy/sdk/roadmap';
import type { DirectoryEntry, Flow, ItemView, Patron, ProjectView, RoadmapRevision, SessionRecord, SessionSummary } from './ledger.js';
import { ItemPage, LIVE_SCRIPT, SessionPage, SessionsPage, SetupPanel, Spine, leadParagraphs } from './stream-view.js';
import { Icon, LOGO_SVG, fmtAgo, mdToSafeHtml, render, usd, usd0 } from './ui.js';

// The funding site, server-rendered from the books: the explore grid (GET /) and the project page
// (GET /p/:account) with its session and item pages. No client JS beyond the coupon form and the live
// channel. Light theme, coral accent, generous whitespace.

export const C = { bg: '#ffffff', wash: '#f6f5f3', panel: '#ffffff', ink: '#16171a', body: '#3d3f44', muted: '#76787d', faint: '#9a9ca1', line: '#ece9e4', accent: '#ff424d', accentDark: '#e2333d', green: '#0a8754', amber: '#c77700', gray: '#9a9ca1' };
const STATUS = { funded: { color: C.green, label: 'Funded' }, low: { color: C.amber, label: 'Low' }, unfunded: { color: C.gray, label: 'Unfunded' } } as const;
const ownerOf = (account: string): string => account.split('/')[0];
const nameOf = (account: string): string => account.split('/')[1] ?? account;
const repoUrlOf = (account: string): string | undefined => (account.includes('/') ? `https://github.com/${account}` : undefined);

// Only http(s) image URLs with no characters that could break out of an attribute or a CSS url('…').
const safeUrl = (url: string | undefined): string | undefined => (url && /^https:\/\/[^\s'"()<>\\]+$/.test(url) ? url : undefined);
function coverStyle(url: string | undefined, seed = ''): string {
  const safe = safeUrl(url);
  if (safe) return `background-image:url('${safe}')`;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return `background:linear-gradient(135deg,hsl(${h} 48% 64%),hsl(${(h + 40) % 360} 52% 54%))`;
}
function Avatar({ url, size, cls = '' }: { url?: string; size: number; cls?: string }) {
  const safe = safeUrl(url);
  return safe ? <img class={`avatar ${cls}`} src={safe} width={size} height={size} alt="" loading="lazy" style={`width:${size}px;height:${size}px`} /> : <span class={`avatar ph ${cls}`} style={`width:${size}px;height:${size}px`} />;
}
function goalLine(e: DirectoryEntry): { label: string; frac: number } {
  if (!e.funded || e.balance_usd_cents <= 0) return { label: 'Awaiting funding', frac: 0 };
  const days = e.runway_days !== null ? Math.max(0, Math.round(e.runway_days)) : 0;
  const shown = days > 9999 ? '9,999+' : days.toLocaleString('en-US');
  return { label: days >= e.goal_days ? `${shown} days funded · goal met` : `${shown} of ${e.goal_days} days funded`, frac: Math.min(1, days / Math.max(1, e.goal_days)) };
}
const Progress = ({ frac, color }: { frac: number; color: string }) => <div class="track"><div class="fill" style={`width:${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%;background:${color}`} /></div>;
const StatusDot = ({ status }: { status: keyof typeof STATUS }) => <span class="status"><span class="dot" style={`background:${STATUS[status].color}`} />{STATUS[status].label}</span>;

export const STYLES = `
  *{box-sizing:border-box;}
  html{-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;}
  body{margin:0;background:${C.bg};color:${C.ink};font:16px/1.6 'Inter',-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;}
  a{color:inherit;text-decoration:none;}
  .wrap{max-width:1080px;margin:0 auto;padding:0 24px 96px;}
  .nav{display:flex;align-items:center;height:68px;border-bottom:1px solid ${C.line};margin-bottom:48px;position:sticky;top:0;background:rgba(255,255,255,.85);backdrop-filter:saturate(180%) blur(12px);z-index:10;}
  .nav .inner{display:flex;align-items:center;gap:20px;width:100%;max-width:1080px;margin:0 auto;padding:0 24px;}
  .nav .brand{display:inline-flex;align-items:center;gap:9px;font-weight:800;font-size:19px;letter-spacing:-.02em;}
  .nav .brand svg{width:26px;height:26px;display:block;}
  .nav .links a{color:${C.muted};font-weight:600;font-size:15px;}
  .nav .spacer{flex:1;}
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;background:${C.accent};color:#fff;font-weight:700;font-size:15px;padding:11px 20px;border-radius:999px;border:0;cursor:pointer;line-height:1;white-space:nowrap;}
  .btn:hover{background:${C.accentDark};}
  .btn.block{width:100%;padding:13px 20px;}
  .btn.ghost{background:#fff;color:${C.ink};border:1.5px solid #d4d1cb;}
  .btn.outline{background:#fff;color:${C.accent};border:1.5px solid #ffd0d3;}
  .display{font-size:46px;line-height:1.05;font-weight:800;letter-spacing:-.03em;margin:8px 0 14px;}
  .lede{color:${C.muted};font-size:19px;line-height:1.5;max-width:640px;margin:0 0 28px;}
  .stripe{display:flex;gap:36px;flex-wrap:wrap;padding:18px 0 0;border-top:1px solid ${C.line};margin-top:8px;}
  .stripe .n{font-size:24px;font-weight:800;letter-spacing:-.02em;display:block;}
  .stripe .k{color:${C.muted};font-size:14px;font-weight:500;}
  .sectionhdr{display:flex;align-items:baseline;justify-content:space-between;margin:48px 0 20px;}
  .sectionhdr h2{font-size:22px;font-weight:800;letter-spacing:-.02em;margin:0;}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(312px,1fr));gap:24px;}
  .card{background:${C.panel};border:1px solid ${C.line};border-radius:18px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 2px 8px rgba(36,40,47,.04),0 4px 12px rgba(36,40,47,.06);}
  .card .cover{height:104px;background-size:cover;background-position:center;}
  .card .cbody{padding:0 24px 24px;display:flex;flex-direction:column;gap:8px;flex:1;}
  .card .av{margin-top:-30px;margin-bottom:2px;}
  .avatar{border-radius:50%;background:${C.wash};object-fit:cover;display:inline-block;}
  .avatar.ring{border:4px solid #fff;box-shadow:0 2px 6px rgba(16,17,26,.12);}
  .avatar.ph{background:linear-gradient(135deg,#cfd2d6,#a9adb3);}
  .pname{font-weight:800;font-size:18px;letter-spacing:-.01em;}
  .ptag{color:#575e6a;font-size:14.5px;line-height:1.55;min-height:44px;}
  .pmeta{color:${C.body};font-size:14px;font-weight:500;}
  .goalrow{display:flex;justify-content:space-between;align-items:center;font-size:13.5px;color:${C.muted};margin-top:4px;}
  .track{height:8px;background:${C.wash};border-radius:999px;overflow:hidden;margin-top:6px;}
  .fill{height:100%;border-radius:999px;}
  .status{display:inline-flex;align-items:center;gap:7px;font-size:13px;font-weight:600;color:${C.body};}
  .dot{width:9px;height:9px;border-radius:50%;display:inline-block;}
  .cardfoot{margin-top:auto;padding-top:14px;}
  .cardfoot .join{margin-top:14px;}
  .cover-hero{height:200px;border-radius:20px;background-size:cover;background-position:center;border:1px solid ${C.line};}
  .phead{margin:-52px 0 48px 8px;}
  .phead .avatar{display:block;position:relative;z-index:1;}
  .phead .htext{margin-top:18px;}
  .phead h1{font-size:38px;font-weight:800;letter-spacing:-.03em;margin:0 0 4px;}
  .phead .tag{color:${C.muted};font-size:17px;margin:0 0 12px;}
  .metarow{display:flex;gap:16px;align-items:center;flex-wrap:wrap;color:${C.body};font-size:15px;}
  .metarow .sep{color:${C.line};}
  .repo-pill{display:inline-flex;align-items:center;gap:7px;background:${C.wash};border:1px solid ${C.line};border-radius:999px;padding:5px 12px;font-size:13.5px;font-weight:600;color:${C.ink};line-height:1;}
  .cols{display:grid;grid-template-columns:1fr 360px;gap:32px;align-items:start;}
  @media(max-width:880px){.cols{grid-template-columns:1fr;}}
  .side{position:sticky;top:92px;}
  .panel{background:${C.panel};border:1px solid ${C.line};border-radius:18px;padding:24px;margin-bottom:24px;box-shadow:0 2px 8px rgba(36,40,47,.04),0 4px 12px rgba(36,40,47,.06);}
  .panel h3{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:${C.faint};margin:0 0 16px;}
  .sub{color:${C.muted};font-size:14px;margin-top:4px;}
  .feed{list-style:none;margin:0;padding:0;}
  .feed li{display:flex;justify-content:space-between;gap:14px;align-items:center;padding:10px 0;border-bottom:1px solid ${C.line};font-size:14px;}
  .feed li:last-child{border-bottom:0;}
  .feed .amt{font-weight:700;color:${C.green};font-variant-numeric:tabular-nums;}
  .feed .when{color:${C.faint};font-size:12.5px;}
  .ledger{display:flex;flex-wrap:wrap;gap:18px 28px;margin-top:16px;}
  .ledger .item .v{font-weight:700;font-size:17px;font-variant-numeric:tabular-nums;}
  .ledger .item .l{color:${C.muted};font-size:13px;}
  .patrons{display:flex;flex-wrap:wrap;gap:10px;}
  .patron{display:inline-flex;align-items:center;gap:9px;background:${C.wash};border-radius:999px;padding:6px 14px 6px 6px;font-size:14px;font-weight:600;color:${C.ink};}
  .patron .tag{color:${C.muted};font-weight:500;}
  .tier{border:1.5px solid ${C.line};border-radius:16px;padding:20px;margin-bottom:14px;position:relative;}
  .tier.feat{border-color:${C.accent};box-shadow:0 8px 28px -14px rgba(255,66,77,.5);}
  .tier .th{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;}
  .tier .tn{font-weight:800;font-size:16px;}
  .tier .tp{font-weight:800;font-size:20px;letter-spacing:-.02em;}
  .tier .tp span{font-weight:500;font-size:13px;color:${C.muted};}
  .tier p{color:${C.body};font-size:14px;margin:0 0 14px;}
  .tier .pay{display:flex;gap:8px;margin-bottom:8px;}
  .tier .pay .btn{flex:1;padding:11px 12px;}
  .coupon{display:flex;gap:10px;margin-top:6px;}
  .coupon input{flex:1;min-width:0;background:${C.bg};border:1.5px solid ${C.line};border-radius:12px;color:${C.ink};padding:11px 14px;font:14px 'Inter',ui-monospace,Menlo,monospace;letter-spacing:.04em;}
  .note{color:${C.faint};font-size:13px;line-height:1.5;margin-top:10px;}
  .prose{color:${C.body};font-size:15px;line-height:1.65;}
  .prose p{margin:0 0 12px;}
  .prose p:last-child{margin-bottom:0;}
  .prose strong{font-weight:700;color:${C.ink};}
  .prose code{background:${C.wash};border-radius:5px;padding:1px 5px;font:13px ui-monospace,Menlo,monospace;}
  .docmore{display:inline-block;margin-top:14px;color:${C.accent};font-weight:600;font-size:14px;}
  .spine h3{margin-top:22px;}
  .spine h3:first-child{margin-top:0;}
  .spine .empty{list-style:none;color:${C.faint};font-size:13px;padding-left:28px;}
  .accept{margin:8px 0 4px 12px;padding:0 0 0 14px;color:${C.body};font-size:13px;line-height:1.5;}
  .receipt{margin:10px 0 4px 12px;padding:10px 12px;border:1px solid ${C.line};border-radius:10px;background:${C.bg};font-size:13px;}
  .receipt.live{border-color:${C.accent};}
  .receipt.failed{border-color:#f85149;}
  .rc-head{display:flex;gap:12px;align-items:baseline;color:${C.muted};font-variant-numeric:tabular-nums;flex-wrap:wrap;}
  .rc-when{font-weight:700;color:${C.ink};}
  .rc-kind{color:${C.accentDark};font-weight:600;}
  .rc-fail{color:#f85149;font-weight:700;}
  .rc-report{margin:6px 0;color:${C.body};white-space:pre-wrap;}
  .rc-proofs{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;font-weight:600;}
  .rc-proofs a{color:${C.accent};}
  .rc-proofs .missing,.proofs .missing{color:${C.faint};font-weight:500;}
  .rc-none{margin:6px 0 2px 12px;color:${C.faint};font-size:12px;}
  .livebox,.schedbox{border:1px solid ${C.line};border-radius:12px;padding:12px 14px;font-size:14px;color:${C.body};margin-bottom:8px;}
  .livebox{border-color:${C.accent};background:#fffafa;}
  .lb-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
  .sched{margin:2px 0;}
  .sched.last{color:${C.muted};font-size:13px;margin-top:6px;}
  .facts{display:grid;grid-template-columns:max-content 1fr;gap:4px 14px;margin:8px 0 12px;font-size:13px;}
  .facts .k{color:${C.faint};text-transform:uppercase;letter-spacing:.04em;font-size:11px;padding-top:2px;}
  .facts .v{color:${C.body};}
  .fact{display:contents;}
  #setup h4{font-size:13px;margin:14px 0 4px;color:${C.body};}
  #setup h4 .filelink{margin-left:8px;font-weight:400;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:${C.muted};}
  .crumb{margin:18px 0 8px;font-size:13px;}
  .crumb a{color:${C.muted};}
  .jobhead h1{font-size:22px;font-weight:800;letter-spacing:-.02em;margin:0 0 6px;}
  .jobhead .item{color:${C.accent};font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:18px;}
  .jobhead .meta{margin:0;color:${C.muted};font-size:14px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
  .report{white-space:pre-wrap;font-family:inherit;font-size:14px;color:${C.body};margin:0;line-height:1.5;}
  .proofs{margin:0;padding-left:18px;font-size:14px;color:${C.body};line-height:1.7;}
  .turns{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:1.5;}
  .turn{display:flex;gap:10px;padding:3px 0;border-bottom:1px solid ${C.wash};align-items:baseline;}
  .turn .ts{flex:none;color:${C.faint};width:64px;}
  .turn .tn{flex:none;color:${C.accentDark};font-weight:700;min-width:96px;}
  .turn .ta{flex:1;min-width:0;color:${C.body};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .turn.say .tx{flex:1;white-space:pre-wrap;color:${C.ink};font-family:inherit;font-size:13px;}
  details.turn{display:block;}
  details.turn summary{display:flex;gap:10px;cursor:pointer;list-style:none;align-items:baseline;}
  details.turn summary::-webkit-details-marker{display:none;}
  details.turn pre{margin:6px 0 6px 74px;padding:8px 10px;background:${C.wash};border-radius:8px;white-space:pre-wrap;max-height:320px;overflow:auto;font-size:11px;}
  .updates{list-style:none;margin:0;padding:0;}
  .updates li{padding:10px 0;border-bottom:1px solid ${C.line};font-size:14px;}
  .updates li:last-child{border-bottom:0;}
  .updates .u-when{color:${C.faint};font-size:12.5px;display:block;margin-bottom:4px;}
  .updates .u-sess{color:${C.accent};font-size:12px;font-weight:600;}
  .rm-spine{list-style:none;margin:0;padding:0;position:relative;}
  .rm-spine::before{content:'';position:absolute;left:6px;top:10px;bottom:12px;width:2px;background:${C.line};}
  .rm-stn{position:relative;padding-left:28px;padding-bottom:10px;}
  .rm-node{position:absolute;left:0;top:13px;width:14px;height:14px;border-radius:50%;background:${C.bg};border:2px solid ${C.line};box-sizing:border-box;z-index:1;}
  .rm-stn.active .rm-node{background:${C.accent};border-color:${C.accent};box-shadow:0 0 0 4px rgba(255,66,77,.14);}
  .rm-stn.planned .rm-node{border-color:${C.muted};}
  .rm-stn.proposed .rm-node{border-style:dashed;border-color:${C.faint};}
  .rm-stn.done .rm-node{background:${C.green};border-color:${C.green};}
  .rm-stn.done{opacity:0.8;}
  .rm-shead{display:flex;align-items:center;gap:9px;padding:9px 12px;border:1px solid ${C.line};border-radius:10px;background:${C.bg};}
  .rm-stn.active .rm-shead{border-color:${C.accent};background:#fffafa;}
  .rm-stn.proposed .rm-shead{border-style:dashed;background:transparent;}
  .rm-stitle{flex:1;min-width:0;font-size:14px;font-weight:600;color:${C.ink};line-height:1.35;}
  .rm-stitle:hover{color:${C.accent};}
  .rm-stn.done .rm-stitle{color:${C.muted};font-weight:500;}
  .rm-now{flex:none;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#fff;background:${C.accent};border-radius:999px;padding:2px 7px;}
  .rm-sphase{flex:none;font-size:11px;font-weight:700;color:${C.faint};font-variant-numeric:tabular-nums;}
  .rm-sstatus{flex:none;font-size:12px;font-weight:700;color:${C.muted};}
  .release{margin-bottom:18px;}
  .rel-head{font-weight:800;font-size:14px;color:${C.ink};margin-bottom:8px;}
  .changelog{list-style:none;margin:0;padding:0;}
  .changelog li{color:${C.body};font-size:14px;line-height:1.55;padding:5px 0 5px 18px;position:relative;}
  .changelog li:before{content:'';position:absolute;left:2px;top:11px;width:5px;height:5px;border-radius:50%;background:${C.accent};}
  .empty{color:${C.muted};text-align:center;padding:72px 0;border:1px dashed ${C.line};border-radius:18px;}
  .legend{color:${C.faint};font-size:13px;margin-top:28px;}
  .live{display:inline-flex;align-items:center;gap:6px;color:${C.green};font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;}
  .pulse{width:8px;height:8px;border-radius:50%;background:${C.green};box-shadow:0 0 0 0 rgba(10,135,84,.5);animation:pulse 1.8s infinite;}
  @keyframes pulse{0%{box-shadow:0 0 0 0 rgba(10,135,84,.5);}70%{box-shadow:0 0 0 7px rgba(10,135,84,0);}100%{box-shadow:0 0 0 0 rgba(10,135,84,0);}}
`;

function Shell({ title, children }: { title: string; children?: unknown }) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
        <title>{title}</title>
        <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

function Nav() {
  return (
    <div class="nav"><div class="inner">
      <a href="/" class="brand">{raw(LOGO_SVG)}<span>open-autonomy</span></a>
      <span class="links"><a href="/">Explore</a></span>
      <span class="spacer"></span>
      <a class="btn" href="https://github.com/sponsors/open-autonomy-org">Become a patron</a>
    </div></div>
  );
}

function ProjectCard({ e }: { e: DirectoryEntry }) {
  const g = goalLine(e);
  const href = `/p/${encodeURIComponent(e.account)}`;
  return (
    <div class="card">
      <a href={href}><div class="cover" style={coverStyle(e.profile.cover_url, e.account)} /></a>
      <div class="cbody">
        <div class="av"><Avatar url={e.profile.avatar_url} size={60} cls="ring" /></div>
        <a href={href} class="pname">{nameOf(e.account)}</a>
        <div class="ptag">{e.profile.tagline ?? ''}</div>
        <div class="pmeta"><b>{e.patron_count}</b>{` patron${e.patron_count === 1 ? '' : 's'} · `}<b>{e.monthly_usd_cents ? `${usd0(e.monthly_usd_cents)}/mo` : '$0/mo'}</b>{e.live_sessions.length ? <> · <span class="live"><span class="pulse" />working</span></> : null}</div>
        <div class="cardfoot">
          <div class="goalrow"><span>{g.label}</span><StatusDot status={e.status} /></div>
          <Progress frac={g.frac} color={STATUS[e.status].color} />
          <a class="btn block join" href={`https://github.com/sponsors/${ownerOf(e.account)}`}>Join</a>
        </div>
      </div>
    </div>
  );
}

export function renderExplore(entries: DirectoryEntry[]): string {
  const listed = entries.filter((e) => e.listed);
  const totalIn = listed.reduce((s, e) => s + (e.granted_in_usd_cents - e.granted_out_usd_cents), 0);
  const totalSpent = listed.reduce((s, e) => s + e.consumed_usd_cents, 0);
  const patrons = listed.reduce((s, e) => s + e.patron_count, 0);
  return render(
    <Shell title="Self-building projects, funded in the open · open-autonomy">
      <Nav />
      <div class="wrap">
        <h1 class="display">Fund a project that builds itself.</h1>
        <p class="lede">Each project here runs its own agent on a roadmap it keeps in its repository. Back one, and every session it works, every cent it spends and everything it ships is on this page.</p>
        <div class="stripe">
          <div><span class="n">{usd0(totalIn)}</span><span class="k">funded</span></div>
          <div><span class="n">{usd0(totalSpent)}</span><span class="k">spent by agents</span></div>
          <div><span class="n">{listed.length}</span><span class="k">{`project${listed.length === 1 ? '' : 's'}`}</span></div>
          <div><span class="n">{patrons}</span><span class="k">{`patron${patrons === 1 ? '' : 's'}`}</span></div>
        </div>
        <div class="sectionhdr"><h2>Projects</h2></div>
        {listed.length ? <div class="grid">{listed.map((e) => <ProjectCard e={e} />)}</div> : <div class="empty">No projects yet. A repository appears here once it has a key and its public repository has synced.</div>}
        <div class="legend">A project lists itself the first time it mints a key and its public repository syncs.</div>
      </div>
    </Shell>,
  );
}

function PatronChip({ p }: { p: Patron }) {
  const inner = <><Avatar url={p.avatar_url} size={26} /><span>{p.name ?? p.login}{p.kind === 'project' ? <span class="tag"> project</span> : null}</span></>;
  return p.url ? <a class="patron" href={p.url}>{inner}</a> : <span class="patron">{inner}</span>;
}

function VisionPanel({ md, repoUrl }: { md?: string; repoUrl?: string }) {
  const excerpt = leadParagraphs(md, 1);
  if (!excerpt) return null;
  return <div class="panel"><h3>Vision</h3><div class="prose" dangerouslySetInnerHTML={{ __html: mdToSafeHtml(excerpt) }} />{repoUrl ? <a class="docmore" href={`${repoUrl}/blob/HEAD/docs/VISION.md`}>Read the full vision →</a> : null}</div>;
}

export function parseChangelog(md: string, maxSections = 2, maxLines = 6): Array<{ heading: string; lines: string[] }> {
  const sections: Array<{ heading: string; lines: string[] }> = [];
  let cur: { heading: string; lines: string[] } | null = null;
  for (const line of md.split('\n')) {
    const hm = line.match(/^##\s+(.+?)\s*$/);
    if (hm) { if (cur) sections.push(cur); cur = { heading: hm[1].trim(), lines: [] }; continue; }
    const bm = cur && line.match(/^\s*-\s+(.+?)\s*$/);
    if (bm && cur) cur.lines.push(bm[1].trim());
  }
  if (cur) sections.push(cur);
  return sections.slice(0, maxSections).map((s) => ({ heading: s.heading, lines: s.lines.slice(0, maxLines) }));
}
function ChangelogPanel({ md, repoUrl }: { md?: string; repoUrl?: string }) {
  const withLines = parseChangelog(md ?? '').filter((s) => s.lines.length);
  if (!withLines.length) return null;
  return (
    <div class="panel">
      <h3>What's shipped</h3>
      {withLines.map((s) => <div class="release"><div class="rel-head">{s.heading}</div><ul class="changelog">{s.lines.map((l) => <li>{l}</li>)}</ul></div>)}
      {repoUrl ? <a class="docmore" href={`${repoUrl}/blob/HEAD/CHANGELOG.md`}>Full changelog →</a> : null}
    </div>
  );
}

function FundRow({ f, now }: { f: Flow; now: number }) {
  const label = f.kind === 'grant' ? `Granted from ${f.from ?? ''}` : f.sponsor_login ? `Sponsored by @${f.sponsor_login}` : 'Funded';
  return <li><span>{label}<span class="when"> · {fmtAgo(f.ts, now)}</span></span><span class="amt">+{usd(f.amount_usd_cents)}</span></li>;
}

// A tier says what the platform delivers for it: the patrons wall, and the runway the amount buys at the
// project's own burn. Two doors, side by side, onto the same books: Polar (monthly or once, when the
// platform has it) and GitHub Sponsors.
function TierCard({ t, i, feat, owner, burn, account, polar }: { t: ProjectView['tiers'][number]; i: number; feat: boolean; owner: string; burn: number; account: string; polar: boolean }) {
  const days = burn > 0 ? Math.round(t.usd_cents / burn) : null;
  return (
    <div class={`tier${feat ? ' feat' : ''}`}>
      <div class="th"><span class="tn">{t.name}</span><span class="tp">{usd0(t.usd_cents)} <span>/mo</span></span></div>
      <p>On the patrons wall{days !== null ? `; about ${days} day${days === 1 ? '' : 's'} of the agent's runway each month at its current burn` : ''}.</p>
      {polar ? (
        <form class="pay" method="post" action="/v1/patrons/checkout">
          <input type="hidden" name="account" value={account} /><input type="hidden" name="tier" value={String(i)} />
          <button class={`btn block ${feat ? '' : 'outline'}`} type="submit" name="interval" value="month">{usd0(t.usd_cents)} monthly</button>
          <button class="btn block outline" type="submit" name="interval" value="once">{usd0(t.usd_cents)} once</button>
        </form>
      ) : null}
      <a class={`btn block ${feat && !polar ? '' : 'outline'}`} href={`https://github.com/sponsors/${owner}`}><Icon name="github" /> Sponsor on GitHub</a>
    </div>
  );
}

function Project({ v, sessions, live, roadmap, revision, now, polar }: { v: ProjectView; sessions: SessionSummary[]; live: string[]; roadmap: Roadmap; revision?: RoadmapRevision; now: number; polar: boolean }) {
  const owner = ownerOf(v.account);
  const g = goalLine(v);
  const enc = encodeURIComponent(v.account);
  const repoUrl = repoUrlOf(v.account);
  return (
    <>
      <Nav />
      <div class="wrap">
        <div class="cover-hero" style={coverStyle(v.profile.cover_url, v.account)} />
        <div class="phead">
          <Avatar url={v.profile.avatar_url} size={104} cls="ring" />
          <div class="htext">
            <h1>{nameOf(v.account)}</h1>
            <p class="tag">{v.profile.tagline ?? `${owner}/${nameOf(v.account)}`}</p>
            <div class="metarow">
              <span><b>{v.patron_count}</b> patrons</span><span class="sep">|</span>
              <span><b>{v.monthly_usd_cents ? `${usd0(v.monthly_usd_cents)}/mo` : '$0/mo'}</b></span><span class="sep">|</span>
              <StatusDot status={v.status} />
              {repoUrl ? <><span class="sep">|</span><a class="repo-pill" href={repoUrl} target="_blank" rel="noopener"><Icon name="github" size={15} />{v.account}<span class="ext"><Icon name="linkExternal" size={11} /></span></a></> : null}
            </div>
          </div>
        </div>
        <div class="cols">
          <div>
            <VisionPanel md={v.profile.vision_md} repoUrl={repoUrl} />
            <Spine account={v.account} roadmap={roadmap} scheduleJson={v.profile.schedule_json} sessions={sessions} live={live} repoUrl={repoUrl} now={now} />
            {revision ? <p class="note">Roadmap from <b>{revision.source}</b>, revision {revision.revision}, {fmtAgo(revision.ts, now)}{revision.by ? ` by ${revision.by}` : ''}{revision.conformance.length ? <> · this source cannot say: {revision.conformance.join('; ')}</> : null} · <a href={`/v1/accounts/${enc}/roadmap/revisions`}>every revision</a></p> : null}
            <SetupPanel setupMd={v.profile.setup_md} soulMd={v.profile.soul_md} configYaml={v.profile.agent_config_yaml} scheduleJson={v.profile.schedule_json} repoUrl={repoUrl} />
            <ChangelogPanel md={v.profile.changelog_md} repoUrl={repoUrl} />
            <div class="panel">
              <h3>Goal</h3>
              <div class="goalrow" style="margin-bottom:2px"><span style={`font-size:15px;color:${C.body};font-weight:600`}>{g.label}</span></div>
              <Progress frac={g.frac} color={STATUS[v.status].color} />
              <p class="note">{`Keep ${v.goal_days} days of agent runway funded. Days remaining is a Bayesian estimate of daily spend.`}</p>
            </div>
            <div class="panel">
              <h3>Funding</h3>
              <img src={`/v1/accounts/${enc}/runway.svg`} width="460" height="116" style={`max-width:100%;border-radius:12px;border:1px solid ${C.line}`} alt="funding runway" />
              <div class="ledger">
                <div class="item"><div class="v">{usd(v.granted_in_usd_cents)}</div><div class="l">received</div></div>
                {v.granted_out_usd_cents > 0 ? <div class="item"><div class="v">{usd(v.granted_out_usd_cents)}</div><div class="l">funded onward</div></div> : null}
                <div class="item"><div class="v">{usd(v.consumed_usd_cents)}</div><div class="l">spent</div></div>
                <div class="item"><div class="v">{usd(v.balance_usd_cents)}</div><div class="l">balance</div></div>
              </div>
              {v.feed.length ? <ul class="feed" style="margin-top:14px">{v.feed.slice(0, 8).map((f) => <FundRow f={f} now={now} />)}</ul> : null}
              <a class="docmore" href={`/v1/accounts/${enc}/calls`}>Every metered call →</a>
            </div>
            <div class="panel"><h3>Patrons</h3>{v.patrons.length ? <div class="patrons">{v.patrons.map((p) => <PatronChip p={p} />)}</div> : <p class="sub">No patrons yet — be the first.</p>}</div>
          </div>
          <div class="side">
            <div class="panel">
              <h3>Become a patron</h3>
              {v.tiers.map((t, i) => <TierCard t={t} i={i} feat={i === 1} owner={owner} burn={v.burn_per_day_usd_cents} account={v.account} polar={polar} />)}
            </div>
            <div class="panel">
              <h3>Have a sponsor coupon?</h3>
              <form class="coupon" method="post" action={`/p/${enc}/redeem`}>
                <input name="code" placeholder="SPON-XXXX-XXXX-XXXX" autocomplete="off" />
                <button class="btn" type="submit">Redeem</button>
              </form>
              <p class="note">Funds this project's agent. At $0, it stops.</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export function renderProject(v: ProjectView, sessions: SessionSummary[] = [], live: string[] = [], roadmap: Roadmap = { schema: 'open-autonomy.roadmap.v3', items: [] }, revision?: RoadmapRevision, polar = false): string {
  return render(<Shell title={`${nameOf(v.account)} · open-autonomy`}><Project v={v} sessions={sessions} live={live} roadmap={roadmap} revision={revision} now={Date.now()} polar={polar} />{live.length ? <script dangerouslySetInnerHTML={{ __html: LIVE_SCRIPT }} /> : null}</Shell>);
}

export function renderSessionsPage(account: string, sessions: SessionSummary[], live: string[], nowMs: number): string {
  return render(<Shell title={`sessions · ${nameOf(account)} · open-autonomy`}><Nav /><SessionsPage account={account} sessions={sessions} live={live} repoUrl={repoUrlOf(account)} now={nowMs} /></Shell>);
}

export function renderSessionPage(account: string, s: SessionRecord, nowMs: number): string {
  return render(<Shell title={`${s.source ?? s.kind} · ${nameOf(account)} · open-autonomy`}><Nav /><SessionPage account={account} s={s} repoUrl={repoUrlOf(account)} now={nowMs} />{s.status === 'live' ? <script dangerouslySetInnerHTML={{ __html: LIVE_SCRIPT }} /> : null}</Shell>);
}

export function renderItemPage(v: ProjectView, view: ItemView, roadmap: Roadmap, nowMs: number): string {
  return render(<Shell title={`${view.item_id} · ${nameOf(v.account)} · open-autonomy`}><Nav /><ItemPage account={v.account} roadmap={roadmap} view={view} repoUrl={repoUrlOf(v.account)} now={nowMs} />{view.live.length ? <script dangerouslySetInnerHTML={{ __html: LIVE_SCRIPT }} /> : null}</Shell>);
}

export function renderMessage(account: string, ok: boolean, title: string, message: string): string {
  return render(
    <Shell title={`${title} · open-autonomy`}>
      <Nav />
      <div class="wrap">
        <div class="panel" style="max-width:540px;margin:56px auto;text-align:center;padding:44px 40px">
          <div style="font-size:44px;margin-bottom:8px">{ok ? '🎉' : '😕'}</div>
          <h1 style="font-size:26px;font-weight:800;letter-spacing:-.02em;margin:0 0 10px">{title}</h1>
          <p style={`color:${C.muted};font-size:16px;margin:0 0 24px`}>{message}</p>
          <a class="btn ghost" href={`/p/${encodeURIComponent(account)}`}>← Back to {account}</a>
        </div>
      </div>
    </Shell>,
  );
}
