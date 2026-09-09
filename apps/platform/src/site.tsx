import { ROADMAP_SCHEMA, itemState, type Roadmap } from '@open-autonomy/sdk/roadmap';
import { Avatar, C, Icon, Nav, Progress, STATUS, Shell, StatusDot, coverStyle, fmtAgo, goalLine, nameOf, ownerOf, purposeSentence, render, usd, usd0, type DirectoryEntry, type FunderView, type ProjectSlots, type ProjectView } from '@open-autonomy/treasury';
import type { Patron, PatronageView, Tier } from './patronage.ts';

// The open platform's pages around the treasury's: the explore grid (GET /), a funder's page, the human giving
// page, and what it adds to every project's page — the patrons wall, the tiers, the give and coupon forms.

// The navigation every page carries here: explore, give credits, become a patron.
export const nav = () => (
  <>
    <span class="links"><a href="/">Explore</a> · <a href="/give">Give credits</a></span>
    <span class="spacer"></span>
    <a class="btn" href="https://github.com/sponsors/open-autonomy-org">Become a patron</a>
  </>
);

export const PATRON_STYLES = `
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
  .tier .pay{display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap;}
  .tier .pay .btn{flex:1;padding:11px 12px;}
  .coupon{display:flex;gap:10px;margin-top:6px;}
  .coupon input{flex:1;min-width:0;background:${C.bg};border:1.5px solid ${C.line};border-radius:12px;color:${C.ink};padding:11px 14px;font:14px 'Inter',ui-monospace,Menlo,monospace;letter-spacing:.04em;}
  .legend{color:${C.faint};font-size:13px;margin-top:28px;}
`;

function ProjectCard({ e, p }: { e: DirectoryEntry; p: PatronageView }) {
  const g = goalLine(e);
  const href = `/p/${encodeURIComponent(e.account)}`;
  return (
    <div class="card">
      <a href={href}><div class="cover" style={coverStyle(e.profile.cover_url, e.account)} /></a>
      <div class="cbody">
        <div class="av"><Avatar url={e.profile.avatar_url} size={60} cls="ring" /></div>
        <a href={href} class="pname">{nameOf(e.account)}</a>
        <div class="ptag">{e.profile.tagline ?? ''}</div>
        <div class="pmeta"><b>{p.patron_count}</b>{` patron${p.patron_count === 1 ? '' : 's'} · `}<b>{p.monthly_usd_cents ? `${usd0(p.monthly_usd_cents)}/mo` : '$0/mo'}</b>{e.live_sessions.length ? <> · <span class="live"><span class="pulse" />working</span></> : null}</div>
        <div class="cardfoot">
          <div class="goalrow"><span>{g.label}</span><StatusDot status={e.status} /></div>
          <Progress frac={g.frac} color={STATUS[e.status].color} />
          <a class="btn block join" href={`https://github.com/sponsors/${ownerOf(e.account)}`}>Join</a>
        </div>
      </div>
    </div>
  );
}

export function renderExplore(entries: DirectoryEntry[], patronage: Record<string, PatronageView>, grants = 'open-autonomy-org/grants'): string {
  const listed = entries.filter((e) => e.listed);
  const granted = entries.filter((e) => e.account.startsWith('@') || e.account === grants).reduce((s, e) => s + e.granted_out_usd_cents, 0);
  const funders = entries.filter((e) => e.account.startsWith('@') && e.granted_out_usd_cents > 0).length;
  const totalIn = listed.reduce((s, e) => s + (e.granted_in_usd_cents - e.granted_out_usd_cents), 0);
  const totalSpent = listed.reduce((s, e) => s + e.consumed_usd_cents, 0);
  const p = (e: DirectoryEntry): PatronageView => patronage[e.account] ?? { tiers: [], patrons: [], patron_count: 0, monthly_usd_cents: 0, sponsors: [], polar_products: {} };
  const patrons = listed.reduce((s, e) => s + p(e).patron_count, 0);
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
          {granted > 0 ? <div><span class="n">{usd0(granted)}</span><span class="k">{`granted by ${funders} funder${funders === 1 ? '' : 's'}`}</span></div> : null}
        </div>
        <div class="sectionhdr"><h2>Projects</h2></div>
        {listed.length ? <div class="grid">{listed.map((e) => <ProjectCard e={e} p={p(e)} />)}</div> : <div class="empty">No projects yet. A repository appears here once it has a key and its public repository has synced.</div>}
        <div class="legend">A project lists itself the first time it mints a key and its public repository syncs.</div>
      </div>
    </Shell>,
  );
}

function PatronChip({ p }: { p: Patron }) {
  const inner = <><Avatar url={p.avatar_url} size={26} /><span>{p.name ?? p.login}{p.kind === 'project' ? <span class="tag"> project</span> : null}</span></>;
  return p.url ? <a class="patron" href={p.url}>{inner}</a> : <span class="patron">{inner}</span>;
}


function EarmarkPicker({ roadmap }: { roadmap: Roadmap }) {
  const open = roadmap.items.filter((item) => itemState(item) !== 'done');
  return <select class="earmark" name="for" aria-label="What this gift is for"><option value="unrestricted">whatever the project needs</option><option value="model">model calls only</option><optgroup label="a task chosen from the roadmap's open items">{open.map((item) => <option value={`item:${item.id}`}>the task '{item.title}'</option>)}</optgroup></select>;
}


// A tier says what the platform delivers for it: the patrons wall, and the runway the amount buys at the
// project's own burn. Two doors, side by side, onto the same books: Polar (monthly or once, when the
// platform has it) and GitHub Sponsors.
function TierCard({ t, i, feat, owner, burn, account, polar, sponsor, roadmap }: { t: Tier; i: number; feat: boolean; owner: string; burn: number; account: string; polar: boolean; sponsor: string; roadmap: Roadmap }) {
  const days = burn > 0 ? Math.round(t.usd_cents / burn) : null;
  return (
    <div class={`tier${feat ? ' feat' : ''}`}>
      <div class="th"><span class="tn">{t.name}</span><span class="tp">{usd0(t.usd_cents)} <span>/mo</span></span></div>
      <p>On the patrons wall{days !== null ? `; about ${days} day${days === 1 ? '' : 's'} of the agent's runway each month at its current burn` : ''}.</p>
      {polar ? (
        <form class="pay" method="post" action="/v1/patrons/checkout">
          <input type="hidden" name="account" value={account} /><input type="hidden" name="tier" value={String(i)} />
          <EarmarkPicker roadmap={roadmap} />
          <button class={`btn block ${feat ? '' : 'outline'}`} type="submit" name="interval" value="month">{usd0(t.usd_cents)} monthly</button>
          <button class="btn block outline" type="submit" name="interval" value="once">{usd0(t.usd_cents)} once</button>
        </form>
      ) : null}
      {/* GitHub Sponsors is one listing per org: its money lands on the org's sponsor account (the grants pool) and is given on
          to projects from there, so on every other project the button says so. */}
      <a class={`btn block ${feat && !polar ? '' : 'outline'}`} href={`https://github.com/sponsors/${owner}`}><Icon name="github" /> {account === sponsor ? 'Sponsor on GitHub' : `Sponsor ${owner} on GitHub · grants reach projects`}</a>
    </div>
  );
}


export function renderFunder(f: FunderView, grants: string, polar = false): string {
  const now = Date.now();
  return render(
    <Shell title={`${f.account} · open-autonomy`}>
      <Nav />
      <div class="wrap">
        <div class="phead">
          <Avatar url={`https://github.com/${encodeURIComponent(f.login)}.png?size=208`} size={104} cls="ring" />
          <div class="htext">
            <h1>{f.account}</h1>
            <p class="tag">A funder: grant credits on their own books, given to projects they believe in.</p>
            <div class="metarow"><span><b>{usd(f.credits_usd_cents)}</b> to give{f.bonus_usd_cents > 0 ? ` (${usd(f.bonus_usd_cents)} of it bonus, for projects you do not own)` : ''}</span><span class="sep">|</span><span><b>{usd(f.given_usd_cents)}</b> given</span><span class="sep">|</span><span><b>{usd(f.received_usd_cents)}</b> received</span></div>
          </div>
        </div>
        <div class="cols">
          <div class="main">
            <div class="panel"><h3>Given</h3>{f.given.length ? <ul class="feed">{f.given.map((g) => <li><span>Granted to <a href={`/p/${encodeURIComponent(g.to)}`}>{g.to}</a>{g.note ? ` — ${g.note}` : ''}<span class="when"> · {fmtAgo(g.ts, now)}</span></span><span class="amt">−{usd(g.amount_usd_cents)}</span></li>)}</ul> : <p class="sub">Nothing given yet.</p>}</div>
            <div class="panel"><h3>Received</h3>{f.received.length ? <ul class="feed">{f.received.map((r) => <li><span>{r.kind === 'grant' ? (r.from === grants ? 'Granted by Open Autonomy' : `Granted from ${r.from ?? ''}`) : r.sponsor_login ? `Credits from @${r.sponsor_login}` : 'Credits from Open Autonomy'}<span class="when"> · {fmtAgo(r.ts, now)}</span></span><span class="amt">+{usd(r.amount_usd_cents)}</span></li>)}</ul> : <p class="sub">No credits yet.</p>}</div>
          </div>
          <div class="side">
            <div class="panel">
              <h3>Fund yourself</h3>
              <p class="sub">Buy grant credits to give. Open Autonomy matches a share as bonus credits for projects you do not own, from what it holds.</p>
              {polar ? (
                <form class="pay" method="post" action="/v1/patrons/checkout">
                  <input type="hidden" name="account" value={f.account} /><input type="hidden" name="interval" value="once" />
                  <button class="btn block outline" type="submit" name="tier" value="0">$10</button>
                  <button class="btn block outline" type="submit" name="tier" value="1">$25</button>
                  <button class="btn block outline" type="submit" name="tier" value="2">$100</button>
                </form>
              ) : <p class="note">Credits come from Open Autonomy for now; buying them opens with the platform's Polar account.</p>}
            </div>
            <div class="panel"><h3>Giving</h3><p class="note">Give from any project's page with your funder key, or <code>POST /v1/grants/give</code> with it. Every grant is public here and on the project's page.</p></div></div>
        </div>
      </div>
    </Shell>,
  );
}

export interface GivePageData {
  login: string;
  funder: FunderView;
  projects: DirectoryEntry[];
  grants?: { account: string; view: FunderView };
  message?: { ok: boolean; text: string };
  attempt: string;
}

// The second door onto grant giving: GitHub proves a human login, while this form moves money
// through the same ledger grant operation as a give-scoped key.
export function renderGivePage(data?: GivePageData): string {
  if (!data) return render(
    <Shell title="Give grant credits · open-autonomy">
      <Nav />
      <div class="wrap">
        <div class="panel" style="max-width:680px;margin:56px auto;padding:40px">
          <h1 style="font-size:32px;margin:0 0 12px">Give grant credits</h1>
          <p class="lede">Grant credits are funds you hold on Open Autonomy's public books and can pass to a project you believe in. They can only be given, never spent by this page.</p>
          <a class="btn" href="/give/login"><Icon name="github" /> Sign in with GitHub</a>
          <p class="note">GitHub is used only to verify your login. The sign-in asks for no repository or organization scope.</p>
        </div>
      </div>
    </Shell>,
  );
  const sourceOptions = [
    { account: data.funder.account, label: `${data.funder.account} · ${usd(data.funder.credits_usd_cents)} available` },
    ...(data.grants ? [{ account: data.grants.account, label: `Organization grants pool · ${usd(data.grants.view.credits_usd_cents)} available` }] : []),
  ];
  const GiftRows = ({ view, empty }: { view: FunderView; empty: string }) => view.given.length ? <ul class="feed">{view.given.map((gift) => <li><span>Granted to <a href={`/p/${encodeURIComponent(gift.to)}`}>{gift.to}</a>{gift.by ? ` · passed on by ${gift.by}` : ''}{gift.note ? ` — ${gift.note}` : ''}{gift.purpose ? <span class="when"> · for {purposeSentence(gift.to, gift.purpose)}</span> : null}<span class="when"> · {fmtAgo(gift.ts, Date.now())}</span></span><span class="amt">−{usd(gift.amount_usd_cents)}</span></li>)}</ul> : <p class="sub">{empty}</p>;
  return render(
    <Shell title="Give grant credits · open-autonomy">
      <Nav />
      <div class="wrap">
        <div class="sectionhdr"><div><h1 style="margin:0">Give grant credits</h1><p class="sub">Signed in as @{data.login}. <a href="/give/logout">Sign out</a></p></div></div>
        {data.message ? <div class="panel" style={`border-color:${data.message.ok ? C.green : C.accent}`}>{data.message.text}</div> : null}
        <div class="cols">
          <div class="main">
            <div class="panel"><h3>Your gifts</h3><GiftRows view={data.funder} empty="You have not given any credits yet." /></div>
            {data.grants ? <div class="panel"><h3>Organization grants pool history</h3><GiftRows view={data.grants.view} empty="The organization has not passed any Sponsors money on yet." /></div> : null}
          </div>
          <div class="side"><div class="panel">
            <h3>Give once</h3>
            <form class="pay" method="post" action="/give">
              <input type="hidden" name="key" value={data.attempt} />
              <label class="sub" for="give-source">Give from</label>
              <select class="earmark" id="give-source" name="source">{sourceOptions.map((source) => <option value={source.account}>{source.label}</option>)}</select>
              <label class="sub" for="give-project">Project</label>
              <select class="earmark" id="give-project" name="to" required>{data.projects.map((project) => <option value={project.account}>{project.account}</option>)}</select>
              <label class="sub" for="give-amount">Amount in cents</label>
              <input class="earmark" id="give-amount" name="usd_cents" type="number" min={1} step={1} required />
              <label class="sub" for="give-for">Earmark</label>
              <select class="earmark" id="give-for" name="for"><option value="unrestricted">whatever the project needs</option><option value="model">model calls only</option><option value="any">anything the agent spends on</option></select>
              <label class="sub" for="give-note">Why this project (optional)</label>
              <input class="earmark" id="give-note" name="note" maxlength={280} />
              <button class="btn block" type="submit" disabled={!data.projects.length}>Give</button>
            </form>
            {!data.projects.length ? <p class="note">There are no listed projects to give to.</p> : <p class="note">One submission, one public gift. Retrying this form cannot give twice.</p>}
          </div></div>
        </div>
      </div>
    </Shell>,
  );
}


// What the open platform adds to a project's page: patrons and monthly in the header, the patrons wall after the
// funding, and the doors onto money in beside it.
export function projectSlots({ v, roadmap, p, polar, sponsor, grants }: { v: ProjectView; roadmap: Roadmap; p: PatronageView; polar: boolean; sponsor: string; grants: string }): ProjectSlots {
  const owner = ownerOf(v.account);
  const enc = encodeURIComponent(v.account);
  return {
    meta: <><span><b>{p.patron_count}</b> patrons</span><span class="sep">|</span><span><b>{p.monthly_usd_cents ? `${usd0(p.monthly_usd_cents)}/mo` : '$0/mo'}</b></span><span class="sep">|</span></>,
    main: <div class="panel"><h3>Patrons</h3>{p.patrons.length ? <div class="patrons">{p.patrons.map((patron) => <PatronChip p={patron} />)}</div> : <p class="sub">No patrons yet — be the first.</p>}</div>,
    side: (
      <>
        <div class="panel">
          <h3>Become a patron</h3>
          {p.tiers.map((t, i) => <TierCard t={t} i={i} feat={i === 1} owner={owner} burn={v.burn_per_day_usd_cents} account={v.account} polar={polar} sponsor={sponsor} roadmap={roadmap} />)}
          <p class="note">When the balance reaches $0, the agent stops; nothing is lost — the balance and every receipt stay on this page, and the next gift starts it again.</p>
          <p class="note">To end or change a recurring gift, use GitHub Sponsors' own page for a GitHub sponsorship or Polar's customer portal for a Polar one; this platform never holds your card and cannot cancel for you.</p>
        </div>
        <div class="panel">
          <h3>Give grant credits</h3>
          <p class="sub">Funders hold grant credits on their own books — given by Open Autonomy, or bought — and give them to a project they believe in. On these books a grant is money in, like a patron's.</p>
          <form class="coupon give" method="post" action={`/p/${enc}/give`}>
            <input name="key" placeholder="your funder key" autocomplete="off" />
            <input name="usd_cents" type="number" min={1} placeholder="cents" />
            <input name="note" placeholder="a word, optional" maxlength={280} />
            <EarmarkPicker roadmap={roadmap} />
            <button class="btn" type="submit">Give</button>
          </form>
          <p class="note">A funder key proves your GitHub login with the claim file in a repository of yours: <code>GET /v1/keys/challenge?funder=&lt;login&gt;</code>, then <code>POST /v1/keys/mint</code>. It can only give.</p>
        </div>
        <div class="panel">
          <h3>Have a sponsor coupon?</h3>
          <form class="coupon" method="post" action={`/p/${enc}/redeem`}>
            <input name="code" placeholder="SPON-XXXX-XXXX-XXXX" autocomplete="off" />
            <button class="btn" type="submit">Redeem</button>
          </form>
          <p class="note">Funds this project's agent. At $0, it stops.</p>
        </div>
      </>
    ),
  };
}
