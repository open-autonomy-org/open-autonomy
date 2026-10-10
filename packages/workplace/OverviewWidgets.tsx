import { Panel } from '@runhuman/workplace/overview/OverviewView';
import type { WidgetProps } from '@runhuman/workplace/contributions/types';
type Summary = { account?: string; balanceUsdCents?: number; burnPerDayUsdCents?: number; giveUrl?: string; goalDays?: number; inUsdCents?: number; runwayDays?: number | null; spentUsdCents?: number; standing?: string };
type Source<M> = { link: string | null; model: M; name: string; sourceKey: string; system: string };
const usd = (cents = 0): string => `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

export function OverviewWidget({ part, data }: WidgetProps) {
  const title = part.options.title;
  if (part.kind === 'runway' || part.kind === 'books') {
    const sources = (data as { sources: Source<{ summary?: Summary; daily?: { key: string; usdCents: number }[] }>[] }).sources;
    return <>{sources.map(source => {
      const s = source.model.summary ?? {};
      const low = s.runwayDays != null && s.goalDays != null && s.runwayDays < s.goalDays / 3;
      return <Panel key={source.sourceKey} title={title ?? (part.kind === 'runway' ? 'Runway' : 'Books')} {...(source.link ? { more: { href: source.link, label: `Books in ${source.system}` } } : {})}>
        <dl className="ui-overview__figures">
          {part.kind === 'runway'
            ? <><div data-tone={low ? 'warn' : undefined}><dt>runway · goal {s.goalDays ?? '—'}d</dt><dd>{s.runwayDays == null ? '—' : s.runwayDays > 365 ? '1y+' : `${s.runwayDays} days`}</dd></div><div><dt>burn a day</dt><dd>{usd(s.burnPerDayUsdCents)}</dd></div></>
            : <><div><dt>put in</dt><dd>{usd(s.inUsdCents)}</dd></div><div><dt>spent</dt><dd>{usd(s.spentUsdCents)}</dd></div><div><dt>balance</dt><dd>{usd(s.balanceUsdCents)}</dd></div></>}
        </dl>
        {s.giveUrl && <a className="ui-overview__give" href={s.giveUrl} target="_blank" rel="noreferrer">Give</a>}
      </Panel>;
    })}</>;
  }
  if (part.kind === 'statement') {
    const sources = (data as { sources: Source<{ statements?: { key: string; text: string; title: string }[] }>[] }).sources;
    const statements = sources.flatMap(source => source.model.statements ?? []);
    return <Panel title={title ?? "The owner's word"}>{statements.length ? <ul className="ui-overview__statements">{statements.map(statement => <li key={statement.key}><strong>{statement.title}</strong> {statement.text}</li>)}</ul> : <p className="ui-overview__muted">No statement yet.</p>}</Panel>;
  }
  return null;
}
