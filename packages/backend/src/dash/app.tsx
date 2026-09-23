/** @jsxImportSource preact */
// The dashboard: the work as the team reads it, built from Supercode's UI kit. The kit's own components carry the
// sessions (the chat inventory and the conversation), the roadmap (the workflow board), the schedule (jobs and
// their runs, the owner's pause on them); the shell around them, the money and the roster are this page's. The
// same tree renders on the worker and hydrates in the browser, where a live session's turns arrive as they land.
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { Conversation, HarnessLogo, SessionList, type MessengerSlots, type SupercodeUiState, type UiAdapter } from '@volter-ai-dev/supercode-ui/preact';
import { JobActions, JobControls, JobDetails, RunList, WorkflowBoard, WorkflowList, type JobModel, type PauseResult, type JobControlResult } from '@volter-ai-dev/supercode-ui/preact/supervision';
import { tenseOf } from '@open-autonomy/sdk/roadmap';
import type { Envelope, Flow, SessionSummary } from '../ledger.js';
import { fmtAgo, fmtDur, fmtWhen, mdToSafeHtml, shortSha, usd, LOGO_SVG } from '../ui.js';
import { sees, type Role } from '../page/model.js';
import { at, nameOf, standingOf, type Standing } from '../page/parts.js';
import { boardOf, entriesOf, jobsOf, lastSeq, paused, runsOf, taskOf, uiState, PAGES, type DashData, type DashPage } from './model.js';

const href = (a: string, p: DashPage, ...rest: string[]) => (p === 'overview' && !rest.length ? at(a, 'dashboard') : at(a, 'dashboard', p, ...rest));
const go = (url: string) => { if (typeof location !== 'undefined') location.assign(url); };
const runway = (d: DashData) => (d.v.runway_days !== null && Number.isFinite(d.v.runway_days) ? Math.round(d.v.runway_days) : null);
const ROLE_WORDS: Record<Role, string> = { public: 'Public view', giver: 'Giver view', team: 'Team view', owner: 'Owner view' };
const STANDING: Record<Standing, [string, string]> = { live: ['live', 'Working now'], running: ['ok', 'Running'], requested: ['warn', 'Pause requested'], paused: ['off', 'Paused by the owner'], exhausted: ['off', 'Spending stopped'], unfunded: ['', 'Not yet funded'] };
const Pill = ({ standing }: { standing: Standing }) => <span class={`oa-pill ${STANDING[standing][0]}`}><i />{STANDING[standing][1]}</span>;
// The page watches; every intent the kit can raise is answered by navigation or by nothing.
const watcher = (d: DashData): UiAdapter => ({ onIntent(i) { if (i.action === 'attach') go(href(d.v.account, 'sessions', i.key)); }, now: () => Date.now(), copyText: (t) => { void navigator.clipboard?.writeText(t); } });

// ---- the shell ------------------------------------------------------------------------------------------------------
export function Shell({ d, title, children }: { d: DashData; title: string; children?: ComponentChildren }) {
  const a = d.v.account;
  const standing = standingOf(d.v, d.live);
  const open = d.roadmap.items.filter((i) => tenseOf(i) !== 'past').length;
  const counts: Partial<Record<DashPage, string | number>> = { sessions: d.live.length ? `${d.live.length} live` : undefined, board: open || undefined };
  const rw = runway(d);
  const today = d.daily.length ? d.daily[d.daily.length - 1] : 0;
  return (
    <div class="oa-dash">
      <aside class="oa-rail">
        <a class="oa-brand" href="/" dangerouslySetInnerHTML={{ __html: `${LOGO_SVG}<span>${d.brand}</span>` }} />
        <div class="oa-proj"><HarnessLogo id={d.v.profile.agent_harness ?? 'hermes'} activity={standing === 'live' ? 'working' : standing === 'running' ? 'idle' : 'finished'} size={30} /><div><div class="n">{nameOf(a)}</div><div class="o">{a}</div></div></div>
        <nav>{PAGES.filter((p) => sees(d.viewer, d.visibility[p.panel])).map((p) => <a class={p.id === d.page ? 'on' : ''} href={href(a, p.id)}>{p.label}{counts[p.id] !== undefined ? <span class="c">{counts[p.id]}</span> : null}</a>)}</nav>
        <div class="oa-role"><b>{ROLE_WORDS[d.viewer]}</b>{d.viewer === 'public' ? 'What the owner opened to everyone.' : d.viewer === 'owner' ? 'Everything, and the one control.' : 'What the owner opened to the team.'} <a href={at(a)}>Project page →</a></div>
      </aside>
      <div class="oa-body">
        <div class="oa-top">
          <h1>{title}</h1>
          <Pill standing={standing} />
          <span class="grow" />
          <div class="oa-facts">
            <span><b>{usd(d.v.balance_usd_cents)}</b> in the bank</span>
            {rw !== null ? <span><b>{rw > 365 ? '1y+' : `${rw}d`}</b> runway</span> : null}
            <span><b>{usd(today)}</b> today</span>
            <span><b>{usd(d.v.consumed_usd_cents)}</b> spent</span>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---- live: a session's turns as they land ----------------------------------------------------------------------------
// The worker's event stream for one session: each turn appends to the transcript; the end of the session, or a
// change in the page's shape, reloads once. Only in a browser; the worker renders what it has.
function useLive(account: string, key: string | undefined, seq: number, live: boolean, onTurn: (t: Record<string, unknown>) => void, onEnd: () => void) {
  useEffect(() => {
    if (!key || !live || typeof EventSource === 'undefined') return;
    const es = new EventSource(`/v1/accounts/${encodeURIComponent(account)}/sessions/${encodeURIComponent(key)}/events?after=${seq}`);
    es.addEventListener('turn', (e) => onTurn(JSON.parse((e as MessageEvent).data)));
    es.addEventListener('status', (e) => { const s = JSON.parse((e as MessageEvent).data) as { status: string }; if (s.status !== 'live') { es.close(); onEnd(); } });
    es.onerror = () => {};
    return () => es.close();
  }, [account, key, live]);
}
const later = () => setTimeout(() => location.reload(), 900);

// ---- the panels -----------------------------------------------------------------------------------------------------
function Panel({ title, more, children, span }: { title: string; more?: [string, string]; children?: ComponentChildren; span?: number }) {
  return <section class={`oa-panel${span ? ` span${span}` : ''}`}><h2>{title}{more ? <a href={more[1]}>{more[0]}</a> : null}</h2>{children}</section>;
}
function Spend({ d }: { d: DashData }) {
  const last = d.daily.slice(-30); const max = Math.max(1, ...last); const week = last.slice(-7).reduce((x, y) => x + y, 0);
  const rw = runway(d); const tone = rw === null ? '' : rw < d.v.goal_days / 3 ? 'warn' : 'ok';
  return (
    <Panel title="Spend" more={['Books →', href(d.v.account, 'books')]}>
      <div class="oa-kpis two">
        <div class="oa-kpi"><div class="v">{usd(week)}</div><div class="l">this week</div></div>
        <div class="oa-kpi"><div class={`v ${tone}`}>{rw === null ? '—' : rw > 365 ? '1y+' : `${rw}d`}</div><div class="l">runway · goal {d.v.goal_days}d</div></div>
      </div>
      <div class="oa-spark">{last.map((x, i) => <i class={x <= 0 ? 'zero' : i === last.length - 1 ? 'hot' : ''} style={`height:${Math.max(4, Math.round((x / max) * 100))}%`} />)}</div>
      <div class="oa-sparklabel"><span>last {last.length} days</span><span>burn {usd(d.v.burn_per_day_usd_cents)}/day</span></div>
    </Panel>
  );
}

// The conversation of one session, live when it is: the kit's transcript over the stream's turns.
function Transcript({ d, s, state, adapter }: { d: DashData; s: { key: string; turns: Array<Record<string, unknown>>; status?: string }; state: SupercodeUiState; adapter: UiAdapter }) {
  const a = d.v.account;
  const live = d.live.includes(s.key) || s.status === 'live';
  // Turns that land after the render join the stored ones; the pairing of calls and answers is redone over all.
  const [arrived, setArrived] = useState<Array<Record<string, unknown>>>([]);
  useLive(a, s.key, lastSeq(s.turns as never), live, (t) => setArrived((x) => [...x, t]), later);
  const s2 = useMemo(() => (arrived.length ? { ...state, transcript: entriesOf([...s.turns, ...arrived] as never, live) } : state), [state, arrived, s.turns, live]);
  return <Conversation state={s2} adapter={adapter} slots={SLOTS} />;
}
const SLOTS: MessengerSlots = { header: () => null, footer: () => null };

// ---- the pages ------------------------------------------------------------------------------------------------------
export function Overview({ d }: { d: DashData }) {
  const a = d.v.account;
  const state = useMemo(() => uiState(d, sees(d.viewer, d.visibility.transcripts) ? d.tail : undefined), [d]);
  const adapter = useMemo(() => watcher(d), [d]);
  const board = useMemo(() => boardOf(d), [d]);
  const ahead = board.tasks.filter((t) => t.lane !== 'shipped').slice(0, 6);
  const jobs = jobsOf(d);
  const first = d.tail && d.live.includes(d.tail.key) ? d.tail : undefined;
  return (
    <Shell d={d} title="Overview">
      <div class="oa-two">
        <div class="oa-col">
          <Panel title={first ? 'Working now' : 'Sessions'} more={sees(d.viewer, d.visibility.sessions) ? ['Every session →', href(a, 'sessions')] : undefined}>
            {first && sees(d.viewer, d.visibility.transcripts) ? <div class="scui-root oa-kit oa-tail"><Transcript d={d} s={first} state={state} adapter={adapter} /></div> : null}
            {state.sessions.length ? <div class="scui-root oa-kit oa-list"><SessionList state={{ ...state, sessions: state.sessions.slice(0, 8) }} adapter={adapter} onOpen={(r) => { if (sees(d.viewer, d.visibility.sessions)) go(href(a, 'sessions', r.key)); }} labels={LABELS} /></div> : <p class="oa-empty">{sees(d.viewer, d.visibility.sessions) ? 'No sessions yet.' : 'Nothing running this minute. The sessions are not open to this view.'}</p>}
          </Panel>
        </div>
        <div class="oa-col">
          <Spend d={d} />
          {sees(d.viewer, d.visibility.work) ? <Panel title="Board" more={['Whole board →', href(a, 'board')]}>
            <div class="oa-kpis three">
              <div class="oa-kpi"><div class="v">{board.tasks.filter((t) => t.lane === 'in progress').length}</div><div class="l">in progress</div></div>
              <div class="oa-kpi"><div class="v">{board.tasks.filter((t) => t.lane === 'planned' || t.lane === 'proposed').length}</div><div class="l">promised</div></div>
              <div class="oa-kpi"><div class="v">{board.tasks.filter((t) => t.lane === 'shipped').length}</div><div class="l">shipped</div></div>
            </div>
            <div class="scui-root oa-kit"><WorkflowList tasks={ahead} onOpen={(k) => go(href(a, 'board', k))} /></div>
          </Panel> : null}
          {sees(d.viewer, d.visibility.agent) && jobs.length ? <Panel title="Agent" more={['Details →', href(a, 'agent')]}><div class="scui-root oa-kit"><Jobs d={d} jobs={jobs} compact /></div></Panel> : null}
        </div>
      </div>
    </Shell>
  );
}

export function Sessions({ d }: { d: DashData }) {
  const a = d.v.account;
  const s = d.session ?? (d.tail && sees(d.viewer, d.visibility.transcripts) ? d.tail : undefined);
  const state = useMemo(() => uiState(d, sees(d.viewer, d.visibility.transcripts) ? s : undefined), [d, s]);
  const adapter = useMemo(() => watcher(d), [d]);
  const rec = d.session;
  return (
    <Shell d={d} title={rec ? `${rec.source ?? rec.kind} · ${fmtWhen(rec.started_at)}` : 'Sessions'}>
      <div class="oa-messenger" data-pane={rec ? 'chat' : 'list'}>
        <div class="scui-root oa-kit oa-list"><SessionList state={state} adapter={adapter} onOpen={(r) => go(href(a, 'sessions', r.key))} focusKey={s?.key ?? null} labels={LABELS} /></div>
        <div class="scui-root oa-kit oa-chat">
          {rec ? <div class="oa-chathead">
            <span><b>{usd(rec.usd_cents)}</b> metered</span><span><b>{rec.calls}</b> model calls</span><span><b>{fmtDur(rec.started_at, rec.ended_at, d.now)}</b> {rec.status === 'live' ? 'so far' : 'run'}</span>
            <span><b>{rec.status}</b>{rec.outcome ? ` · ${rec.outcome}` : ''}</span>
            {rec.item_id ? <span>on <a href={href(a, 'board', rec.item_id)}>{rec.item_id}</a></span> : null}
            {rec.commit_sha ? <span>landed as <b>{shortSha(rec.commit_sha)}</b></span> : null}
            {rec.model_provider ? <span>paid by <b>{rec.model_provider === 'open-autonomy' ? 'the project' : rec.model_provider}</b></span> : null}
          </div> : null}
          {s && sees(d.viewer, d.visibility.transcripts) ? <Transcript d={d} s={s} state={state} adapter={adapter} /> : <p class="oa-empty">{sees(d.viewer, d.visibility.transcripts) ? 'Open a session to read its transcript.' : 'Transcripts are not open to this view.'}</p>}
        </div>
      </div>
    </Shell>
  );
}
const LABELS = { chats: 'Sessions', newChat: 'New session', searchChats: 'Search sessions', askAgent: '', continueHere: '', joinLive: 'Watch', forkHere: '' } as never;

export function Board({ d }: { d: DashData }) {
  const a = d.v.account;
  const board = useMemo(() => boardOf(d), [d]);
  const [selected, setSelected] = useState<string | null>(d.item ?? null);
  return (
    <Shell d={d} title="Board">
      <div class="scui-root oa-kit oa-board"><WorkflowBoard board={board} selectedKey={selected} onSelect={(k) => { setSelected(k); if (typeof history !== 'undefined') history.replaceState(null, '', k ? href(a, 'board', k) : href(a, 'board')); }} onOpenSession={(k) => go(href(a, 'sessions', k))} initialLayout="board" /></div>
    </Shell>
  );
}

// The owner's one control, through the kit's job actions: pause, resume. The door records the request as the
// owner's; the automation applies it its own way and answers through the SDK, so the page reloads to read it.
function Jobs({ d, jobs, compact }: { d: DashData; jobs: JobModel[]; compact?: boolean }) {
  const a = d.v.account;
  const [open, setOpen] = useState<string | null>(compact ? null : jobs[0]?.key ?? null);
  const post = async (state: 'paused' | 'running') => {
    const body = new FormData(); body.set('state', state);
    const r = await fetch(`${at(a)}/state`, { method: 'POST', body, redirect: 'manual' });
    return r.ok || r.type === 'opaqueredirect' || r.status === 303;
  };
  const onPause = async (key: string): Promise<PauseResult> => { const ok = await post('paused'); if (ok) later(); const job = jobs.find((j) => j.key === key)!; return { job: ok ? { ...job, state: 'paused', enabled: false, canPause: false, canResume: true } : job, confirmed: ok }; };
  const onControl = async (action: 'resume' | 'run' | 'delete', key: string): Promise<JobControlResult> => { const ok = action === 'resume' ? await post('running') : false; if (ok) later(); return { key, action, confirmed: ok, deleted: false, requested: action === 'resume' }; };
  const job = jobs.find((j) => j.key === open);
  return (
    <div class="oa-jobs">
      <div class="oa-joblist" data-open={open ?? ''}>{jobs.map((j) => <button type="button" class={`oa-job${j.key === open ? ' on' : ''}`} onClick={() => setOpen(j.key === open ? null : j.key)}><HarnessLogo id={j.harness} size={20} /><b>{j.title}</b><span>fires {j.schedule}</span><em class={j.state}>{j.state}</em></button>)}</div>
      {job ? <div class="oa-jobopen">
        <JobDetails job={job} />
        {job.canPause ? <JobActions job={job} onPause={onPause} /> : null}
        {job.canResume ? <JobControls job={job} onControl={onControl} /> : null}
        {!compact ? <RunList runs={runsOf(d, job.key)} onOpen={(k) => go(href(a, 'sessions', k))} /> : null}
      </div> : null}
    </div>
  );
}
export function Agent({ d }: { d: DashData }) {
  const c = d.v.control;
  const jobs = jobsOf(d);
  const rt = ((): { mode?: string; kit?: string; executor?: string; host?: string } | undefined => { try { return JSON.parse(d.v.profile.agent_runtime ?? ''); } catch { return undefined; } })();
  const skills = (d.v.profile.agent_skills ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return (
    <Shell d={d} title="Agent">
      <div class="oa-grid">
        <Panel title="The agent" span={4}>
          <div class="oa-ident"><HarnessLogo id={d.v.profile.agent_harness ?? 'hermes'} size={44} /><div><b>{d.v.profile.agent_harness ?? 'its agent'}</b><span>{d.v.profile.agent_model ?? 'model unknown'}</span></div></div>
          <ul class="oa-rows">
            <li><span class="t">standing</span><span class="n">{paused(d.v) ? 'paused by the owner' : 'running'}</span></li>
            <li><span class="t">last said</span><span class="n">{c?.observed ? `${c.observed.state} · ${fmtAgo(c.observed.at, d.now)}` : 'nothing yet'}</span></li>
            {c?.desired ? <li><span class="t">owner asked</span><span class="n">{c.desired.state} · {fmtAgo(c.desired.at, d.now)}{c.desired.reason ? ` · “${c.desired.reason}”` : ''}</span></li> : null}
            {rt?.mode ? <li><span class="t">{rt.mode === 'container' ? 'in a container' : 'bare on a host'}</span><span class="n">{[rt.executor, rt.host].filter(Boolean).join(' · ') || '—'}</span></li> : null}
            {rt?.kit ? <li><span class="t">kit</span><span class="n">{rt.kit}</span></li> : null}
            {skills.length ? <li><span class="t">skills</span><span class="n">{skills.join(' · ')}</span></li> : null}
          </ul>
        </Panel>
        <Panel title="Jobs and runs" span={8}>{jobs.length ? <div class="scui-root oa-kit"><Jobs d={d} jobs={jobs} /></div> : <p class="oa-empty">No schedule published yet.</p>}</Panel>
        <Panel title="Who it is" span={4}>{d.v.profile.soul_md ? <div class="oa-prose" dangerouslySetInnerHTML={{ __html: mdToSafeHtml(d.v.profile.soul_md) }} /> : <p class="oa-empty">Not published yet.</p>}</Panel>
        <Panel title="How it runs" span={8}>{d.v.profile.setup_md ? <div class="oa-prose" dangerouslySetInnerHTML={{ __html: mdToSafeHtml(d.v.profile.setup_md) }} /> : <p class="oa-empty">Not published yet.</p>}</Panel>
      </div>
    </Shell>
  );
}

export function Books({ d }: { d: DashData }) {
  const a = d.v.account;
  const gifts = (d.v.feed ?? []).filter((f: Flow) => f.kind === 'grant' || f.kind === 'mint');
  const purpose = (e: Envelope) => (e.purpose.type === 'item' ? `for ${e.purpose.item}` : e.purpose.type === 'models' ? `for ${e.purpose.models.join(', ')}` : e.purpose.type === 'model' ? 'for model calls' : 'for anything');
  const session = (key: string | undefined): SessionSummary | undefined => (key ? d.sessions.find((s) => s.key === key) : undefined);
  return (
    <Shell d={d} title="Books">
      <div class="oa-grid">
        <Panel title="The ledger" span={12}><div class="oa-kpis four">
          <div class="oa-kpi"><div class="v">{usd(d.v.granted_in_usd_cents)}</div><div class="l">put in</div></div>
          <div class="oa-kpi"><div class="v">{usd(d.v.consumed_usd_cents)}</div><div class="l">spent, every cent metered</div></div>
          <div class="oa-kpi"><div class="v">{usd(d.v.balance_usd_cents)}</div><div class="l">balance</div></div>
          <div class="oa-kpi"><div class="v">{usd(d.v.burn_per_day_usd_cents)}</div><div class="l">burn a day</div></div>
        </div></Panel>
        <Panel title="Money in" span={6}>{gifts.length ? <table class="oa-table"><thead><tr><th>When</th><th>From</th><th>What</th><th class="n">Amount</th></tr></thead><tbody>{gifts.map((g) => <tr><td class="nowrap">{fmtAgo(g.ts, d.now)}</td><td>{g.from ? g.from.replace(/^@/, '') : g.sponsor_login ?? 'the operator'}</td><td>{g.kind === 'mint' ? (g.coupon ? 'a coupon' : g.sponsor_login ? 'sponsorship' : 'credits') : g.note ? `a grant · “${g.note}”` : 'a grant'}</td><td class="n">{usd(g.amount_usd_cents)}</td></tr>)}</tbody></table> : <p class="oa-empty">Nothing has come in yet.</p>}</Panel>
        <Panel title="Earmarked · the owner's bounds" span={6}>
          {d.v.envelopes.length ? <ul class="oa-rows">{d.v.envelopes.map((e: Envelope) => <li><span class="t">{purpose(e)}{e.from ? ` · from ${e.from.replace(/^@/, '')}` : ''}</span><span class="n">{usd(e.balance_usd_cents)}</span></li>)}</ul> : <p class="oa-empty">Nothing earmarked.</p>}
          <ul class="oa-rows" style="margin-top:14px">{d.v.bounds.models.length ? <li><span class="t">models</span><span class="n">{d.v.bounds.models.join(', ')}</span></li> : null}{d.v.bounds.limits.map((l) => <li><span class="t">{l.model ? `${l.model} · ` : ''}{[l.usd_cents !== undefined ? usd(l.usd_cents) : '', l.calls !== undefined ? ` calls` : '', l.tokens !== undefined ? ` tokens` : ''].filter(Boolean).join(', ')} per {l.window}</span><span class="n">used {usd(l.used.usd_cents)}</span></li>)}</ul>
        </Panel>
        {sees(d.viewer, d.visibility.calls) ? <Panel title="Every metered call" span={12}>{d.calls?.length ? <div class="oa-tw"><table class="oa-table"><thead><tr><th>When</th><th>What</th><th>Session</th><th class="n">Cost</th></tr></thead><tbody>{d.calls.map((c) => <tr><td class="nowrap">{fmtAgo(c.ts, d.now)}</td><td>{c.rail === 'model' ? <>{c.model ?? 'model'}{c.input_tokens !== undefined ? <span class="oa-muted"> · {c.input_tokens} in / {c.output_tokens ?? 0} out</span> : null}</> : c.rail === 'card' ? `${c.merchant ?? 'a merchant'} · ${c.category ?? 'card'}` : `${c.partner ?? 'a partner'} · ${c.unit ?? ''}`}</td><td class="clip">{c.session ? <a href={href(a, 'sessions', c.session)}>{session(c.session)?.source ?? c.session}</a> : <span class="oa-muted">no session</span>}</td><td class="n">{usd(c.usd_cents)}</td></tr>)}</tbody></table></div> : <p class="oa-empty">No calls on the books yet.</p>}</Panel> : null}
      </div>
    </Shell>
  );
}

// The roster from the committed config, and the owner's door to change it: a form that continues with GitHub and
// opens a pull request; the change takes effect when merged.
const TEAM_LABELS: Record<string, string> = { owner: 'Owner', direction: 'Project direction', moderation: 'Moderation', 'release-review': 'Release review' };
export function Team({ d }: { d: DashData }) {
  const a = d.v.account;
  const r = d.roster;
  const base = href(a, 'team');
  const members = r?.members ?? [];
  const member = members.find((m) => m.id === r?.editing);
  const edit = Boolean(r && members.length && (r.editing === 'new' || member));
  const field = (name: string, title: string, value = '', required = false, max = 80) => <label class="oa-field">{title}<input name={name} value={value} required={required} maxlength={max} /></label>;
  return (
    <Shell d={d} title="Team">
      <div class="oa-grid">
        <Panel title="The roster" span={8}>
          {r?.failure ? <p class="oa-empty" role="alert">{r.failure}</p> : null}
          {!r || r.members === undefined ? <p class="oa-empty">The committed roster is unavailable. Changes are disabled until it can be read.</p>
            : !members.length ? <p class="oa-empty">No team recorded yet. The setup agent establishes the first owner's verified accounts and authority; then owners manage the team here.</p>
            : <table class="oa-table"><thead><tr><th>Person</th><th>Accounts</th><th>Authority</th><th>Verified by</th>{sees(d.viewer, 'owner') ? <th /> : null}</tr></thead><tbody>{members.map((m) => <tr><td><b>{m.name}</b></td><td>{m.github ? <a class="oa-chip" href={`https://github.com/${encodeURIComponent(m.github.login)}`}><img src={`https://github.com/${encodeURIComponent(m.github.login)}.png?size=48`} alt="" />@{m.github.login}</a> : null}{m.discord ? <span class="oa-chip">{m.discord.name}</span> : null}</td><td>{m.scopes.length ? m.scopes.map((s) => TEAM_LABELS[s] ?? s).join(' · ') : 'Contributor'}</td><td class="oa-muted">{m.source}</td>{sees(d.viewer, 'owner') ? <td class="n"><a href={`${base}?edit=${encodeURIComponent(m.id)}`}>Edit</a></td> : null}</tr>)}</tbody></table>}
          {sees(d.viewer, 'owner') && members.length && !edit ? <p class="oa-fine" style="margin-top:12px"><a href={`${base}?edit=new`}>Add a teammate →</a></p> : null}
        </Panel>
        <Panel title="Changing it" span={4}><p class="oa-fine">{r?.head ? <>From the <a href={`https://github.com/${a}/blob/${encodeURIComponent(r.head)}/.open-autonomy/config.yaml`}>committed roster</a>. </> : null}The roster lives in the project's committed configuration; an owner changes it here, through GitHub, as a pull request. Release authority still requires a human's review of the specific release.</p></Panel>
        {edit && r ? <Panel title={member ? `Edit ${member.name}` : 'Add a teammate'} span={8}>
          <form class="oa-form" method="post" action={base}>
            <input type="hidden" name="sha" value={r.sha ?? ''} /><input type="hidden" name="id" value={member?.id ?? ''} />
            {field('name', 'Name', member?.name, true)}
            {field('github_login', 'GitHub username', member?.github?.login)}
            {field('github_id', 'GitHub account ID (kept for a renamed account; clear it only to link a different one)', member?.github?.id, false, 20)}
            {field('discord_id', 'Discord user ID or profile link', member?.discord?.id)}
            {field('discord_name', 'Discord name', member?.discord?.name)}
            <fieldset class="oa-field"><legend>Authority</legend>{Object.entries(TEAM_LABELS).map(([scope, label]) => <label class="oa-check"><input type="checkbox" name="scopes" value={scope} checked={member?.scopes.includes(scope as never)} /> {label}</label>)}</fieldset>
            <label class="oa-field">Identity and authority source<textarea name="source" required maxlength={500}>{member?.source ?? ''}</textarea></label>
            <p class="oa-fine">A public source link or a specific owner confirmation establishing whose accounts these are and what they may decide.</p>
            <label class="oa-check"><input type="checkbox" name="attest" value="yes" required /> I confirm these account links and permissions, or the removal of this person.</label>
            <p class="oa-fine">Continue with GitHub to open a draft pull request. Only a recorded owner can authorize this change; it takes effect when merged on GitHub. GitHub asks for public repository access to create the change under your account.</p>
            {r.configured ? <div class="oa-actions"><button class="oa-btn" name="operation" value="save">Continue with GitHub</button>{member ? <button class="oa-btn quiet" name="operation" value="remove">Remove teammate</button> : null}</div> : <p class="oa-empty" role="status">GitHub sign-in is not configured on this deployment; edit the committed config instead.</p>}
            <p class="oa-fine"><a href={base}>Cancel</a></p>
          </form>
        </Panel> : null}
      </div>
    </Shell>
  );
}

export function DashApp({ d }: { d: DashData }) {
  switch (d.page) {
    case 'sessions': return <Sessions d={d} />;
    case 'board': return <Board d={d} />;
    case 'books': return <Books d={d} />;
    case 'agent': return <Agent d={d} />;
    case 'team': return <Team d={d} />;
    default: return <Overview d={d} />;
  }
}
export const titleOf = (d: DashData): string => (d.page === 'sessions' && d.session ? `${d.session.source ?? d.session.kind} · ${fmtWhen(d.session.started_at)}` : PAGES.find((p) => p.id === d.page)?.label ?? 'Overview');
export { taskOf };

// ---- the shell's sheet ----------------------------------------------------------------------------------------------
// On the kit's tokens: the same palette the kit's components draw with, light and dark, so the page and the
// components it holds are one surface. The kit's `.scui-root` is a widget frame by default; here it is a region.
export const DASH_CSS = `
:root{--scui-bg:#fff;--scui-bg-raised:#f6f7f9;--scui-fill:#eef0f3;--scui-fg:#20242a;--scui-muted:#56606c;--scui-border:#d6dce3;--scui-border-strong:#a7b0bd;--scui-accent:#2457c5;--scui-positive:#167335;--scui-warning:#946018;--scui-danger:#b52d34;--scui-radius:10px;--scui-font:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;--scui-font-mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color-scheme:light dark}
@media(prefers-color-scheme:dark){:root{--scui-bg:#17191d;--scui-bg-raised:#202329;--scui-fill:#292d34;--scui-fg:#f5f7fa;--scui-muted:#a9b0ba;--scui-border:#30353d;--scui-border-strong:#59616b;--scui-accent:#91b5ff;--scui-positive:#63cf86;--scui-warning:#e5b95f;--scui-danger:#ff8990}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--scui-bg-raised);color:var(--scui-fg);font:13.5px/1.5 var(--scui-font);-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
a:hover{text-decoration:underline;text-underline-offset:3px}
h1,h2,h3,p,ul,ol{margin:0}
ul,ol{padding:0;list-style:none}
.oa-dash{display:grid;grid-template-columns:224px minmax(0,1fr);min-height:100vh}
.oa-rail{position:sticky;top:0;height:100vh;display:flex;flex-direction:column;gap:18px;padding:16px 14px;background:var(--scui-bg);border-right:1px solid var(--scui-border)}
.oa-brand{display:flex;align-items:center;gap:8px;font-weight:800;font-size:15px;letter-spacing:-.01em;padding:2px 6px}
.oa-brand svg{width:20px;height:20px}
.oa-proj{display:flex;align-items:center;gap:10px;padding:0 6px}
.oa-proj .n{font-weight:700;font-size:15px;letter-spacing:-.01em}
.oa-proj .o{color:var(--scui-muted);font-size:11.5px;font-family:var(--scui-font-mono)}
.oa-rail nav{display:flex;flex-direction:column;gap:2px}
.oa-rail nav a{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;font-weight:600;color:var(--scui-fg)}
.oa-rail nav a:hover{background:var(--scui-fill);text-decoration:none}
.oa-rail nav a.on{background:var(--scui-fill);color:var(--scui-accent)}
.oa-rail nav .c{margin-left:auto;font-size:11px;font-weight:700;padding:1px 7px;border-radius:999px;background:var(--scui-bg-raised);border:1px solid var(--scui-border);color:var(--scui-muted)}
.oa-role{margin-top:auto;color:var(--scui-muted);font-size:12px;line-height:1.45;padding:0 6px}
.oa-role b{display:block;color:var(--scui-fg)}
.oa-role a{color:var(--scui-accent);font-weight:600}
.oa-body{min-width:0;padding:0 22px 40px}
.oa-top{position:sticky;top:0;z-index:3;display:flex;align-items:center;gap:14px;height:56px;margin:0 -22px 18px;padding:0 22px;background:color-mix(in srgb,var(--scui-bg-raised) 88%,transparent);backdrop-filter:blur(8px);border-bottom:1px solid var(--scui-border)}
.oa-top h1{font-size:18px;font-weight:700;letter-spacing:-.01em}
.oa-top .grow{flex:1}
.oa-facts{display:flex;gap:18px;color:var(--scui-muted);font-size:12.5px;white-space:nowrap}
.oa-facts b{color:var(--scui-fg);font-weight:700;font-variant-numeric:tabular-nums}
.oa-pill{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 10px 0 8px;border-radius:999px;font-size:12px;font-weight:600;background:var(--scui-fill);color:var(--scui-fg)}
.oa-pill i{width:7px;height:7px;border-radius:50%;background:var(--scui-border-strong)}
.oa-pill.live i,.oa-pill.ok i{background:var(--scui-positive)}
.oa-pill.live{color:var(--scui-positive)}
.oa-pill.live i{animation:oa-pulse 1.6s infinite}
.oa-pill.warn{color:var(--scui-warning)}.oa-pill.warn i{background:var(--scui-warning)}
.oa-pill.off{color:var(--scui-danger)}.oa-pill.off i{background:var(--scui-danger)}
@keyframes oa-pulse{0%{box-shadow:0 0 0 0 rgba(22,115,53,.45)}70%{box-shadow:0 0 0 7px rgba(22,115,53,0)}100%{box-shadow:0 0 0 0 rgba(22,115,53,0)}}
.oa-two{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:16px;align-items:start}
.oa-col{display:flex;flex-direction:column;gap:16px;min-width:0}
.oa-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:16px}
.oa-grid>.oa-panel{grid-column:span 12}
.oa-grid>.span4{grid-column:span 4}.oa-grid>.span6{grid-column:span 6}.oa-grid>.span8{grid-column:span 8}.oa-grid>.span12{grid-column:span 12}
.oa-panel{background:var(--scui-bg);border:1px solid var(--scui-border);border-radius:var(--scui-radius);padding:14px 16px;min-width:0}
.oa-panel>h2{display:flex;align-items:baseline;gap:10px;font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--scui-muted);margin-bottom:12px}
.oa-panel>h2 a{margin-left:auto;text-transform:none;letter-spacing:0;font-size:12.5px;color:var(--scui-accent)}
.oa-kpis{display:grid;gap:8px}.oa-kpis.two{grid-template-columns:1fr 1fr}.oa-kpis.three{grid-template-columns:repeat(3,1fr)}.oa-kpis.four{grid-template-columns:repeat(4,1fr)}
.oa-kpi{background:var(--scui-bg-raised);border-radius:8px;padding:10px 12px}
.oa-kpi .v{font-size:19px;font-weight:700;letter-spacing:-.01em;font-variant-numeric:tabular-nums}
.oa-kpi .v.ok{color:var(--scui-positive)}.oa-kpi .v.warn{color:var(--scui-warning)}
.oa-kpi .l{color:var(--scui-muted);font-size:11.5px;margin-top:1px}
.oa-spark{display:flex;align-items:flex-end;gap:3px;height:44px;margin-top:14px}
.oa-spark i{flex:1;display:block;background:color-mix(in srgb,var(--scui-accent) 35%,transparent);border-radius:2px 2px 0 0;min-height:2px}
.oa-spark i.hot{background:var(--scui-accent)}.oa-spark i.zero{background:var(--scui-fill)}
.oa-sparklabel{display:flex;justify-content:space-between;color:var(--scui-muted);font-size:11.5px;margin-top:6px}
.oa-rows{display:flex;flex-direction:column}
.oa-rows li{display:flex;align-items:baseline;gap:12px;padding:8px 0;border-top:1px solid var(--scui-border)}
.oa-rows li:first-child{border-top:0;padding-top:0}
.oa-rows .t{flex:1;min-width:0;font-weight:500}
.oa-rows .n{color:var(--scui-muted);font-size:12.5px;white-space:nowrap}
.oa-rows .n a{color:var(--scui-accent)}
.oa-table{width:100%;border-collapse:collapse;font-size:13px}
.oa-table th{text-align:left;color:var(--scui-muted);font-weight:600;font-size:11.5px;letter-spacing:.04em;text-transform:uppercase;padding:0 12px 8px 0;border-bottom:1px solid var(--scui-border)}
.oa-table td{padding:8px 12px 8px 0;border-bottom:1px solid var(--scui-border);vertical-align:top}
.oa-table th:last-child,.oa-table td:last-child{padding-right:0}
.oa-table .n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.oa-table .nowrap{white-space:nowrap}
.oa-table td.clip{max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.oa-table a{color:var(--scui-accent)}
.oa-tw{overflow-x:auto}
.oa-muted{color:var(--scui-muted)}
.oa-empty{color:var(--scui-muted);font-size:13px;padding:6px 0}
.oa-fine{color:var(--scui-muted);font-size:12.5px;line-height:1.5}
.oa-prose{font-size:13.5px;line-height:1.6;color:var(--scui-fg)}
.oa-prose p+p{margin-top:8px}
.oa-prose h1,.oa-prose h2,.oa-prose h3{font-size:14px;margin:12px 0 4px}
.oa-prose code{font-family:var(--scui-font-mono);font-size:12px;background:var(--scui-fill);padding:1px 4px;border-radius:4px}
.oa-prose ul{list-style:disc;padding-left:18px}
.oa-chip{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 9px 0 3px;border-radius:999px;border:1px solid var(--scui-border);background:var(--scui-bg);font-size:12.5px;font-weight:600}
.oa-chip img{width:20px;height:20px;border-radius:50%}
.oa-form{display:flex;flex-direction:column;gap:10px;max-width:560px}
.oa-field{display:flex;flex-direction:column;gap:5px;font-size:13px;font-weight:600;border:0;padding:0;margin:0}
.oa-field input,.oa-field textarea{font:inherit;font-weight:400;width:100%;border:1px solid var(--scui-border);border-radius:8px;padding:7px 10px;background:var(--scui-bg);color:var(--scui-fg)}
.oa-field textarea{min-height:84px;resize:vertical}
.oa-field legend{padding:0;margin-bottom:4px}
.oa-check{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:400}
.oa-actions{display:flex;gap:8px;flex-wrap:wrap}
.oa-btn{display:inline-flex;align-items:center;justify-content:center;height:36px;padding:0 16px;border-radius:8px;border:1px solid var(--scui-accent);background:var(--scui-accent);color:#fff;font:inherit;font-weight:700;cursor:pointer}
.oa-btn.quiet{background:var(--scui-bg);color:var(--scui-fg);border-color:var(--scui-border-strong)}
.oa-ident{display:flex;align-items:center;gap:12px;margin-bottom:12px}
.oa-ident b{display:block;font-size:15px}.oa-ident span{color:var(--scui-muted);font-size:12.5px}
.oa-kit.scui-root{--scui-width:100%;--scui-height:auto;width:100%;height:auto;display:block;border:0;border-radius:0;overflow:visible;background:transparent}
.oa-kit .scui-list{width:100%}
.oa-list.scui-root{border:1px solid var(--scui-border);border-radius:var(--scui-radius);overflow:hidden;background:var(--scui-bg)}
.oa-tail.scui-root{border:1px solid var(--scui-border);border-radius:var(--scui-radius);overflow:hidden;background:var(--scui-bg);margin-bottom:12px;max-height:380px;display:flex;flex-direction:column}
.oa-tail .scui-conversation-wrap{max-height:380px}
.oa-messenger{display:grid;grid-template-columns:320px minmax(0,1fr);gap:16px;align-items:start;min-height:calc(100vh - 110px)}
.oa-chathead{display:flex;flex-wrap:wrap;gap:6px 16px;padding:10px 14px;border-bottom:1px solid var(--scui-border);background:var(--scui-bg-raised);color:var(--scui-muted);font-size:12.5px}
.oa-chathead b{color:var(--scui-fg);font-weight:600}
.oa-chathead a{color:var(--scui-accent);font-weight:600}
.oa-messenger .oa-list.scui-root{position:sticky;top:74px;max-height:calc(100vh - 92px);display:flex;flex-direction:column}
.oa-messenger .oa-chat.scui-root{position:sticky;top:74px;height:calc(100vh - 92px);border:1px solid var(--scui-border);border-radius:var(--scui-radius);background:var(--scui-bg);display:flex;flex-direction:column;overflow:hidden}
.oa-chat .scui-conversation-wrap{flex:1;min-height:0;display:flex;flex-direction:column}
.oa-chat .scui-conversation{flex:1;min-height:0;overflow:auto}
.oa-messenger .oa-chat .oa-empty{padding:24px}
.oa-board.scui-root{border:1px solid var(--scui-border);border-radius:var(--scui-radius);background:var(--scui-bg);overflow:hidden;min-height:60vh}
.oa-jobs{display:flex;flex-direction:column;gap:12px}
.oa-joblist{display:flex;flex-direction:column;gap:6px}
.oa-job{display:flex;align-items:center;gap:10px;width:100%;padding:8px 10px;border:1px solid var(--scui-border);border-radius:8px;background:var(--scui-bg);color:inherit;font:inherit;text-align:left;cursor:pointer}
.oa-job:hover{background:var(--scui-fill)}
.oa-job.on{border-color:var(--scui-accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--scui-accent) 20%,transparent)}
.oa-job b{font-weight:700}.oa-job span{color:var(--scui-muted);font-size:12.5px}
.oa-job em{margin-left:auto;font-style:normal;font-size:11.5px;font-weight:700;padding:1px 8px;border-radius:999px;background:var(--scui-fill);color:var(--scui-muted)}
.oa-job em.scheduled{color:var(--scui-positive)}.oa-job em.paused{color:var(--scui-warning)}
.oa-jobopen{display:flex;flex-direction:column;gap:12px;padding:12px;border:1px solid var(--scui-border);border-radius:8px;background:var(--scui-bg-raised)}
@media(max-width:980px){.oa-dash{grid-template-columns:1fr}.oa-rail{position:static;height:auto;flex-direction:row;flex-wrap:wrap;align-items:center;gap:10px;padding:10px 14px}.oa-rail nav{flex-direction:row;overflow-x:auto;gap:2px}.oa-role{display:none}.oa-body{padding:0 14px 32px}.oa-top{margin:0 -14px 14px;padding:0 14px;height:auto;min-height:52px;flex-wrap:wrap;row-gap:4px;padding-top:8px;padding-bottom:8px}.oa-facts{gap:12px;flex-wrap:wrap;white-space:normal}.oa-two{grid-template-columns:1fr}.oa-grid>.span4,.oa-grid>.span6,.oa-grid>.span8{grid-column:span 12}.oa-messenger{grid-template-columns:1fr;min-height:0}.oa-messenger .oa-list.scui-root{position:static;max-height:50vh}.oa-messenger .oa-chat.scui-root{position:static;height:auto;min-height:60vh}.oa-messenger[data-pane=chat] .oa-list{display:none}}
`;
