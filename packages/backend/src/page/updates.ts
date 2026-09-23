// A project's recent updates, as its substrate published them: what shipped (the roadmap's past, with its date) and
// what each scheduled run reported when it ended. The project page lists them and the feed serves them; nothing is
// written here that the SDK did not publish. The caller hands in only what its viewer may see.
import { tenseOf, type Roadmap } from '@open-autonomy/sdk/roadmap';
import type { SessionSummary } from '../ledger.js';
import { esc } from '../ui.js';
import { firstLine } from './parts.js';

export interface Update { id: string; ts: string; kind: 'shipped' | 'run'; title: string; text?: string; item?: string; session?: string }

export function updatesOf(sessions: SessionSummary[], roadmap: Roadmap, max = 20): Update[] {
  const shipped: Update[] = roadmap.items.filter((i) => tenseOf(i) === 'past' && i.done_at).map((i) => ({ id: `item:${i.id}`, ts: i.done_at!, kind: 'shipped', title: i.title, item: i.id }));
  const runs: Update[] = sessions.filter((s) => s.status === 'ended' && s.kind === 'run' && s.report && s.report !== '[SILENT]')
    .map((s) => ({ id: `session:${s.key}`, ts: s.ended_at ?? s.started_at, kind: 'run', title: `${s.source ?? 'A scheduled'} run${s.outcome === 'failed' ? ' failed' : ''}`, text: firstLine(s.report, 280), session: s.key, item: s.item_id }));
  return [...shipped, ...runs].filter((u) => Number.isFinite(Date.parse(u.ts))).sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts)).slice(0, max);
}

// The same updates as an Atom feed a reader can follow. `origin` makes every link absolute.
export function atomFeed(o: { origin: string; account: string; title: string; page: string; board?: (item: string) => string; session?: (key: string) => string; updates: Update[] }): string {
  const abs = (p: string) => `${o.origin}${p}`;
  const updated = o.updates[0]?.ts ?? new Date(0).toISOString();
  const entry = (u: Update) => {
    const link = u.kind === 'shipped' && u.item && o.board ? abs(o.board(u.item)) : u.session && o.session ? abs(o.session(u.session)) : abs(o.page);
    return `<entry><id>${esc(`${abs(o.page)}#${u.id}`)}</id><title>${esc(u.kind === 'shipped' ? `Shipped: ${u.title}` : u.title)}</title><updated>${esc(new Date(u.ts).toISOString())}</updated><link href="${esc(link)}"/>${u.text ? `<summary>${esc(u.text)}</summary>` : ''}</entry>`;
  };
  return `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom"><id>${esc(abs(o.page))}</id><title>${esc(o.title)}</title><updated>${esc(new Date(updated).toISOString())}</updated><link rel="alternate" href="${esc(abs(o.page))}"/><link rel="self" href="${esc(abs(`${o.page}/updates.xml`))}"/>${o.updates.map(entry).join('')}</feed>`;
}
