import './cost-control.css';
import { PagePanel } from '@runhuman/workplace/page/Page';
import type { UsageEntry } from '@runhuman/workplace/organization/Usage';

// VERCEL-SPEND-MANAGEMENT and FINOPS-INFORM (company RFC 0023 decision 21): Usage is cost control. Each budget and limit
// this period with its spend against it; the burn and the projected period-end; and the spend attributed by project
// (each funding system's account), then resource (the model), then Task. Money here is only what the buying endpoints
// measured: each funding system's own metering (the books it publishes) and the calls RH2's buying endpoints recorded
// with the vendor's reading. Nothing is self-reported. A budget's alert reaches its owner through Alerts, raised by the
// system that holds the budget; this page shows the limits and links to where they are set.
export interface CostLimit { key: string; window: string; model?: string; usdCents?: number; calls?: number; used: { usdCents: number; calls: number } }
export interface CostSource {
  sourceKey: string; name: string; system: string; link: string | null;
  summary?: { balanceUsdCents?: number; burnPerDayUsdCents?: number; runwayDays?: number | null };
  limits: CostLimit[]; days: { key: string; usdCents: number }[];
}
export interface CostControlProps {
  /** The period: the calendar month containing `now`. */
  now: string;
  sources: CostSource[];
  /** Calls RH2's buying endpoints recorded this period. */
  calls: UsageEntry[];
  /** Task titles by id, for attribution. */
  taskTitles?: Record<string, string>;
}

const usd = (cents: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: cents < 10_000 ? 2 : 0 }).format(cents / 100);
const pct = (value: number) => `${Math.round(value * 100)}%`;

export function periodOf(now: string): { start: number; end: number; elapsedDays: number; days: number } {
  const at = new Date(now);
  const start = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1), end = Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1);
  return { start, end, days: (end - start) / 86_400_000, elapsedDays: Math.max(1 / 24, (at.getTime() - start) / 86_400_000) };
}

export function CostControl({ calls, now, sources, taskTitles = {} }: CostControlProps): React.ReactElement {
  const period = periodOf(now);
  const inPeriod = (key: string) => { const t = Date.parse(`${key}T00:00:00Z`); return t >= period.start && t < period.end; };
  const projects = sources.map(source => ({ source, cents: source.days.filter(day => inPeriod(day.key)).reduce((sum, day) => sum + day.usdCents, 0) }));
  const callCents = calls.reduce((sum, call) => sum + Math.round((call.costUsd ?? 0) * 100), 0);
  const spent = projects.reduce((sum, project) => sum + project.cents, 0) + callCents;
  const burn = spent / period.elapsedDays;
  const projected = burn * period.days;
  const byModel = new Map<string, number>(), byTask = new Map<string, number>();
  for (const call of calls) {
    const cents = Math.round((call.costUsd ?? 0) * 100);
    byModel.set(call.model, (byModel.get(call.model) ?? 0) + cents);
    const task = call.taskId ?? 'overhead';
    byTask.set(task, (byTask.get(task) ?? 0) + cents);
  }
  const limits = sources.flatMap(source => source.limits.filter(limit => limit.usdCents || limit.calls).map(limit => ({ source, limit, share: limit.usdCents ? limit.used.usdCents / limit.usdCents : limit.used.calls / limit.calls! })));
  const month = new Date(period.start).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return <PagePanel label={`Cost control · ${month}`}>
    <div className="ui-cost">
      <dl className="ui-cost__figures">
        <div><dt>Spent this month</dt><dd>{usd(spent)}</dd></div>
        <div><dt>Burn a day</dt><dd>{usd(burn)}</dd></div>
        <div><dt>Projected month end</dt><dd>{usd(projected)}</dd></div>
      </dl>
      <section aria-label="Limits and budgets">
        <h3>Limits and budgets</h3>
        {limits.length === 0 ? <p className="ui-muted">No limits are set by the systems that buy for this organization.</p> : <ul className="ui-cost__limits">
          {limits.map(({ source, limit, share }) => <li key={`${source.sourceKey}:${limit.key}`} data-tone={share >= 1 ? 'over' : share >= 0.75 ? 'near' : undefined}>
            <span>{source.name}{limit.model ? ` · ${limit.model}` : ''} · per {limit.window}</span>
            <meter min={0} max={1} low={0.5} high={0.75} optimum={0} value={Math.min(1, share)} aria-label={`${pct(share)} used`} />
            <span>{limit.usdCents ? `${usd(limit.used.usdCents)} of ${usd(limit.usdCents)}` : `${limit.used.calls} of ${limit.calls} calls`} · {pct(share)}</span>
            {source.link && <a href={source.link} target="_blank" rel="noreferrer">Set in {source.system}</a>}
          </li>)}
        </ul>}
      </section>
      <section aria-label="Spend by project">
        <h3>By project</h3>
        <table className="ui-cost__table"><thead><tr><th>Project</th><th>System</th><th>This month</th><th>Burn a day</th><th>Runway</th></tr></thead><tbody>
          {projects.map(({ source, cents }) => <tr key={source.sourceKey}><td>{source.link ? <a href={source.link} target="_blank" rel="noreferrer">{source.name}</a> : source.name}</td><td>{source.system}</td><td>{usd(cents)}</td><td>{source.summary?.burnPerDayUsdCents !== undefined ? usd(source.summary.burnPerDayUsdCents) : '—'}</td><td>{source.summary?.runwayDays == null ? '—' : `${source.summary.runwayDays} days`}</td></tr>)}
          {callCents > 0 && <tr><td>Task agents' calls</td><td>Runhuman</td><td>{usd(callCents)}</td><td>—</td><td>—</td></tr>}
        </tbody></table>
      </section>
      {calls.length > 0 && <div className="ui-cost__split">
        <section aria-label="Spend by resource"><h3>By resource</h3><ul className="ui-cost__bars">{[...byModel].sort((a, b) => b[1] - a[1]).map(([model, cents]) => <li key={model}><span>{model}</span><span>{usd(cents)}</span></li>)}</ul></section>
        <section aria-label="Spend by Task"><h3>By Task</h3><ul className="ui-cost__bars">{[...byTask].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([task, cents]) => <li key={task}><span>{task === 'overhead' ? 'Organization overhead' : <a href={`/console/tasks/${encodeURIComponent(task)}`}>{taskTitles[task] ?? task}</a>}</span><span>{usd(cents)}</span></li>)}</ul></section>
      </div>}
    </div>
  </PagePanel>;
}
