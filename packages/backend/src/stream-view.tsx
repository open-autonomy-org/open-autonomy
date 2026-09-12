import { itemState, itemTime, phaseNumber, tenseOf, type Roadmap, type RoadmapItem, type RoadmapState, type Tense } from '@open-autonomy/sdk/roadmap';
import type { CallRecord, EnvelopePurpose, ItemView, SessionRecord, SessionSummary, Turn, UpdateRecord } from './ledger.js';
import { fmtAgo, fmtDur, fmtWhen, mdToSafeHtml, shortSha, usd } from './ui.js';
import { parseSchedule } from './widgets.js';

// The development stream on the page: the timeline's views, one session's page, one item's page, the
// Setup pane. Every sentence is a timeline line, a session's report, a transcript turn, an
// update or a commit — never the platform's own words — and every element links to its source.

const toolLine = (t: Turn): string => {
  if (!t.tool) return '';
  try { const a = t.args ? JSON.parse(t.args) as Record<string, unknown> : {}; const v = a.path ?? a.command ?? a.pattern ?? a.query ?? Object.values(a)[0]; return typeof v === 'string' ? v.slice(0, 140) : (t.args ?? '').slice(0, 140); } catch { return (t.args ?? '').slice(0, 140); }
};
const outcomeWord = (s: SessionSummary): string => (s.status === 'live' ? 'live' : s.outcome === 'failed' ? 'failed' : s.outcome === 'done' ? 'done' : 'ended');
const sessionCost = (s: Pick<SessionSummary, 'calls' | 'usd_cents' | 'model_provider'>): string => (s.calls === 0 && s.usd_cents === 0 && s.model_provider && s.model_provider !== 'open-autonomy' ? `owner subscription (${s.model_provider})` : usd(s.usd_cents));
const envelopeName = (purpose: EnvelopePurpose): string => purpose.type === 'item' ? `the task '${purpose.item}'` : purpose.type === 'models' ? `model calls on ${purpose.models.join(', ')}` : purpose.type === 'model' ? 'model calls only' : purpose.type === 'any' ? 'anything the agent spends on' : 'whatever the project needs';
const envelopeDraws = (call: CallRecord): string => call.envelopes?.length ? call.envelopes.map((part) => `${envelopeName(part.purpose)} (${usd(part.usd_cents)})`).join(' + ') : envelopeName(call.envelope ?? { type: 'unrestricted' });
function CallReceipts({ calls }: { calls?: CallRecord[] }) {
  if (!calls?.length) return null;
  return <ul class="updates">{calls.map((call) => <li><span class="u-when">{fmtWhen(call.ts)}</span><div class="u-text">{call.model ?? call.rail} · {usd(call.usd_cents)} · paid from {envelopeDraws(call)}</div></li>)}</ul>;
}

export function Receipt({ s, enc, repoUrl, now }: { s: SessionSummary; enc: string; repoUrl?: string; now: number }) {
  const live = s.status === 'live';
  const cls = s.outcome === 'failed' ? 'failed' : live ? 'live' : 'done';
  return (
    <div class={`receipt ${cls}`}>
      <div class="rc-head">
        <span class="rc-when">{live ? `in progress · ${fmtDur(s.started_at, undefined, now)}` : `${fmtAgo(s.ended_at ?? s.started_at, now)} · ${fmtDur(s.started_at, s.ended_at, now)}`}</span>
        <span class="rc-kind">{s.source ?? s.kind}</span>
        <span class="rc-stat">{s.turn_count} turns · {s.tool_calls} tools · {sessionCost(s)}</span>
        {s.outcome === 'failed' ? <span class="rc-fail">failed</span> : null}
      </div>
      <CallReceipts calls={s.receipts} />
      {s.report ? <div class="rc-report prose" dangerouslySetInnerHTML={{ __html: mdToSafeHtml(s.report.length > 280 ? `${s.report.slice(0, 279)}…` : s.report) }} /> : null}
      <div class="rc-proofs">
        {s.commit_sha && repoUrl ? <a href={`${repoUrl}/commit/${s.commit_sha}`}>commit {shortSha(s.commit_sha)} ↗</a> : <span class="missing">no commit</span>}
        <a href={`/p/${enc}/sessions/${encodeURIComponent(s.key)}`}>transcript ↗</a>
        <a href={`/v1/accounts/${enc}/calls`}>calls ↗</a>
      </div>
    </div>
  );
}

type Row = { item: RoadmapItem; state: RoadmapState; tense: Tense; time: number };
const stateWord = (state: RoadmapState): string => (state === 'active' ? 'in progress' : state === 'done' ? 'shipped' : state === 'proposed' ? 'proposed · awaits owner' : 'queued');
const whenOf = (r: Row, now: number): string => (r.time ? fmtAgo(new Date(r.time).toISOString(), now) : '');

function Station({ r, enc, now, repoUrl, mark, children }: { r: Row; enc: string; now: number; repoUrl?: string; mark?: boolean; children?: unknown }) {
  const { item, state } = r;
  const phase = item.phase ? (Number.isNaN(parseInt(item.phase, 10)) ? item.phase : `P${item.phase}`) : '';
  const when = whenOf(r, now);
  return (
    <li class={`rm-stn ${state === 'queued' ? 'planned' : state}${mark ? ' is-now' : ''}`}>
      <span class="rm-node" aria-hidden="true" />
      <div class="rm-stnbody">
        <div class="rm-shead">
          <a class="rm-stitle" href={`/p/${enc}/items/${encodeURIComponent(item.id)}`}>{item.title}</a>
          {mark ? <span class="rm-now">now</span> : null}
          {phase ? <span class="rm-sphase">{phase}</span> : null}
          {item.release ? <span class="rm-smeta">{item.release}</span> : null}
          {when ? <span class="rm-smeta">{when}</span> : null}
          {item.commit && repoUrl ? <span class="rm-smeta"><a href={`${repoUrl}/commit/${item.commit}`}>{shortSha(item.commit)} ↗</a></span> : null}
          {(item.links ?? []).map((l) => <span class="rm-smeta"><a href={l.url} title={l.kind}>{l.label ?? l.kind} ↗</a></span>)}
          <span class="rm-sstatus">{stateWord(state)}</span>
        </div>
        {children}
      </div>
    </li>
  );
}

const Acceptance = ({ item }: { item: RoadmapItem }) => (item.acceptance.length ? <ul class="accept">{item.acceptance.map((l) => <li>{l}</li>)}</ul> : null);

// The timeline's views: one document, several ways to look at it. A board with the three tenses as columns, a
// list sortable on any column, the timeline itself by month, and the past grouped by release. Every view is a
// rendering of what was published; nothing here edits an item.
export type TimelineView = 'board' | 'list' | 'timeline' | 'releases';
export interface TimelineQuery { view?: string; sort?: string }
const VIEWS: readonly TimelineView[] = ['board', 'list', 'timeline', 'releases'];
type SortKey = 'time' | 'title' | 'tense' | 'status' | 'release' | 'priority' | 'home';
const SORTS: readonly SortKey[] = ['time', 'title', 'tense', 'status', 'release', 'priority', 'home'];
const TENSE_RANK: Record<Tense, number> = { future: 0, present: 1, past: 2 };
function sorted(rows: Row[], sort: string | undefined): { rows: Row[]; key: SortKey; desc: boolean } {
  const desc = (sort ?? '').startsWith('-');
  const name = (sort ?? '').replace(/^-/, '');
  const key: SortKey = (SORTS as readonly string[]).includes(name) ? name as SortKey : 'time';
  const dir = sort ? (desc ? -1 : 1) : -1;
  const val = (r: Row): string | number => (key === 'time' ? r.time : key === 'tense' ? TENSE_RANK[r.tense] : key === 'title' ? r.item.title.toLowerCase() : (r.item[key] ?? '').toLowerCase());
  const out = [...rows].sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * dir || phaseNumber(a.item) - phaseNumber(b.item) || a.item.title.localeCompare(b.item.title); });
  return { rows: out, key, desc: sort ? desc : true };
}
const monthOf = (t: number): string => (t ? new Date(t).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : 'undated');

export function Timeline({ account, roadmap, scheduleJson, sessions, live, repoUrl, now, query = {} }: { account: string; roadmap: Roadmap; scheduleJson?: string; sessions: SessionSummary[]; live: string[]; repoUrl?: string; now: number; query?: TimelineQuery }) {
  const enc = encodeURIComponent(account);
  const view: TimelineView = (VIEWS as readonly string[]).includes(query.view ?? '') ? query.view as TimelineView : 'board';
  const rows: Row[] = roadmap.items.map((item) => ({ item, state: itemState(item), tense: tenseOf(item), time: itemTime(item) }));
  const byItem = new Map<string, SessionSummary[]>();
  const known = new Set(roadmap.items.map((i) => i.id));
  for (const s of sessions) if (s.item_id && known.has(s.item_id)) byItem.set(s.item_id, [...(byItem.get(s.item_id) ?? []), s]);
  // A session with no item, or whose item has since left the timeline, still happened.
  const orphan = sessions.filter((s) => !s.item_id || !known.has(s.item_id));
  const liveSessions = sessions.filter((s) => live.includes(s.key));
  const last = sessions.find((s) => s.status === 'ended' && s.kind === 'run');
  const schedule = parseSchedule(scheduleJson);
  const future = rows.filter((r) => r.tense === 'future').sort((a, b) => (a.state === 'proposed' ? 1 : 0) - (b.state === 'proposed' ? 1 : 0) || phaseNumber(a.item) - phaseNumber(b.item));
  const present = rows.filter((r) => r.tense === 'present').sort((a, b) => (a.state === 'active' ? 0 : 1) - (b.state === 'active' ? 0 : 1) || b.time - a.time);
  const past = rows.filter((r) => r.tense === 'past').sort((a, b) => b.time - a.time);
  const receipts = (r: Row) => (byItem.get(r.item.id) ?? []).map((s) => <Receipt s={s} enc={enc} repoUrl={repoUrl} now={now} />);
  const nav = (
    <div class="tl-nav">{VIEWS.map((v) => <a class={v === view ? 'on' : ''} href={`/p/${enc}${v === 'board' ? '' : `?view=${v}`}`}>{v}</a>)}<span style="flex:1" /><span>{past.length} shipped · {present.length} in flight · {future.length} ahead</span></div>
  );
  const now_ = liveSessions.length ? liveSessions.map((s) => (
    <div class="livebox">
      <div class="lb-head" data-live-session={s.key} data-account={account}><span class="live"><span class="pulse" /></span><b>{s.source ?? s.kind}</b> · {s.item_id ? <a href={`/p/${enc}/items/${encodeURIComponent(s.item_id)}`}>{s.item_id}</a> : s.title ?? ''} · in progress · {fmtDur(s.started_at, undefined, now)} · <span data-live-turns>{s.turn_count}</span> turns · <span data-live-tools>{s.tool_calls}</span> tools</div>
      <a class="docmore" href={`/p/${enc}/sessions/${encodeURIComponent(s.key)}`}>Follow the session →</a>
    </div>
  )) : (
    <div class="schedbox">
      {schedule.length ? schedule.map((j) => <div class="sched"><b>{j.name ?? 'job'}</b> · fires {j.schedule ?? '?'}{j.deliver ? ` · reports to ${j.deliver}` : ''}</div>) : <div class="sched">No schedule committed.</div>}
      {last ? <div class="sched last">last run {fmtWhen(last.started_at)}: {outcomeWord(last)}{last.item_id ? ` · ${last.item_id}` : ''}{last.commit_sha && repoUrl ? <> · <a href={`${repoUrl}/commit/${last.commit_sha}`}>{shortSha(last.commit_sha)} ↗</a></> : null} · <a href={`/p/${enc}/sessions/${encodeURIComponent(last.key)}`}>receipt ↗</a></div> : <div class="sched last">no run yet</div>}
    </div>
  );
  let body: unknown;
  if (view === 'list') {
    const { rows: list, key, desc } = sorted(rows, query.sort);
    const th = (k: SortKey, label: string) => <th><a href={`/p/${enc}?view=list&sort=${key === k && !desc ? '-' : ''}${k}`}>{label}{key === k ? (desc ? ' ↓' : ' ↑') : ''}</a></th>;
    body = (
      <table class="tl-table">
        <thead><tr>{th('title', 'item')}{th('tense', 'tense')}{th('status', 'status')}{th('release', 'release')}{th('time', 'when')}{th('home', 'home')}<th>proof</th></tr></thead>
        <tbody>{list.map((r) => <tr><td class="t"><a href={`/p/${enc}/items/${encodeURIComponent(r.item.id)}`}>{r.item.title}</a></td><td class="n">{r.tense}</td><td class="n">{stateWord(r.state)}</td><td class="n">{r.item.release ?? ''}</td><td class="n">{whenOf(r, now)}</td><td class="n">{r.item.home ?? ''}</td><td class="n">{r.item.commit && repoUrl ? <><a href={`${repoUrl}/commit/${r.item.commit}`}>{shortSha(r.item.commit)}</a> </> : null}{(r.item.links ?? []).map((l) => <><a href={l.url} title={l.kind}>{l.label ?? l.kind}</a> </>)}{!r.item.commit && !r.item.links?.length && byItem.get(r.item.id)?.length ? <a href={`/p/${enc}/items/${encodeURIComponent(r.item.id)}`}>{byItem.get(r.item.id)!.length} session{byItem.get(r.item.id)!.length === 1 ? '' : 's'}</a> : ''}</td></tr>)}</tbody>
      </table>
    );
  } else if (view === 'timeline') {
    const dated = rows.filter((r) => r.time).sort((a, b) => b.time - a.time);
    const undated = rows.filter((r) => !r.time);
    const months: Array<[string, Row[]]> = [];
    for (const r of dated) { const m = monthOf(r.time); if (months[months.length - 1]?.[0] === m) months[months.length - 1][1].push(r); else months.push([m, [r]]); }
    const ahead = future.filter((r) => !r.time);
    const undatedRest = undated.filter((r) => r.tense !== 'future');
    const groups: Array<[string, Row[]]> = [...(ahead.length ? [['ahead' as string, ahead]] as Array<[string, Row[]]> : []), ...months, ...(undatedRest.length ? [['undated' as string, undatedRest]] as Array<[string, Row[]]> : [])];
    body = <>{groups.map(([m, rs]) => <><div class="tl-month">{m}</div><ol class="rm-spine">{rs.map((r) => <Station r={r} enc={enc} now={now} repoUrl={repoUrl} mark={r.state === 'active'}>{r.tense !== 'future' ? receipts(r) : null}</Station>)}</ol></>)}{!rows.length ? <p class="sub">Nothing on the timeline yet.</p> : null}</>;
  } else if (view === 'releases') {
    const groups: Array<[string, Row[]]> = [];
    for (const r of past) { const g = r.item.release ?? 'unreleased'; const at = groups.find(([k]) => k === g); if (at) at[1].push(r); else groups.push([g, [r]]); }
    body = <>{groups.map(([g, rs]) => <div class="release"><div class="tl-month">{g}{rs[0].time ? ` · ${fmtWhen(new Date(rs[0].time).toISOString())}` : ''}</div><ol class="rm-spine">{rs.map((r) => <Station r={r} enc={enc} now={now} repoUrl={repoUrl}>{receipts(r)}</Station>)}</ol></div>)}{!past.length ? <p class="sub">Nothing shipped yet.</p> : null}</>;
  } else {
    body = (
      <div class="tl-board">
        <div class="tl-col"><h4>Future</h4><ol class="rm-spine">{future.map((r) => <Station r={r} enc={enc} now={now} repoUrl={repoUrl}><Acceptance item={r.item} /></Station>)}{!future.length ? <li class="empty">Nothing ahead. What comes next is the project's to file.</li> : null}</ol></div>
        <div class="tl-col"><h4>Present</h4>{now_}<ol class="rm-spine">{present.map((r) => <Station r={r} enc={enc} now={now} repoUrl={repoUrl} mark={r.state === 'active'}><Acceptance item={r.item} />{receipts(r)}</Station>)}{!present.length ? <li class="empty">Nothing in flight.</li> : null}</ol></div>
        <div class="tl-col"><h4>Past</h4><ol class="rm-spine">{past.slice(0, 12).map((r) => { const rc = receipts(r); return <Station r={r} enc={enc} now={now} repoUrl={repoUrl}>{rc.length ? rc : r.item.home === 'kanban' ? <div class="rc-none">no agent session</div> : null}</Station>; })}{past.length > 12 ? <li class="empty">{past.length - 12} more · <a href={`/p/${enc}?view=releases`}>by release</a></li> : null}{!past.length ? <li class="empty">Nothing shipped yet.</li> : null}</ol></div>
      </div>
    );
  }
  return (
    <div class="panel spine">
      {nav}
      {body}
      {orphan.length ? <><h3>Other sessions</h3>{orphan.slice(0, 5).map((s) => <Receipt s={s} enc={enc} repoUrl={repoUrl} now={now} />)}{orphan.length > 5 ? <div class="rc-none">{orphan.length - 5} more · <a href={`/p/${enc}/sessions`}>every session ↗</a></div> : null}</> : null}
      <div class="rc-proofs" style="margin-top:14px"><a href={`/p/${enc}/sessions`}>every session ↗</a><a href={`/v1/accounts/${enc}/roadmap/revisions`}>every revision ↗</a></div>
    </div>
  );
}

// ---- every session ------------------------------------------------------------------------------------
export function SessionsPage({ account, sessions, live, repoUrl, now }: { account: string; sessions: SessionSummary[]; live: string[]; repoUrl?: string; now: number }) {
  const enc = encodeURIComponent(account);
  return (
    <div class="wrap">
      <p class="crumb"><a href={`/p/${enc}`}>← {account}</a></p>
      <div class="panel jobhead">
        <h1>Every session</h1>
        <p class="meta">{sessions.length} session{sessions.length === 1 ? '' : 's'} on the page · {live.length} live · newest first · <a href={`/v1/accounts/${enc}/sessions?limit=100`}>as JSON ↗</a></p>
      </div>
      <div class="panel">
        {sessions.length ? sessions.map((s) => <div>{s.item_id ? <div class="rc-none">item <a href={`/p/${enc}/items/${encodeURIComponent(s.item_id)}`}>{s.item_id}</a></div> : null}<Receipt s={s} enc={enc} repoUrl={repoUrl} now={now} /></div>) : <p class="sub">No session has been published yet.</p>}
      </div>
    </div>
  );
}

// ---- one session ----------------------------------------------------------------------------------------
function TurnRow({ t }: { t: Turn }) {
  const ts = t.ts ? new Date(t.ts).toISOString().slice(11, 19) : '';
  if (t.role === 'assistant' && t.tool) return <div class="turn tool"><span class="ts">{ts}</span><span class="tn">{t.tool}</span><span class="ta">{toolLine(t)}</span></div>;
  if (t.role === 'tool') return <details class="turn result"><summary><span class="ts">{ts}</span><span class="tn">↳ {t.tool ?? 'result'}</span><span class="ta">{(t.result ?? '').slice(0, 90)}</span></summary><pre>{t.result ?? ''}</pre></details>;
  if (t.role === 'assistant') return <div class="turn say"><span class="ts">{ts}</span><div class="tx">{t.text ?? ''}</div></div>;
  if (t.role === 'user') return <details class="turn user"><summary><span class="ts">{ts}</span><span class="tn">prompt</span><span class="ta">{(t.text ?? '').slice(0, 90)}</span></summary><pre>{t.text ?? ''}</pre></details>;
  return null;
}

export function SessionPage({ account, s, repoUrl, now }: { account: string; s: SessionRecord; repoUrl?: string; now: number }) {
  const enc = encodeURIComponent(account);
  const live = s.status === 'live';
  const tools = s.turns.filter((t) => t.role === 'assistant' && t.tool).length;
  return (
    <div class="wrap">
      <p class="crumb"><a href={`/p/${enc}`}>← {account}</a>{s.item_id ? <> · <a href={`/p/${enc}/items/${encodeURIComponent(s.item_id)}`}>{s.item_id}</a></> : null}</p>
      <div class="panel jobhead">
        <h1>{s.source ?? s.kind}{s.item_id ? <> · <span class="item">{s.item_id}</span></> : null}</h1>
        <p class="meta" data-session-meta>{live ? <><span class="live"><span class="pulse" /></span> in progress · {fmtDur(s.started_at, undefined, now)}</> : <>{s.outcome === 'failed' ? '✕ failed' : s.outcome === 'done' ? '✓ completed' : '· ended'} · {fmtDur(s.started_at, s.ended_at, now)}</>} · started {fmtAgo(s.started_at, now)} · <span data-turns>{s.turn_count}</span> turns · <span data-tools>{tools}</span> tool calls · <span data-cents>{sessionCost(s)}</span>{s.calls ? ` over ${s.calls} calls` : ''}</p>
      </div>
      {s.report ? <div class="panel"><h3>Report (the agent's own words)</h3><div class="report prose" dangerouslySetInnerHTML={{ __html: mdToSafeHtml(s.report) }} /></div> : null}
      <div class="panel">
        <h3>Proofs</h3>
        <ul class="proofs">
          <li>commit {s.commit_sha && repoUrl ? <a href={`${repoUrl}/commit/${s.commit_sha}`}>{shortSha(s.commit_sha)} ↗</a> : <span class="missing">{live ? 'not yet' : 'none recorded'}</span>}</li>
          <li>transcript · this page · {s.turns.length} of {s.turn_count} turns kept</li>
          <li>calls · <a href={`/v1/accounts/${enc}/calls`}>the audit trail ↗</a></li>
        </ul>
        <CallReceipts calls={s.receipts} />
      </div>
      <div class="panel">
        <h3>Transcript</h3>
        <div class="turns" data-turns-list data-last-seq={String(s.turns.length ? s.turns[s.turns.length - 1].seq ?? -1 : -1)}>{s.turns.map((t) => <TurnRow t={t} />)}</div>
        {live ? <p class="note" data-live-note>Live: new turns append as the agent works; the page stays where you scrolled unless you are at the bottom.</p> : null}
      </div>
    </div>
  );
}

// ---- one item -------------------------------------------------------------------------------------------
export function ItemPage({ account, roadmap, view, repoUrl, now }: { account: string; roadmap: Roadmap; view: ItemView; repoUrl?: string; now: number }) {
  const enc = encodeURIComponent(account);
  const item = roadmap.items.find((i) => i.id === view.item_id);
  const state = item ? itemState(item) : undefined;
  const word = state ? stateWord(state) : 'not on the timeline';
  const facts = item ? [item.tense, item.release, item.done_at ? `shipped ${fmtWhen(item.done_at)}` : item.started_at ? `started ${fmtWhen(item.started_at)}` : item.proposed_at ? `proposed ${fmtWhen(item.proposed_at)}` : '', item.by ? `by ${item.by}` : '', item.home ? `from ${item.home}` : ''].filter(Boolean).join(' · ') : '';
  const turns = view.sessions.reduce((n, s) => n + s.turn_count, 0);
  return (
    <div class="wrap">
      <p class="crumb"><a href={`/p/${enc}`}>← {account}</a></p>
      <div class="panel jobhead" data-item={view.item_id} data-account={account} data-live={view.live.length ? '1' : ''} data-sessions={String(view.sessions.length)} data-updates={String(view.updates.length)}>
        <h1><span class="item">{view.item_id}</span>{item ? <> · {item.title}</> : null}</h1>
        <p class="meta">{word}{item?.phase ? ` · phase ${item.phase}` : ''}{facts ? ` · ${facts}` : ''}{item?.commit && repoUrl ? <> · <a href={`${repoUrl}/commit/${item.commit}`}>{shortSha(item.commit)} ↗</a></> : null} · <span data-item-sessions>{view.sessions.length}</span> session{view.sessions.length === 1 ? '' : 's'} · <span data-item-turns>{turns}</span> turns · <span data-item-updates>{view.updates.length}</span> update{view.updates.length === 1 ? '' : 's'} · <span data-item-cents>{usd(view.usd_cents)}</span> settled{view.live.length ? <> · <span class="live"><span class="pulse" /></span> {view.live.length} live</> : null}</p>
        {item?.acceptance.length ? <ul class="accept">{item.acceptance.map((l) => <li>{l}</li>)}</ul> : null}
        {item?.links?.length ? <div class="rc-proofs">{item.links.map((l) => <a href={l.url} title={l.kind}>{l.label ?? l.kind} ↗</a>)}</div> : null}
      </div>
      <div class="panel">
        <h3>Sessions</h3>
        {view.sessions.length ? view.sessions.map((s) => <Receipt s={s} enc={enc} repoUrl={repoUrl} now={now} />) : <p class="sub">No session has worked this item yet.</p>}
      </div>
      {view.purchases.length ? (
        <div class="panel">
          <h3>Purchases</h3>
          <ul class="updates">{view.purchases.map((c) => <li><span class="u-when">{fmtAgo(c.ts, now)}</span><div class="u-text">{c.rail === 'card' ? <>{c.merchant ?? 'a merchant'}{c.category ? ` (${c.category})` : ''} on card ···{c.card_last4 ?? '????'}</> : <>{c.partner ?? 'a partner'}{c.unit ? ` · ${c.quantity ?? 1} ${c.unit}` : ''}</>} · {usd(c.usd_cents)} · paid from {envelopeDraws(c)}{c.session ? <> · <a href={`/p/${enc}/sessions/${encodeURIComponent(c.session)}`}>session</a></> : null}</div></li>)}</ul>
        </div>
      ) : null}
      <div class="panel">
        <h3>Updates</h3>
        {view.updates.length ? <ul class="updates">{view.updates.map((u: UpdateRecord) => <li><span class="u-when">{fmtAgo(u.ts, now)}</span><div class="u-text prose" dangerouslySetInnerHTML={{ __html: mdToSafeHtml(u.text) }} />{u.session ? <a class="u-sess" href={`/p/${enc}/sessions/${encodeURIComponent(u.session)}`}>from session ↗</a> : null}</li>)}</ul> : <p class="sub">No updates posted on this item.</p>}
      </div>
      <p class="note">Settled cents are the metered calls made by sessions on this item; the <a href={`/v1/accounts/${enc}/calls`}>audit trail</a> is the full record.</p>
    </div>
  );
}

// ---- Setup: who the agent is and how it runs, as its substrate published it through the SDK -----------------
export function leadParagraphs(md: string | undefined, max = 2): string {
  if (!md) return '';
  return md.split('\n').filter((l) => !/^#/.test(l)).join('\n').trim().split(/\n{2,}/).slice(0, max).join('\n\n').trim();
}
export function SetupPanel({ setupMd, soulMd, model, provider, harness, skills, scheduleJson }: { setupMd?: string; soulMd?: string; model?: string; provider?: string; harness?: string; skills?: string; scheduleJson?: string }) {
  const soul = leadParagraphs(soulMd, 2);
  const setup = leadParagraphs(setupMd, 2);
  const jobs = parseSchedule(scheduleJson);
  const known = (skills ?? '').split(',').map((k) => k.trim()).filter(Boolean);
  if (!soul && !setup && !model) return null;
  return (
    <div class="panel" id="setup">
      <h3>Setup</h3>
      <p class="note">Who the agent is and how it runs, as it publishes it through the SDK. Nothing here drives the agent; it is the agent's own account of itself.</p>
      <div class="facts">
        {harness ? <div class="fact"><span class="k">harness</span><span class="v">{harness}</span></div> : null}
        {model ? <div class="fact"><span class="k">model</span><span class="v">{model}{provider ? ` (${provider})` : ''}</span></div> : null}
        {provider ? <div class="fact"><span class="k">calls</span><span class="v">{provider === 'open-autonomy' ? "through the platform on the project's key, every one metered" : `on the owner's ${provider} subscription, outside the project's funds`}</span></div> : null}
        {jobs.length ? <div class="fact"><span class="k">schedule</span><span class="v">{jobs.map((j) => `${j.name ?? 'job'} · ${j.schedule ?? '?'}`).join(' · ')}</span></div> : null}
        {known.length ? <div class="fact"><span class="k">skills</span><span class="v">{known.join(' · ')}</span></div> : null}
      </div>
      {soul ? <><h4>Who it is</h4><div class="prose" dangerouslySetInnerHTML={{ __html: mdToSafeHtml(soul) }} /></> : null}
      {setup ? <><h4>How it runs</h4><div class="prose" dangerouslySetInnerHTML={{ __html: mdToSafeHtml(setup) }} /></> : null}
    </div>
  );
}

// The page-side half of the live channels. On a project page: EventSource over the project's route, the
// books' numbers updating in place and a reload when the shape changes (a session starts or ends, a roadmap
// revision, money in). On a session page or the spine's live box: EventSource over the session's SSE route,
// turns appended as rows, status updating the header, a reload once it ends. On an item page: EventSource
// over the item's route, counters updating and a reload when what touched the item changes shape. Follows
// the log unless the reader has scrolled up.
export const LIVE_SCRIPT = `(() => {
  const enc = encodeURIComponent;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const itemBox = document.querySelector('[data-item][data-live="1"]');
  if (itemBox && 'EventSource' in window) {
    const account = itemBox.getAttribute('data-account'), item = itemBox.getAttribute('data-item');
    const sessions = itemBox.getAttribute('data-sessions'), updates = itemBox.getAttribute('data-updates');
    const es = new EventSource('/v1/accounts/' + enc(account) + '/items/' + enc(item) + '/events');
    es.addEventListener('item', (e) => {
      const d = JSON.parse(e.data);
      if (String(d.sessions) !== sessions || String(d.updates) !== updates || !d.live.length) { es.close(); setTimeout(() => location.reload(), 800); return; }
      const set = (sel, v) => { const el = document.querySelector(sel); if (el) el.textContent = v; };
      set('[data-item-turns]', String(d.turn_count)); set('[data-item-cents]', '$' + (d.usd_cents / 100).toFixed(2));
    });
    return;
  }
  const project = document.querySelector('[data-project]');
  if (project && 'EventSource' in window) {
    const account = project.getAttribute('data-project'), shape = project.getAttribute('data-shape');
    const usd = (c) => '$' + (c / 100).toFixed(2);
    const es = new EventSource('/v1/accounts/' + enc(account) + '/events');
    es.addEventListener('project', (e) => {
      const d = JSON.parse(e.data);
      if (JSON.stringify([d.live, d.roadmap_revision, d.granted_in_usd_cents, d.state]) !== shape) { es.close(); setTimeout(() => location.reload(), 800); return; }
      const set = (sel, v) => { const el = document.querySelector(sel); if (el) el.textContent = v; };
      set('[data-spent]', usd(d.consumed_usd_cents)); set('[data-balance]', usd(d.balance_usd_cents)); set('[data-received]', usd(d.granted_in_usd_cents));
    });
    es.onerror = () => {};
  }
  const list = document.querySelector('[data-turns-list]');
  const box = document.querySelector('[data-live-session]');
  const path = location.pathname.match(/^\\/p\\/(.+?)\\/sessions\\/([^/]+)$/);
  const account = box ? box.getAttribute('data-account') : path && decodeURIComponent(path[1]);
  const key = box ? box.getAttribute('data-live-session') : path && decodeURIComponent(path[2]);
  if (!account || !key || !('EventSource' in window)) return;
  const after = list ? list.getAttribute('data-last-seq') : '-1';
  const es = new EventSource('/v1/accounts/' + enc(account) + '/sessions/' + enc(key) + '/events?after=' + after);
  const atBottom = () => (window.innerHeight + window.scrollY) >= (document.body.scrollHeight - 80);
  es.addEventListener('turn', (e) => {
    if (!list) return;
    const t = JSON.parse(e.data); const ts = t.ts ? new Date(t.ts).toISOString().slice(11, 19) : '';
    const follow = atBottom();
    let html = '';
    if (t.role === 'assistant' && t.tool) { let a = t.args || ''; try { const o = JSON.parse(a); const v = o.path ?? o.command ?? o.pattern ?? o.query ?? Object.values(o)[0]; a = typeof v === 'string' ? v : a; } catch {} html = '<div class="turn tool"><span class="ts">' + ts + '</span><span class="tn">' + esc(t.tool) + '</span><span class="ta">' + esc(a.slice(0, 140)) + '</span></div>'; }
    else if (t.role === 'tool') html = '<details class="turn result"><summary><span class="ts">' + ts + '</span><span class="tn">↳ ' + esc(t.tool || 'result') + '</span><span class="ta">' + esc((t.result || '').slice(0, 90)) + '</span></summary><pre>' + esc(t.result || '') + '</pre></details>';
    else if (t.role === 'assistant') html = '<div class="turn say"><span class="ts">' + ts + '</span><div class="tx">' + esc(t.text || '') + '</div></div>';
    else if (t.role === 'user') html = '<details class="turn user"><summary><span class="ts">' + ts + '</span><span class="tn">prompt</span><span class="ta">' + esc((t.text || '').slice(0, 90)) + '</span></summary><pre>' + esc(t.text || '') + '</pre></details>';
    if (html) { list.insertAdjacentHTML('beforeend', html); if (follow) window.scrollTo(0, document.body.scrollHeight); }
  });
  es.addEventListener('status', (e) => {
    const s = JSON.parse(e.data);
    for (const el of document.querySelectorAll('[data-turns],[data-live-turns]')) el.textContent = String(s.turn_count);
    for (const el of document.querySelectorAll('[data-cents]')) el.textContent = '$' + (s.usd_cents / 100).toFixed(2);
    if (s.status !== 'live') { es.close(); setTimeout(() => location.reload(), 800); }
  });
  es.onerror = () => {};
})();`;
