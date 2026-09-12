import { raw } from 'hono/html';
import { ROADMAP_SCHEMA, itemState, type Roadmap } from '@open-autonomy/sdk/roadmap';
import { TEAM_SCOPES, type TeamMember } from '@open-autonomy/sdk/team';
import type { TeamFile } from './team.js';
import type { AgentControl, DirectoryEntry, Envelope, EnvelopePurpose, Flow, ItemView, ProjectView, RoadmapRevision, SessionRecord, SessionSummary } from './ledger.js';
import { ItemPage, LIVE_SCRIPT, SessionPage, SessionsPage, SetupPanel, Timeline, leadParagraphs, type TimelineQuery } from './stream-view.js';
import { Icon, LOGO_SVG, fmtAgo, fmtWhen, mdInlineToSafeHtml, mdToSafeHtml, render, usd, usd0 } from './ui.js';

// The agent's operating state on the page: nothing while the owner asked nothing and the automation is not paused; the
// owner's word beside the automation's answer when they differ; one word when they agree on paused. The platform shows
// both records as they are; a request the automation has never answered says so.
export function operatingLine(c: AgentControl | undefined): string | undefined {
  const desired = c?.desired?.state ?? 'running', observed = c?.observed?.state;
  const reason = c?.desired?.reason ? `: ${c.desired.reason}` : '';
  const note = c?.observed?.note ? ` · ${c.observed.note}` : '';
  if (desired === 'paused') return observed === 'paused' ? `paused by the owner ${fmtWhen(c!.desired!.at)}${reason}${note}` : `pause requested ${fmtWhen(c!.desired!.at)}${reason} · ${observed ? 'still running' : 'no answer from the agent yet'}`;
  if (observed === 'paused') return c?.desired ? `resume requested ${fmtWhen(c.desired.at)}${reason} · still paused${note}` : `paused ${fmtWhen(c!.observed!.at)}${note}`;
  return undefined;
}

// A project's page, server-rendered from the books: the timeline, the sessions, the items, the funding, the
// setup, the team. No client JS beyond the live channel. Light theme, coral accent, generous whitespace.
// What an app puts around it — its brand and navigation, its own styles, panels beside the funding — comes
// through `configurePage` once at load and `ProjectSlots` per request; the core page knows no door of its own.

export const C = { bg: '#ffffff', wash: '#f6f5f3', panel: '#ffffff', ink: '#16171a', body: '#3d3f44', muted: '#76787d', faint: '#9a9ca1', line: '#ece9e4', accent: '#ff424d', accentDark: '#e2333d', green: '#0a8754', amber: '#c77700', gray: '#9a9ca1' };
export const STATUS = { funded: { color: C.green, label: 'Funded' }, low: { color: C.amber, label: 'Low' }, unfunded: { color: C.gray, label: 'Unfunded' } } as const;
export const ownerOf = (account: string): string => account.split('/')[0];
export const nameOf = (account: string): string => account.split('/')[1] ?? account;
export const repoUrlOf = (account: string): string | undefined => (account.includes('/') ? `https://github.com/${account}` : undefined);

// Only http(s) image URLs with no characters that could break out of an attribute or a CSS url('…').
const safeUrl = (url: string | undefined): string | undefined => (url && /^https:\/\/[^\s'"()<>\\]+$/.test(url) ? url : undefined);
export function coverStyle(url: string | undefined, seed = ''): string {
  const safe = safeUrl(url);
  if (safe) return `background-image:url('${safe}')`;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return `background:linear-gradient(135deg,hsl(${h} 48% 64%),hsl(${(h + 40) % 360} 52% 54%))`;
}
export function Avatar({ url, size, cls = '' }: { url?: string; size: number; cls?: string }) {
  const safe = safeUrl(url);
  return safe ? <img class={`avatar ${cls}`} src={safe} width={size} height={size} alt="" loading="lazy" style={`width:${size}px;height:${size}px`} /> : <span class={`avatar ph ${cls}`} style={`width:${size}px;height:${size}px`} />;
}
export function goalLine(e: DirectoryEntry): { label: string; frac: number } {
  if (!e.funded || e.balance_usd_cents <= 0) return { label: 'Awaiting funding', frac: 0 };
  const days = e.runway_days !== null ? Math.max(0, Math.round(e.runway_days)) : 0;
  const shown = days > 9999 ? '9,999+' : days.toLocaleString('en-US');
  return { label: days >= e.goal_days ? `${shown} days funded · goal met` : `${shown} of ${e.goal_days} days funded`, frac: Math.min(1, days / Math.max(1, e.goal_days)) };
}
const itemTitle = (roadmap: Roadmap, id: string): string => roadmap.items.find((item) => item.id === id)?.title ?? id;
export function purposeSentence(account: string, purpose: EnvelopePurpose, roadmap?: Roadmap): string {
  if (purpose.type === 'item') return `the task '${roadmap ? itemTitle(roadmap, purpose.item) : purpose.item}'`;
  if (purpose.type === 'models') return `model calls on ${purpose.models.join(', ')}`;
  if (purpose.type === 'model') return 'model calls only';
  return purpose.type === 'any' ? 'anything the agent spends on' : `whatever ${nameOf(account)} needs`;
}
export const Progress = ({ frac, color }: { frac: number; color: string }) => <div class="track"><div class="fill" style={`width:${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%;background:${color}`} /></div>;
export const StatusDot = ({ status }: { status: keyof typeof STATUS }) => <span class="status"><span class="dot" style={`background:${STATUS[status].color}`} />{STATUS[status].label}</span>;

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
  .bounds{margin-top:18px;padding-top:16px;border-top:1px solid ${C.line};}
  .bounds .models{color:${C.body};font-size:14px;margin-bottom:8px;}
  .bounds .limit{display:flex;justify-content:space-between;gap:14px;padding:6px 0;color:${C.body};font-size:13px;}
  .bounds .limit .window{color:${C.faint};white-space:nowrap;}
  .earmark{display:block;width:100%;margin:0 0 10px;padding:10px 12px;border:1.5px solid ${C.line};border-radius:10px;background:${C.bg};color:${C.ink};font:14px Inter,sans-serif;}
  .envelopes{list-style:none;margin:14px 0 0;padding:0;border-top:1px solid ${C.line};}
  .envelopes li{display:flex;gap:8px;justify-content:space-between;padding:9px 0;border-bottom:1px solid ${C.line};font-size:13px;color:${C.body};}
  .envelopes b{color:${C.ink};font-variant-numeric:tabular-nums;white-space:nowrap;}
  .note{color:${C.faint};font-size:13px;line-height:1.5;margin-top:10px;}
  .prose{color:${C.body};font-size:15px;line-height:1.65;}
  .prose p{margin:0 0 12px;}
  .prose p:last-child{margin-bottom:0;}
  .prose strong{font-weight:700;color:${C.ink};}
  .prose code{background:${C.wash};border-radius:5px;padding:1px 5px;font:13px ui-monospace,Menlo,monospace;}
  .prose a{color:${C.accent};text-decoration:underline;text-underline-offset:2px;}
  .prose h1,.prose h2,.prose h3,.prose h4,.prose h5,.prose h6{color:${C.ink};line-height:1.3;margin:24px 0 10px;text-transform:none;letter-spacing:-.01em;}
  .prose h1:first-child,.prose h2:first-child,.prose h3:first-child{margin-top:0;}
  .prose h1{font-size:28px;}.prose h2{font-size:22px;}.prose h3{font-size:18px;}.prose h4,.prose h5,.prose h6{font-size:15px;}
  .prose ul,.prose ol{margin:8px 0 14px;padding-left:24px;}
  .prose li{margin:4px 0;}.prose li>ul,.prose li>ol{margin:4px 0;}
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
  .tl-nav{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12.5px;font-weight:600;color:${C.muted};margin:-4px 0 12px;}
  .tl-nav a{color:${C.muted};}
  .tl-nav a.on{color:${C.ink};border-bottom:2px solid ${C.accent};}
  .tl-board{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;}
  @media (max-width:900px){.tl-board{grid-template-columns:1fr;}}
  .tl-col h4{margin:0 0 8px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:${C.faint};}
  .tl-col .rm-shead{flex-wrap:wrap;}
  .rm-smeta{flex:none;font-size:11.5px;color:${C.faint};font-variant-numeric:tabular-nums;}
  .rm-smeta a{color:${C.muted};}
  .tl-table{width:100%;border-collapse:collapse;font-size:13px;}
  .tl-table th{text-align:left;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:${C.faint};padding:6px 8px;border-bottom:1px solid ${C.line};}
  .tl-table th a{color:${C.faint};}
  .tl-table td{padding:8px;border-bottom:1px solid ${C.line};vertical-align:top;}
  .tl-table td.t{font-weight:600;color:${C.ink};}
  .tl-table td.n{color:${C.muted};white-space:nowrap;font-variant-numeric:tabular-nums;}
  .tl-month{margin:14px 0 6px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:${C.faint};}
  .release{margin-bottom:18px;}
  .rel-head{font-weight:800;font-size:14px;color:${C.ink};margin-bottom:8px;}
  .changelog{font-size:14px;line-height:1.55;}
  .changelog>ul,.changelog>ol{margin:0 0 14px;}
  .empty{color:${C.muted};text-align:center;padding:72px 0;border:1px dashed ${C.line};border-radius:18px;}
  .live{display:inline-flex;align-items:center;gap:6px;color:${C.green};font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;}
  .pulse{width:8px;height:8px;border-radius:50%;background:${C.green};box-shadow:0 0 0 0 rgba(10,135,84,.5);animation:pulse 1.8s infinite;}
  @keyframes pulse{0%{box-shadow:0 0 0 0 rgba(10,135,84,.5);}70%{box-shadow:0 0 0 7px rgba(10,135,84,0);}100%{box-shadow:0 0 0 0 rgba(10,135,84,0);}}
`;

// What an app puts around every page: its name, its navigation, its own styles. Set once at load; a
// deployment that sets nothing gets the brand alone.
export interface PageConfig { brand: string; nav?: () => unknown; styles?: string; grants?: string }
let page: PageConfig = { brand: 'open-autonomy' };
export function configurePage(config: Partial<PageConfig>): void { page = { ...page, ...config }; }
export const pageConfig = (): PageConfig => page;

export function Shell({ title, children }: { title: string; children?: unknown }) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
        <title>{title}</title>
        <style dangerouslySetInnerHTML={{ __html: STYLES + (page.styles ?? '') }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

export function Nav() {
  return (
    <div class="nav"><div class="inner">
      <a href="/" class="brand">{raw(LOGO_SVG)}<span>{page.brand}</span></a>
      {page.nav ? page.nav() : <span class="spacer"></span>}
    </div></div>
  );
}

// What the project is, as its substrate published it: the first paragraph leads; the rest is a page.
function AboutPanel({ md, enc }: { md?: string; enc: string }) {
  const excerpt = leadParagraphs(md, 1);
  if (!excerpt) return null;
  return <div class="panel"><h3>About</h3><div class="prose" dangerouslySetInnerHTML={{ __html: mdToSafeHtml(excerpt) }} />{(md ?? '').trim().length > excerpt.length ? <a class="docmore" href={`/p/${enc}/about`}>Read more →</a> : null}</div>;
}

function FundRow({ f, now, grants, account }: { f: Flow; now: number; grants: string; account: string }) {
  if (f.kind === 'release') return <li id={f.id ? `gift-${f.id}` : undefined}><span>task done; {usd(f.amount_usd_cents)} released to whatever {nameOf(account)} needs<span class="when"> · {fmtAgo(f.ts, now)}</span></span></li>;
  const label = f.kind === 'grant' ? (f.from === grants ? `Granted by ${page.brand}` : f.from?.startsWith('@') ? `Granted by ${f.from}` : `Granted from ${f.from ?? ''}`) + (f.by ? ` · passed on by ${f.by}` : '') + (f.note ? ` — ${f.note}` : '') : f.sponsor_login ? `Sponsored by @${f.sponsor_login}` : 'Funded';
  return <li id={f.id ? `gift-${f.id}` : undefined}><span>{label}<span class="when"> · {fmtAgo(f.ts, now)}</span></span><span class="amt">+{usd(f.amount_usd_cents)}</span></li>;
}

function EnvelopeLine({ envelope, account, roadmap }: { envelope: Envelope; account: string; roadmap: Roadmap }) {
  const giver = envelope.from ?? 'Open Autonomy';
  return <li><span>{purposeSentence(account, envelope.purpose, roadmap)} · given by {envelope.gift_id ? <a href={`#gift-${envelope.gift_id}`}>{giver}</a> : giver}</span><b>{usd(envelope.balance_usd_cents)}</b></li>;
}

function FundingBounds({ bounds }: { bounds: ProjectView['bounds'] }) {
  const models = bounds.models.length ? bounds.models.join(' · ') : 'any model the gateway serves';
  return (
    <div class="bounds">
      <div class="models"><b>Models funds may buy:</b> {models}</div>
      {bounds.limits.map((l) => {
        const uses = [
          l.usd_cents !== undefined ? `${usd(l.used.usd_cents)} of ${usd(l.usd_cents)}` : '',
          l.calls !== undefined ? `${l.used.calls.toLocaleString('en-US')} of ${l.calls.toLocaleString('en-US')} calls` : '',
          l.tokens !== undefined ? `${l.used.tokens.toLocaleString('en-US')} of ${l.tokens.toLocaleString('en-US')} tokens` : '',
        ].filter(Boolean).join(' · ');
        return <div class="limit"><span>{uses}{l.model ? ` · ${l.model}` : ''}</span><span class="window">over {l.window}</span></div>;
      })}
    </div>
  );
}

// What an app adds to a project's page, per request: a line in the header's meta row, panels after the
// funding, panels in the side column. The core page renders the books, the timeline, the setup and the goal.
export interface ProjectSlots { meta?: unknown; main?: unknown; side?: unknown }

function Project({ v, sessions, live, roadmap, revision, now, view, slots }: { v: ProjectView; sessions: SessionSummary[]; live: string[]; roadmap: Roadmap; revision?: RoadmapRevision; now: number; view: TimelineQuery; slots: ProjectSlots }) {
  const owner = ownerOf(v.account);
  const g = goalLine(v);
  const enc = encodeURIComponent(v.account);
  const repoUrl = repoUrlOf(v.account);
  const grants = page.grants ?? '';
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
              <a href={`/p/${enc}/team`}>Team</a><span class="sep">|</span>
              {slots.meta}
              <StatusDot status={v.status} />
              {repoUrl ? <><span class="sep">|</span><a class="repo-pill" href={repoUrl} target="_blank" rel="noopener"><Icon name="github" size={15} />{v.account}<span class="ext"><Icon name="linkExternal" size={11} /></span></a></> : null}
            </div>
            {v.live ? <p class="tag">{v.live.commit ? <>{`live: ${v.live.commit}`}{v.live.ahead === 0 ? ' · up to date' : v.live.ahead === null ? null : <> · <a href={`https://github.com/${v.account}/compare/${v.live.commit}...${v.live.head ?? 'main'}`} target="_blank" rel="noopener">{`main is ${v.live.ahead} changes ahead`}</a></>}</> : 'live: unreachable'}</p> : null}
            {operatingLine(v.control) ? <p class="tag" data-operating>{operatingLine(v.control)}</p> : null}
          </div>
        </div>
        <div class="cols">
          <div>
            <AboutPanel md={v.profile.about_md} enc={enc} />
            <Timeline account={v.account} roadmap={roadmap} scheduleJson={v.profile.schedule_json} sessions={sessions} live={live} repoUrl={repoUrl} now={now} query={view} />
            {revision ? <p class="note">Timeline from <b>{revision.source}</b>, revision {revision.revision}, {fmtAgo(revision.ts, now)}{revision.by ? ` by ${revision.by}` : ''}{revision.conformance.length ? <> · this source cannot say: {revision.conformance.join('; ')}</> : null} · <a href={`/v1/accounts/${enc}/roadmap/revisions`}>every revision</a></p> : null}
            <SetupPanel setupMd={v.profile.setup_md} soulMd={v.profile.soul_md} model={v.profile.agent_model} provider={v.profile.agent_provider} harness={v.profile.agent_harness} skills={v.profile.agent_skills} scheduleJson={v.profile.schedule_json} />
            <div class="panel">
              <h3>Goal</h3>
              <div class="goalrow" style="margin-bottom:2px"><span style={`font-size:15px;color:${C.body};font-weight:600`}>{g.label}</span></div>
              <Progress frac={g.frac} color={STATUS[v.status].color} />
              <p class="note">{`Keep ${v.goal_days} days of agent runway funded. Days remaining counts only the ${usd(v.usable_usd_cents)} the next model call could use${v.balance_usd_cents > v.usable_usd_cents ? `; ${usd(v.balance_usd_cents - v.usable_usd_cents)} earmarked for other work is excluded` : ''}, with a Bayesian estimate of daily spend.`}</p>
            </div>
            <div class="panel">
              <h3>Funding</h3>
              <img src={`/v1/accounts/${enc}/runway.svg`} width="460" height="116" style={`max-width:100%;border-radius:12px;border:1px solid ${C.line}`} alt="funding runway" />
              <div class="ledger" data-project={v.account} data-shape={JSON.stringify([live, revision?.revision ?? 0, v.granted_in_usd_cents, `${v.control?.desired?.state ?? 'running'}/${v.control?.observed?.state ?? ''}`])}>
                <div class="item"><div class="v" data-received>{usd(v.granted_in_usd_cents)}</div><div class="l">received</div></div>
                {v.granted_out_usd_cents > 0 ? <div class="item"><div class="v">{usd(v.granted_out_usd_cents)}</div><div class="l">funded onward</div></div> : null}
                <div class="item"><div class="v" data-spent>{usd(v.consumed_usd_cents)}</div><div class="l">spent</div></div>
                <div class="item"><div class="v" data-balance>{usd(v.balance_usd_cents)}</div><div class="l">balance</div></div>
              </div>
              <ul class="envelopes">{v.envelopes.map((envelope) => <EnvelopeLine envelope={envelope} account={v.account} roadmap={roadmap} />)}</ul>
              <FundingBounds bounds={v.bounds} />
              {v.feed.length ? <ul class="feed" style="margin-top:14px">{v.feed.map((f) => <FundRow f={f} now={now} grants={grants} account={v.account} />)}</ul> : null}
              <a class="docmore" href={`/v1/accounts/${enc}/calls`}>Every metered call →</a>
            </div>
            {slots.main}
          </div>
          <div class="side">{slots.side}</div>
        </div>
      </div>
    </>
  );
}

export function renderProject(v: ProjectView, sessions: SessionSummary[] = [], live: string[] = [], roadmap: Roadmap = { schema: ROADMAP_SCHEMA, items: [] }, revision?: RoadmapRevision, view: TimelineQuery = {}, slots: ProjectSlots = {}): string {
  return render(<Shell title={`${nameOf(v.account)} · ${page.brand}`}><Project v={v} sessions={sessions} live={live} roadmap={roadmap} revision={revision} now={Date.now()} view={view} slots={slots} /><script dangerouslySetInnerHTML={{ __html: LIVE_SCRIPT }} /></Shell>);
}

// The deployment's index: every listed project, from the books. An app may put its own front page here instead.
export function renderDirectory(entries: DirectoryEntry[]): string {
  const listed = entries.filter((e) => e.listed);
  return render(
    <Shell title={`Projects · ${page.brand}`}>
      <Nav />
      <div class="wrap">
        <h1>Projects</h1>
        {listed.length ? <ul class="feed">{listed.map((e) => { const g = goalLine(e); return <li><span><a href={`/p/${encodeURIComponent(e.account)}`}><b>{e.account}</b></a>{e.profile.tagline ? ` — ${e.profile.tagline}` : ''}<span class="when"> · {g.label}{e.live_sessions.length ? ` · ${e.live_sessions.length} live` : ''}</span></span><span class="amt"><StatusDot status={e.status} /></span></li>; })}</ul> : <p class="sub">No project yet. A repository appears here once it has a key and its repository has synced.</p>}
      </div>
    </Shell>,
  );
}

// A project document in full: what it is, or everything shipped.
export function renderDocPage(account: string, title: string, md: string | undefined): string {
  return render(<Shell title={`${title} · ${nameOf(account)} · ${page.brand}`}><Nav /><div class="wrap"><h1>{nameOf(account)} · {title}</h1>{md ? <div class="panel prose" dangerouslySetInnerHTML={{ __html: mdToSafeHtml(md) }} /> : <p class="sub">Nothing published yet.</p>}<p><a href={`/p/${encodeURIComponent(account)}`}>← back to the project</a></p></div></Shell>);
}

export function renderSessionsPage(account: string, sessions: SessionSummary[], live: string[], nowMs: number): string {
  return render(<Shell title={`sessions · ${nameOf(account)} · ${page.brand}`}><Nav /><SessionsPage account={account} sessions={sessions} live={live} repoUrl={repoUrlOf(account)} now={nowMs} /></Shell>);
}

export function renderSessionPage(account: string, s: SessionRecord, nowMs: number): string {
  return render(<Shell title={`${s.source ?? s.kind} · ${nameOf(account)} · ${page.brand}`}><Nav /><SessionPage account={account} s={s} repoUrl={repoUrlOf(account)} now={nowMs} />{s.status === 'live' ? <script dangerouslySetInnerHTML={{ __html: LIVE_SCRIPT }} /> : null}</Shell>);
}

export function renderItemPage(v: ProjectView, view: ItemView, roadmap: Roadmap, nowMs: number): string {
  return render(<Shell title={`${view.item_id} · ${nameOf(v.account)} · ${page.brand}`}><Nav /><ItemPage account={v.account} roadmap={roadmap} view={view} repoUrl={repoUrlOf(v.account)} now={nowMs} />{view.live.length ? <script dangerouslySetInnerHTML={{ __html: LIVE_SCRIPT }} /> : null}</Shell>);
}

// A funder's page: the credits they hold, where they came from, and what they gave and to whom.
const TEAM_LABELS = { owner: 'Owner', direction: 'Project direction', moderation: 'Moderation', 'release-review': 'Release review' };

export function renderTeamPage(account: string, file?: TeamFile, editing?: string, failure?: string, configured = true): string {
  const base = `/p/${encodeURIComponent(account)}/team`;
  const member = file?.team.members.find(m => m.id === editing);
  const edit = Boolean(file?.team.members.length && (editing === 'new' || member));
  const input = (name: string, title: string, value = '', required = false, max = 80) => <label style="display:block;margin:12px 0">{title}<input class="earmark" style="display:block;width:100%;margin-top:5px" name={name} value={value} required={required} maxlength={max} /></label>;
  return render(<Shell title={`Team · ${account}`}><Nav /><main class="wrap" style="max-width:880px;padding-bottom:64px">
    <p style="margin-top:32px"><a href={`/p/${encodeURIComponent(account)}`}>← {account}</a></p>
    <h1>Team</h1><p class="tag">The people behind the project and the decisions they can make.</p>
    {failure ? <p role="alert">{failure}</p> : null}
    {file ? <>
      <p class="note">From the <a href={`https://github.com/${account}/blob/${file.head}/.open-autonomy/config.yaml`}>committed roster</a>. Release authority still requires human review of the specific release.</p>
      {!file.team.members.length ? <div class="panel"><h3>No team recorded yet</h3><p>The setup agent needs to establish the first owner's verified accounts and authority. Then owners can manage the team here.</p></div> : <>
        <div>{file.team.members.map((m: TeamMember) => <article class="panel">
          <h3>{m.name}</h3><p>{m.scopes.length ? m.scopes.map(s => TEAM_LABELS[s]).join(' · ') : 'Contributor'}</p>
          {m.github ? <p><a href={`https://github.com/${m.github.login}`}>GitHub · @{m.github.login}</a> <span class="note">ID {m.github.id}</span></p> : null}
          {m.discord ? <p><a href={`https://discord.com/users/${m.discord.id}`}>Discord · {m.discord.name}</a> <span class="note">ID {m.discord.id}</span></p> : null}
          <details><summary>Identity and authority source</summary><p style="overflow-wrap:anywhere">{m.source}</p></details>
          <p><a href={`${base}?edit=${encodeURIComponent(m.id)}`}>Edit {m.name}</a></p>
        </article>)}</div>
        {!edit ? <p><a class="btn" href={`${base}?edit=new`}>Add teammate</a></p> : null}
      </>}
      {edit ? <section class="panel" id="editor"><h2>{member ? `Edit ${member.name}` : 'Add teammate'}</h2>
        <form method="post" action={base}>
          <input type="hidden" name="sha" value={file.sha} /><input type="hidden" name="id" value={member?.id ?? ''} />
          {input('name', 'Name', member?.name, true)}
          {input('github_login', 'GitHub username', member?.github?.login)}
          <details><summary>GitHub account ID</summary>{input('github_id', 'Verified ID', member?.github?.id, false, 20)}<p class="note">New accounts are resolved from GitHub. Keep this ID for a renamed account; clear it only to link a different account.</p></details>
          {input('discord_id', 'Discord user ID or profile link', member?.discord?.id)}
          {input('discord_name', 'Discord name', member?.discord?.name)}
          <fieldset><legend>Authority</legend>{TEAM_SCOPES.map(scope => <label style="display:block;margin:8px 0"><input type="checkbox" name="scopes" value={scope} checked={member?.scopes.includes(scope)} /> {TEAM_LABELS[scope]}</label>)}</fieldset>
          <label style="display:block;margin:16px 0">Identity and authority source<textarea class="earmark" style="display:block;width:100%;min-height:100px" name="source" required maxlength={500}>{member?.source ?? ''}</textarea></label>
          <p class="note">Include a public source link or a specific owner confirmation establishing whose accounts these are and what they may decide.</p>
          <label style="display:block;margin:16px 0"><input type="checkbox" name="attest" value="yes" required /> I confirm these account links and permissions, or the removal of this person.</label>
          <p>Continue with GitHub to create a draft pull request. Only a recorded owner can authorize this change. Review and merge it on GitHub before it takes effect.</p>
          <p class="note">GitHub will ask for public repository access to create the change using your account.</p>
          {configured ? <><button class="btn" name="operation" value="save">Continue with GitHub</button>{member ? <button class="btn outline" style="margin-left:12px" name="operation" value="remove">Remove teammate</button> : null}</> : <p role="status">GitHub sign-in is not configured on this platform yet.</p>}
          <p><a href={base}>Cancel</a></p>
        </form>
      </section> : null}
    </> : <p>The committed roster is unavailable. Changes are disabled until it can be read.</p>}
  </main></Shell>);
}

export function renderMessage(account: string, ok: boolean, title: string, message: string): string {
  return render(
    <Shell title={`${title} · ${page.brand}`}>
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
