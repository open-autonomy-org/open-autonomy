import './books.css';

// METERED SPEND AT THE FUNDING SYSTEMS (company RFC 0023 decision 21, RFC 0024 B5(1)). VERCEL-USAGE-SPEND: beside the
// week's people, agents and tasks, the money each funding system's own endpoint measured buying calls for this
// organization (Open Autonomy's metering proxy: the gateway's reported cost per call), day by day. Read from what the
// funding integration published; never estimated here.
export interface MeteredSource { sourceKey: string; name: string; system: string; link: string | null; days: { key: string; usdCents: number }[] }

const usd = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

export function MeteredSpend({ sources, weekStart }: { sources: readonly MeteredSource[]; weekStart: string }): React.ReactElement | null {
  if (sources.length === 0) return null;
  const from = weekStart.slice(0, 10);
  const until = new Date(Date.parse(weekStart) + 7 * 86_400_000).toISOString().slice(0, 10);
  const dates = Array.from({ length: 7 }, (_, index) => new Date(Date.parse(weekStart) + index * 86_400_000).toISOString().slice(0, 10));
  return <section className="ui-books__panel" aria-label="Metered spend at the funding systems">
    <h3>Metered spend at the funding systems</h3>
    <table className="ui-books__metered">
      <thead><tr><th>Source</th>{dates.map(date => <th key={date}>{new Date(`${date}T00:00:00Z`).toLocaleDateString([], { weekday: 'short', timeZone: 'UTC' })}</th>)}<th>Week</th></tr></thead>
      <tbody>{sources.map(source => {
        const inWeek = source.days.filter(day => day.key >= from && day.key < until);
        const of = (date: string) => inWeek.find(day => day.key === date)?.usdCents ?? 0;
        return <tr key={source.sourceKey}>
          <td>{source.link ? <a href={source.link} target="_blank" rel="noreferrer">{source.name}</a> : source.name}<small> · {source.system}</small></td>
          {dates.map(date => <td key={date}>{usd(of(date))}</td>)}
          <td><strong>{usd(inWeek.reduce((sum, day) => sum + day.usdCents, 0))}</strong></td>
        </tr>;
      })}</tbody>
    </table>
  </section>;
}
