// The human giving page: GitHub proves a login, and the same grant that a funder key moves is moved from a form.
// The platform's page, on the core's frame.
import { TopBar, Foot, at, document, purposeSentence, render, usd, fmtAgo, type DirectoryEntry, type FunderView } from '@open-autonomy/backend';

export interface GivePageData {
  login: string;
  funder: FunderView;
  projects: DirectoryEntry[];
  grants?: { account: string; view: FunderView };
  message?: { ok: boolean; text: string };
  attempt: string;
}
const BRAND = 'open-autonomy';

export function renderGivePage(data?: GivePageData): string {
  const now = Date.now();
  if (!data) return document('Give grant credits', BRAND, render(
    <>
      <TopBar brand={BRAND} nav={<a href="/">Explore</a>} />
      <div class="page">
        <div class="card" style="max-width:620px;margin:64px auto 0;padding:36px">
          <h1 style="font-family:Fraunces,Georgia,serif;font-size:32px;font-weight:600;letter-spacing:-.01em;margin-bottom:10px">Give grant credits</h1>
          <p class="prose" style="margin-bottom:20px">Grant credits are funds you hold on these public books and can pass to a project you believe in. They can only be given, never spent by this page.</p>
          <a class="btn" href="/give/login">Sign in with GitHub</a>
          <p class="fine">GitHub is used only to verify your login. The sign-in asks for no repository or organization scope.</p>
        </div>
        <Foot brand={BRAND} />
      </div>
    </>,
  ));
  const sources = [
    { account: data.funder.account, label: `${data.funder.account} · ${usd(data.funder.credits_usd_cents)} available` },
    ...(data.grants ? [{ account: data.grants.account, label: `the organization's grants pool · ${usd(data.grants.view.credits_usd_cents)} available` }] : []),
  ];
  const Gifts = ({ view, empty }: { view: FunderView; empty: string }) => view.given.length
    ? <ul class="gifts">{view.given.map((g) => <li><span class="ph" /><span class="who"><b><a href={at(g.to)}>{g.to}</a></b><span>{g.by ? `passed on by ${g.by} · ` : ''}{g.note ? `“${g.note}” · ` : ''}{g.purpose ? `for ${purposeSentence(g.to, g.purpose)} · ` : ''}{fmtAgo(g.ts, now)}</span></span><span class="amt">−{usd(g.amount_usd_cents)}</span></li>)}</ul>
    : <p class="empty">{empty}</p>;
  return document('Give grant credits', BRAND, render(
    <>
      <TopBar brand={BRAND} nav={<a href="/">Explore</a>} cta={<a class="btn small quiet" href="/give/logout">Sign out</a>} />
      <div class="page">
        <div class="acct" style="align-items:flex-start"><div class="who"><h1>Give grant credits</h1><p class="line">Signed in as <a href={at(data.login)}>@{data.login}</a>.</p></div></div>
        {data.message ? <div class="card" role="status" style={`margin-top:20px;border-color:${data.message.ok ? '#0a8754' : '#ff424d'}`}>{data.message.text}</div> : null}
        <div class="cols">
          <div class="main">
            <div class="card"><h2>Your gifts</h2><Gifts view={data.funder} empty="You have not given any credits yet." /></div>
            {data.grants ? <div class="card"><h2>The grants pool's gifts</h2><Gifts view={data.grants.view} empty="The organization has not passed any money on yet." /></div> : null}
          </div>
          <div class="side">
            <div class="card">
              <h2>Give once</h2>
              <form class="form" method="post" action="/give">
                <input type="hidden" name="key" value={data.attempt} />
                <label class="field">Give from<select name="source">{sources.map((x) => <option value={x.account}>{x.label}</option>)}</select></label>
                <label class="field">Project<select name="to" required>{data.projects.map((p) => <option value={p.account}>{p.account}</option>)}</select></label>
                <label class="field">Amount in cents<input name="usd_cents" type="number" min={1} step={1} required /></label>
                <label class="field">Earmark<select name="for"><option value="unrestricted">whatever the project needs</option><option value="model">model calls only</option><option value="any">anything the agent spends on</option></select></label>
                <label class="field">Why this project (optional)<input name="note" maxlength={280} /></label>
                <button class="btn wide" type="submit" disabled={!data.projects.length}>Give</button>
                <p class="fine">{data.projects.length ? 'One submission, one public gift. Retrying this form cannot give twice.' : 'There are no listed projects to give to.'}</p>
              </form>
            </div>
          </div>
        </div>
        <Foot brand={BRAND} />
      </div>
    </>,
  ));
}
