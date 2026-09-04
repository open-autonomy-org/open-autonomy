import { itemState, phaseNumber, type Roadmap, type RoadmapItem, type RoadmapState } from '@open-autonomy/sdk/roadmap';
import type { ItemView, SessionRecord, SessionSummary, Turn, UpdateRecord } from './ledger.js';
import { fmtAgo, fmtDur, fmtWhen, mdToSafeHtml, shortSha, usd } from './ui.js';
import { parseSchedule } from './widgets.js';

// The development stream on the page: the spine (NEXT / NOW / DONE), one session's page, one item's
// page, the Setup pane. Every sentence is a roadmap line, a session's report, a transcript turn, an
// update or a commit — never the platform's own words — and every element links to its source.

const toolLine = (t: Turn): string => {
  if (!t.tool) return '';
  try { const a = t.args ? JSON.parse(t.args) as Record<string, unknown> : {}; const v = a.path ?? a.command ?? a.pattern ?? a.query ?? Object.values(a)[0]; return typeof v === 'string' ? v.slice(0, 140) : (t.args ?? '').slice(0, 140); } catch { return (t.args ?? '').slice(0, 140); }
};
const outcomeWord = (s: SessionSummary): string => (s.status === 'live' ? 'live' : s.outcome === 'failed' ? 'failed' : s.outcome === 'done' ? 'done' : 'ended');

export function Receipt({ s, enc, repoUrl, now }: { s: SessionSummary; enc: string; repoUrl?: string; now: number }) {
  const live = s.status === 'live';
  const cls = s.outcome === 'failed' ? 'failed' : live ? 'live' : 'done';
  return (
    <div class={`receipt ${cls}`}>
      <div class="rc-head">
        <span class="rc-when">{live ? `in progress · ${fmtDur(s.started_at, undefined, now)}` : `${fmtAgo(s.ended_at ?? s.started_at, now)} · ${fmtDur(s.started_at, s.ended_at, now)}`}</span>
        <span class="rc-kind">{s.source ?? s.kind}</span>
        <span class="rc-stat">{s.turn_count} turns · {s.tool_calls} tools · {usd(s.usd_cents)}</span>
        {s.outcome === 'failed' ? <span class="rc-fail">failed</span> : null}
      </div>
      {s.report ? <div class="rc-report prose" dangerouslySetInnerHTML={{ __html: mdToSafeHtml(s.report.length > 280 ? `${s.report.slice(0, 279)}…` : s.report) }} /> : null}
      <div class="rc-proofs">
        {s.commit_sha && repoUrl ? <a href={`${repoUrl}/commit/${s.commit_sha}`}>commit {shortSha(s.commit_sha)} ↗</a> : <span class="missing">no commit</span>}
        <a href={`/p/${enc}/sessions/${encodeURIComponent(s.key)}`}>transcript ↗</a>
        <a href={`/v1/accounts/${enc}/calls`}>calls ↗</a>
      </div>
    </div>
  );
}

function Station({ item, state, enc, now, children }: { item: RoadmapItem; state: RoadmapState; enc: string; now?: boolean; children?: unknown }) {
  const phase = item.phase ? (Number.isNaN(parseInt(item.phase, 10)) ? item.phase : `P${item.phase}`) : '';
  const word = state === 'active' ? 'in progress' : state === 'done' ? 'shipped' : state === 'proposed' ? 'proposed · awaits owner' : 'queued';
  return (
    <li class={`rm-stn ${state === 'queued' ? 'planned' : state}${now ? ' is-now' : ''}`}>
      <span class="rm-node" aria-hidden="true" />
      <div class="rm-stnbody">
        <div class="rm-shead">
          <a class="rm-stitle" href={`/p/${enc}/items/${encodeURIComponent(item.id)}`}>{item.title}</a>
          {now ? <span class="rm-now">now</span> : null}
          {phase ? <span class="rm-sphase">{phase}</span> : null}
          <span class="rm-sstatus">{word}</span>
        </div>
        {children}
      </div>
    </li>
  );
}

const Acceptance = ({ item }: { item: RoadmapItem }) => (item.acceptance.length ? <ul class="accept">{item.acceptance.map((l) => <li>{l}</li>)}</ul> : null);

export function Spine({ account, roadmap, scheduleJson, sessions, live, repoUrl, now }: { account: string; roadmap: Roadmap; scheduleJson?: string; sessions: SessionSummary[]; live: string[]; repoUrl?: string; now: number }) {
  const enc = encodeURIComponent(account);
  const items = roadmap.items;
  const rows = items.map((item) => ({ item, state: itemState(item) })).sort((a, b) => phaseNumber(a.item) - phaseNumber(b.item));
  const byItem = new Map<string, SessionSummary[]>();
  const known = new Set(items.map((i) => i.id));
  for (const s of sessions) if (s.item_id && known.has(s.item_id)) byItem.set(s.item_id, [...(byItem.get(s.item_id) ?? []), s]);
  // A session with no item, or whose item has since left the roadmap file, still happened.
  const orphan = sessions.filter((s) => !s.item_id || !known.has(s.item_id));
  const liveSessions = sessions.filter((s) => live.includes(s.key));
  const last = sessions.find((s) => s.status === 'ended' && s.kind === 'run');
  const schedule = parseSchedule(scheduleJson);
  const next = rows.filter((r) => r.state === 'queued');
  const proposed = rows.filter((r) => r.state === 'proposed');
  const active = rows.filter((r) => r.state === 'active');
  const done = rows.filter((r) => r.state === 'done').reverse();
  return (
    <div class="panel spine">
      <h3>Next</h3>
      <ol class="rm-spine">
        {proposed.map((r) => <Station item={r.item} state={r.state} enc={enc}><Acceptance item={r.item} /></Station>)}
        {next.map((r) => <Station item={r.item} state={r.state} enc={enc}><Acceptance item={r.item} /></Station>)}
        {!proposed.length && !next.length ? <li class="empty">Nothing queued. The roadmap file decides what comes next.</li> : null}
      </ol>
      <h3>Now</h3>
      {liveSessions.length ? liveSessions.map((s) => (
        <div class="livebox">
          <div class="lb-head" data-live-session={s.key} data-account={account}><span class="live"><span class="pulse" /></span><b>{s.source ?? s.kind}</b> · {s.item_id ? <a href={`/p/${enc}/items/${encodeURIComponent(s.item_id)}`}>{s.item_id}</a> : s.title ?? ''} · in progress · {fmtDur(s.started_at, undefined, now)} · <span data-live-turns>{s.turn_count}</span> turns · <span data-live-tools>{s.tool_calls}</span> tools</div>
          <a class="docmore" href={`/p/${enc}/sessions/${encodeURIComponent(s.key)}`}>Follow the session →</a>
        </div>
      )) : (
        <div class="schedbox">
          {schedule.length ? schedule.map((j) => <div class="sched"><b>{j.name ?? 'job'}</b> · fires {j.schedule ?? '?'}{j.deliver ? ` · reports to ${j.deliver}` : ''}</div>) : <div class="sched">No schedule committed.</div>}
          {last ? <div class="sched last">last run {fmtWhen(last.started_at)}: {outcomeWord(last)}{last.item_id ? ` · ${last.item_id}` : ''}{last.commit_sha && repoUrl ? <> · <a href={`${repoUrl}/commit/${last.commit_sha}`}>{shortSha(last.commit_sha)} ↗</a></> : null} · <a href={`/p/${enc}/sessions/${encodeURIComponent(last.key)}`}>receipt ↗</a></div> : <div class="sched last">no run yet</div>}
        </div>
      )}
      {active.length ? <ol class="rm-spine">{active.map((r) => <Station item={r.item} state={r.state} enc={enc} now><Acceptance item={r.item} />{(byItem.get(r.item.id) ?? []).map((s) => <Receipt s={s} enc={enc} repoUrl={repoUrl} now={now} />)}</Station>)}</ol> : null}
      <h3>Done</h3>
      <ol class="rm-spine">
        {done.map((r) => { const receipts = byItem.get(r.item.id) ?? []; return <Station item={r.item} state={r.state} enc={enc}>{receipts.length ? receipts.map((s) => <Receipt s={s} enc={enc} repoUrl={repoUrl} now={now} />) : <div class="rc-none">shipped by the maintainer · no agent session</div>}</Station>; })}
        {!done.length ? <li class="empty">Nothing shipped yet.</li> : null}
      </ol>
      {orphan.length ? <><h3>Other sessions</h3>{orphan.map((s) => <Receipt s={s} enc={enc} repoUrl={repoUrl} now={now} />)}</> : null}
      {repoUrl ? <a class="docmore" href={`${repoUrl}/blob/HEAD/ROADMAP.yml`}>The roadmap file →</a> : null}
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
        <p class="meta" data-session-meta>{live ? <><span class="live"><span class="pulse" /></span> in progress · {fmtDur(s.started_at, undefined, now)}</> : <>{s.outcome === 'failed' ? '✕ failed' : s.outcome === 'done' ? '✓ completed' : '· ended'} · {fmtDur(s.started_at, s.ended_at, now)}</>} · started {fmtAgo(s.started_at, now)} · <span data-turns>{s.turn_count}</span> turns · <span data-tools>{tools}</span> tool calls · <span data-cents>{usd(s.usd_cents)}</span> over {s.calls} calls</p>
      </div>
      {s.report ? <div class="panel"><h3>Report (the agent's own words)</h3><div class="report prose" dangerouslySetInnerHTML={{ __html: mdToSafeHtml(s.report) }} /></div> : null}
      <div class="panel">
        <h3>Proofs</h3>
        <ul class="proofs">
          <li>commit {s.commit_sha && repoUrl ? <a href={`${repoUrl}/commit/${s.commit_sha}`}>{shortSha(s.commit_sha)} ↗</a> : <span class="missing">{live ? 'not yet' : 'none recorded'}</span>}</li>
          <li>transcript · this page · {s.turns.length} of {s.turn_count} turns kept</li>
          <li>calls · <a href={`/v1/accounts/${enc}/calls`}>the audit trail ↗</a></li>
        </ul>
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
  const word = state === 'active' ? 'in progress' : state === 'done' ? 'shipped' : state === 'proposed' ? 'proposed · awaits owner' : state ? 'queued' : 'not on the roadmap file';
  const turns = view.sessions.reduce((n, s) => n + s.turn_count, 0);
  return (
    <div class="wrap">
      <p class="crumb"><a href={`/p/${enc}`}>← {account}</a></p>
      <div class="panel jobhead" data-item={view.item_id} data-account={account} data-live={view.live.length ? '1' : ''} data-sessions={String(view.sessions.length)} data-updates={String(view.updates.length)}>
        <h1><span class="item">{view.item_id}</span>{item ? <> · {item.title}</> : null}</h1>
        <p class="meta">{word}{item?.phase ? ` · phase ${item.phase}` : ''} · <span data-item-sessions>{view.sessions.length}</span> session{view.sessions.length === 1 ? '' : 's'} · <span data-item-turns>{turns}</span> turns · <span data-item-updates>{view.updates.length}</span> update{view.updates.length === 1 ? '' : 's'} · <span data-item-cents>{usd(view.usd_cents)}</span> settled{view.live.length ? <> · <span class="live"><span class="pulse" /></span> {view.live.length} live</> : null}</p>
        {item?.acceptance.length ? <ul class="accept">{item.acceptance.map((l) => <li>{l}</li>)}</ul> : null}
      </div>
      <div class="panel">
        <h3>Sessions</h3>
        {view.sessions.length ? view.sessions.map((s) => <Receipt s={s} enc={enc} repoUrl={repoUrl} now={now} />) : <p class="sub">No session has worked this item yet.</p>}
      </div>
      <div class="panel">
        <h3>Updates</h3>
        {view.updates.length ? <ul class="updates">{view.updates.map((u: UpdateRecord) => <li><span class="u-when">{fmtAgo(u.ts, now)}</span><div class="u-text prose" dangerouslySetInnerHTML={{ __html: mdToSafeHtml(u.text) }} />{u.session ? <a class="u-sess" href={`/p/${enc}/sessions/${encodeURIComponent(u.session)}`}>from session ↗</a> : null}</li>)}</ul> : <p class="sub">No updates posted on this item.</p>}
      </div>
      <p class="note">Settled cents are the metered calls that landed while a session on this item was the only one live; the <a href={`/v1/accounts/${enc}/calls`}>audit trail</a> is the full record.</p>
    </div>
  );
}

// ---- Setup: who the agent is and how it runs, read from its checked-in home ------------------------------
export interface AgentSetup { model?: string; provider?: string }
export function parseAgentConfig(yaml: string | undefined): AgentSetup {
  if (!yaml) return {};
  const out: AgentSetup = {};
  let inModel = false;
  for (const raw of yaml.split('\n')) {
    if (/^\S/.test(raw)) inModel = /^model:\s*$/.test(raw);
    else if (inModel) { const m = /^\s+(default|provider):\s*(.+?)\s*$/.exec(raw); if (m) out[m[1] === 'default' ? 'model' : 'provider'] = m[2].replace(/^["']|["']$/g, ''); }
  }
  return out;
}
export function leadParagraphs(md: string | undefined, max = 2): string {
  if (!md) return '';
  return md.split('\n').filter((l) => !/^#/.test(l)).join('\n').trim().split(/\n{2,}/).slice(0, max).join('\n\n').trim();
}
export function SetupPanel({ setupMd, soulMd, configYaml, scheduleJson, repoUrl }: { setupMd?: string; soulMd?: string; configYaml?: string; scheduleJson?: string; repoUrl?: string }) {
  const soul = leadParagraphs(soulMd, 2);
  const setup = leadParagraphs(setupMd, 2);
  const cfg = parseAgentConfig(configYaml);
  const jobs = parseSchedule(scheduleJson);
  if (!soul && !setup && !cfg.model) return null;
  const file = (path: string) => (repoUrl ? `${repoUrl}/blob/HEAD/hermes/${path}` : undefined);
  return (
    <div class="panel" id="setup">
      <h3>Setup</h3>
      <p class="note">Everything the agent is lives in the repository's <a href={repoUrl ? `${repoUrl}/tree/HEAD/hermes` : '#'}>hermes/</a> home, checked in. This page reads it; nothing here drives the agent.</p>
      <div class="facts">
        {cfg.model ? <div class="fact"><span class="k">model</span><span class="v">{cfg.model}</span></div> : null}
        <div class="fact"><span class="k">calls</span><span class="v">through the platform on the project's key, every one metered</span></div>
        {jobs.length ? <div class="fact"><span class="k">schedule</span><span class="v">{jobs.map((j) => `${j.name ?? 'job'} · ${j.schedule ?? '?'}`).join(' · ')}</span></div> : null}
      </div>
      {soul ? <><h4>Who it is <a class="filelink" href={file('SOUL.md')}>SOUL.md</a></h4><div class="prose" dangerouslySetInnerHTML={{ __html: mdToSafeHtml(soul) }} /></> : null}
      {setup ? <><h4>How it runs <a class="filelink" href={file('README.md')}>hermes/README.md</a></h4><div class="prose" dangerouslySetInnerHTML={{ __html: mdToSafeHtml(setup) }} /></> : null}
      {repoUrl ? <a class="docmore" href={file('config.yaml')}>The model config →</a> : null}
    </div>
  );
}

// The page-side half of the live channels. On a session page or the spine's live box: EventSource over the
// session's SSE route, turns appended as rows, status updating the header, a reload once it ends. On an
// item page: EventSource over the item's route, counters updating and a reload when what touched the item
// changes shape. Follows the log unless the reader has scrolled up.
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
