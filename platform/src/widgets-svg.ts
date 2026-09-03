import type { FundingSnapshot } from './limit-ledger.js';
import { roadmapItemState, type RoadmapItem, type RoadmapState } from './project-docs.js';

// The README widget family beside the runway bar: self-contained, Camo-safe SVGs (no scripts, no
// animation, no external references) rendered from the same data the site shows. GitHub's Camo proxy
// caches them for minutes, so each carries a short cache-control (see index.ts).

const W = 460;
const FONT = '-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif';
const MONO = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';
const C = {
  bg: '#0d1117',
  border: '#30363d',
  track: '#21262d',
  text: '#e6edf3',
  muted: '#8b949e',
  green: '#3fb950',
  blue: '#58a6ff',
  amber: '#d29922',
  gray: '#6e7681',
};

function esc(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === "'" ? '&apos;' : '&quot;'));
}
const usd = (cents: number): string => `$${(cents / 100).toFixed(2)}`;
const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function frame(h: number, label: string, title: string, body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}" viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(label)}: ${esc(title)}">
  <rect x="0.5" y="0.5" width="${W - 1}" height="${h - 1}" rx="11" fill="${C.bg}" stroke="${C.border}"/>
  <text x="16" y="26" font-family="${FONT}" font-size="14" font-weight="700" fill="${C.text}">${esc(title)}</text>
  <text x="${W - 16}" y="26" text-anchor="end" font-family="${FONT}" font-size="11" font-weight="600" fill="${C.muted}">${esc(label)}</text>
${body}
</svg>`;
}

const STATE_COLOR: Record<RoadmapState, string> = { done: C.green, in_progress: C.blue, parked: C.gray, proposed: C.gray };
const STATE_WORD: Record<RoadmapState, string> = { done: 'shipped', in_progress: 'in progress', parked: 'queued', proposed: 'proposed' };
const MAX_ROWS = 8;

// The roadmap as a station list: phase-ordered committed items (shipped / in progress / queued), the
// earliest in-progress item marked "now", proposed candidates folded into one trailing count.
export function renderRoadmapSvg(items: RoadmapItem[]): string {
  const phaseNum = (i: RoadmapItem): number => { const n = parseInt(i.phase ?? '', 10); return isNaN(n) ? Number.MAX_SAFE_INTEGER : n; };
  const rows = items.map((item) => ({ item, state: roadmapItemState(item) }));
  const committed = rows.filter((r) => r.state !== 'proposed').sort((a, b) => phaseNum(a.item) - phaseNum(b.item));
  const proposed = rows.length - committed.length;
  const count = (s: RoadmapState): number => committed.filter((r) => r.state === s).length;
  const shown = committed.slice(0, MAX_ROWS);
  const hidden = committed.length - shown.length;
  const frontier = committed.find((r) => r.state === 'in_progress');
  const title = committed.length ? `${count('done')} shipped · ${count('in_progress')} in progress · ${count('parked')} queued` : 'No roadmap yet';
  const lines: string[] = [];
  let y = 52;
  for (const r of shown) {
    const phase = r.item.phase ? `P${esc(r.item.phase)}` : '';
    const now = frontier && r.item.id === frontier.item.id;
    const right = `${phase ? `${phase} · ` : ''}${STATE_WORD[r.state]}${now ? ' · now' : ''}`;
    // The title yields to its label: ~6.6px per 12px sans char, ~6.2px per 10px mono char, 12px gap.
    const titleChars = Math.max(12, Math.floor((W - 34 - 16 - right.length * 6.2 - 12) / 6.6));
    lines.push(`  <circle cx="22" cy="${y - 4}" r="4" fill="${STATE_COLOR[r.state]}"/>`);
    lines.push(`  <text x="34" y="${y}" font-family="${FONT}" font-size="12" fill="${C.text}">${esc(clip(r.item.title, titleChars))}</text>`);
    lines.push(`  <text x="${W - 16}" y="${y}" text-anchor="end" font-family="${MONO}" font-size="10" fill="${now ? C.blue : C.muted}">${esc(right)}</text>`);
    y += 20;
  }
  const foot: string[] = [];
  if (hidden > 0) foot.push(`+${hidden} more`);
  if (proposed > 0) foot.push(`${proposed} proposed`);
  if (foot.length) {
    lines.push(`  <text x="34" y="${y}" font-family="${MONO}" font-size="10" fill="${C.gray}">${esc(foot.join(' · '))}</text>`);
    y += 20;
  }
  const h = Math.max(72, y - 4);
  return frame(h, '🗺 roadmap', title, lines.join('\n'));
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

// Spend per day over the last two weeks as bars, the running call count, and when the agent last spoke.
export function renderActivitySvg(f: FundingSnapshot, now = Date.now()): string {
  const series = f.daily_spend_usd_cents.slice(-DAYS);
  const padded = [...new Array(Math.max(0, DAYS - series.length)).fill(0), ...series];
  const max = Math.max(1, ...padded);
  const week = padded.slice(-7).reduce((a, b) => a + b, 0);
  const title = `${f.calls_total.toLocaleString('en-US')} metered call${f.calls_total === 1 ? '' : 's'} · ${usd(week)} this week`;
  const padX = 16;
  const chartW = W - padX * 2;
  const barW = Math.floor(chartW / DAYS) - 4;
  const baseY = 88;
  const chartH = 36;
  const bars = padded.map((v, i) => {
    const h = v > 0 ? Math.max(2, Math.round((v / max) * chartH)) : 1;
    const x = padX + i * (barW + 4);
    return `  <rect x="${x}" y="${baseY - h}" width="${barW}" height="${h}" rx="2" fill="${v > 0 ? C.blue : C.track}"/>`;
  });
  const sub = `last call ${ago(f.last_call_at, now)} · ~${usd(f.burn_per_day_usd_cents)}/day`;
  const body = [...bars, `  <text x="${padX}" y="${106}" font-family="${MONO}" font-size="10" fill="${C.muted}">${esc(sub)}</text>`].join('\n');
  return frame(116, '⚡ activity', title, body);
}
