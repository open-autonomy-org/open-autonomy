// The look of `oa`: one palette, aligned columns, short words for time and money. Colour follows the terminal
// (NO_COLOR and a non-TTY turn it off), so a pipe gets plain text.
import pc from 'picocolors';

export const c = pc;
export const dim = pc.dim;
export const bold = pc.bold;

// ---- words for numbers ---------------------------------------------------------------------------------------------
export const usd = (cents: number): string => (cents > 0 && cents < 100 ? `${cents < 1 ? cents.toFixed(2) : cents.toFixed(1)}¢` : `$${(cents / 100).toFixed(2)}`);
export const ago = (iso: string | undefined | null, now = Date.now()): string => {
  if (!iso) return '';
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};
export const dur = (from: string, to?: string, now = Date.now()): string => {
  const s = Math.max(0, Math.round(((to ? Date.parse(to) : now) - Date.parse(from)) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};
export const when = (iso: string | undefined): string => (iso ? iso.slice(0, 16).replace('T', ' ') + 'Z' : '');
export const days = (n: number | null): string => (n === null ? '—' : n > 365 ? '1y+' : `${Math.round(n)}d`);

// ---- the one word on the agent ------------------------------------------------------------------------------------
export type Standing = 'live' | 'running' | 'requested' | 'paused' | 'exhausted' | 'unfunded';
export function standingOf(v: { funded: boolean; exhausted: boolean }, live: string[], control?: { desired?: { state: string }; observed?: { state: string; at?: string } }): Standing {
  const desired = control?.desired?.state ?? 'running', observed = control?.observed?.state;
  if (desired === 'paused' && observed === 'paused') return 'paused';
  if (desired === 'paused') return 'requested';
  if (observed === 'paused') return 'paused';
  if (live.length) return 'live';
  // Empty books decide only when nothing else speaks: an automation that has reported itself running lately runs
  // on its owner's own model, as the platform's own pages read it.
  const reported = observed === 'running' && control?.observed?.at !== undefined && Date.now() - Date.parse(control.observed.at) < 6 * 3600_000;
  if (v.exhausted && !reported) return 'exhausted';
  if (!v.funded && !reported) return 'unfunded';
  return 'running';
}
const WORD: Record<Standing, [string, (s: string) => string]> = {
  live: ['Working now', pc.green], running: ['Running', pc.green], requested: ['Pause requested', pc.yellow],
  paused: ['Paused by the owner', pc.red], exhausted: ['Spending stopped', pc.red], unfunded: ['Not yet funded', pc.gray],
};
// `org`: the org whose word holds (ADR 0010), named in place of the owner.
export const pill = (s: Standing, org?: string): string => WORD[s][1](`● ${org && s === 'paused' ? `Paused by ${org.replace(/^@/, '')}` : org && s === 'requested' ? `Pause requested by ${org.replace(/^@/, '')}` : WORD[s][0]}`);
export const outcome = (s: { status: string; outcome?: string }): string => (s.status === 'live' ? pc.green('live') : s.outcome === 'failed' ? pc.red('failed') : s.outcome === 'done' ? pc.green('done') : pc.dim('quiet'));

// ---- columns ------------------------------------------------------------------------------------------------------
const visible = (s: string): number => s.replace(/\x1b\[[0-9;]*m/g, '').length;
const pad = (s: string, w: number, right = false): string => { const gap = Math.max(0, w - visible(s)); return right ? ' '.repeat(gap) + s : s + ' '.repeat(gap); };
export interface Column { head: string; right?: boolean; max?: number }
// Aligned columns with a dim header; a cell longer than its column's `max` is cut with an ellipsis.
export function table(cols: Column[], rows: string[][]): string {
  const cells = rows.map((r) => r.map((cell, i) => { const max = cols[i]?.max; return max && visible(cell) > max ? cell.slice(0, max - 1) + '…' : cell; }));
  const widths = cols.map((col, i) => Math.max(visible(col.head), ...cells.map((r) => visible(r[i] ?? ''))));
  const line = (r: string[]) => r.map((cell, i) => pad(cell, widths[i], cols[i].right)).join('  ').trimEnd();
  return [dim(line(cols.map((col) => col.head))), ...cells.map(line)].join('\n');
}
// A facts block: label in dim, value beside it, two facts per line when both fit.
export function facts(pairs: Array<[string, string]>, width = 14): string {
  return pairs.map(([k, v]) => `  ${dim(pad(k, width))}${v}`).join('\n');
}
export const title = (s: string): string => bold(s);
export const rule = (): string => dim('─'.repeat(Math.min(72, process.stdout.columns ?? 72)));

// ---- prose -----------------------------------------------------------------------------------------------------------
// Markdown as the terminal reads it: headings kept as bold lines, emphasis marks dropped, links as their text.
export function plain(md: string): string {
  return md
    .replace(/^#{1,6}\s+(.*)$/gm, (_, t: string) => bold(t))
    .replace(/\*\*([^*]+)\*\*/g, (_, t: string) => bold(t))
    .replace(/`([^`]+)`/g, (_, t: string) => pc.cyan(t))
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}
export function wrap(text: string, width = Math.min(96, (process.stdout.columns ?? 96) - 12), indent = ''): string {
  return text.split('\n').map((line) => {
    const words = line.split(' '); const out: string[] = []; let cur = '';
    for (const w of words) { if (visible(cur) + visible(w) + 1 > width && cur) { out.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w; }
    if (cur) out.push(cur);
    return out.map((l) => indent + l).join('\n');
  }).join('\n');
}
export const firstLine = (s: string | undefined, max = 120): string => { const l = (s ?? '').split('\n').map((x) => x.trim()).find((x) => x && !/^[#\-*\[]/.test(x)) ?? ''; return l.length > max ? `${l.slice(0, max - 1)}…` : l; };

// ---- failure -----------------------------------------------------------------------------------------------------
export class Fail extends Error { constructor(message: string, readonly hint?: string) { super(message); } }
export function fail(message: string, hint?: string): never { throw new Fail(message, hint); }
