/** @jsxImportSource preact */
// The dashboard: the work as the team reads it, built from Supercode's UI kit. The kit's own components carry the
// sessions (the chat inventory and the conversation), the roadmap (the workflow board), the schedule (jobs and
// their runs, the owner's pause on them); the shell around them, the money and the roster are this page's. The
// same tree renders on the worker and hydrates in the browser, where a live session's turns arrive as they land.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { Conversation, HarnessLogo, SessionList, type MessengerLabels, type MessengerSlots, type SupercodeUiState, type UiAdapter } from '@volter-ai-dev/supercode-ui/preact';
import { JobActions, JobControls, JobDetails, RunList, WorkflowBoard, WorkflowList, type JobModel, type PauseResult, type JobControlResult } from '@volter-ai-dev/supercode-ui/preact/supervision';
import { tenseOf } from '@open-autonomy/sdk/roadmap';
import type { Envelope, Flow, SessionSummary } from '../ledger.js';
import { fmtAgo, fmtDur, fmtWhen, mdToSafeHtml, shortSha, usd, LOGO_SVG } from '../ui.js';
import { sees, type Role } from '../page/model.js';
import { at, nameOf, ownerOf, standingOf, standingWord, type Standing } from '../page/parts.js';
import { boardOf, entriesOf, jobsOf, lastSeq, paused, rowOf, runsOf, taskOf, uiState, PAGES, type DashData, type DashPage } from './model.js';

const href = (a: string, p: DashPage, ...rest: string[]) => (p === 'overview' && !rest.length ? at(a, 'dashboard') : at(a, 'dashboard', p, ...rest));
const go = (url: string) => { if (typeof location !== 'undefined') location.assign(url); };
const runway = (d: DashData) => (d.v.runway_days !== null && Number.isFinite(d.v.runway_days) ? Math.round(d.v.runway_days) : null);
const ROLE_WORDS: Record<Role, string> = { public: 'Public view', giver: 'Giver view', team: 'Team view', owner: 'Owner view' };
const STANDING: Record<Standing, string> = { live: 'live', running: 'ok', requested: 'warn', paused: 'off', exhausted: 'off', unfunded: '' };
const Pill = ({ standing, from }: { standing: Standing; from?: string }) => <span class={`oa-pill ${STANDING[standing]}`}><i />{standingWord(standing, from)}</span>;
// The page watches; every intent the kit can raise is answered by navigation or by nothing.
const watcher = (d: DashData): UiAdapter => ({ onIntent(i) { if (i.action === 'attach') go(href(d.v.account, 'sessions', i.key)); }, now: () => Date.now(), copyText: (t) => { void navigator.clipboard?.writeText(t); } });

// ---- the shell ------------------------------------------------------------------------------------------------------
// Keys, in a browser: 1–6 open the pages in the rail's order, ⌘K the palette, / the page's search, j and k walk the
// rows on the page, Esc closes the palette. None fire while a field has the focus.
const ROWS = '.oa-body button[data-session-key], .oa-body button[data-lane], .oa-body .oa-job, .oa-body button[data-state]';
const typing = (n: EventTarget | null) => (n as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]');
interface Jump { id: string; kind: string; hint: string; label: string; href: string }
function jumpsOf(d: DashData, pages: typeof PAGES): Jump[] {
  const a = d.v.account;
  const open = (panel: keyof DashData['visibility']) => sees(d.viewer, d.visibility[panel]);
  return [
    ...pages.map((p) => ({ id: `page:${p.id}`, kind: 'Page', hint: '', label: p.label, href: href(a, p.id) })),
    ...(open('work') ? d.roadmap.items.map((i) => ({ id: `item:${i.id}`, kind: taskOf(d, i).lane, hint: i.id, label: i.title, href: href(a, 'board', i.id) })) : []),
    ...(open('sessions') ? d.sessions.slice(0, 60).map((x) => ({ id: `session:${x.key}`, kind: x.kind === 'run' ? 'Run' : 'Session', hint: fmtAgo(x.started_at, d.now), label: rowOf(d, x).title ?? x.key, href: href(a, 'sessions', x.key) })) : []),
    ...(open('agent') ? jobsOf(d).map((j) => ({ id: `job:${j.key}`, kind: 'Job', hint: '', label: `${j.title} · fires ${j.schedule}`, href: href(a, 'agent') })) : []),
  ];
}
function Palette({ jumps, onClose }: { jumps: Jump[]; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = jumps.filter((j) => words.every((w) => `${j.kind} ${j.hint} ${j.label}`.toLowerCase().includes(w))).slice(0, 12);
  const at = Math.min(index, Math.max(0, shown.length - 1));
  const key = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) { e.preventDefault(); setIndex((at + 1) % Math.max(1, shown.length)); }
    else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) { e.preventDefault(); setIndex((at - 1 + shown.length) % Math.max(1, shown.length)); }
    else if (e.key === 'Enter' && shown[at]) { e.preventDefault(); go(shown[at].href); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };
  return (
    <div class="oa-veil" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="oa-palette" role="dialog" aria-label="Go to">
        <input ref={input} class="oa-palette-input" placeholder="Go to a page, task, session or job…" aria-label="Go to" value={query} onInput={(e) => { setQuery((e.currentTarget as HTMLInputElement).value); setIndex(0); }} onKeyDown={key} />
        <ul class="oa-palette-list" role="listbox" aria-label="Results">
          {shown.map((j, i) => <li role="option" aria-selected={i === at} class="oa-palette-item" onMouseMove={() => setIndex(i)} onClick={() => go(j.href)}><span class="k">{j.kind}</span><span class="l">{j.hint ? <b>{j.hint}</b> : null}{j.label}</span>{i === at ? <kbd>↵</kbd> : null}</li>)}
          {shown.length ? null : <li class="oa-palette-empty">Nothing matches “{query}”.</li>}
        </ul>
      </div>
    </div>
  );
}
function useKeys(pages: typeof PAGES, a: string, palette: boolean, setPalette: (open: boolean | ((o: boolean) => boolean)) => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((o) => !o); return; }
      if (palette || e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      const n = Number(e.key);
      if (n >= 1 && n <= pages.length) { go(href(a, pages[n - 1].id)); return; }
      if (e.key === '/') { const f = document.querySelector<HTMLInputElement>('.oa-body input[type="search"]'); if (f) { e.preventDefault(); f.focus(); } return; }
      if (e.key === 'j' || e.key === 'k') {
        const rows = [...document.querySelectorAll<HTMLElement>(ROWS)].filter((r) => r.offsetParent && !(r as HTMLButtonElement).disabled);
        if (!rows.length) return;
        const here = rows.indexOf(document.activeElement as HTMLElement);
        const next = rows[here < 0 ? 0 : Math.min(rows.length - 1, Math.max(0, here + (e.key === 'j' ? 1 : -1)))];
        next.focus(); next.scrollIntoView({ block: 'nearest' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [palette, a]);
}
export function Shell({ d, title, children }: { d: DashData; title: string; children?: ComponentChildren }) {
  const a = d.v.account;
  const standing = standingOf(d.v, d.live);
  const open = d.roadmap.items.filter((i) => tenseOf(i) !== 'past').length;
  const counts: Partial<Record<DashPage, string | number>> = { sessions: d.live.length ? `${d.live.length} live` : undefined, board: open || undefined };
  const rw = runway(d);
  const today = d.daily.length ? d.daily[d.daily.length - 1] : 0;
  const pages = PAGES.filter((p) => sees(d.viewer, d.visibility[p.panel]));
  const [palette, setPalette] = useState(false);
  useKeys(pages, a, palette, setPalette);
  return (
    <div class="oa-dash">
      <aside class="oa-rail">
        <a class="oa-brand" href="/" dangerouslySetInnerHTML={{ __html: `${LOGO_SVG}<span>${d.brand}</span>` }} />
        <div class="oa-proj"><HarnessLogo id={d.v.profile.agent_harness ?? 'hermes'} activity={standing === 'live' ? 'working' : standing === 'running' ? 'idle' : 'finished'} size={26} /><div><div class="n">{nameOf(a)}</div><div class="o">{ownerOf(a)}</div></div></div>
        <nav>{pages.map((p, i) => <a class={p.id === d.page ? 'on' : ''} aria-current={p.id === d.page ? 'page' : undefined} href={href(a, p.id)}><span class="t">{p.label}</span>{counts[p.id] !== undefined ? <span class="c">{counts[p.id]}</span> : null}<kbd>{i + 1}</kbd></a>)}</nav>
        <p class="oa-keys"><kbd>j</kbd><kbd>k</kbd><span>rows</span><kbd>/</kbd><span>search</span></p>
        {d.door?.in ? <a class="oa-signin" href={d.door.in}>Sign in with GitHub</a> : d.door?.who ? <p class="oa-signed">@{d.door.who}{d.door.out ? <> · <a href={d.door.out}>Sign out</a></> : null}</p> : null}
        <div class="oa-role"><b>{ROLE_WORDS[d.viewer]}</b>{d.viewer === 'public' ? 'What the owner opened to everyone.' : d.viewer === 'owner' ? 'Everything, and the one control.' : 'What the owner opened to the team.'} <a href={at(a)}>Project page →</a></div>
      </aside>
      <div class="oa-body">
        <div class="oa-top">
          <h1>{title}</h1>
          <Pill standing={standing} from={d.v.control?.desired?.from} />
          <span class="grow" />
          <div class="oa-facts">
            <span><b>{usd(d.v.balance_usd_cents)}</b> in the bank</span>
            {rw !== null ? <span><b>{rw > 365 ? '1y+' : `${rw}d`}</b> runway</span> : null}
            <span><b>{usd(today)}</b> today</span>
            <span><b>{usd(d.v.consumed_usd_cents)}</b> spent</span>
          </div>
          <button type="button" class="oa-jump" onClick={() => setPalette(true)}><span>Go to…</span><kbd>⌘K</kbd></button>
        </div>
        {children}
      </div>
      {palette ? <Palette jumps={jumpsOf(d, pages)} onClose={() => setPalette(false)} /> : null}
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
      {last.length ? <div class="oa-spark">{last.map((x, i) => <i class={x <= 0 ? 'zero' : i === last.length - 1 ? 'hot' : ''} style={`height:${Math.max(4, Math.round((x / max) * 100))}%`} />)}</div> : <p class="oa-empty">No metered spend yet.</p>}
      <div class="oa-sparklabel"><span>{last.length ? `last ${last.length} day${last.length === 1 ? '' : 's'}` : ''}</span><span>burn {d.v.runway_confident ? '' : '~'}{usd(d.v.burn_per_day_usd_cents)}/day{d.v.runway_confident ? '' : ', estimated'}</span></div>
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
// What needs someone's eye, from the facts this page already carries: the owner's word not yet taken, money
// running out or stopped, a bound nearly used, failed runs, work proposed and not yet planned, a quiet schedule.
// Each line says what is true and links to where it is seen in full; nothing here is an instruction to the agent.
interface Attention { tone: 'hot' | 'warn' | 'note'; text: string; href: string; go: string }
function attentionOf(d: DashData): Attention[] {
  const a = d.v.account;
  const out: Attention[] = [];
  const standing = standingOf(d.v, d.live);
  const rw = runway(d);
  if (standing === 'requested') out.push({ tone: 'warn', text: `Pause requested${d.v.control?.desired?.from ? ` by ${d.v.control.desired.from.slice(1)}` : ''} ${d.v.control?.desired?.at ? fmtAgo(d.v.control.desired.at, d.now) : ''}; the agent has not reported it paused yet.`, href: href(a, 'agent'), go: 'Agent' });
  if (standing === 'exhausted') out.push({ tone: 'hot', text: 'Spending stopped: the balance is spent. Nothing on the platform can be spent until money comes in.', href: href(a, 'books'), go: 'Books' });
  if (standing === 'unfunded') out.push({ tone: 'note', text: 'Not yet funded: the agent spends nothing on the platform until money comes in.', href: href(a, 'books'), go: 'Books' });
  if (rw !== null && standing !== 'exhausted' && rw < d.v.goal_days / 3) out.push({ tone: 'warn', text: `${rw} ${rw === 1 ? 'day' : 'days'} of runway left, under a third of the ${d.v.goal_days}-day goal.`, href: href(a, 'books'), go: 'Books' });
  for (const l of d.v.bounds.limits) {
    const frac = l.usd_cents ? l.used.usd_cents / l.usd_cents : l.calls ? l.used.calls / l.calls : l.tokens ? l.used.tokens / l.tokens : 0;
    if (frac >= 0.8) out.push({ tone: frac >= 1 ? 'hot' : 'warn', text: `${l.model ? `${l.model}: ` : ''}${Math.round(frac * 100)}% of the ${l.usd_cents !== undefined ? usd(l.usd_cents) : l.calls !== undefined ? `${l.calls}-call` : `${l.tokens}-token`} limit per ${l.window} is used.`, href: href(a, 'books'), go: 'Books' });
  }
  if (sees(d.viewer, d.visibility.sessions)) {
    const week = d.sessions.filter((x) => x.outcome === 'failed' && d.now - Date.parse(x.ended_at ?? x.started_at) < 7 * 86_400_000);
    if (week.length) out.push({ tone: 'hot', text: `${week.length} ${week.length === 1 ? 'run' : 'runs'} failed in the last seven days, the latest ${fmtAgo(week[0].ended_at ?? week[0].started_at, d.now)}.`, href: `${href(a, 'sessions')}?show=failed`, go: 'Sessions' });
    const last = d.sessions.find((x) => x.kind === 'run');
    const quiet = last ? d.now - Date.parse(last.ended_at ?? last.started_at) : null;
    if (!paused(d.v) && jobsOf(d).length && quiet !== null && quiet > 2 * 86_400_000 && !d.live.length) out.push({ tone: 'warn', text: `No scheduled run in ${fmtAgo(last!.ended_at ?? last!.started_at, d.now).replace(/ ago$/, '')}, though the agent is not paused.`, href: href(a, 'agent'), go: 'Agent' });
  }
  if (sees(d.viewer, d.visibility.work)) {
    const proposed = d.roadmap.items.filter((i) => i.status === 'proposed').length;
    if (proposed) out.push({ tone: 'note', text: `${proposed} ${proposed === 1 ? 'item is' : 'items are'} proposed and not yet planned.`, href: href(a, 'board'), go: 'Board' });
  }
  return out;
}
function Attend({ d }: { d: DashData }) {
  const items = attentionOf(d);
  return (
    <Panel title="Needs attention">
      {items.length ? <ul class="oa-attend">{items.map((x) => <li class={x.tone}><i /><span class="t">{x.text}</span><a href={x.href}>{x.go} →</a></li>)}</ul> : <p class="oa-empty">Nothing needs attention: the agent is running within its bounds, and no run failed this week.</p>}
    </Panel>
  );
}

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
          <Attend d={d} />
          <Panel title={first ? 'Working now' : 'Sessions'} more={sees(d.viewer, d.visibility.sessions) ? ['Every session →', href(a, 'sessions')] : undefined}>
            {first && sees(d.viewer, d.visibility.transcripts) ? <div class="scui-root oa-kit oa-tail"><Transcript d={d} s={first} state={state} adapter={adapter} /></div> : null}
            {state.sessions.length ? <div class="scui-root oa-kit oa-list"><SessionList state={{ ...state, sessions: latestPerJob(state.sessions).slice(0, 8) }} adapter={adapter} onOpen={(r) => { if (sees(d.viewer, d.visibility.sessions)) go(href(a, 'sessions', r.key)); }} labels={LABELS} /></div> : <p class="oa-empty">{sees(d.viewer, d.visibility.sessions) ? 'No sessions yet.' : 'Nothing running this minute. The sessions are not open to this view.'}</p>}
          </Panel>
        </div>
        <div class="oa-col">
          <Spend d={d} />
          {sees(d.viewer, d.visibility.work) ? <Panel title="Board" more={['Whole board →', href(a, 'board')]}>
            <div class="oa-kpis three">
              <div class="oa-kpi"><div class="v">{board.tasks.filter((t) => t.lane === 'in progress').length}</div><div class="l">in progress</div></div>
              <div class="oa-kpi"><div class="v">{board.tasks.filter((t) => t.lane === 'planned' || t.lane === 'proposed').length}</div><div class="l">ahead</div></div>
              <div class="oa-kpi"><div class="v">{board.tasks.filter((t) => t.lane === 'shipped').length}</div><div class="l">shipped</div></div>
            </div>
            <div class="scui-root oa-kit oa-rowlist"><WorkflowList tasks={ahead} onOpen={(k) => go(href(a, 'board', k))} /></div>
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
  // The filter narrows the list the kit shows; the rows are the same records the unfiltered page lists.
  const jobNames = [...new Set(d.sessions.filter((x) => x.kind === 'run' && x.source).map((x) => x.source!))].slice(0, 6);
  const keep = new Set(d.sessions.filter((x) => (d.filter?.show === 'live' ? d.live.includes(x.key) || x.status === 'live' : d.filter?.show === 'failed' ? x.outcome === 'failed' : true) && (!d.filter?.job || x.source === d.filter.job)).map((x) => x.key));
  const shown = d.filter ? { ...state, sessions: state.sessions.filter((r) => keep.has(r.key)) } : state;
  return (
    <Shell d={d} title={rec ? `${rec.source ?? rec.kind} · ${fmtWhen(rec.started_at)}` : 'Sessions'}>
      <div class="oa-messenger" data-pane={rec ? 'chat' : 'list'}>
        <div class="oa-listcol">
          <nav class="oa-filters" aria-label="Show">{[['All', undefined, undefined], ['Live', 'live', undefined], ['Failed', 'failed', undefined], ...jobNames.map((j) => [j, undefined, j])].map(([label, show, job]) => {
            const on = (d.filter?.show ?? undefined) === show && (d.filter?.job ?? undefined) === job;
            const q = show ? `?show=${show}` : job ? `?job=${encodeURIComponent(job)}` : '';
            return <a class={on ? 'on' : ''} aria-current={on ? 'true' : undefined} href={`${href(a, 'sessions')}${q}`}>{label}</a>;
          })}</nav>
          <div class="scui-root oa-kit oa-list"><SessionList state={shown} adapter={adapter} onOpen={(r) => go(href(a, 'sessions', r.key))} focusKey={s?.key ?? null} labels={LABELS} /></div>
        </div>
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
const LABELS: Partial<MessengerLabels> = { chats: 'Sessions', recentConversations: '{count} sessions', newChat: 'New session', searchChats: 'Search sessions', askAgent: '', continueHere: '', joinLive: 'Watch', forkHere: '' };
// The overview names each scheduled job once, by its latest run; every run stays on Sessions and under its job.
const latestPerJob = (rows: SupercodeUiState['sessions']): SupercodeUiState['sessions'] => { const seen = new Set<string>(); return rows.filter((r) => { const g = r.recurring?.groupKey; if (!g) return true; if (seen.has(g)) return false; seen.add(g); return true; }); };

export function Board({ d }: { d: DashData }) {
  const a = d.v.account;
  const board = useMemo(() => boardOf(d), [d]);
  const [selected, setSelected] = useState<string | null>(d.item ?? null);
  return (
    <Shell d={d} title="Board">
      <p class="oa-under">The work lands as pull requests on GitHub: <a href={`https://github.com/${a}/pulls`} target="_blank" rel="noopener">open ↗</a> · <a href={`https://github.com/${a}/pulls?q=is%3Apr+is%3Amerged`} target="_blank" rel="noopener">merged ↗</a></p>
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
const PANEL_WORDS = { overview: 'overview and project page', work: 'roadmap and board', sessions: 'session list', transcripts: 'transcripts', books: 'books', calls: 'every metered call', agent: 'agent and its setup', team: 'team' } as const;
const WHO_WORDS: Record<Role, string> = { public: 'open to everyone', giver: 'givers and the team', team: 'the team', owner: 'the owner only' };
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
            <li><span class="t">standing</span><span class="n">{paused(d.v) ? `paused by ${c?.desired?.from?.slice(1) ?? 'the owner'}` : 'running'}</span></li>
            <li><span class="t">last said</span><span class="n">{c?.observed ? `${c.observed.state} · ${fmtAgo(c.observed.at, d.now)}` : 'nothing yet'}</span></li>
            {c?.own ? <li><span class="t">owner asked</span><span class="n">{c.own.state} · {fmtAgo(c.own.at, d.now)}{c.own.reason ? ` · “${c.own.reason}”` : ''}</span></li> : null}
            {c?.desired ? <li><span class="t">{c.desired.from ? `${c.desired.from.slice(1)} asked` : 'owner asked'}</span><span class="n">{c.desired.state} · {fmtAgo(c.desired.at, d.now)}{c.desired.reason ? ` · “${c.desired.reason}”` : ''}</span></li> : null}
            {rt?.mode ? <li><span class="t">{rt.mode === 'container' ? 'in a container' : 'bare on a host'}</span><span class="n">{[rt.executor, rt.host].filter(Boolean).join(' · ') || '—'}</span></li> : null}
            {rt?.kit ? <li><span class="t">kit</span><span class="n">{rt.kit}</span></li> : null}
            {skills.length ? <li><span class="t">skills</span><span class="n">{skills.join(' · ')}</span></li> : null}
          </ul>
        </Panel>
        <Panel title="Jobs and runs" span={8}>{jobs.length ? <div class="scui-root oa-kit"><Jobs d={d} jobs={jobs} /></div> : <p class="oa-empty">No schedule published yet.</p>}</Panel>
        <Panel title="The owner's settings" more={['config.yaml ↗', `https://github.com/${d.v.account}/blob/HEAD/.open-autonomy/config.yaml`]} span={12}>
          <div class="oa-settings">
            <ul class="oa-rows"><li><span class="t">runway goal</span><span class="n">{d.v.goal_days} days</span></li>{sees(d.viewer, d.visibility.books) ? <>{d.v.bounds.models.length ? <li><span class="t">models the funds may buy</span><span class="n">{d.v.bounds.models.join(', ')}</span></li> : null}{d.v.bounds.limits.length ? d.v.bounds.limits.map((l) => <li><span class="t">limit{l.model ? ` · ${l.model}` : ''}</span><span class="n">{[l.usd_cents !== undefined ? usd(l.usd_cents) : '', l.calls !== undefined ? `${l.calls} calls` : '', l.tokens !== undefined ? `${l.tokens} tokens` : ''].filter(Boolean).join(', ')} per {l.window}</span></li>) : <li><span class="t">limits</span><span class="n">none beyond the balance</span></li>}</> : <li><span class="t">bounds</span><span class="n">shown with the books</span></li>}</ul>
            <ul class="oa-rows">{(Object.keys(PANEL_WORDS) as Array<keyof typeof PANEL_WORDS>).map((k) => <li><span class="t">{PANEL_WORDS[k]}</span><span class="n">{WHO_WORDS[d.visibility[k]]}</span></li>)}</ul>
          </div>
          <p class="oa-fine" style="margin-top:8px">The owner's committed word, read from the repository's configuration; change it there, by commit.</p>
        </Panel>
        <Panel title="Who it is" span={4}>{d.v.profile.soul_md ? <div class="oa-prose" dangerouslySetInnerHTML={{ __html: mdToSafeHtml(d.v.profile.soul_md) }} /> : <p class="oa-empty">Not published yet.</p>}</Panel>
        <Panel title="How it runs" span={8}>{d.v.profile.setup_md ? <div class="oa-prose" dangerouslySetInnerHTML={{ __html: mdToSafeHtml(d.v.profile.setup_md) }} /> : <p class="oa-empty">Not published yet.</p>}</Panel>
      </div>
    </Shell>
  );
}

// Settled cents grouped by one key: the books' own figures summed, never an estimate.
function groupBy<T>(rows: T[], key: (r: T) => string, cents: (r: T) => number): Array<[string, number, number]> {
  const m = new Map<string, [number, number]>();
  for (const r of rows) { const k = key(r); const v = m.get(k) ?? [0, 0]; m.set(k, [v[0] + cents(r), v[1] + 1]); }
  return [...m.entries()].map(([k, [c, n]]) => [k, c, n] as [string, number, number]).sort((a, b) => b[1] - a[1]);
}
function Breakdown({ title, rows }: { title: string; rows: Array<[string, number, number]> }) {
  const top = rows.slice(0, 8), max = Math.max(1, ...top.map((r) => r[1]));
  return <div class="oa-break"><h3>{title}</h3>{top.length ? <ul>{top.map(([k, c, n]) => <li><span class="t" title={k}>{k}</span><span class="bar"><i style={`width:${Math.round((c / max) * 100)}%`} /></span><span class="n">{usd(c)}<small> · {n}</small></span></li>)}</ul> : <p class="oa-empty">Nothing yet.</p>}</div>;
}
// The calls on this page as a spreadsheet, made in the browser from the rows already here.
const csvOf = (d: DashData): string => [['when', 'rail', 'what', 'input_tokens', 'output_tokens', 'session', 'usd_cents'], ...(d.calls ?? []).map((c) => [c.ts, c.rail, c.rail === 'model' ? c.model ?? '' : c.rail === 'card' ? `${c.merchant ?? ''} ${c.category ?? ''}`.trim() : `${c.partner ?? ''} ${c.unit ?? ''}`.trim(), String(c.input_tokens ?? ''), String(c.output_tokens ?? ''), c.session ?? '', String(c.usd_cents)])].map((r) => r.map((v) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v).join(',')).join('\n');
function useCsv(d: DashData) {
  useEffect(() => {
    const click = (e: MouseEvent) => {
      const link = (e.target as HTMLElement | null)?.closest?.('a[href="#calls.csv"]');
      if (!link) return;
      e.preventDefault();
      const url = URL.createObjectURL(new Blob([csvOf(d)], { type: 'text/csv' }));
      const save = Object.assign(document.createElement('a'), { href: url, download: `${d.v.account.replace('/', '-')}-calls.csv` });
      save.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    document.addEventListener('click', click);
    return () => document.removeEventListener('click', click);
  }, [d]);
}
export function Books({ d }: { d: DashData }) {
  const a = d.v.account;
  // The feed holds every flow touching the account, both ways: what came in is what was given TO it; what it gave (a pool's
  // grants to projects) is money out, never income.
  const moved = (d.v.feed ?? []).filter((f: Flow) => f.kind === 'grant' || f.kind === 'mint');
  const gifts = moved.filter((f) => f.to === a);
  const given = moved.filter((f) => f.kind === 'grant' && f.from === a);
  // What moved beyond the flows listed: money from before the books kept each gift, or older than the feed's window.
  const earlier = d.v.granted_in_usd_cents - gifts.reduce((n, g) => n + g.amount_usd_cents, 0);
  const grantedOut = d.v.granted_out_usd_cents ?? 0;
  const earlierOut = grantedOut - given.reduce((n, g) => n + g.amount_usd_cents, 0);
  const purpose = (e: Envelope) => (e.purpose.type === 'item' ? `for ${e.purpose.item}` : e.purpose.type === 'models' ? `for ${e.purpose.models.join(', ')}` : e.purpose.type === 'model' ? 'for model calls' : 'for anything');
  const session = (key: string | undefined): SessionSummary | undefined => (key ? d.sessions.find((s) => s.key === key) : undefined);
  useCsv(d);
  return (
    <Shell d={d} title="Books">
      <div class="oa-grid">
        <Panel title="The ledger" span={12}><div class={`oa-kpis ${grantedOut > 0 ? 'five' : 'four'}`}>
          <div class="oa-kpi"><div class="v">{usd(d.v.granted_in_usd_cents)}</div><div class="l">put in</div></div>
          {grantedOut > 0 ? <div class="oa-kpi"><div class="v">{usd(grantedOut)}</div><div class="l">given to projects</div></div> : null}
          <div class="oa-kpi"><div class="v">{usd(d.v.consumed_usd_cents)}</div><div class="l">spent, every cent metered</div></div>
          <div class="oa-kpi"><div class="v">{usd(d.v.balance_usd_cents)}</div><div class="l">balance</div></div>
          <div class="oa-kpi"><div class="v">{usd(d.v.burn_per_day_usd_cents)}</div><div class="l">burn a day</div></div>
        </div></Panel>
        {sees(d.viewer, d.visibility.sessions) ? <Panel title={d.sessions.length ? `Where it went · the last ${d.sessions.length} session${d.sessions.length === 1 ? '' : 's'}` : 'Where it went'} span={12}><div class="oa-split3">
          <Breakdown title="By task" rows={groupBy(d.sessions.filter((x) => x.item_id), (x) => d.roadmap.items.find((i) => i.id === x.item_id)?.title ?? x.item_id!, (x) => x.usd_cents)} />
          <Breakdown title="By job" rows={groupBy(d.sessions, (x) => x.source ?? x.kind, (x) => x.usd_cents)} />
          <Breakdown title={d.calls?.length ? `By model · the last ${d.calls.length} call${d.calls.length === 1 ? '' : 's'}` : 'By model'} rows={groupBy(d.calls ?? [], (c) => c.rail === 'model' ? c.model ?? 'model' : c.rail === 'card' ? `card · ${c.merchant ?? 'a merchant'}` : `partner · ${c.partner ?? 'a partner'}`, (c) => c.usd_cents)} />
        </div></Panel> : null}
        <Panel title="Money in" span={6}>{gifts.length || earlier > 0 ? <table class="oa-table"><thead><tr><th>When</th><th>From</th><th>What</th><th class="n">Amount</th></tr></thead><tbody>{gifts.map((g) => <tr><td class="nowrap">{fmtAgo(g.ts, d.now)}</td><td>{g.from ? g.from.replace(/^@/, '') : g.sponsor_login ?? 'the operator'}</td><td>{g.kind === 'mint' ? (g.coupon ? 'a coupon' : g.sponsor_login ? 'sponsorship' : 'credits') : g.note ? `a grant · “${g.note}”` : 'a grant'}</td><td class="n">{usd(g.amount_usd_cents)}</td></tr>)}{earlier > 0 ? <tr><td class="nowrap">earlier</td><td>—</td><td>not itemized on these books</td><td class="n">{usd(earlier)}</td></tr> : null}</tbody></table> : <p class="oa-empty">Nothing has come in yet.</p>}</Panel>
        {grantedOut > 0 ? <Panel title="Money out · given to projects" span={6}><table class="oa-table"><thead><tr><th>When</th><th>To</th><th>What</th><th class="n">Amount</th></tr></thead><tbody>{given.map((g) => <tr><td class="nowrap">{fmtAgo(g.ts, d.now)}</td><td>{g.to}</td><td>{g.note ? `a grant · “${g.note}”` : 'a grant'}</td><td class="n">{usd(g.amount_usd_cents)}</td></tr>)}{earlierOut > 0 ? <tr><td class="nowrap">earlier</td><td>—</td><td>not itemized on these books</td><td class="n">{usd(earlierOut)}</td></tr> : null}</tbody></table></Panel> : null}
        <Panel title="Earmarked · the owner's bounds" span={6}>
          {d.v.envelopes.length ? <ul class="oa-rows">{d.v.envelopes.map((e: Envelope) => <li><span class="t">{purpose(e)}{e.from ? ` · from ${e.from.replace(/^@/, '')}` : ''}</span><span class="n">{usd(e.balance_usd_cents)}</span></li>)}</ul> : <p class="oa-empty">Nothing earmarked.</p>}
          <ul class="oa-rows" style="margin-top:14px">{d.v.bounds.models.length ? <li><span class="t">models</span><span class="n">{d.v.bounds.models.join(', ')}</span></li> : null}{d.v.bounds.limits.map((l) => <li><span class="t">{l.model ? `${l.model} · ` : ''}{[l.usd_cents !== undefined ? usd(l.usd_cents) : '', l.calls !== undefined ? `${l.calls} calls` : '', l.tokens !== undefined ? `${l.tokens} tokens` : ''].filter(Boolean).join(', ')} per {l.window}</span><span class="n">used {[l.usd_cents !== undefined ? usd(l.used.usd_cents) : '', l.calls !== undefined ? `${l.used.calls} calls` : '', l.tokens !== undefined ? `${l.used.tokens} tokens` : ''].filter(Boolean).join(', ')}</span></li>)}</ul>
        </Panel>
        {sees(d.viewer, d.visibility.calls) ? <Panel title="Every metered call" more={d.calls?.length ? ['Download CSV', '#calls.csv'] : undefined} span={12}>{d.calls?.length ? <div class="oa-tw"><table class="oa-table"><thead><tr><th>When</th><th>What</th><th>Session</th><th class="n">Cost</th></tr></thead><tbody>{d.calls.map((c) => <tr><td class="nowrap">{fmtAgo(c.ts, d.now)}</td><td>{c.rail === 'model' ? <>{c.model ?? 'model'}{c.input_tokens !== undefined ? <span class="oa-muted"> · {c.input_tokens} in / {c.output_tokens ?? 0} out</span> : null}</> : c.rail === 'card' ? `${c.merchant ?? 'a merchant'} · ${c.category ?? 'card'}` : `${c.partner ?? 'a partner'} · ${c.unit ?? ''}`}</td><td class="clip">{c.session ? <a href={href(a, 'sessions', c.session)}>{session(c.session)?.source ?? c.session}</a> : <span class="oa-muted">no session</span>}</td><td class="n">{usd(c.usd_cents)}</td></tr>)}</tbody></table></div> : <p class="oa-empty">No calls on the books yet.</p>}</Panel> : null}
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
// The kit's tokens in the Plotter Logic look, on :root and on every kit root (a kit root declares its own defaults),
// so the page and the components it holds are one surface: paper, ink rules, square controls, Michroma headings over
// DM Sans reading text, Iosevka Slab where columns must line up (code, tool rows, times, keys), lime for what is current. Then the shell: dense rows, hard edges, a pixel's give when pressed.
export const DASH_CSS = `
@font-face{font-family:"Iosevka Slab";src:url(/assets/fonts/iosevka-slab-light.woff) format("woff");font-weight:100 350;font-display:swap}
@font-face{font-family:"Iosevka Slab";src:url(/assets/fonts/iosevka-slab-regular.woff) format("woff");font-weight:351 900;font-display:swap}
:root,.scui-root{--oa-lime:#e3f5a3;--oa-lilac:#e8e4f0;--oa-hot:#ff5a1f;--oa-rule:#b4b7ba;--oa-display:Michroma,Eurostile,sans-serif;--oa-label:"DM Sans",ui-sans-serif,system-ui,sans-serif;
--scui-bg:#f8f9f5;--scui-bg-raised:#fbfbf8;--scui-fill:#1414140d;--scui-fg:#161a24;--scui-muted:#656a72;--scui-prose-fg:#2b2f3a;--scui-border:#dcddda;--scui-border-strong:#161a24;--scui-accent:#161a24;--scui-accent-fg:#f8f9f5;--scui-positive:#58761a;--scui-warning:#a2600a;--scui-danger:#c2410c;
--scui-font:"DM Sans",ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;--scui-font-mono:"Iosevka Slab",ui-monospace,SFMono-Regular,Menlo,monospace;--scui-heading-font:var(--oa-display);--scui-heading-weight:400;--scui-line-height:1.45;
--scui-text-2xs:11px;--scui-text-xs:12px;--scui-text-sm:12.5px;--scui-text-md:13.5px;--scui-text-lg:13.5px;--scui-text-base:13.5px;--scui-text-xl:15px;--scui-text-2xl:16px;--scui-text-3xl:17px;--scui-text-4xl:22px;--scui-text-5xl:30px;
--scui-radius:0;--scui-radius-xs:0;--scui-radius-sm:0;--scui-radius-md:0;--scui-radius-lg:0;--scui-radius-xl:0;--scui-radius-2xl:0;--scui-shadow-sm:none;--scui-shadow-md:0 0 0 1px #161a24;
--scui-button-bg:transparent;--scui-button-fg:#161a24;--scui-button-border:1px solid #161a24;--scui-button-radius:0;--scui-icon-button-radius:0;--scui-input-bg:#fbfbf8;--scui-input-border:1px solid #b4b7ba;--scui-input-radius:0;--scui-primary-bg:#161a24;--scui-primary-fg:#f8f9f5;--scui-card-radius:0;--scui-popover-radius:0;
--scui-press-transform:translateY(1px);--scui-focus-target-outline:0;
--scui-head-bg:transparent;--scui-head-border:1px solid #dcddda;--scui-head-height:44px;--scui-head-padding:4px 14px;--scui-head-title-size:13px;--scui-head-logo-display:none;
--scui-conversation-width:860px;--scui-conversation-padding:14px 18px 20px;--scui-turn-gap:12px;--scui-prose-font:"DM Sans",ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;--scui-prose-size:13.5px;--scui-prose-line-height:1.55;
--scui-message-display:grid;--scui-message-columns:96px minmax(0,1fr);--scui-message-column-gap:14px;--scui-message-actor-display:grid;--scui-message-actor-columns:38px auto;--scui-message-actor-dot:8px;--scui-message-actor-dot-bg:#bea6e7;--scui-message-actor-user-dot-bg:#e3f5a3;--scui-message-actor-tool-dot-bg:#161a24;--scui-entry-inset:0;
--scui-user-bg:transparent;--scui-user-border:0;--scui-user-padding:0;--scui-user-max-width:100%;--scui-user-align:stretch;--scui-user-font:"DM Sans",ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;--scui-user-size:13.5px;
--scui-inline-code-bg:#1414140d;--scui-inline-code-padding:0 3px;--scui-code-size:12px;--scui-code-bg:#f1f1ec;--scui-code-border:0;--scui-code-head-bg:transparent;
--scui-tool-size:12.5px;--scui-tool-weight:400;--scui-tool-fg:#3d4150;--scui-tool-target-bg:transparent;--scui-tool-target-padding:0;--scui-tool-actor-width:96px;--scui-tool-actor-gap:14px;--scui-tool-detail-inset:110px;--scui-tool-detail-border:0;--scui-tool-output-bg:#f1f1ec;--scui-tool-output-padding:8px 12px;--scui-tool-output-max-height:240px;--scui-terminal-bg:transparent;--scui-terminal-head-bg:#f1f1ec;--scui-terminal-head-border:0;--scui-terminal-lights-display:none;
--scui-compose-bg:transparent;--scui-compose-border:0;
--scui-session-radius:0;--scui-session-logo-display:none;--scui-session-bg:transparent;--scui-session-border:0;--scui-session-spacing:0;--scui-session-padding:7px 10px;--scui-session-align:start;--scui-session-title-size:13.5px;--scui-session-title-weight:400;--scui-session-active-bg:#e3f5a3;--scui-session-hover-bg:#1414140a;--scui-session-list-padding:4px 6px;--scui-session-shadow:inset 0 -1px 0 #dcddda;--scui-list-toolbar-padding:4px 6px 6px;--scui-search-height:28px;--scui-search-padding:0 9px;
--scui-domain-bg:transparent;--scui-domain-border:0;--scui-domain-radius:0;--scui-domain-title-size:16px;--scui-domain-header-padding:12px 14px 10px;--scui-domain-toolbar-padding:7px 14px;--scui-domain-toolbar-border:1px solid #dcddda;--scui-domain-toolbar-align:center;--scui-domain-search-columns:auto minmax(0,1fr);--scui-domain-search-size:11.5px;--scui-domain-control-height:28px;--scui-domain-meta-size:11.5px;--scui-domain-heading-size:15px;--scui-domain-collection-padding:12px 14px;--scui-domain-schedule-padding:0 14px 10px;
--scui-domain-detail-columns:minmax(0,1fr) minmax(300px,40%);--scui-domain-detail-border:1px solid #161a24;--scui-domain-detail-bg:#fbfbf8;--scui-eyebrow-transform:uppercase;--scui-eyebrow-tracking:.24em;
--scui-board-gap:6px;--scui-lane-bg:#f1f1ec;--scui-lane-radius:0;--scui-lane-padding:7px 6px 2px;--scui-lane-min-height:0;--scui-lane-title-size:9.5px;--scui-lane-title-weight:500;--scui-lane-title-font:var(--oa-label);--scui-lane-title-transform:uppercase;--scui-lane-title-tracking:.28em;--scui-lane-title-justify:flex-start;--scui-lane-title-gap:10px;--scui-lane-title-padding:1px 4px 7px;
--scui-task-bg:#fbfbf8;--scui-task-border:1px solid #e3e3e0;--scui-task-radius:0;--scui-task-padding:7px 9px 8px;--scui-task-gap:2px;--scui-task-spacing:4px;--scui-task-title-order:0;--scui-task-title-size:13.5px;--scui-task-title-weight:400;--scui-task-status-display:none;--scui-task-hover-bg:#f8f9f5;
--scui-badge-bg:#e7e6e5;--scui-badge-radius:0;--scui-badge-padding:1px 6px;--scui-badge-size:10.5px;--scui-badge-dot-display:none;--scui-run-padding:8px 12px;
color-scheme:light}
*{box-sizing:border-box;scrollbar-width:none}
*::-webkit-scrollbar{display:none}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:#f8f9f5;color:#161a24;font:400 13.5px/1.5 var(--scui-font);-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
a{color:inherit;text-decoration:none}
a:hover{text-decoration:underline;text-underline-offset:3px}
h1,h2,h3,p,ul,ol{margin:0}
ul,ol{padding:0;list-style:none}
kbd{display:inline-grid;min-width:15px;height:15px;place-items:center;padding:0 3px;border:1px solid #dcddda;border-bottom-width:2px;color:#656a72;font:400 9.5px/1 var(--scui-font-mono)}
button:active:not(:disabled){transform:translateY(1px)}
button:focus-visible,a:focus-visible{outline:2px solid #161a24;outline-offset:-2px}
.oa-dash{display:grid;grid-template-columns:188px minmax(0,1fr);min-height:100vh}
.oa-rail{position:sticky;top:0;height:100vh;display:flex;flex-direction:column;gap:12px;padding:12px 8px;border-right:1px solid var(--oa-rule)}
.oa-brand{display:flex;align-items:center;gap:9px;padding:4px 6px 6px;font:400 12.5px/1 var(--oa-display);letter-spacing:-.01em;color:#000;white-space:nowrap}
.oa-brand:hover{text-decoration:none}
.oa-brand svg{width:16px;height:16px;flex:none}
.oa-proj{display:flex;align-items:center;gap:9px;padding:8px 6px;border-top:1px solid #dcddda;border-bottom:1px solid #dcddda}
.oa-proj .n{font-weight:500;font-size:12.5px;overflow:hidden;text-overflow:ellipsis}
.oa-proj .o{color:#656a72;font-size:11px}
.oa-rail nav{display:flex;flex-direction:column;gap:1px}
.oa-rail nav a{display:flex;align-items:center;gap:8px;height:26px;padding:0 6px 0 8px;color:#3d4150}
.oa-rail nav a:before{content:"";width:6px;height:6px;flex:none;border:1px solid transparent}
.oa-rail nav a .t{flex:1}
.oa-rail nav a kbd{visibility:hidden}
.oa-rail nav a:hover{background:#1414140a;color:#161a24;text-decoration:none}
.oa-rail nav a:hover kbd{visibility:visible}
.oa-rail nav a:hover:before{border-color:currentColor}
.oa-rail nav a.on{background:var(--oa-lime);color:#161a24}
.oa-rail nav a.on:before{border-color:currentColor;background:currentColor}
.oa-rail nav a.on kbd{border-color:#0000002e;color:#3d4150}
.oa-rail nav .c{padding:0 5px;background:var(--oa-lilac);color:#34324a;font-size:10.5px;line-height:15px}
.oa-keys{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin-top:auto;padding:8px 4px 0;border-top:1px solid #dcddda;color:#656a72;font-size:10.5px}
.oa-keys span{margin-right:6px}
.oa-signin{display:flex;align-items:center;justify-content:center;height:28px;border:1px solid #161a24;color:#161a24;font-size:12px}
.oa-signin:hover{background:#161a24;color:#f8f9f5;text-decoration:none}
.oa-signed{padding:0 4px;color:#3d4150;font-size:11.5px}
.oa-signed a{text-decoration:underline;text-underline-offset:3px}
.oa-role{color:#656a72;font-size:11px;line-height:1.45;padding:0 4px}
.oa-role b{display:block;color:#161a24;font-weight:500}
.oa-role a{color:#161a24;text-decoration:underline;text-underline-offset:3px}
.oa-body{min-width:0;padding:0 18px 32px}
.oa-top{position:sticky;top:0;z-index:3;display:flex;align-items:center;gap:12px;height:48px;margin:0 -18px 14px;padding:0 18px;background:#f8f9f5;border-bottom:1px solid var(--oa-rule)}
.oa-top h1{font:400 16px/1 var(--oa-display);letter-spacing:-.02em;color:#000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.oa-top .grow{flex:1}
.oa-facts{display:flex;gap:0;color:#656a72;font-size:11.5px;white-space:nowrap}
.oa-facts span{padding:0 10px;border-left:1px solid #dcddda}
.oa-facts span:first-child{border-left:0}
.oa-facts b{color:#161a24;font-weight:500}
.oa-jump{display:inline-flex;align-items:center;justify-content:space-between;gap:18px;width:190px;height:26px;padding:0 5px 0 9px;border:1px solid #dcddda;background:#fbfbf8;color:#656a72;font:inherit;cursor:pointer}
.oa-jump:hover{border-color:#161a24;color:#161a24}
.oa-pill{display:inline-flex;align-items:center;gap:7px;height:22px;padding:0 8px;font:500 11px/1 var(--oa-label);background:#f1f1ec;color:#3d4150;white-space:nowrap}
.oa-pill i{width:7px;height:7px;background:#a9adb2}
.oa-pill.live{background:var(--oa-lime);color:#161a24}.oa-pill.live i{background:#161a24;animation:oa-pulse 1.4s steps(2) infinite}
.oa-pill.ok i{background:#9fcb2a}
.oa-pill.warn{background:#fcf0dc;color:#a2600a}.oa-pill.warn i{background:#a2600a}
.oa-pill.off{background:#ffe7dc;color:#9b3510}.oa-pill.off i{background:var(--oa-hot)}
@keyframes oa-pulse{0%{opacity:1}100%{opacity:.25}}
.oa-two{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:14px;align-items:start}
.oa-col{display:flex;flex-direction:column;gap:14px;min-width:0}
.oa-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:14px}
.oa-grid>.oa-panel{grid-column:span 12}
.oa-grid>.span4{grid-column:span 4}.oa-grid>.span6{grid-column:span 6}.oa-grid>.span8{grid-column:span 8}.oa-grid>.span12{grid-column:span 12}
.oa-panel{min-width:0}
.oa-panel>h2{display:flex;align-items:center;gap:10px;height:18px;margin-bottom:6px;font:500 9.5px/1 var(--oa-label);letter-spacing:.28em;text-transform:uppercase;color:#5f656b}
.oa-panel>h2 a{margin-left:auto;text-transform:none;letter-spacing:0;font:400 11.5px var(--scui-font);color:#3d4150}
.oa-kpis{display:grid;border:1px solid #dcddda}.oa-kpis.two{grid-template-columns:1fr 1fr}.oa-kpis.three{grid-template-columns:repeat(3,1fr)}.oa-kpis.four{grid-template-columns:repeat(4,1fr)}.oa-kpis.five{grid-template-columns:repeat(5,1fr)}
.oa-kpi{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;padding:9px 12px}
.oa-kpi+.oa-kpi{border-left:1px solid #dcddda}
.oa-kpi .v{font:400 21px/1.1 var(--oa-label);letter-spacing:-.02em}
.oa-kpi .v.ok{color:#58761a}.oa-kpi .v.warn{color:#a2600a}
.oa-kpi .l{color:#656a72;font-size:11px;font-family:var(--scui-font-mono)}
.oa-spark{display:flex;align-items:flex-end;gap:2px;height:42px;margin-top:10px;border-bottom:1px solid #161a24}
.oa-spark i{flex:1;display:block;background:#161a24;opacity:.7;min-height:1px}
.oa-spark i.hot{background:var(--oa-hot);opacity:1}.oa-spark i.zero{background:#b4b7ba;opacity:.4}
.oa-sparklabel{display:flex;justify-content:space-between;color:#656a72;font-size:10.5px;margin-top:5px}
.oa-rows{display:flex;flex-direction:column;border:1px solid #dcddda}
.oa-rows li{display:flex;align-items:baseline;gap:12px;padding:6px 10px;border-top:1px solid #dcddda}
.oa-rows li:first-child{border-top:0}
.oa-rows .t{flex:1;min-width:0}
.oa-rows .n{color:#656a72;font-size:11.5px;text-align:right;font-family:var(--scui-font-mono)}
.oa-rows .n a{text-decoration:underline;text-underline-offset:3px}
.oa-table{width:100%;border-collapse:collapse;font-size:12px;border:1px solid #dcddda}
.oa-table th{text-align:left;font:500 9.5px/1 var(--oa-label);letter-spacing:.24em;text-transform:uppercase;color:#5f656b;padding:8px 10px;border-bottom:1px solid #b4b7ba;background:#fbfbf8}
.oa-table td{padding:6px 10px;border-bottom:1px solid #dcddda;vertical-align:top}
.oa-table tr:last-child td{border-bottom:0}
.oa-table .n{text-align:right;white-space:nowrap}
.oa-table .nowrap{white-space:nowrap}
.oa-table td.n,.oa-table td.nowrap{font-family:var(--scui-font-mono)}
.oa-table td.clip{max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.oa-table a{text-decoration:underline;text-underline-offset:3px}
.oa-tw{overflow-x:auto}
.oa-muted{color:#656a72}
.oa-empty{color:#656a72;font-size:12px;padding:8px 0}
.oa-fine{color:#656a72;font-size:11.5px;line-height:1.5}
.oa-fine a{color:#161a24;text-decoration:underline;text-underline-offset:3px}
.oa-prose{font-size:13.5px;line-height:1.6;color:#2b2f3a;border:1px solid #dcddda;padding:10px 12px;background:#fbfbf8}
.oa-prose p+p{margin-top:8px}
.oa-prose h1,.oa-prose h2,.oa-prose h3{font:400 13px/1.3 var(--oa-display);color:#000;margin:12px 0 4px}
.oa-prose code{font-family:var(--scui-font-mono);font-size:12px;background:#1414140d;padding:0 3px}
.oa-prose ul{list-style:square;padding-left:18px}
.oa-chip{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 8px 0 2px;border:1px solid #dcddda;background:#fbfbf8;font-size:11.5px;margin-right:4px}
.oa-chip img{width:18px;height:18px;border-radius:50%}
.oa-form{display:flex;flex-direction:column;gap:10px;max-width:560px}
.oa-field{display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:500;border:0;padding:0;margin:0}
.oa-field input,.oa-field textarea{font:inherit;font-weight:400;width:100%;height:30px;border:1px solid #b4b7ba;padding:0 9px;background:#fbfbf8;color:#161a24}
.oa-field textarea{min-height:84px;padding:7px 9px;resize:vertical}
.oa-field legend{padding:0;margin-bottom:4px}
.oa-check{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:400}
.oa-actions{display:flex;gap:8px;flex-wrap:wrap}
.oa-btn{display:inline-flex;align-items:center;justify-content:center;height:30px;padding:0 12px;border:1px solid #161a24;background:#161a24;color:#f8f9f5;font:inherit;cursor:pointer}
.oa-btn.quiet{background:transparent;color:#161a24}
.oa-ident{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid #dcddda;border-bottom:0}
.oa-ident b{display:block;font:400 14px/1.2 var(--oa-display);color:#000}.oa-ident span{color:#656a72;font-size:11.5px}
.oa-ident+.oa-rows{border-top:1px solid #dcddda}
.oa-kit.scui-root{--scui-width:100%;--scui-height:auto;width:100%;height:auto;display:block;border:0;border-radius:0;overflow:visible;background:transparent}
.oa-kit .scui-list{width:100%}
.oa-list.scui-root{border:1px solid #dcddda;overflow:hidden;background:#fbfbf8}
/* On the overview the panel names the list; the kit's own list header would say it twice. */
.oa-col>.oa-panel .oa-list.scui-root{--scui-head-display:none}
.oa-tail.scui-root{border:1px solid #dcddda;overflow:hidden;background:#fbfbf8;margin-bottom:10px;max-height:380px;display:flex;flex-direction:column}
.oa-tail .scui-conversation-wrap{max-height:380px}
.oa-messenger{display:grid;grid-template-columns:300px minmax(0,1fr);gap:0;align-items:start;min-height:calc(100vh - 80px);border:1px solid #dcddda}
.oa-listcol{min-width:0;border-right:1px solid #dcddda}
.oa-messenger .oa-list.scui-root{border:0}
.oa-filters{display:flex;flex-wrap:wrap;gap:4px;padding:8px 8px 6px;border-bottom:1px solid #dcddda}
.oa-filters a{padding:2px 5px;border:1px solid #dcddda;font-size:11.5px;color:#3d4150}
.oa-filters a:hover{text-decoration:none;border-color:#161a24}
.oa-filters a.on{background:var(--oa-lime);border-color:var(--oa-lime);color:#161a24}
.oa-chathead{display:flex;flex-wrap:wrap;gap:0;padding:8px 12px;border-bottom:1px solid #dcddda;color:#656a72;font-size:11.5px}
.oa-chathead span{padding:0 10px;border-left:1px solid #dcddda}
.oa-chathead span:first-child{padding-left:0;border-left:0}
.oa-chathead b{color:#161a24;font-weight:500}
.oa-chathead a{color:#161a24;text-decoration:underline;text-underline-offset:3px}
.oa-listcol{position:sticky;top:62px;max-height:calc(100vh - 80px);display:flex;flex-direction:column}
.oa-listcol .oa-list.scui-root{flex:1;min-height:0;display:flex;flex-direction:column}
.oa-messenger .oa-chat.scui-root{position:sticky;top:62px;height:calc(100vh - 80px);background:#f8f9f5;display:flex;flex-direction:column;overflow:hidden}
.oa-chat .scui-conversation-wrap{flex:1;min-height:0;display:flex;flex-direction:column}
.oa-chat .scui-conversation{flex:1;min-height:0;overflow:auto}
.oa-messenger .oa-chat .oa-empty{padding:20px}
/* Mixed lists of tasks as ruled rows: the key, the title, its status. */
.oa-under{margin:-4px 0 10px;color:#656a72;font-size:11.5px}
.oa-under a{color:#161a24;text-decoration:underline;text-underline-offset:3px}
.oa-split3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border:1px solid #dcddda}
.oa-break{padding:10px 12px;min-width:0}
.oa-break+.oa-break{border-left:1px solid #dcddda}
.oa-break h3{font:500 9.5px/1 var(--oa-label);letter-spacing:.24em;text-transform:uppercase;color:#5f656b;margin-bottom:8px}
.oa-break li{display:grid;grid-template-columns:minmax(0,1fr) 60px auto;align-items:center;gap:8px;padding:3px 0}
.oa-break .t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.oa-break .bar{height:5px;background:#f1f1ec}.oa-break .bar i{display:block;height:100%;background:#161a24}
.oa-break .n{text-align:right;white-space:nowrap}.oa-break .n small{color:#656a72}
.oa-settings{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.oa-attend{border:1px solid #dcddda}
.oa-attend li{display:grid;grid-template-columns:8px minmax(0,1fr) auto;align-items:baseline;gap:10px;padding:7px 10px;border-top:1px solid #dcddda}
.oa-attend li:first-child{border-top:0}
.oa-attend i{width:8px;height:8px;background:#a9adb2;align-self:center}
.oa-attend .hot i{background:var(--oa-hot)}.oa-attend .warn i{background:#f2b04a}.oa-attend .note i{background:#b3a6e0}
.oa-attend a{color:#3d4150;font-size:11.5px;white-space:nowrap}
.oa-rowlist{border:1px solid #dcddda;margin-top:10px;--scui-task-flow:column;--scui-task-columns:92px minmax(0,1fr) minmax(0,38%);--scui-task-align:center;--scui-task-gap:12px;--scui-task-border:0;--scui-task-spacing:0;--scui-task-shadow:inset 0 -1px 0 #dcddda;--scui-task-bg:transparent;--scui-task-padding:6px 10px;--scui-task-status-display:block}
.oa-rowlist .scui-domain-task-meta{font-family:var(--scui-font-mono)}
.oa-rowlist .scui-domain-task-status{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* The transcript's tool rows keep the mono: commands and paths line up. */
.scui-tool-head{font-family:var(--scui-font-mono)}
/* Diff line numbers sit on tinted rows; the muted grey alone falls under 4.5:1 there. */
.scui-code-preview-number{color:#595e66}
.oa-board.scui-root{background:#f8f9f5;overflow:hidden;min-height:60vh}
/* The job list and the open job are one block: one frame, a rule between them. */
.oa-jobs{display:flex;flex-direction:column;border:1px solid #dcddda}
.oa-joblist{display:flex;flex-direction:column}
.oa-job{display:flex;align-items:center;gap:10px;width:100%;padding:6px 10px;border:0;border-top:1px solid #dcddda;background:#fbfbf8;color:inherit;font:inherit;text-align:left;cursor:pointer}
.oa-job:first-child{border-top:0}
.oa-job:hover{background:#f1f1ec}
.oa-job.on{background:var(--oa-lime)}
.oa-job b{font-weight:500}.oa-job span{color:#656a72;font-size:11.5px}
.oa-job em{margin-left:auto;font-style:normal;font-size:10.5px;padding:1px 6px;background:#e7e6e5;color:#464a59}
.oa-job em.scheduled{background:#e9fac1;color:#424a33}.oa-job em.paused{background:#fcf0dc;color:#a2600a}
.oa-jobopen{display:flex;flex-direction:column;gap:10px;padding:10px;border-top:1px solid #dcddda;background:#fbfbf8}
.oa-veil{position:fixed;inset:0;z-index:20;display:grid;justify-items:center;align-items:start;padding-top:14vh;background:#f8f9f5a6}
.oa-palette{width:min(560px,92vw);border:1px solid #161a24;background:#f8f9f5;box-shadow:4px 4px 0 #161a24}
.oa-palette-input{width:100%;height:40px;padding:0 12px;border:0;border-bottom:1px solid #dcddda;outline:0;background:transparent;color:#161a24;font:inherit;font-size:13.5px}
.oa-palette-list{max-height:360px;margin:0;padding:4px;overflow:auto;list-style:none}
.oa-palette-item{display:grid;grid-template-columns:84px minmax(0,1fr) auto;align-items:center;gap:10px;height:28px;padding:0 8px;cursor:pointer}
.oa-palette-item[aria-selected=true]{background:var(--oa-lime)}
.oa-palette-item .k{color:#656a72;font-size:10.5px;text-transform:capitalize;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.oa-palette-item .l{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.oa-palette-item .l b{margin-right:8px;color:#656a72;font-weight:400;font-family:var(--scui-font-mono)}
.oa-palette-empty{padding:10px 8px;color:#656a72}
@media(prefers-reduced-motion:reduce){.oa-pill.live i{animation:none}}
@media(max-width:980px){.oa-dash{grid-template-columns:minmax(0,1fr)}.oa-table{display:block;overflow-x:auto}.oa-rows li{flex-wrap:wrap}.oa-rows .n{margin-left:auto;min-width:0;overflow-wrap:anywhere}.oa-rail{position:static;height:auto;flex-direction:row;flex-wrap:wrap;align-items:center;gap:8px;padding:6px 10px;border-right:0;border-bottom:1px solid var(--oa-rule)}.oa-proj,.oa-keys,.oa-role{display:none}.oa-rail nav{flex-direction:row;overflow-x:auto;gap:1px}.oa-rail nav a kbd{display:none}.oa-body{padding:0 12px 28px}.oa-top{margin:0 -12px 12px;padding:6px 12px;height:auto;min-height:44px;flex-wrap:wrap;row-gap:4px}.oa-facts{flex-wrap:wrap;white-space:normal}.oa-jump{display:none}.oa-rowlist{--scui-task-flow:row;--scui-task-columns:none;--scui-task-gap:1px}.oa-two{grid-template-columns:1fr}.oa-grid>.span4,.oa-grid>.span6,.oa-grid>.span8{grid-column:span 12}.oa-split3{grid-template-columns:1fr}.oa-settings{grid-template-columns:1fr}.oa-break+.oa-break{border-left:0;border-top:1px solid #dcddda}.oa-kpis.four,.oa-kpis.five{grid-template-columns:repeat(2,1fr)}.oa-messenger{grid-template-columns:1fr;min-height:0}.oa-listcol{position:static;max-height:50vh;border-right:0;border-bottom:1px solid #dcddda}.oa-messenger .oa-chat.scui-root{position:static;height:auto;min-height:60vh}.oa-messenger[data-pane=chat] .oa-listcol{display:none}}
`;
