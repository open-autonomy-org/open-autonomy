// oa books <owner/project> [--calls]: the ledger, the owner's bounds, and every metered call.
import { ReadError } from '@open-autonomy/sdk/client';
import type { Doors } from '../config.ts';
import { ago, bold, days, dim, facts, fail, table, usd } from '../ui.ts';

export async function books(d: Doors, opts: { calls: boolean; limit: number }): Promise<void> {
  const funding = await d.oa.funding(d.acct).catch((e: unknown) => { if (e instanceof ReadError && e.status === 404) fail(e.code === 'not_open' ? 'the books are not open to this view' : `no project ${d.acct}`, e.code === 'not_open' ? 'pass --key with the project\'s key' : undefined); throw e; });
  const calls = opts.calls ? await d.oa.calls(d.acct, opts.limit).catch((e: unknown) => { if (e instanceof ReadError && e.code === 'not_open') fail('the calls are not open to this view', 'pass --key with the project\'s key'); throw e; }) : undefined;
  if (d.json) { console.log(JSON.stringify({ funding, ...(calls ? { calls: calls.calls } : {}) }, null, 2)); return; }
  const last = funding.daily_spend_usd_cents.slice(-7).reduce((a, b) => a + b, 0);
  console.log(`${bold(d.acct)} ${dim('· the books')}`);
  console.log();
  console.log(facts([
    ['in the bank', bold(usd(funding.balance_usd_cents))],
    ['put in', usd(funding.granted_in_usd_cents)],
    ['spent', `${usd(funding.consumed_usd_cents)} ${dim(`· ${funding.calls_total} metered calls · ${usd(last)} this week`)}`],
    ['burn', `${usd(funding.burn_per_day_usd_cents)}/day ${dim(`· runway ${days(funding.runway_days)}${funding.runway_confident ? '' : ' (early)'} · ${funding.days_observed} days observed`)}`],
    ['standing', funding.exhausted ? 'spending stopped: the balance is spent' : funding.funded ? 'funded' : 'not yet funded'],
  ]));
  if (funding.bounds.models.length || funding.bounds.limits.length) {
    console.log();
    console.log(bold('The owner\'s bounds'));
    if (funding.bounds.models.length) console.log(`  ${dim('models'.padEnd(14))}${funding.bounds.models.join(', ')}`);
    for (const l of funding.bounds.limits) console.log(`  ${dim('limit'.padEnd(14))}${[l.usd_cents !== undefined ? usd(l.usd_cents) : '', l.calls !== undefined ? `${l.calls} calls` : '', l.tokens !== undefined ? `${l.tokens} tokens` : ''].filter(Boolean).join(', ')} per ${l.window}${l.model ? ` on ${l.model}` : ''} ${dim(`· used ${usd(l.used.usd_cents)}`)}`);
  }
  if (calls) {
    console.log();
    console.log(bold('Every metered call') + dim(` · latest ${calls.calls.length}`));
    console.log(table(
      [{ head: 'when' }, { head: 'what', max: 44 }, { head: 'session', max: 36 }, { head: 'cost', right: true }],
      calls.calls.map((c) => [ago(c.ts), c.rail === 'model' ? `${c.model ?? 'model'}${c.input_tokens !== undefined ? dim(` ${c.input_tokens}→${c.output_tokens ?? 0}`) : ''}` : c.rail === 'card' ? `${c.merchant ?? 'a merchant'} · ${c.category ?? 'card'}` : `${c.partner ?? 'a partner'} · ${c.unit ?? ''}`, c.session ?? dim('—'), usd(c.usd_cents)]),
    ));
  }
}
