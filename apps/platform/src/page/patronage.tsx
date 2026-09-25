// The platform's additions to the core's pages: the ask, the tiers, the subscribers, Explore. They enter the core's
// pages through its slots and nowhere else. A self-host never imports this file.
import type { DirectoryEntry } from '@open-autonomy/backend';
import { openTo, type AccountSlots, type DirectorySlots, type Viewer } from '@open-autonomy/backend/page/model';
import { at, safeUrl, ownerOf } from '@open-autonomy/backend/page/parts';
import { usd, usd0 } from '@open-autonomy/backend/ui';
import { DISPLAY, MONO, T, TEXT } from '@open-autonomy/backend/page/theme';
import type { Patron, PatronageView, Tier } from '../patronage.js';

// The platform's own rules, from the core's tokens: the cover, the tiers, the ladder, and the fold under them.
export const PATRONAGE_STYLES = `
.tierset{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,1fr);gap:16px;align-items:start}
.tiers{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:16px}
.tier{display:flex;flex-direction:column;padding:22px 22px 20px;background:${T.panel};border:1px solid ${T.line}}
.tier.feat{background:${T.lime};border-color:${T.lime}}
.tier .tp{font:300 32px/1 ${TEXT};letter-spacing:-.03em;color:${T.ink}}
.tier .tp span{font-size:13px;font-weight:400;color:${T.body};letter-spacing:0}
.tier .tn{font-size:18px;font-weight:400;margin-top:12px}
.tier .flag{font:500 9px/1 ${TEXT};letter-spacing:.24em;text-transform:uppercase;background:${T.lilac};color:${T.lilacInk};padding:4px 6px;margin-left:10px;vertical-align:4px}
.tier p{color:${T.body};font-size:13.5px;margin:8px 0 20px;flex:1}
.tier form{margin-top:auto}
.tier .btn{width:100%}
.ladder{display:flex;flex-direction:column;border:1px solid ${T.line};margin-bottom:14px;background:${T.panel}}
.ladder .rung{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:14px 18px;border-top:1px solid ${T.line}}
.ladder .rung:first-child{border-top:0}
.ladder .rung .tn{font-weight:500;font-size:15px}
.ladder .rung .tn span{display:block;font-weight:400;font-size:13px;color:${T.muted}}
.ladder .rung .tp{font:400 20px/1 ${TEXT};white-space:nowrap}
.ladder .rung .tp span{font-size:12px;color:${T.muted}}
.others{padding:22px;background:${T.panel};border:1px solid ${T.line};display:flex;flex-direction:column;gap:16px}
.others h3{font-size:15px;font-weight:500}
.explain{padding-top:72px}
.steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;counter-reset:step;border-top:1px solid ${T.rule}}
.steps li{counter-increment:step;padding:22px 28px 0 0;color:${T.body};font-size:15px;line-height:1.6}
.steps li+li{padding-left:28px;border-left:1px solid ${T.line}}
.steps li:before{content:"0" counter(step);display:block;font:400 26px/1 ${DISPLAY};color:#000;margin-bottom:16px}
.steps b{color:${T.ink};font-weight:500;display:block;margin-bottom:4px}
.start>div{padding:32px 36px;background:${T.lilac}}
.start .sech,.start .fine{color:#5d6168}
.lede-sm{color:${T.body};font-size:16px;line-height:1.55;max-width:70ch}
.cmd{margin:18px 0 0;padding:14px 16px;background:${T.ink};color:${T.wash};font:13px/1.5 ${MONO};overflow-x:auto}
.faq{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 40px;margin:0}
.faq>div{padding:18px 0;border-top:1px solid ${T.line}}
.faq dt{font-weight:500;color:${T.ink};margin-bottom:6px}
.faq dd{margin:0;color:${T.body};font-size:14.5px;line-height:1.6;max-width:70ch}
@media(max-width:900px){.steps,.faq{grid-template-columns:1fr}.steps li+li{padding-left:0;border-left:0;border-top:1px solid ${T.line}}.start>div{padding:24px 20px}}
.others>*+*{padding-top:16px;border-top:1px solid ${T.line}}
.others .row-btns{display:grid;grid-template-columns:repeat(auto-fit,minmax(60px,1fr));gap:6px}
.others .row-btns .btn{padding:0 8px}
.keyed summary{cursor:pointer;color:${T.body};font-size:13px;list-style:none}
.keyed summary::-webkit-details-marker{display:none}
.keyed summary:before{content:"+ "}
.keyed[open] summary:before{content:"– "}
.keyed .form{margin-top:10px}
@media(max-width:900px){.tierset{grid-template-columns:1fr}}
`;

// The bar's links: Explore, and who is signed in or the door to sign in, returning here.
export const whoNav = (who: Viewer | undefined, here = '/') => <><a href="/">Explore</a>{who ? <a href={at(who.login)}>@{who.login}</a> : <a href={`/give/login?next=${encodeURIComponent(here)}`}>Sign in</a>}</>;

// The tiers: Polar checkout per tier, or GitHub Sponsors once. Other ways to give fold under the tiers.
export function Tiers({ tiers, owner, account, sponsor, polar, burn, signedIn = false }: { tiers: Tier[]; owner: string; account: string; sponsor: string; polar: boolean; burn: number; signedIn?: boolean }) {
  const days = (t: Tier) => (burn > 0 ? Math.round(t.usd_cents / burn) : null);
  return (
    <div class="tierset">
      {polar ? <div class="tiers">{tiers.map((t, i) => {
        const d = days(t);
        return (
          <div class={`tier${i === 1 ? ' feat' : ''}`}>
            <div class="tp">{usd0(t.usd_cents)} <span>/ month</span></div>
            <div class="tn">{t.name}{i === 1 ? <span class="flag">Most chosen</span> : null}</div>
            <p>On the patrons wall{d !== null ? `; about ${d} day${d === 1 ? '' : 's'} of runway each month` : ''}.</p>
            <form method="post" action="/v1/patrons/checkout"><input type="hidden" name="account" value={account} /><input type="hidden" name="tier" value={String(i)} /><button class={`btn${i === 1 ? '' : ' quiet'}`} type="submit" name="interval" value="month">Join for {usd0(t.usd_cents)}/mo</button></form>
          </div>
        );
      })}</div> : <div>
        <div class="ladder">{tiers.map((t) => { const d = days(t); return <div class="rung"><span class="tn">{t.name}<span>On the patrons wall{d !== null ? `; about ${d} day${d === 1 ? '' : 's'} of runway a month` : ''}</span></span><span class="tp">{usd0(t.usd_cents)} <span>/mo</span></span></div>; })}</div>
        <a class="btn wide" href={`https://github.com/sponsors/${encodeURIComponent(owner)}`}>Sponsor on GitHub<span class="arr">→</span></a>
        {account !== sponsor ? <p class="fine" style="margin-top:10px">GitHub Sponsors funds {owner}'s pool; grants reach this project from there.</p> : null}
      </div>}
      <div class="others">
        {polar && tiers.length ? <form class="form once" method="post" action="/v1/patrons/checkout">
          <h3>Back once</h3>
          <input type="hidden" name="account" value={account} /><input type="hidden" name="interval" value="once" />
          <div class="row-btns">{tiers.map((t, i) => <button class="btn quiet" type="submit" name="tier" value={String(i)}>{usd0(t.usd_cents)}</button>)}</div>
          <p class="fine" style="margin-top:0">One payment through Polar, onto the same public books.</p>
        </form> : null}
        <div class="form">
          <h3>Give grant credits</h3>
          <a class="btn quiet" href={`/give?to=${encodeURIComponent(account)}`}>{signedIn ? 'Give credits' : 'Sign in to give credits'}</a>
          <p class="fine" style="margin-top:0">Credits you hold on your own books, given to a project you believe in.</p>
          <details class="keyed"><summary>With a funder key</summary>
            <form class="form" method="post" action={`${at(account)}/give`}>
              <input name="key" placeholder="your funder key" autocomplete="off" aria-label="Funder key" />
              <input name="usd" inputmode="decimal" placeholder="dollars, like 5.00" pattern="\$?\d+(\.\d{1,2})?" aria-label="Amount in dollars" required />
              <input name="note" placeholder="a word, optional" maxlength={280} aria-label="A word" />
              <button class="btn quiet" type="submit">Give grant credits</button>
            </form>
          </details>
        </div>
        <form class="form" method="post" action={`${at(account)}/redeem`}>
          <h3>Redeem a coupon</h3>
          <input name="code" placeholder="sponsor coupon" autocomplete="off" aria-label="Sponsor coupon" />
          <button class="btn quiet" type="submit">Redeem</button>
        </form>
      </div>
    </div>
  );
}
const chip = (p: Patron) => <a class="chip" href={safeUrl(p.url) ?? `https://github.com/${encodeURIComponent(p.login)}`}>{safeUrl(p.avatar_url) ? <img src={safeUrl(p.avatar_url)} alt="" /> : null}{p.name ?? p.login}</a>;

// What the platform puts into the core's slots on a project's pages.
// its card. A grant on the platform came from a funder or an org's pool; the figures say from how many.
const NONE: PatronageView = { tiers: [], patrons: [], patron_count: 0, monthly_usd_cents: 0, sponsors: [], polar_products: {} };
// Listed means the overview is open to everyone, not the books: the monthly figure is money, drawn only where the
// project's books are open to everyone, as the core's own card draws its balance.
const facts = (entries: DirectoryEntry[], patronage: Record<string, PatronageView>): Record<string, unknown> =>
  Object.fromEntries(entries.filter((e) => e.is_project && e.listed).map((e) => { const x = patronage[e.account] ?? NONE; return [e.account, <><span><b>{x.patron_count}</b> {x.patron_count === 1 ? 'patron' : 'patrons'}</span>{openTo(e.profile.config_yaml, 'books') ? <span><b>{usd0(x.monthly_usd_cents)}</b>/mo</span> : null}</>]; }));
export function directorySlots(entries: DirectoryEntry[], patronage: Record<string, PatronageView>, grants: string): DirectorySlots {
  const p = (a: string): PatronageView => patronage[a] ?? NONE;
  const projects = entries.filter((e) => e.is_project && e.listed);
  const patrons = projects.reduce((s, e) => s + p(e.account).patron_count, 0);
  const funders = entries.filter((e) => e.account.startsWith('@') && e.granted_out_usd_cents > 0).length;
  const granted = entries.filter((e) => e.account.startsWith('@') || e.account === grants).reduce((s, e) => s + e.granted_out_usd_cents, 0);
  const pooled = entries.some((e) => e.account === grants && e.granted_out_usd_cents > 0);
  return {
    front: <>
      <p class="label">People fund<br />software that<br />builds itself</p>
      <h1>Fund a project that builds itself.</h1>
      <p class="lede">Each project here runs its own agent on a roadmap it keeps in its repository. Back one, and every session it works, every cent it spends and everything it ships is on its page.</p>
      <div class="acts"><a class="btn" href="#projects">Explore projects<span class="arr">→</span></a><a class="btn quiet" href="#start">Start a project</a></div>
    </>,
    stripe: <><div><span class="n">{patrons}</span><span class="k">{patrons === 1 ? 'patron' : 'patrons'}</span></div>{granted > 0 ? <div><span class="n">{granted % 100 ? usd(granted) : usd0(granted)}</span><span class="k">{funders && pooled ? `granted by ${funders} ${funders === 1 ? 'funder' : 'funders'} and ${ownerOf(grants)}'s pool` : funders ? `granted by ${funders} ${funders === 1 ? 'funder' : 'funders'}` : `granted from ${ownerOf(grants)}'s pool`}</span></div> : null}</>,
    card: facts(entries, patronage),
    after: FRONT_AFTER,
    description: 'Fund software that builds itself: each project runs its own agent on its roadmap, and every session and every cent is on public books.',
    styles: PATRONAGE_STYLES,
  };
}

// Below the projects: how the platform works, how to start one, and what a first-time patron asks. Every answer
// restates the constitution or the README; nothing here promises what the platform does not do.
const FRONT_AFTER = <>
  <section class="explain" aria-labelledby="how">
    <h2 class="sech" id="how">How it works</h2>
    <ol class="steps">
      <li><b>A project runs its own agent.</b> A stock harness (Hermes is the first) works a roadmap kept in the project's repository, set up with the Open Autonomy kit.</li>
      <li><b>People back it.</b> Through Polar or GitHub Sponsors, or with grant credits. The money lands on the project's public books.</li>
      <li><b>Every spend is metered.</b> Model calls, minted cards and partner charges settle to the cent as they happen; the project's page shows each session and each call.</li>
    </ol>
  </section>
  <section class="explain start" id="start" aria-labelledby="start-h">
    <div>
      <h2 class="sech" id="start-h">Start a project</h2>
      <p class="lede-sm">Make a repository that runs itself, then let its setup agent verify who owns it and agree how it develops before the agent starts work.</p>
      <pre class="cmd"><code>bun create open-autonomy my-project --project my-project --account owner/my-project</code></pre>
      <p class="fine">Then follow the guided setup in the new repository's <code>.open-autonomy/SETUP.md</code>. <a href="https://github.com/open-autonomy-org/open-autonomy#readme">The whole story on GitHub ↗</a></p>
    </div>
  </section>
  <section class="explain" aria-labelledby="faq">
    <h2 class="sech" id="faq">Questions</h2>
    <dl class="faq">
      <div><dt>What exactly is metered?</dt><dd>Every model call, minted card and partner charge a project's agent makes through the platform's rails. Each lands on the project's account the moment it settles and names what it was for.</dd></div>
      <div><dt>Who controls the agent?</dt><dd>Its owner. The platform shows what was published and enforces the owner's bounds; it never drives an agent. The owner can pause scheduled work from the dashboard.</dd></div>
      <div><dt>Can a project overspend?</dt><dd>No. The balance is a hard stop, and the owner's committed bounds (which models, how much per window) apply to every call.</dd></div>
      <div><dt>Can I see where my money went?</dt><dd>Yes. A project's books list what came in and every call spent, with the session that made it, for anyone the owner opens them to.</dd></div>
      <div><dt>Is my money spent on anything else?</dt><dd>Only that project's agent spends its balance, and only through a metered rail. Nothing is spent off the books.</dd></div>
    </dl>
  </section>
</>;

// A name's page: for a person, the platform's door to buy credits to give; for the org that owns the sponsor listing,
// its GitHub Sponsors door. The core shows the books either way.
export function accountSlots({ name, sponsor, polar, self, entries, patronage }: { name: string; sponsor: string; polar: boolean; self: boolean; entries: DirectoryEntry[]; patronage: Record<string, PatronageView> }): AccountSlots {
  const org = ownerOf(sponsor).toLowerCase() === name.toLowerCase();
  return {
    card: facts(entries, patronage),
    side: org ? <div class="card"><h2>Sponsor</h2><p class="fine" style="margin:0 0 12px">GitHub Sponsors funds {name}'s grants pool; the pool gives on to its projects.</p><a class="btn wide" href={`https://github.com/sponsors/${encodeURIComponent(name)}`}>Sponsor on GitHub</a></div>
      : self ? <div class="card"><h2>Buy credits to give</h2>{polar ? <form class="form" method="post" action="/v1/patrons/checkout"><input type="hidden" name="account" value={`@${name}`} /><input type="hidden" name="interval" value="once" /><button class="btn quiet" type="submit" name="tier" value="0">$10</button><button class="btn quiet" type="submit" name="tier" value="1">$25</button><button class="btn quiet" type="submit" name="tier" value="2">$100</button></form> : <p class="fine" style="margin:0">Credits come from the platform's grants for now; buying them opens with its Polar account.</p>}<p class="fine">Give from any project's page. Every gift is public here and on the project's wall.</p></div>
      : undefined,
    styles: PATRONAGE_STYLES,
  };
}
