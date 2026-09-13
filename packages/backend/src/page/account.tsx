// A name's page: GitHub's user or org page. A name is a GitHub login, an org or a person, one namespace. The page
// shows what the name owns here (its projects, its grants pool) and what it gave (a giver's books). Money never
// arrives from nobody, so every gift on a project's wall leads back to one of these pages.
import type { DirectoryEntry, Flow, FunderView } from '../ledger.js';
import { fmtAgo, usd } from '../ui.js';
import { Foot, TopBar, at, ownerOf, safeUrl } from './parts.js';
import { ProjectCard, byStanding, listed } from './directory.js';
import type { AccountSlots, Role } from './model.js';

export interface AccountPageData { brand: string; viewer: Role; name: string; entries: DirectoryEntry[]; funder?: FunderView; now: number; slots?: AccountSlots }

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
export const ownedBy = (name: string, entries: DirectoryEntry[]): DirectoryEntry[] => byStanding(listed(entries).filter((e) => same(ownerOf(e.account), name)));
export const poolOf = (name: string, entries: DirectoryEntry[]): DirectoryEntry | undefined => entries.find((e) => same(e.account, `${name}/grants`));

// One gift as a row: who or what, a word, when, how much. A project in the row links to its page.
function Gift({ f, dir, entries, now, brand }: { f: Flow; dir: 'out' | 'in'; entries: DirectoryEntry[]; now: number; brand: string }) {
  const other = dir === 'out' ? f.to : f.from;
  const project = other ? entries.find((e) => same(e.account, other)) : undefined;
  const who = other ? (other.startsWith('@') ? other.slice(1) : other.endsWith('/grants') ? `${ownerOf(other)}'s grants pool` : other) : f.sponsor_login ? `@${f.sponsor_login}` : brand;
  const href = other ? (other.startsWith('@') ? at(other.slice(1)) : at(other)) : undefined;
  return (
    <li>
      {project && safeUrl(project.profile.avatar_url) ? <img src={safeUrl(project.profile.avatar_url)} alt="" /> : <span class="ph" />}
      <span class="who"><b>{href ? <a href={href}>{who}</a> : who}</b><span>{f.note ? `“${f.note}” · ` : ''}{f.kind === 'mint' ? (f.coupon ? 'a coupon' : 'credits') : 'a grant'} · {fmtAgo(f.ts, now)}</span></span>
      <span class="amt">{dir === 'out' ? '−' : '+'}{usd(f.amount_usd_cents)}</span>
    </li>
  );
}

export function Account(d: AccountPageData) {
  const projects = ownedBy(d.name, d.entries);
  const pool = poolOf(d.name, d.entries);
  const working = projects.filter((e) => e.live_sessions.length).length;
  const f = d.funder?.found ? d.funder : undefined;
  const gives = Boolean(f && (f.given.length || f.received.length || f.credits_usd_cents > 0));
  const line = projects.length
    ? `${projects.length === 1 ? 'One project builds itself' : `${projects.length} projects build themselves`} here${working ? `, ${working === 1 ? 'one' : working} at work this minute` : ''}.`
    : gives ? 'Gives to projects here.' : 'Nothing here yet.';
  return (
    <>
      <TopBar brand={d.brand} nav={d.slots?.nav} />
      <div class="page">
        <div class="acct">
          <img class="av" src={`https://github.com/${encodeURIComponent(d.name)}.png?size=160`} alt="" />
          <div class="who">
            <h1>{d.name}</h1>
            <p class="line">{line}</p>
            <div class="meta">
              {projects.length ? <span><b>{usd(projects.reduce((s, e) => s + e.balance_usd_cents, 0))}</b> in the bank across projects</span> : null}
              {f ? <span><b>{usd(f.given_usd_cents)}</b> given</span> : null}
              {d.slots?.meta}
              <a href={`https://github.com/${encodeURIComponent(d.name)}`} target="_blank" rel="noopener">github.com/{d.name} ↗</a>
            </div>
          </div>
        </div>
        <div class="cols">
          <div class="main">
            {projects.length ? <div class="card"><h2>Projects</h2><div class="grid two">{projects.map((e) => <ProjectCard e={e} facts={d.slots?.card?.[e.account]} />)}</div></div> : null}
            {f && f.given.length ? <div class="card"><h2>Given</h2><ul class="gifts">{f.given.map((g) => <Gift f={g} dir="out" entries={d.entries} now={d.now} brand={d.brand} />)}</ul></div> : null}
            {f && f.received.length ? <div class="card"><h2>Received</h2><ul class="gifts">{f.received.map((g) => <Gift f={g} dir="in" entries={d.entries} now={d.now} brand={d.brand} />)}</ul></div> : null}
            {!projects.length && !gives ? <div class="card"><p class="empty">{d.name} owns no project here and has not given yet.</p></div> : null}
            {d.slots?.main}
          </div>
          <div class="side">
            {f ? <div class="card fund">
              <div class="big">{usd(f.credits_usd_cents)}<span> to give</span></div>
              <div class="line">Credits on {d.name}'s own books, given to projects they believe in.</div>
              <div class="stats"><div class="stat"><div class="v">{usd(f.given_usd_cents)}</div><div class="l">given</div></div><div class="stat"><div class="v">{usd(f.received_usd_cents)}</div><div class="l">received</div></div><div class="stat"><div class="v">{f.given.length}</div><div class="l">{f.given.length === 1 ? 'gift' : 'gifts'}</div></div></div>
            </div> : null}
            {pool ? <div class="card fund">
              <div class="big">{usd(pool.balance_usd_cents)}<span> in the grants pool</span></div>
              <div class="line">{d.name}'s pool gives on to its projects; {usd(pool.granted_out_usd_cents)} given so far.</div>
              <p class="fine"><a href={at(pool.account, 'books')}>The pool's books →</a></p>
            </div> : null}
            {d.slots?.side}
          </div>
        </div>
        <Foot brand={d.brand} />
      </div>
    </>
  );
}
