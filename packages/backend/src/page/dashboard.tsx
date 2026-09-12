// The dashboard: the same project seen by the people who run it. A self-hosted deployment has no patrons and no ask;
// its front page is this. On the platform it is the sub-page behind the public face. What a viewer sees is the
// owner's committed word (`visibility:` in .open-autonomy/config.yaml): public, patron, team, owner.
import type { ProjectView, SessionSummary } from '../ledger.js';
import type { Roadmap } from '@open-autonomy/sdk/roadmap';
import { tenseOf } from '@open-autonomy/sdk/roadmap';
import { Foot, Hero, NextUp, Pill, Shipped, TopBar, Workshop, standingOf, type SessionTail, type Schedule } from './parts.js';
import { fmtAgo, usd } from '../ui.js';
import { parseSchedule } from './project.js';

export type Viewer = 'public' | 'patron' | 'team' | 'owner';
export interface DashboardData {
  brand: string;
  v: ProjectView;
  sessions: SessionSummary[];
  live: string[];
  roadmap: Roadmap;
  tail?: SessionTail;
  daily: number[];
  viewer: Viewer;
  calls?: Array<{ ts: string; model?: string; rail?: string; usd_cents: number; session?: string }>;
  now: number;
}
const rank: Record<Viewer, number> = { public: 0, patron: 1, team: 2, owner: 3 };
export const sees = (viewer: Viewer, least: Viewer): boolean => rank[viewer] >= rank[least];

function Books({ v, calls, enc, now }: { v: ProjectView; calls: DashboardData['calls']; enc: string; now: number }) {
  return (
    <div class="card">
      <h2>The books</h2>
      <div class="stats">
        <div class="stat"><div class="v">{usd(v.balance_usd_cents)}</div><div class="l">balance</div></div>
        <div class="stat"><div class="v">{usd(v.granted_in_usd_cents)}</div><div class="l">received</div></div>
        <div class="stat"><div class="v">{usd(v.consumed_usd_cents)}</div><div class="l">spent</div></div>
      </div>
      {v.bounds.limits.length ? <div class="rows" style="margin-top:14px">{v.bounds.limits.map((l) => <div class="row"><span class="t">{l.model ? `${l.model} · ` : ''}{l.usd_cents !== undefined ? `${usd(l.usd_cents)} a ${l.window}` : l.calls !== undefined ? `${l.calls} calls a ${l.window}` : `${l.tokens} tokens a ${l.window}`}</span><span class="n">{l.usd_cents !== undefined ? `${usd(l.used.usd_cents)} used` : l.calls !== undefined ? `${l.used.calls} used` : `${l.used.tokens} used`}</span></div>)}</div> : null}
      {calls?.length ? <div class="rows" style="margin-top:14px">{calls.slice(0, 5).map((c) => <div class="row"><span class="t">{c.model ?? c.rail ?? 'call'}</span><span class="n">{usd(c.usd_cents)} · {fmtAgo(c.ts, now)}</span></div>)}</div> : null}
      <a class="more" href={`/v1/accounts/${enc}/calls`}>Every metered call →</a>
    </div>
  );
}
function Agent({ v, schedule }: { v: ProjectView; schedule: Schedule[] }) {
  const skills = (v.profile.agent_skills ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return (
    <div class="card">
      <h2>The agent</h2>
      <div class="rows">
        <div class="row"><span class="t">runs on</span><span class="n">{v.profile.agent_harness ?? 'its harness'} · {v.profile.agent_model ?? 'a model'}{v.profile.agent_provider ? ` (${v.profile.agent_provider})` : ''}</span></div>
        {schedule.map((j) => <div class="row"><span class="t">{j.name ?? 'job'}</span><span class="n">fires {j.schedule ?? '?'}</span></div>)}
        {skills.length ? <div class="row"><span class="t">knows</span><span class="n">{skills.join(' · ')}</span></div> : null}
      </div>
      <a class="more" href={`/p/${encodeURIComponent(v.account)}/setup`}>Who it is and how it runs →</a>
    </div>
  );
}
// The owner's one control. Its form posts to a page route that is not served yet: today the owner's door is
// `POST /v1/agent/state` on a steer key (ADR 0003). Serving this form means a signed-in owner and a steer key held by
// the deployment; both are decisions outside this design.
function Controls({ v, enc }: { v: ProjectView; enc: string }) {
  const desired = v.control?.desired?.state ?? 'running';
  return (
    <div class="card">
      <h2>Owner</h2>
      <p class="prose" style="font-size:14px">The one word of control. The agent applies it its own way and answers; the page shows the request beside the answer.</p>
      <form class="form" method="post" action={`/p/${enc}/state`} style="margin-top:12px">
        <input name="reason" placeholder={desired === 'paused' ? 'why resume (optional)' : 'why pause (optional)'} maxlength={400} />
        <button class={`btn${desired === 'paused' ? '' : ' quiet'}`} type="submit" name="state" value={desired === 'paused' ? 'running' : 'paused'}>{desired === 'paused' ? 'Resume the agent' : 'Pause the agent'}</button>
      </form>
      {v.control?.observed ? <p class="fine">The agent last said <b>{v.control.observed.state}</b>{v.control.observed.note ? `: ${v.control.observed.note}` : ''}.</p> : <p class="fine">The agent has not reported its state yet.</p>}
    </div>
  );
}
export function DashboardPage(d: DashboardData) {
  const enc = encodeURIComponent(d.v.account);
  const standing = standingOf(d.v, d.live);
  const schedule = parseSchedule(d.v.profile.schedule_json);
  const active = d.roadmap.items.filter((i) => tenseOf(i) === 'present');
  return (
    <>
      <TopBar brand={d.brand} cta={false} />
      <div class="page">
        <Hero v={d.v} standing={standing} patronage={{ tiers: [], patrons: [], patron_count: 0, monthly_usd_cents: 0 }} runwayDays={d.v.runway_days !== null && Number.isFinite(d.v.runway_days) ? Math.round(d.v.runway_days) : null} quiet />
        <div class="cols">
          <div class="main">
            <Workshop sessions={d.sessions} live={d.live} tail={d.tail} schedule={schedule} standing={standing} control={d.v.control} daily={d.daily} enc={enc} now={d.now} />
            {active.length ? <div class="card"><h2>In progress</h2><div class="rows">{active.map((i) => <div class="row"><a class="t" href={`/p/${enc}/items/${encodeURIComponent(i.id)}`}>{i.title}</a><span class="n k">{i.by ?? 'in progress'}</span></div>)}</div></div> : null}
            <NextUp roadmap={d.roadmap} enc={enc} max={8} />
            <Shipped roadmap={d.roadmap} enc={enc} now={d.now} max={8} />
          </div>
          <div class="side">
            <div class="card" style="display:flex;align-items:center;gap:12px"><Pill standing={standing} /><span class="empty">{d.viewer === 'public' ? 'as a stranger sees it' : `as ${d.viewer}`}</span></div>
            <Books v={d.v} calls={d.calls} enc={enc} now={d.now} />
            {sees(d.viewer, 'team') ? <Agent v={d.v} schedule={schedule} /> : null}
            {sees(d.viewer, 'owner') ? <Controls v={d.v} enc={enc} /> : null}
          </div>
        </div>
        <Foot enc={enc} />
      </div>
    </>
  );
}
