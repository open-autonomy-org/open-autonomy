// The platform's additions to the core's pages: the ask, the tiers, the subscribers, Explore. They enter the core's
// pages through its slots and nowhere else. A self-host never imports this file.
import type { DirectoryEntry } from '@open-autonomy/backend';
import type { AccountSlots, DirectorySlots, Viewer } from '@open-autonomy/backend/page/model';
import { at, safeUrl, ownerOf } from '@open-autonomy/backend/page/parts';
import { usd0 } from '@open-autonomy/backend/ui';
import { T, TEXT } from '@open-autonomy/backend/page/theme';
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
.ladder .rung .tp{font:300 20px/1 ${TEXT};white-space:nowrap}
.ladder .rung .tp span{font-size:12px;color:${T.muted}}
.others{padding:22px;background:${T.panel};border:1px solid ${T.line};display:flex;flex-direction:column;gap:16px}
.others h3{font-size:16px;font-weight:400}
.others .form+.form{padding-top:16px;border-top:1px solid ${T.line}}
@media(max-width:900px){.tierset{grid-template-columns:1fr}}
`;

// The bar's links: Explore, and who is signed in or the door to sign in, returning here.
export const whoNav = (who: Viewer | undefined, here = '/') => <><a href="/">Explore</a>{who ? <a href={at(who.login)}>@{who.login}</a> : <a href={`/give/login?next=${encodeURIComponent(here)}`}>Sign in</a>}</>;

// The tiers: Polar checkout per tier, or GitHub Sponsors once. Other ways to give fold under the tiers.
export function Tiers({ tiers, owner, account, sponsor, polar, burn }: { tiers: Tier[]; owner: string; account: string; sponsor: string; polar: boolean; burn: number }) {
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
        <h3>Other ways to give</h3>
        <form class="form" method="post" action={`${at(account)}/give`}>
          <input name="key" placeholder="your funder key" autocomplete="off" aria-label="Funder key" />
          <input name="usd_cents" type="number" min={1} placeholder="cents" aria-label="Amount in cents" />
          <input name="note" placeholder="a word, optional" maxlength={280} aria-label="A word" />
          <button class="btn quiet" type="submit">Give grant credits</button>
          <p class="fine" style="margin-top:0">Funders hold grant credits on their own books and give them to a project they believe in.</p>
        </form>
        <form class="form" method="post" action={`${at(account)}/redeem`}>
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
const facts = (entries: DirectoryEntry[], patronage: Record<string, PatronageView>): Record<string, unknown> =>
  Object.fromEntries(entries.filter((e) => e.is_project && e.listed).map((e) => { const x = patronage[e.account] ?? NONE; return [e.account, <><span><b>{x.patron_count}</b> {x.patron_count === 1 ? 'patron' : 'patrons'}</span><span><b>{usd0(x.monthly_usd_cents)}</b>/mo</span></>]; }));
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
      <div class="acts"><a class="btn" href="#projects">Explore projects<span class="arr">→</span></a><a class="btn quiet" href="https://github.com/open-autonomy-org/open-autonomy#readme">Start a project</a></div>
    </>,
    stripe: <><div><span class="n">{patrons}</span><span class="k">{patrons === 1 ? 'patron' : 'patrons'}</span></div>{granted > 0 ? <div><span class="n">{usd0(granted)}</span><span class="k">{funders && pooled ? `granted by ${funders} ${funders === 1 ? 'funder' : 'funders'} and ${ownerOf(grants)}'s pool` : funders ? `granted by ${funders} ${funders === 1 ? 'funder' : 'funders'}` : `granted from ${ownerOf(grants)}'s pool`}</span></div> : null}</>,
    card: facts(entries, patronage),
    styles: PATRONAGE_STYLES,
  };
}

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
