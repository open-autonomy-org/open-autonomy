import { useEffect, useState } from 'react';
import { door, session } from '@runhuman/workplace/api';
import { measurements } from '@runhuman/workplace/organization/UsagePage';
import type { UsageEntry } from '@runhuman/workplace/organization/Usage';
import { CostControl, periodOf, type CostLimit, type CostSource } from './CostControl.js';
import { MeteredSpend, type MeteredSource } from './MeteredSpend.js';
export function UsageFunding({ context }: { context: Record<string, unknown> }) {
  const organizationId = session()?.organizationId; const week = context.week as number; const refresh = context.refresh as number;
  // What each funding system's own endpoint measured buying calls (the books it publishes, kind books).
  const [metered, setMetered] = useState<MeteredSource[]>([]);
  const [costSources, setCostSources] = useState<CostSource[]>([]);
  // This month's calls the buying endpoints recorded, for cost control (the week above is for its own tables).
  const [monthCalls, setMonthCalls] = useState<UsageEntry[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    if (!organizationId) return () => controller.abort();
    const { start } = periodOf(new Date().toISOString());
    const base = `/api/v3/organizations/${encodeURIComponent(organizationId)}/measurements?since=${encodeURIComponent(new Date(start).toISOString())}&until=${encodeURIComponent(new Date().toISOString())}&limit=2000`;
    void measurements<UsageEntry>(base, 'agents', controller.signal).then(rows => { if (!controller.signal.aborted) setMonthCalls(rows); }, () => { if (!controller.signal.aborted) setMonthCalls([]); });
    return () => controller.abort();
  }, [organizationId, refresh]);
  useEffect(() => {
    const controller = new AbortController();
    if (organizationId) void door<{ sources: Array<{ sourceKey: string; name: string; system: string; link: string | null; model: { daily?: { key: string; usdCents: number }[]; limits?: CostLimit[]; summary?: CostSource['summary'] } }> }>(`/api/v3/organizations/${encodeURIComponent(organizationId)}/books`, { signal: controller.signal })
      .then(value => {
        setMetered(value.sources.map(source => ({ days: source.model.daily ?? [], link: source.link, name: source.name, sourceKey: source.sourceKey, system: source.system })));
        setCostSources(value.sources.map(source => ({ days: source.model.daily ?? [], limits: source.model.limits ?? [], link: source.link, name: source.name, sourceKey: source.sourceKey, ...(source.model.summary ? { summary: source.model.summary } : {}), system: source.system })));
      }, () => { setMetered([]); setCostSources([]); });
    return () => controller.abort();
  }, [organizationId, refresh]);
  return <><CostControl now={new Date().toISOString()} sources={costSources} calls={monthCalls} /><MeteredSpend sources={metered} weekStart={new Date(week).toISOString()} /></>;
}
