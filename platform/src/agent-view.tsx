// The "what the agent is doing, did, and will do" surfaces: one spine with three bands (NEXT / NOW / DONE),
// the run page (a receipt with its proofs and transcript), and the README "now" widget. Every sentence here
// is a roadmap line, a run report, a transcript turn, or a commit — never the platform's own words — and every
// element links to its source. Structure borrowed from GitHub Projects (NEXT), the Actions log (NOW/run page)
// and the Vercel deployment card (DONE receipts); nothing is styled in a new vocabulary.
import type { JobRecord, JobSummary, JobTurn } from './limit-ledger.js';
import { mdToSafeHtml, parseRoadmap, roadmapItemState, type RoadmapItem, type RoadmapState } from './project-docs.js';
import { Icon } from './ui/Icon.js';
import { render } from './ui/render.js';

export interface ScheduleJob { name?: string; schedule?: string; deliver?: string; prompt?: string; skills?: string[] }
export function parseSchedule(json: string | undefined): ScheduleJob[] {
  if (!json) return [];
  try {
    const d = JSON.parse(json) as { jobs?: unknown };
    return Array.isArray(d.jobs) ? d.jobs.filter((j): j is ScheduleJob => !!j && typeof j === 'object') : [];
  } catch { return []; }
}

const fmtWhen = (iso: string | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toISOString().slice(5, 16).replace('T', ' ') + ' UTC';
};
const fmtDur = (a: string | undefined, b: string | undefined, now: number): string => {
  const s = a ? Date.parse(a) : NaN; const e = b ? Date.parse(b) : now;
  if (!Number.isFinite(s) || !Number.isFinite(e)) return '';
  const m = Math.max(0, Math.round((e - s) / 60_000));
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
};
const short = (sha: string | undefined): string => (sha ? sha.slice(0, 7) : '');
// Relative time the way GitHub's relative-time renders it: "3 minutes ago", "2 hours ago", "yesterday", else the date.
export const fmtAgo = (iso: string | undefined, now: number): string => {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24); if (d === 1) return 'yesterday'; if (d < 14) return `${d} days ago`;
  return fmtWhen(iso);
};
const toolLine = (t: JobTurn): string => {
  if (!t.tool) return '';
  try {
    const a = t.args ? JSON.parse(t.args) as Record<string, unknown> : {};
    const v = a.path ?? a.command ?? a.pattern ?? a.query ?? Object.values(a)[0];
    return typeof v === 'string' ? v.slice(0, 140) : (t.args ?? '').slice(0, 140);
  } catch { return (t.args ?? '').slice(0, 140); }
};

// ---- receipts -------------------------------------------------------------------------------------------
function Receipt({ job, enc, repoUrl, now }: { job: JobSummary; enc: string; repoUrl?: string; now: number }) {
  const running = job.status === 'running';
  const cls = job.status === 'failed' ? 'failed' : running ? 'running' : 'done';
  return (
    <div class={`receipt ${cls}`}>
      <div class="rc-head">
        <span class="rc-when">{running ? `in progress · ${fmtDur(job.started_at, undefined, now)}` : `${fmtAgo(job.ended_at ?? job.started_at, now)} · ${fmtDur(job.started_at, job.ended_at, now)}`}</span>
        <span class="rc-stat">{job.turn_count} turns · {job.tool_calls} tools</span>
        {job.status === 'failed' ? <span class="rc-fail">failed</span> : null}
      </div>
      {job.report ? <div class="rc-report prose" dangerouslySetInnerHTML={{ __html: mdToSafeHtml(job.report.length > 280 ? `${job.report.slice(0, 279)}…` : job.report) }} /> : null}
      <div class="rc-proofs">
        {job.commit_sha && repoUrl ? <a href={`${repoUrl}/commit/${job.commit_sha}`}>commit {short(job.commit_sha)} ↗</a> : <span class="missing">no commit</span>}
        <a href={`/p/${enc}/jobs/${encodeURIComponent(job.key)}`}>transcript ↗</a>
        <a href={`/v1/accounts/${enc}/calls`}>calls ↗</a>
      </div>
    </div>
  );
}

function Station({ item, state, now, children }: { item: RoadmapItem; state: RoadmapState; now?: boolean; children?: unknown }) {
  const cls = state === 'in_progress' ? 'active' : state === 'parked' ? 'planned' : state;
  const phase = item.phase ? (isNaN(parseInt(item.phase, 10)) ? item.phase : `P${item.phase}`) : '';
  const word = state === 'in_progress' ? 'in progress' : state === 'done' ? 'shipped' : state === 'proposed' ? 'proposed · awaits owner' : 'queued';
  return (
    <li class={`rm-stn ${cls}${now ? ' is-now' : ''}`}>
      <span class="rm-node" aria-hidden="true" />
      <div class="rm-stnbody">
        <div class="rm-shead">
          <span class="rm-stitle">{item.title}</span>
          {now ? <span class="rm-now">now</span> : null}
          {phase ? <span class="rm-sphase">{phase}</span> : null}
          <span class="rm-sstatus">{word}</span>
        </div>
        {children}
      </div>
    </li>
  );
}

function Acceptance({ yml, id }: { yml: string; id: string }) {
  // The item's acceptance lines, verbatim from ROADMAP.yml (the agent's own definition of done).
  const block = yml.split(/\n(?=  - id: )/).find((b) => b.includes(`- id: ${id}\n`) || b.startsWith(`- id: ${id}\n`) || b.includes(`- id: ${id}\r`));
  const lines = block ? [...block.matchAll(/^\s{6}- (.+)$/gm)].map((m) => m[1]) : [];
  return lines.length ? <ul class="accept">{lines.map((l) => <li>{l}</li>)}</ul> : null;
}

export function Spine({ account, yml, scheduleJson, jobs, current, repoUrl, now }: { account: string; yml: string; scheduleJson?: string; jobs: JobSummary[]; current?: string; repoUrl?: string; now: number }) {
  const enc = encodeURIComponent(account);
  const items = parseRoadmap(yml);
  const phaseNum = (i: RoadmapItem): number => { const n = parseInt(i.phase ?? '', 10); return isNaN(n) ? Number.MAX_SAFE_INTEGER : n; };
  const rows = items.map((item) => ({ item, state: roadmapItemState(item) })).sort((a, b) => phaseNum(a.item) - phaseNum(b.item));
  const byItem = new Map<string, JobSummary[]>();
  for (const j of jobs) if (j.item_id) byItem.set(j.item_id, [...(byItem.get(j.item_id) ?? []), j]);
  const orphan = jobs.filter((j) => !j.item_id);
  const live = current ? jobs.find((j) => j.key === current) : undefined;
  const last = jobs.find((j) => j.status !== 'running');
  const schedule = parseSchedule(scheduleJson);
  const next = rows.filter((r) => r.state === 'parked');
  const proposed = rows.filter((r) => r.state === 'proposed');
  const active = rows.filter((r) => r.state === 'in_progress');
  const done = rows.filter((r) => r.state === 'done').reverse();
  return (
    <div class="panel spine">
      <h3>Next</h3>
      <ol class="rm-spine">
        {proposed.map((r) => <Station item={r.item} state={r.state}><Acceptance yml={yml} id={r.item.id} /></Station>)}
        {next.map((r) => <Station item={r.item} state={r.state}><Acceptance yml={yml} id={r.item.id} /></Station>)}
        {!proposed.length && !next.length ? <li class="empty">Nothing queued. The roadmap file decides what comes next.</li> : null}
      </ol>
      <h3>Now</h3>
      {live ? (
        <div class="livebox">
          <div class="lb-head" data-live-job={live.key} data-account={account}><span class="live"><span class="pulse" /></span><b>{live.job_name ?? 'agent'}</b> · {live.item_id ?? live.title ?? ''} · in progress · {fmtDur(live.started_at, undefined, now)} · <span data-live-turns>{live.turn_count}</span> turns · <span data-live-tools>{live.tool_calls}</span> tools</div>
          <a class="docmore" href={`/p/${enc}/jobs/${encodeURIComponent(live.key)}`}>Follow the run →</a>
        </div>
      ) : (
        <div class="schedbox">
          {schedule.length ? schedule.map((j) => <div class="sched"><b>{j.name ?? 'job'}</b> · fires {j.schedule ?? '?'}{j.deliver ? ` · reports to ${j.deliver}` : ''}</div>) : <div class="sched">No schedule committed.</div>}
          {last ? <div class="sched last">last run {fmtWhen(last.started_at)}: {last.status === 'failed' ? 'failed' : 'done'}{last.item_id ? ` · ${last.item_id}` : ''}{last.commit_sha && repoUrl ? <> · <a href={`${repoUrl}/commit/${last.commit_sha}`}>{short(last.commit_sha)} ↗</a></> : null} · <a href={`/p/${enc}/jobs/${encodeURIComponent(last.key)}`}>receipt ↗</a></div> : null}
        </div>
      )}
      {active.length ? <ol class="rm-spine">{active.map((r) => <Station item={r.item} state={r.state} now><Acceptance yml={yml} id={r.item.id} />{(byItem.get(r.item.id) ?? []).map((j) => <Receipt job={j} enc={enc} repoUrl={repoUrl} now={now} />)}</Station>)}</ol> : null}
      <h3>Done</h3>
      <ol class="rm-spine">
        {done.map((r) => {
          const receipts = byItem.get(r.item.id) ?? [];
          return <Station item={r.item} state={r.state}>{receipts.length ? receipts.map((j) => <Receipt job={j} enc={enc} repoUrl={repoUrl} now={now} />) : <div class="rc-none">shipped by the maintainer · no agent run</div>}</Station>;
        })}
        {!done.length ? <li class="empty">Nothing shipped yet.</li> : null}
      </ol>
      {orphan.length ? <><h3>Other runs</h3>{orphan.map((j) => <Receipt job={j} enc={enc} repoUrl={repoUrl} now={now} />)}</> : null}
      {repoUrl ? <a class="docmore" href={`${repoUrl}/blob/HEAD/ROADMAP.yml`}>The roadmap file →</a> : null}
    </div>
  );
}

// ---- the run page ---------------------------------------------------------------------------------------
function Turn({ t }: { t: JobTurn }) {
  const ts = t.ts ? new Date(t.ts).toISOString().slice(11, 19) : '';
  if (t.role === 'assistant' && t.tool) return <div class="turn tool"><span class="ts">{ts}</span><span class="tn">{t.tool}</span><span class="ta">{toolLine(t)}</span></div>;
  if (t.role === 'tool') return <details class="turn result"><summary><span class="ts">{ts}</span><span class="tn">↳ {t.tool ?? 'result'}</span><span class="ta">{(t.result ?? '').slice(0, 90)}</span></summary><pre>{t.result ?? ''}</pre></details>;
  if (t.role === 'assistant') return <div class="turn say"><span class="ts">{ts}</span><div class="tx">{t.text ?? ''}</div></div>;
  if (t.role === 'user') return <details class="turn user"><summary><span class="ts">{ts}</span><span class="tn">prompt</span><span class="ta">{(t.text ?? '').slice(0, 90)}</span></summary><pre>{t.text ?? ''}</pre></details>;
  return null;
}

export function JobPage({ account, job, repoUrl, now }: { account: string; job: JobRecord; repoUrl?: string; now: number }) {
  const enc = encodeURIComponent(account);
  const running = job.status === 'running';
  const tools = job.turns.filter((t) => t.role === 'assistant' && t.tool).length;
  return (
    <div class="wrap">
      <p class="crumb"><a href={`/p/${enc}`}>← {account}</a></p>
      <div class="panel jobhead">
        <h1>{job.job_name ?? 'agent'}{job.item_id ? <> · <span class="item">{job.item_id}</span></> : null}</h1>
        <p class="meta" data-job-meta>{running ? <><span class="live"><span class="pulse" /></span> in progress · {fmtDur(job.started_at, undefined, now)}</> : <>{job.status === 'failed' ? '✕ failed' : '✓ completed'} · {fmtDur(job.started_at, job.ended_at, now)}</>} · started {fmtAgo(job.started_at, now)} · <span data-turns>{job.turn_count}</span> turns · <span data-tools>{tools}</span> tool calls</p>
      </div>
      {job.report ? <div class="panel"><h3>Report (the agent's own words)</h3><div class="report prose" dangerouslySetInnerHTML={{ __html: mdToSafeHtml(job.report) }} /></div> : null}
      <div class="panel">
        <h3>Proofs</h3>
        <ul class="proofs">
          <li>commit {job.commit_sha && repoUrl ? <a href={`${repoUrl}/commit/${job.commit_sha}`}>{short(job.commit_sha)} ↗</a> : <span class="missing">{running ? 'not yet' : 'none recorded'}</span>}</li>
          <li>transcript · this page · {job.turns.length} of {job.turn_count} turns kept</li>
          <li>calls · <a href={`/v1/accounts/${enc}/calls`}>the audit trail ↗</a></li>
        </ul>
      </div>
      <div class="panel">
        <h3>Transcript</h3>
        <div class="turns" data-turns-list data-last-seq={String(job.turns.length ? job.turns[job.turns.length - 1].seq ?? -1 : -1)}>{job.turns.map((t) => <Turn t={t} />)}</div>
        {running ? <p class="note" data-live-note>Live: new turns append as the agent works; the page stays where you scrolled unless you are at the bottom.</p> : null}
      </div>
    </div>
  );
}

export function jobPageHtml(account: string, job: JobRecord, repoUrl: string | undefined, now: number): string {
  return render(<JobPage account={account} job={job} repoUrl={repoUrl} now={now} />);
}

// The page-side half of the live channel: EventSource over the job's SSE route. Turns append as rows (same
// markup as the server renders), status updates the header, and a finished job reloads once so the receipt
// renders server-side. Follows the log unless the reader has scrolled up (the Actions log-viewer rule).
export const LIVE_SCRIPT = `(() => {
  const list = document.querySelector('[data-turns-list]');
  const box = document.querySelector('[data-live-job]');
  const path = location.pathname.match(/^\\/p\\/(.+?)\\/jobs\\/([^/]+)$/);
  const account = box ? box.getAttribute('data-account') : path && decodeURIComponent(path[1]);
  const key = box ? box.getAttribute('data-live-job') : path && decodeURIComponent(path[2]);
  if (!account || !key || !('EventSource' in window)) return;
  const enc = encodeURIComponent;
  const after = list ? list.getAttribute('data-last-seq') : '-1';
  const es = new EventSource('/v1/accounts/' + enc(account) + '/jobs/' + enc(key) + '/events?after=' + after);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
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
    if (s.status !== 'running') { es.close(); setTimeout(() => location.reload(), 800); }
  });
  es.onerror = () => { /* EventSource reconnects with Last-Event-ID on its own */ };
})();`;
export function spineHtml(props: Parameters<typeof Spine>[0]): string {
  return render(<Spine {...props} />);
}

// ---- README widget: now ----------------------------------------------------------------------------------
const W = 460;
const esc = (s: string): string => s.replace(/[<>&'"]/g, (c) => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === "'" ? '&apos;' : '&quot;'));
export function renderNowSvg(jobs: JobSummary[], current: string | undefined, scheduleJson: string | undefined, now = Date.now()): string {
  const live = current ? jobs.find((j) => j.key === current) : undefined;
  const last = jobs.find((j) => j.status !== 'running');
  const sched = parseSchedule(scheduleJson)[0];
  const title = live
    ? `${live.job_name ?? 'agent'} · running ${fmtDur(live.started_at, undefined, now)}${live.item_id ? ` · ${live.item_id}` : ''}`
    : sched ? `${sched.name ?? 'agent'} · fires ${sched.schedule ?? '?'}` : 'no schedule committed';
  const sub = live
    ? `${live.turn_count} turns · ${live.tool_calls} tool calls so far`
    : last ? `last run ${fmtWhen(last.started_at)} · ${last.status === 'failed' ? 'failed' : 'done'}${last.item_id ? ` · ${last.item_id}` : ''}${last.commit_sha ? ` · ${short(last.commit_sha)}` : ''}` : 'no runs yet';
  const color = live ? '#58a6ff' : last?.status === 'failed' ? '#f85149' : '#3fb950';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="72" viewBox="0 0 ${W} 72" role="img" aria-label="now: ${esc(title)}">
  <rect x="0.5" y="0.5" width="${W - 1}" height="71" rx="11" fill="#0d1117" stroke="#30363d"/>
  <circle cx="21" cy="22" r="5" fill="${color}"/>
  <text x="34" y="26" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif" font-size="14" font-weight="700" fill="#e6edf3">${esc(title.length > 52 ? `${title.slice(0, 51)}…` : title)}</text>
  <text x="${W - 16}" y="26" text-anchor="end" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif" font-size="11" font-weight="600" fill="#8b949e">⏱ now</text>
  <text x="16" y="54" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="11" fill="#8b949e">${esc(sub.length > 66 ? `${sub.slice(0, 65)}…` : sub)}</text>
</svg>`;
}

// ---- Setup: who the agent is and how it runs, read from its checked-in Hermes home -----------------------
// Visualization only: the pane reads hermes/ (README, SOUL, config, schedule) and nothing on it drives the agent.

export interface AgentSetup { model?: string; provider?: string }
// The two facts the page states from hermes/config.yaml: the `model:` block's `default` and `provider`.
// A tolerant line parser (no YAML dependency in the worker): keys directly under `model:`.
export function parseAgentConfig(yaml: string | undefined): AgentSetup {
  if (!yaml) return {};
  const out: AgentSetup = {};
  let inModel = false;
  for (const raw of yaml.split('\n')) {
    if (/^\S/.test(raw)) inModel = /^model:\s*$/.test(raw);
    else if (inModel) {
      const m = /^\s+(default|provider):\s*(.+?)\s*$/.exec(raw);
      if (m) out[m[1] as 'default' | 'provider' === 'default' ? 'model' : 'provider'] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return out;
}
// The opening paragraphs of a markdown doc (headings skipped), bounded, for a pane excerpt.
export function leadParagraphs(md: string | undefined, max = 2): string {
  if (!md) return '';
  const body = md.split('\n').filter((l) => !/^#/.test(l)).join('\n').trim();
  return body.split(/\n{2,}/).slice(0, max).join('\n\n').trim();
}

export function SetupPanel({ setupMd, soulMd, configYaml, scheduleJson, repoUrl }: { setupMd?: string; soulMd?: string; configYaml?: string; scheduleJson?: string; repoUrl?: string }) {
  const soul = leadParagraphs(soulMd, 2);
  const setup = leadParagraphs(setupMd, 2);
  const cfg = parseAgentConfig(configYaml);
  const jobs = parseSchedule(scheduleJson);
  const skills = [...new Set(jobs.flatMap((j) => j.skills ?? []))];
  if (!soul && !setup && !cfg.model) return null;
  const file = (path: string) => (repoUrl ? `${repoUrl}/blob/HEAD/hermes/${path}` : undefined);
  return (
    <div class="panel" id="setup">
      <h3>Setup</h3>
      <p class="note">Everything the agent is lives in the repository's <a href={repoUrl ? `${repoUrl}/tree/HEAD/hermes` : '#'}>hermes/</a> home, checked in. This page reads it; nothing here drives the agent.</p>
      <div class="facts">
        {cfg.model ? <div class="fact"><span class="k">model</span><span class="v">{cfg.model}</span></div> : null}
        <div class="fact"><span class="k">calls</span><span class="v">through the platform on a standing key, every one metered</span></div>
        {jobs.length ? <div class="fact"><span class="k">schedule</span><span class="v">{jobs.map((j) => `${j.name ?? 'job'} · ${j.schedule ?? '?'}`).join(' · ')}</span></div> : null}
        {skills.length ? <div class="fact"><span class="k">skills</span><span class="v">{skills.map((sk, i) => <>{i ? ', ' : ''}<a href={file(`skills`)}>{sk}</a></>)}</span></div> : null}
      </div>
      {soul ? <>
        <h4>Who it is <a class="filelink" href={file('SOUL.md')}>SOUL.md</a></h4>
        <div class="prose" dangerouslySetInnerHTML={{ __html: mdToSafeHtml(soul) }} />
      </> : null}
      {setup ? <>
        <h4>How it runs <a class="filelink" href={file('README.md')}>hermes/README.md</a></h4>
        <div class="prose" dangerouslySetInnerHTML={{ __html: mdToSafeHtml(setup) }} />
      </> : null}
      {repoUrl ? <a class="docmore" href={file('config.yaml')}>The model config →</a> : null}
    </div>
  );
}
export function renderSetupPanel(props: { setupMd?: string; soulMd?: string; configYaml?: string; scheduleJson?: string; repoUrl?: string }): string {
  return render(<SetupPanel {...props} />);
}
