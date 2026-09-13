// oa roadmap <owner/project>: the board as the platform holds it: in progress, planned, proposed, shipped.
import { ReadError } from '@open-autonomy/sdk/client';
import { tenseOf, type RoadmapItem } from '@open-autonomy/sdk/roadmap';
import type { Doors } from '../config.ts';
import { ago, bold, c, dim, fail } from '../ui.ts';

export async function roadmap(d: Doors, opts: { shipped: number }): Promise<void> {
  const revision = await d.oa.roadmap(d.acct).catch((e: unknown) => { if (e instanceof ReadError && e.code === 'not_open') fail('the roadmap is not open to this view', 'pass --key with the project\'s key'); throw e; });
  if (d.json) { console.log(JSON.stringify(revision ?? null, null, 2)); return; }
  if (!revision) { console.log(dim('no roadmap published yet')); return; }
  const items = revision.roadmap.items;
  const active = items.filter((i) => tenseOf(i) === 'present');
  const planned = items.filter((i) => tenseOf(i) === 'future' && i.status === 'planned');
  const proposed = items.filter((i) => tenseOf(i) === 'future' && i.status !== 'planned');
  const shipped = items.filter((i) => tenseOf(i) === 'past').sort((a, b) => Date.parse(b.done_at ?? '') - Date.parse(a.done_at ?? '') || 0);
  const line = (i: RoadmapItem, note?: string) => `  ${c.cyan('•')} ${i.title}${note ? dim(`  ${note}`) : ''} ${dim(i.id)}`;
  const section = (head: string, rows: RoadmapItem[], note: (i: RoadmapItem) => string | undefined) => { console.log(`${bold(head)} ${dim(String(rows.length))}`); if (!rows.length) console.log(dim('  none')); for (const i of rows) console.log(line(i, note(i))); console.log(); };
  console.log(`${bold(d.acct)} ${dim(`· roadmap revision ${revision.revision} · ${revision.source}${revision.by ? ` · ${revision.by}` : ''} · ${ago(revision.ts)}`)}`);
  console.log();
  section('In progress', active, (i) => (i.started_at ? `since ${ago(i.started_at)}` : undefined));
  section('Planned', planned, (i) => i.release);
  section('Proposed', proposed, (i) => (i.proposed_at ? `since ${i.proposed_at.slice(0, 10)}` : undefined));
  const show = opts.shipped > 0 ? shipped.slice(0, opts.shipped) : shipped;
  section(`Shipped${show.length < shipped.length ? ` (latest ${show.length} of ${shipped.length}; --shipped 0 for all)` : ''}`, show, (i) => (i.done_at ? ago(i.done_at) : undefined));
}
