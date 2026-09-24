// oa status <owner/project>: the word, the money, what is running, the schedule, the board's shape.
// oa status <org>: the org's own word and bounds, and each of its listed projects in one line.
import { ReadError } from '@open-autonomy/sdk/client';
import { tenseOf } from '@open-autonomy/sdk/roadmap';
import type { Doors } from '../config.ts';
import { pageOf } from '../config.ts';
import { ago, bold, c, days, dim, dur, facts, fail, firstLine, pill, plain, standingOf, table, usd } from '../ui.ts';

export async function status(d: Doors): Promise<void> {
  const [funding, stream, control, revision] = await Promise.all([
    d.oa.funding(d.acct).catch((e: unknown) => { if (e instanceof ReadError && e.status === 404) fail(`no project ${d.acct} on ${d.base.replace(/\/v1$/, '')}`); throw e; }),
    d.oa.sessions(d.acct, 20).catch((e: unknown) => (e instanceof ReadError && e.code === 'not_open' ? undefined : Promise.reject(e))),
    d.oa.state(d.acct),
    d.oa.roadmap(d.acct).catch(() => undefined),
  ]);
  if (d.json) { console.log(JSON.stringify({ funding, sessions: stream, control, roadmap: revision?.roadmap }, null, 2)); return; }
  const live = stream?.live ?? [];
  const standing = standingOf(funding, live, control);
  const first = stream?.sessions.find((s) => live.includes(s.key));
  const last = stream?.sessions.find((s) => s.status === 'ended' && s.kind === 'run');
  const items = revision?.roadmap.items ?? [];
  const lines: string[] = [];
  lines.push(`${bold(d.acct)}   ${pill(standing, control?.desired?.from)}`);
  if (control?.desired?.state === 'paused') lines.push(`  ${dim(control.desired.reason ? `“${control.desired.reason}”` : 'no reason given')} ${dim(`· asked ${ago(control.desired.at)}`)}${control.observed ? dim(` · observed ${ago(control.observed.at)}${control.observed.note ? `: ${control.observed.note}` : ''}`) : ''}`);
  lines.push('');
  lines.push(facts([
    ['in the bank', `${bold(usd(funding.balance_usd_cents))}   ${dim('runway')} ${days(funding.runway_days)} ${dim(`· burn ${usd(funding.burn_per_day_usd_cents)}/day`)}`],
    ['put in', `${usd(funding.granted_in_usd_cents)}   ${dim('spent')} ${usd(funding.consumed_usd_cents)} ${dim(`· ${funding.calls_total} metered calls`)}`],
  ]));
  lines.push('');
  if (first) lines.push(facts([['working now', `${c.green(first.source ?? first.kind)} ${dim(`· ${dur(first.started_at)} in · ${first.turn_count} turns · ${usd(first.usd_cents)} so far`)}`]]));
  if (last) lines.push(facts([['last run', `${last.source ?? last.kind} ${dim(`· ${ago(last.started_at)} · ${last.outcome ?? 'ended'} · ${last.turn_count} turns · ${usd(last.usd_cents)}`)}${last.report && last.report !== '[SILENT]' ? `\n  ${' '.repeat(14)}${dim('“' + firstLine(plain(last.report), 100) + '”')}` : ''}`]]));
  if (!stream) lines.push(facts([['sessions', dim('not open to this view')]]));
  if (items.length) lines.push(facts([['board', `${items.filter((i) => tenseOf(i) === 'present').length} in progress · ${items.filter((i) => tenseOf(i) === 'future').length} promised · ${items.filter((i) => tenseOf(i) === 'past').length} shipped`]]));
  lines.push(facts([['page', dim(pageOf(d.base.replace(/\/v1$/, ''), d.acct))]]));
  console.log(lines.join('\n'));
}

export async function orgStatus(d: Doors): Promise<void> {
  const view = await d.oa.org(d.acct).catch((e: unknown) => { if (e instanceof ReadError && e.status === 404) fail(`no org ${d.acct.slice(1)} on ${d.base.replace(/\/v1$/, '')}`); throw e; });
  if (d.json) { console.log(JSON.stringify(view, null, 2)); return; }
  const name = d.acct.slice(1);
  const lines: string[] = [];
  const word = view.desired?.state === 'paused' ? c.red(`● Paused by ${name}`) : c.green('● Running');
  lines.push(`${bold(name)}   ${word}${view.desired?.state === 'paused' ? dim(`  ${view.desired.reason ? `“${view.desired.reason}” · ` : ''}asked ${ago(view.desired.at)} · every project inherits it`) : ''}`);
  for (const l of view.bounds) {
    const of = (used: number | undefined, bound: number, unit: (n: number) => string) => (used === undefined ? unit(bound) : `${unit(used)} of ${unit(bound)}`);
    lines.push(`  ${dim('org limit'.padEnd(14))}${[l.usd_cents !== undefined ? of(l.used?.usd_cents, l.usd_cents, usd) : '', l.calls !== undefined ? of(l.used?.calls, l.calls, (n) => `${n} calls`) : '', l.tokens !== undefined ? of(l.used?.tokens, l.tokens, (n) => `${n} tokens`) : ''].filter(Boolean).join(', ')} ${dim(`per ${l.window}${l.model ? ` on ${l.model}` : ''} · all projects together${l.withheld ? ' · the total is withheld: a project of the org keeps its books closed' : ''}`)}`);
  }
  lines.push('');
  if (!view.projects.length) lines.push(dim('  no listed projects'));
  else lines.push(table([{ head: 'project' }, { head: 'standing' }, { head: 'bank', right: true }, { head: 'burn/day', right: true }, { head: 'runway', right: true }],
    view.projects.map((p) => [p.account, pill(standingOf({ funded: p.funded ?? true, exhausted: p.exhausted ?? false }, p.live_sessions ?? [], p.control), p.control?.desired?.from), p.balance_usd_cents === undefined ? dim('closed') : usd(p.balance_usd_cents), p.burn_per_day_usd_cents === undefined ? '' : usd(p.burn_per_day_usd_cents), p.runway_days === undefined ? '' : days(p.runway_days)])));
  lines.push('');
  lines.push(facts([['page', dim(pageOf(d.base.replace(/\/v1$/, ''), name))]]));
  console.log(lines.join('\n'));
}
