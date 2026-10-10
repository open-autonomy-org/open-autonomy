import './books.css';
import { useState } from 'react';
import { Button } from '@runhuman/workplace/foundation';

// THE ORGANIZATION'S BOOKS (company RFC 0024 B5(1)). OPEN-AUTONOMY-BOOKS: Open Autonomy's dashboard Books page (Open
// Collective's open budget: "where money comes from and where it goes"), drawn from what each funding integration last
// published: the ledger (put in, given out, spent, balance, burn and runway against its goal), money in and money out,
// what is earmarked, the spending caps with what each has used, the owner's statements, and the daily metered spend. A
// spending freeze (a cap of zero on every rail) is asked here and taken by the funding system; until its next snapshot
// shows it taken, the page says it was asked. Books are not Usage: Usage measures use, whoever pays.
export interface BooksSummary {
  account: string;
  standing: string;
  balanceUsdCents: number;
  inUsdCents: number;
  outUsdCents: number;
  spentUsdCents: number;
  burnPerDayUsdCents: number;
  runwayDays: number | null;
  runwayConfident: boolean;
  goalDays: number;
  freeze: { at: string; by: string; reason?: string; from?: string } | null;
  canFreeze: boolean;
  giveUrl?: string;
}
export interface BooksFlow { key: string; at: string; direction: 'in' | 'out'; party: string; what: string; usdCents: number }
export interface BooksEnvelope { key: string; purpose: string; from?: string; balanceUsdCents: number }
export interface BooksLimit { key: string; window: string; model?: string; usdCents?: number; calls?: number; tokens?: number; used: { usdCents: number; calls: number; tokens: number } }
export interface BooksStatement { key: string; title: string; text: string; at: string }
export interface BooksDay { key: string; usdCents: number; calls: number }
export interface BooksSource {
  sourceKey: string;
  name: string;
  system: string;
  link: string | null;
  observedAt: string;
  model: { summary: BooksSummary; flows: BooksFlow[]; envelopes: BooksEnvelope[]; limits: BooksLimit[]; statements: BooksStatement[]; daily: BooksDay[] };
}
export interface BooksControl { action: 'freeze' | 'unfreeze'; controlId: string; targetKey: string; sourceKey: string; state: 'done' | 'failed' | 'requested'; note: string | null; requestedAt: string }

export interface BooksViewProps {
  sources: readonly BooksSource[];
  controls?: readonly BooksControl[];
  /** Asks the funding system to freeze or lift its freeze; absent, the viewer may only read. */
  onFreeze?: (sourceKey: string, account: string, frozen: boolean, reason?: string) => Promise<void>;
  now?: Date;
}

const usd = (cents: number): string => `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
const ago = (at: string, now: Date): string => {
  const minutes = Math.max(0, Math.round((now.getTime() - Date.parse(at)) / 60_000));
  return minutes < 1 ? 'just now' : minutes < 60 ? `${minutes} min ago` : minutes < 2880 ? `${Math.round(minutes / 60)} h ago` : `${Math.round(minutes / 1440)} days ago`;
};

function Freeze({ source, controls, onFreeze }: { source: BooksSource; controls: readonly BooksControl[]; onFreeze?: BooksViewProps['onFreeze'] }): React.ReactElement | null {
  const summary = source.model.summary;
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const asked = controls.find(control => control.sourceKey === source.sourceKey && control.state === 'requested');
  const failed = controls.find(control => control.sourceKey === source.sourceKey && control.state === 'failed');
  const act = (frozen: boolean) => {
    if (!onFreeze) return;
    setBusy(true); setError(undefined);
    onFreeze(source.sourceKey, summary.account, frozen, reason.trim() || undefined).then(() => setReason(''), failure => setError(failure instanceof Error ? failure.message : String(failure))).finally(() => setBusy(false));
  };
  return <div className="ui-books__freeze" data-frozen={summary.freeze ? 'true' : undefined}>
    {summary.freeze
      ? <p><strong>Spending is frozen</strong>{summary.freeze.from ? ` for every project of ${summary.freeze.from.replace(/^@/, '')}` : ''} since {new Date(summary.freeze.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}{summary.freeze.reason ? `: ${summary.freeze.reason}` : ''}. Nothing is spent until it is lifted.</p>
      : <p>Spending is open. A freeze is a cap of zero on every rail; it is not the agent's pause.</p>}
    {asked && <p className="ui-books__asked" role="status">{asked.action === 'freeze' ? 'Freeze' : 'Lifting the freeze'} asked · waiting for {source.system}</p>}
    {failed && !asked && <p className="ui-books__error" role="alert">{failed.action === 'freeze' ? 'The freeze' : 'Lifting the freeze'} failed{failed.note ? `: ${failed.note}` : ''}</p>}
    {error && <p className="ui-books__error" role="alert">{error}</p>}
    {onFreeze && summary.canFreeze && !asked && (summary.freeze
      ? !summary.freeze.from && <Button size="compact" tone="quiet" type="button" busy={busy} onClick={() => act(false)}>Lift the freeze</Button>
      : <div className="ui-books__freeze-form">
        <input aria-label="Why freeze spending" maxLength={300} placeholder="Why (optional)" value={reason} disabled={busy} onChange={event => setReason(event.target.value)} />
        <Button size="compact" tone="danger" type="button" busy={busy} onClick={() => act(true)}>Freeze spending</Button>
      </div>)}
  </div>;
}

function SourceBooks({ source, controls, now, onFreeze }: { source: BooksSource; controls: readonly BooksControl[]; now: Date; onFreeze?: BooksViewProps['onFreeze'] }): React.ReactElement {
  const { daily, envelopes, flows, limits, statements, summary } = source.model;
  const runway = summary.runwayDays === null ? '—' : summary.runwayDays > 365 ? '1y+' : `${summary.runwayDays}d`;
  const low = summary.runwayDays !== null && summary.runwayDays < summary.goalDays / 3;
  const peak = Math.max(1, ...daily.map(day => day.usdCents));
  const moneyIn = flows.filter(flow => flow.direction === 'in');
  const moneyOut = flows.filter(flow => flow.direction === 'out');
  return <section className="ui-books__source" aria-label={`${source.name}'s books`}>
    <header className="ui-books__head">
      <h2>{source.name}</h2>
      <p>{source.system} · {summary.standing} · read {ago(source.observedAt, now)}{source.link && <> · <a href={source.link} target="_blank" rel="noreferrer">Open in {source.system}</a></>}{summary.giveUrl && <> · <a href={summary.giveUrl} target="_blank" rel="noreferrer">Give</a></>}</p>
    </header>
    <dl className="ui-books__kpis">
      <div><dt>put in</dt><dd>{usd(summary.inUsdCents)}</dd></div>
      {summary.outUsdCents > 0 && <div><dt>given out</dt><dd>{usd(summary.outUsdCents)}</dd></div>}
      <div><dt>spent, every cent metered</dt><dd>{usd(summary.spentUsdCents)}</dd></div>
      <div><dt>balance</dt><dd>{usd(summary.balanceUsdCents)}</dd></div>
      <div><dt>burn a day</dt><dd>{usd(summary.burnPerDayUsdCents)}{summary.runwayConfident ? '' : ' est.'}</dd></div>
      <div data-tone={low ? 'warn' : undefined}><dt>runway · goal {summary.goalDays}d</dt><dd>{runway}</dd></div>
    </dl>
    <Freeze controls={controls} source={source} {...(onFreeze ? { onFreeze } : {})} />
    <div className="ui-books__grid">
      <div className="ui-books__panel">
        <h3>Daily metered spend</h3>
        {daily.length === 0 ? <p className="ui-books__empty">No metered spend yet.</p> : <ol className="ui-books__bars" aria-label="Daily metered spend">
          {daily.slice(-30).map(day => <li key={day.key} title={`${day.key}: ${usd(day.usdCents)}, ${day.calls} calls`} style={{ height: `${Math.max(3, Math.round(day.usdCents / peak * 100))}%` }}><span className="ui-visually-hidden">{day.key}: {usd(day.usdCents)}</span></li>)}
        </ol>}
      </div>
      <div className="ui-books__panel">
        <h3>Spending caps</h3>
        {limits.length === 0 ? <p className="ui-books__empty">No caps declared.</p> : <ul className="ui-books__rows">
          {limits.map(limit => {
            const share = limit.usdCents ? limit.used.usdCents / limit.usdCents : limit.calls ? limit.used.calls / limit.calls : limit.tokens ? limit.used.tokens / limit.tokens : 0;
            return <li key={limit.key} data-tone={share >= 1 ? 'hot' : share >= 0.8 ? 'warn' : undefined}>
              <span>{limit.model ? `${limit.model} · ` : ''}{[limit.usdCents !== undefined ? usd(limit.usdCents) : '', limit.calls !== undefined ? `${limit.calls} calls` : '', limit.tokens !== undefined ? `${limit.tokens} tokens` : ''].filter(Boolean).join(', ')} per {limit.window}</span>
              <span>{Math.round(share * 100)}% used</span>
            </li>;
          })}
        </ul>}
      </div>
      <div className="ui-books__panel">
        <h3>Money in</h3>
        {moneyIn.length === 0 ? <p className="ui-books__empty">Nothing has come in yet.</p> : <ul className="ui-books__rows">{moneyIn.map(flow => <li key={flow.key}><span>{flow.party} · {flow.what} · {ago(flow.at, now)}</span><span>{usd(flow.usdCents)}</span></li>)}</ul>}
      </div>
      {moneyOut.length > 0 && <div className="ui-books__panel">
        <h3>Money out</h3>
        <ul className="ui-books__rows">{moneyOut.map(flow => <li key={flow.key}><span>{flow.party} · {flow.what} · {ago(flow.at, now)}</span><span>{usd(flow.usdCents)}</span></li>)}</ul>
      </div>}
      <div className="ui-books__panel">
        <h3>Earmarked</h3>
        {envelopes.length === 0 ? <p className="ui-books__empty">Nothing earmarked.</p> : <ul className="ui-books__rows">{envelopes.map(envelope => <li key={envelope.key}><span>{envelope.purpose}{envelope.from ? ` · from ${envelope.from.replace(/^@/, '')}` : ''}</span><span>{usd(envelope.balanceUsdCents)}</span></li>)}</ul>}
      </div>
      {statements.length > 0 && <div className="ui-books__panel">
        <h3>The owner's statements</h3>
        <ul className="ui-books__statements">{statements.map(statement => <li key={statement.key}><strong>{statement.title}</strong><p>{statement.text}</p><small>{ago(statement.at, now)}</small></li>)}</ul>
      </div>}
    </div>
  </section>;
}

export function BooksView({ controls = [], now, onFreeze, sources }: BooksViewProps): React.ReactElement {
  const at = now ?? new Date();
  if (sources.length === 0) return <p className="ui-books__empty">No funding system publishes here yet. Linking the organization's Open Autonomy project shows its books here.</p>;
  return <div className="ui-books">{sources.map(source => <SourceBooks key={source.sourceKey} controls={controls} now={at} source={source} {...(onFreeze ? { onFreeze } : {})} />)}</div>;
}
