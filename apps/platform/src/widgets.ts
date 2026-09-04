import { itemState, phaseNumber, type RoadmapItem, type RoadmapState } from '@open-autonomy/sdk/roadmap';
import type { FundingSnapshot, SessionSummary } from './ledger.js';
import { fmtDur, fmtWhen, shortSha } from './ui.js';

// The README widgets: self-contained, Camo-safe SVGs (no scripts, no animation, no external references)
// rendered from the same data as the site. GitHub's Camo proxy caches them for minutes.

const W = 460;
const FONT = '-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif';
const MONO = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';
const C = { bg: '#0d1117', border: '#30363d', track: '#21262d', text: '#e6edf3', muted: '#8b949e', green: '#3fb950', blue: '#58a6ff', amber: '#d29922', red: '#f85149', gray: '#6e7681' };
const esc = (s: string): string => s.replace(/[<>&'"]/g, (c) => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === "'" ? '&apos;' : '&quot;'));
const usd = (cents: number): string => `$${(cents / 100).toFixed(2)}`;
const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const fmtDays = (d: number) => (d > 9999 ? '9999+' : String(Math.max(0, Math.round(d))));

function frame(h: number, label: string, title: string, body: string, dot?: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}" viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(label)}: ${esc(title)}">
  <rect x="0.5" y="0.5" width="${W - 1}" height="${h - 1}" rx="11" fill="${C.bg}" stroke="${C.border}"/>
  ${dot ? `<circle cx="21" cy="22" r="5" fill="${dot}"/>` : ''}
  <text x="${dot ? 34 : 16}" y="26" font-family="${FONT}" font-size="14" font-weight="700" fill="${C.text}">${esc(clip(title, dot ? 52 : 56))}</text>
  <text x="${W - 16}" y="26" text-anchor="end" font-family="${FONT}" font-size="11" font-weight="600" fill="${C.muted}">${esc(label)}</text>
${body}
</svg>`;
}

export function renderRunwaySvg(f: FundingSnapshot): string {
  const budget = f.granted_in_usd_cents - f.granted_out_usd_cents;
  const remaining = f.balance_usd_cents;
  let color = C.gray, frac = 0, headline: string, sub: string, note: string;
  if (!f.funded || budget <= 0) {
    headline = 'Not yet funded'; sub = 'Sponsor to start funding the agent'; note = 'runway = balance ÷ a Bayesian estimate of daily spend';
  } else if (f.paused || remaining <= 0) {
    color = C.red; headline = 'Funding needed — agent paused'; sub = `${usd(0)} left of ${usd(budget)} sponsored`; note = 'add funds to resume';
  } else {
    frac = Math.max(0.02, Math.min(1, remaining / budget));
    color = frac > 0.25 ? C.green : C.amber;
    headline = `${usd(remaining)} left of ${usd(budget)}`;
    const days = f.runway_days !== null ? fmtDays(f.runway_days) : '?';
    const lo = f.runway_lo_days !== null ? fmtDays(f.runway_lo_days) : '?';
    const hi = f.runway_hi_days !== null ? fmtDays(f.runway_hi_days) : '?';
    sub = `~${days} days of runway · ~${usd(f.burn_per_day_usd_cents)}/day`;
    note = `Bayesian: posterior $/day from ${f.days_observed}d + prior · 80% CI ${lo}–${hi} days`;
  }
  const padX = 16, barY = 52, barW = W - padX * 2, fillW = Math.round(barW * frac);
  const body = [
    `  <rect x="${padX}" y="${barY}" width="${barW}" height="12" rx="6" fill="${C.track}"/>`,
    fillW > 0 ? `  <rect x="${padX}" y="${barY}" width="${fillW}" height="12" rx="6" fill="${color}"/>` : '',
    `  <text x="${padX}" y="${barY + 28}" font-family="${MONO}" font-size="11" fill="${C.muted}">${esc(sub)}</text>`,
    `  <text x="${padX}" y="${barY + 46}" font-family="${MONO}" font-size="9" fill="${C.gray}">${esc(note)}</text>`,
  ].filter(Boolean).join('\n');
  return frame(116, '⛽ funding', headline, body, color);
}

const STATE_COLOR: Record<RoadmapState, string> = { done: C.green, active: C.blue, queued: C.gray, proposed: C.gray };
const STATE_WORD: Record<RoadmapState, string> = { done: 'shipped', active: 'in progress', queued: 'queued', proposed: 'proposed' };
const MAX_ROWS = 8;

// The roadmap as a station list: phase-ordered committed items, the earliest active marked "now",
// proposed candidates folded into one trailing count.
export function renderRoadmapSvg(items: RoadmapItem[]): string {
  const rows = items.map((item) => ({ item, state: itemState(item) }));
  const committed = rows.filter((r) => r.state !== 'proposed').sort((a, b) => phaseNumber(a.item) - phaseNumber(b.item));
  const proposed = rows.length - committed.length;
  const count = (s: RoadmapState): number => committed.filter((r) => r.state === s).length;
  const shown = committed.slice(0, MAX_ROWS);
  const frontier = committed.find((r) => r.state === 'active');
  const title = committed.length ? `${count('done')} shipped · ${count('active')} in progress · ${count('queued')} queued` : 'No roadmap yet';
  const lines: string[] = [];
  let y = 52;
  for (const r of shown) {
    const phase = r.item.phase ? `P${esc(r.item.phase)}` : '';
    const now = frontier && r.item.id === frontier.item.id;
    const right = `${phase ? `${phase} · ` : ''}${STATE_WORD[r.state]}${now ? ' · now' : ''}`;
    const titleChars = Math.max(12, Math.floor((W - 34 - 16 - right.length * 6.2 - 12) / 6.6));
    lines.push(`  <circle cx="22" cy="${y - 4}" r="4" fill="${STATE_COLOR[r.state]}"/>`);
    lines.push(`  <text x="34" y="${y}" font-family="${FONT}" font-size="12" fill="${C.text}">${esc(clip(r.item.title, titleChars))}</text>`);
    lines.push(`  <text x="${W - 16}" y="${y}" text-anchor="end" font-family="${MONO}" font-size="10" fill="${now ? C.blue : C.muted}">${esc(right)}</text>`);
    y += 20;
  }
  const foot: string[] = [];
  if (committed.length - shown.length > 0) foot.push(`+${committed.length - shown.length} more`);
  if (proposed > 0) foot.push(`${proposed} proposed`);
  if (foot.length) { lines.push(`  <text x="34" y="${y}" font-family="${MONO}" font-size="10" fill="${C.gray}">${esc(foot.join(' · '))}</text>`); y += 20; }
  return frame(Math.max(72, y - 4), '🗺 roadmap', title, lines.join('\n'));
}

const DAYS = 14;
function ago(iso: string | null, now: number): string {
  if (!iso) return 'no calls yet';
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const m = Math.round(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

// Spend per day over two weeks as bars, the running call count, and when the agent last spoke.
export function renderActivitySvg(f: FundingSnapshot, now = Date.now()): string {
  const series = f.daily_spend_usd_cents.slice(-DAYS);
  const padded = [...new Array(Math.max(0, DAYS - series.length)).fill(0), ...series];
  const max = Math.max(1, ...padded);
  const week = padded.slice(-7).reduce((a, b) => a + b, 0);
  const title = `${f.calls_total.toLocaleString('en-US')} metered call${f.calls_total === 1 ? '' : 's'} · ${usd(week)} this week`;
  const padX = 16, chartW = W - padX * 2, barW = Math.floor(chartW / DAYS) - 4, baseY = 88, chartH = 36;
  const bars = padded.map((v, i) => {
    const h = v > 0 ? Math.max(2, Math.round((v / max) * chartH)) : 1;
    return `  <rect x="${padX + i * (barW + 4)}" y="${baseY - h}" width="${barW}" height="${h}" rx="2" fill="${v > 0 ? C.blue : C.track}"/>`;
  });
  const sub = `last call ${ago(f.last_call_at, now)} · ~${usd(f.burn_per_day_usd_cents)}/day`;
  return frame(116, '⚡ activity', title, [...bars, `  <text x="${padX}" y="106" font-family="${MONO}" font-size="10" fill="${C.muted}">${esc(sub)}</text>`].join('\n'));
}

export interface ScheduleJob { name?: string; schedule?: string; deliver?: string }
export function parseSchedule(json: string | undefined): ScheduleJob[] {
  if (!json) return [];
  try { const d = JSON.parse(json) as { jobs?: unknown }; return Array.isArray(d.jobs) ? d.jobs.filter((j): j is ScheduleJob => !!j && typeof j === 'object') : []; } catch { return []; }
}

// What the agent is doing now: the live sessions, else the schedule and the last run.
export function renderNowSvg(sessions: SessionSummary[], live: string[], scheduleJson: string | undefined, now = Date.now()): string {
  const liveSessions = sessions.filter((s) => live.includes(s.key));
  const first = liveSessions[0];
  const last = sessions.find((s) => s.status === 'ended' && s.kind === 'run');
  const sched = parseSchedule(scheduleJson)[0];
  const title = first
    ? `${first.source ?? first.kind} · running ${fmtDur(first.started_at, undefined, now)}${first.item_id ? ` · ${first.item_id}` : ''}${liveSessions.length > 1 ? ` · +${liveSessions.length - 1} live` : ''}`
    : sched ? `${sched.name ?? 'agent'} · fires ${sched.schedule ?? '?'}` : 'no schedule committed';
  const sub = first
    ? `${first.turn_count} turns · ${first.tool_calls} tool calls · ${usd(first.usd_cents)} so far`
    : last ? `last run ${fmtWhen(last.started_at)} · ${last.outcome ?? 'ended'}${last.item_id ? ` · ${last.item_id}` : ''}${last.commit_sha ? ` · ${shortSha(last.commit_sha)}` : ''}` : 'no runs yet';
  const color = first ? C.blue : last?.outcome === 'failed' ? C.red : C.green;
  return frame(72, '⏱ now', title, `  <text x="16" y="54" font-family="${MONO}" font-size="11" fill="${C.muted}">${esc(clip(sub, 66))}</text>`, color);
}
