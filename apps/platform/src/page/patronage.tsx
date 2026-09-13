// The platform's additions to the core's pages: the ask, the tiers, the subscribers, Explore. They enter the core's
// pages through its slots and nowhere else. A self-host never imports this file.
import type { Roadmap } from '@open-autonomy/sdk/roadmap';
import type { DirectoryEntry } from '@open-autonomy/backend';
import type { AccountSlots, DirectorySlots, PageSlots, Viewer } from '@open-autonomy/backend/page/model';
import { at, safeUrl, ownerOf } from '@open-autonomy/backend/page/parts';
import { usd0 } from '@open-autonomy/backend/ui';
import { T } from '@open-autonomy/backend/page/theme';
import type { Patron, PatronageView, Tier } from '../patronage.js';

// The platform's own rules, from the core's tokens: the tiers, the ladder, and the fold under them.
export const PATRONAGE_STYLES = `
.tiers{display:flex;flex-direction:column;gap:10px}
.tier{border:1.5px solid ${T.line};border-radius:14px;padding:16px 18px;background:${T.panel}}
.tier.feat{border-color:${T.accent};background:${T.accentWash}}
.tier .th{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px}
.tier .tn{font-weight:700;font-size:15px}
.tier .tp{font-weight:800;font-size:18px;letter-spacing:-.02em}
.tier .tp span{font-weight:500;font-size:12.5px;color:${T.muted}}
.tier p{color:${T.body};font-size:13.5px;margin-bottom:12px}
.tier .btn{width:100%}
.ladder{display:flex;flex-direction:column;border:1.5px solid ${T.line};border-radius:14px;overflow:hidden;margin-bottom:12px;background:${T.panel}}
.ladder .rung{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:12px 16px;border-top:1px solid ${T.line}}
.ladder .rung:first-child{border-top:0}
.ladder .rung .tn{font-weight:700;font-size:14.5px}
.ladder .rung .tn span{display:block;font-weight:400;font-size:13px;color:${T.muted}}
.ladder .rung .tp{font-weight:800;font-size:16px;white-space:nowrap}
.ladder .rung .tp span{font-weight:500;font-size:12px;color:${T.muted}}
details.more{border-top:1px solid ${T.line};margin-top:16px;padding-top:12px}
details.more summary{cursor:pointer;color:${T.muted};font-size:13.5px;font-weight:600;list-style:none;display:flex;align-items:center;gap:6px}
details.more summary::-webkit-details-marker{display:none}
details.more summary::before{content:"";width:6px;height:6px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(-45deg);margin-right:4px;transition:transform .15s}
details.more[open] summary::before{transform:rotate(45deg)}
details.more .body{padding-top:12px;display:flex;flex-direction:column;gap:12px}
`;

export interface PlatformPage { account: string; patronage: PatronageView; polar: boolean; sponsor: string; burnPerMonth: number; roadmap: Roadmap; who?: Viewer; here?: string }

// The bar's links: Explore, and who is signed in or the door to sign in, returning here.
export const whoNav = (who: Viewer | undefined, here = '/') => <><a href="/">Explore</a>{who ? <a href={at(who.login)}>@{who.login}</a> : <a href={`/give/login?next=${encodeURIComponent(here)}`}>Sign in</a>}</>;

// The tiers: Polar checkout per tier, or GitHub Sponsors once. Other ways to give fold under the tiers.
export function Tiers({ tiers, owner, account, sponsor, polar, burn }: { tiers: Tier[]; owner: string; account: string; sponsor: string; polar: boolean; burn: number }) {
  const days = (t: Tier) => (burn > 0 ? Math.round(t.usd_cents / burn) : null);
  return (
    <div class="card" id="tiers">
      <h2>Become a patron</h2>
      {polar ? <div class="tiers">{tiers.map((t, i) => {
        const d = days(t);
        return (
          <div class={`tier${i === 1 ? ' feat' : ''}`}>
            <div class="th"><span class="tn">{t.name}</span><span class="tp">{usd0(t.usd_cents)} <span>/mo</span></span></div>
            <p>On the patrons wall{d !== null ? `; about ${d} day${d === 1 ? '' : 's'} of runway each month` : ''}.</p>
            <form method="post" action="/v1/patrons/checkout"><input type="hidden" name="account" value={account} /><input type="hidden" name="tier" value={String(i)} /><button class={`btn${i === 1 ? '' : ' quiet'}`} type="submit" name="interval" value="month">Join for {usd0(t.usd_cents)}/mo</button></form>
          </div>
        );
      })}</div> : <>
        <div class="ladder">{tiers.map((t) => { const d = days(t); return <div class="rung"><span class="tn">{t.name}<span>On the patrons wall{d !== null ? `; about ${d} day${d === 1 ? '' : 's'} of runway a month` : ''}</span></span><span class="tp">{usd0(t.usd_cents)} <span>/mo</span></span></div>; })}</div>
        <a class="btn wide" href={`https://github.com/sponsors/${encodeURIComponent(owner)}`}>Sponsor on GitHub</a>
        {account !== sponsor ? <p class="fine" style="margin-top:10px">GitHub Sponsors funds {owner}'s pool; grants reach this project from there.</p> : null}
      </>}
      <details class="more">
        <summary>Other ways to give</summary>
        <div class="body">
          <form class="form" method="post" action={`${at(account)}/give`}>
            <input name="key" placeholder="your funder key" autocomplete="off" />
            <input name="usd_cents" type="number" min={1} placeholder="cents" />
            <input name="note" placeholder="a word, optional" maxlength={280} />
            <button class="btn quiet" type="submit">Give grant credits</button>
            <p class="fine">Funders hold grant credits on their own books and give them to a project they believe in.</p>
          </form>
          <form class="form" method="post" action={`${at(account)}/redeem`}>
            <input name="code" placeholder="sponsor coupon" autocomplete="off" />
            <button class="btn quiet" type="submit">Redeem</button>
          </form>
        </div>
      </details>
    </div>
  );
}
const chip = (p: Patron) => <a class="chip" href={safeUrl(p.url) ?? `https://github.com/${encodeURIComponent(p.login)}`}>{safeUrl(p.avatar_url) ? <img src={safeUrl(p.avatar_url)} alt="" /> : null}{p.name ?? p.login}</a>;

// What the platform puts into the core's slots on a project's pages.
export function projectSlots(p: PlatformPage): PageSlots {
  const { patronage, account } = p;
  const monthly = patronage.monthly_usd_cents;
  return {
    nav: whoNav(p.who, p.here),
    cta: <a class="btn small" href="#tiers">Become a patron</a>,
    meta: <><span><b>{patronage.patron_count}</b> {patronage.patron_count === 1 ? 'patron' : 'patrons'}</span><span><b>{usd0(monthly)}</b>/mo</span></>,
    side: <Tiers tiers={patronage.tiers} owner={ownerOf(account)} account={account} sponsor={p.sponsor} polar={p.polar} burn={p.burnPerMonth} />,
    wallTitle: 'Patrons',
    wall: patronage.patrons.length ? <>{patronage.patrons.map(chip)}</> : undefined,
    moneyIn: patronage.patrons.length ? <>{patronage.patrons.map((x) => <li>{safeUrl(x.avatar_url) ? <img src={safeUrl(x.avatar_url)} alt="" /> : <span class="ph" />}<span class="who"><b>{x.name ?? x.login}</b><span>{x.amount_label ?? (x.kind === 'sponsor' ? 'GitHub sponsor' : x.kind === 'funder' ? 'grant credits' : 'patron')}</span></span><span class="amt" /></li>)}</> : undefined,
    styles: PATRONAGE_STYLES,
  };
}

// Explore: the core's directory with the platform's pitch, its patrons in the figures, and each project's patrons on
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
    front: <><h1>Fund a project that builds itself.</h1><p class="lede">Each project here runs its own agent on a roadmap it keeps in its repository. Back one, and every session it works, every cent it spends and everything it ships is on its page.</p></>,
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
