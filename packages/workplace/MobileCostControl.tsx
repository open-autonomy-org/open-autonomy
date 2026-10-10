import { useMemo } from "react";
import { View } from "react-native";
import type { CostSource, CostLimit } from "./CostControl.js";
import type { UsageEntry } from "@runhuman/workplace/organization/Usage";
import { MobileText } from "@runhuman/workplace/mobile/MobilePage";
import { MobileNotice, Row, Section } from "@runhuman/workplace/mobile/MobileScreens";
import { MobileMeter, measurementPages } from "@runhuman/workplace/mobile/MobileMeasurements";
import { useRead } from "@runhuman/workplace/mobile/data";
import { mid, money, type MobileWorkspaceProps } from "@runhuman/workplace/mobile/workspace-types";
// Discord's insights/settings rows: every funding source retains its own attribution
// and budget door. Failed measurement reads never masquerade as zero spend.
export function MobileCostControl({
  platform,
  organization,
  visuals,
  go,
}: MobileWorkspaceProps) {
  const now = useMemo(() => Date.now(), [organization]);
  const date = new Date(now),
    start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1),
    end = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
  const books = useRead<{
    sources: Array<
      Omit<CostSource, "days" | "limits" | "summary"> & {
        model: {
          daily?: CostSource["days"];
          limits?: CostLimit[];
          summary?: CostSource["summary"];
        };
      }
    >;
  }>(
    platform,
    `/api/v3/organizations/${mid(organization)}/books`,
    organization,
    30000,
  );
  return (
    <View style={{ gap: 8 }}>
      <Section
        title={`Cost control · ${date.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" })}`}
        visuals={visuals}
      />
      <MonthlyCosts
        platform={platform}
        organization={organization}
        visuals={visuals}
        go={go}
        start={start}
        end={end}
        now={now}
        books={books}
      />
    </View>
  );
}
import { useEffect, useState } from "react";
function MonthlyCosts({
  platform,
  organization,
  visuals,
  go,
  start,
  end,
  now,
  books,
}: Pick<
  MobileWorkspaceProps,
  "platform" | "organization" | "visuals" | "go"
> & {
  start: number;
  end: number;
  now: number;
  books: ReturnType<
    typeof useRead<{
      sources: Array<
        Omit<CostSource, "days" | "limits" | "summary"> & {
          model: {
            daily?: CostSource["days"];
            limits?: CostLimit[];
            summary?: CostSource["summary"];
          };
        }
      >;
    }>
  >;
}) {
  const [read, setRead] = useState<{
      key: string;
      calls?: UsageEntry[];
      error?: string;
    }>(),
    [revision, retry] = useState(0),
    key = `${organization}:${start}:${now}`;
  useEffect(() => {
    const controller = new AbortController();
    void measurementPages<UsageEntry>(
      platform,
      organization,
      `/api/v3/organizations/${mid(organization)}/measurements?since=${mid(new Date(start).toISOString())}&until=${mid(new Date(now).toISOString())}&limit=2000`,
      "agents",
      controller.signal,
    ).then(
      (calls) => {
        if (!controller.signal.aborted) setRead({ key, calls });
      },
      (failure) => {
        if (!controller.signal.aborted)
          setRead({
            key,
            error: failure instanceof Error ? failure.message : String(failure),
          });
      },
    );
    return () => controller.abort();
  }, [platform, key, revision]);
  const data = read?.key === key ? read : undefined;
  if (books.error || data?.error)
    return (
      <MobileNotice
        message={books.error ?? data!.error!}
        retry={() => {
          books.retry();
          retry((v) => v + 1);
        }}
        visuals={visuals}
      />
    );
  if (!books.value || !data?.calls)
    return (
      <MobileNotice
        message="Loading funding sources and every page of monthly calls…"
        busy
        visuals={visuals}
      />
    );
  const calls = data.calls,
    unpriced = calls.filter((c) => c.costUsd === null).length,
    elapsed = Math.max(1 / 24, (now - start) / 86400000);
  const projects = books.value.sources.map((source) => ({
    ...source,
    days: (source.model.daily ?? []).filter((day) => {
      const at = Date.parse(`${day.key}T00:00:00Z`);
      return at >= start && at < end;
    }),
    limits: source.model.limits ?? [],
    summary: source.model.summary,
    cents: (source.model.daily ?? [])
      .filter((day) => {
        const at = Date.parse(`${day.key}T00:00:00Z`);
        return at >= start && at < end;
      })
      .reduce((sum, day) => sum + day.usdCents, 0),
  }));
  const callCost = calls.reduce(
      (sum, call) => sum + Math.round((call.costUsd ?? 0) * 100),
      0,
    ),
    spent = projects.reduce((sum, p) => sum + p.cents, callCost),
    byModel = new Map<string, number>(),
    byTask = new Map<string, number>();
  for (const call of calls) {
    const cents = Math.round((call.costUsd ?? 0) * 100),
      model = `${call.provider}/${call.model}`,
      task = call.taskId ?? "";
    byModel.set(model, (byModel.get(model) ?? 0) + cents);
    byTask.set(task, (byTask.get(task) ?? 0) + cents);
  }
  const limits = projects.flatMap((source) =>
    source.limits.map((limit) => ({ source, limit })),
  );
  return (
    <>
      <MobileText muted visuals={visuals}>
        Reported by buying systems. Limits are managed in their owning system;
        reported sources can cover overlapping costs.
      </MobileText>
      {unpriced > 0 && (
        <MobileNotice
          message={`${unpriced} calls have unknown prices. Reported totals and projections are incomplete.`}
          visuals={visuals}
        />
      )}
      <Row title="Spent this month" detail={money(spent)} visuals={visuals} />
      <Row
        title="Burn per day"
        detail={money(spent / elapsed)}
        visuals={visuals}
      />
      <Row
        title="Projected month end"
        detail={money((spent / elapsed) * ((end - start) / 86400000))}
        visuals={visuals}
      />
      <Section title="Limits & budgets" visuals={visuals} />
      {!limits.length && (
        <MobileText muted visuals={visuals}>
          No limits published by buying systems.
        </MobileText>
      )}
      {limits.map(({ source, limit }) => (
        <View key={`${source.sourceKey}:${limit.key}`}>
          <MobileMeter
            label={`${source.name}${limit.model ? ` · ${limit.model}` : ""} · per ${limit.window}`}
            value={
              limit.usdCents !== undefined
                ? limit.used.usdCents
                : limit.used.calls
            }
            maximum={limit.usdCents ?? limit.calls ?? 0}
            detail={
              limit.usdCents !== undefined
                ? `${money(limit.used.usdCents)} of ${money(limit.usdCents)}`
                : `${limit.used.calls} of ${limit.calls ?? "unspecified"} calls`
            }
            visuals={visuals}
          />
          {source.link && (
            <Row
              title={`Set in ${source.system}`}
              onPress={() => void platform.open(source.link!)}
              visuals={visuals}
            />
          )}
        </View>
      ))}
      <Section title="By project" visuals={visuals} />
      {projects.map((source) => (
        <View key={source.sourceKey}>
          <Row
            title={source.name}
            detail={`${source.system} · ${money(source.cents)} this month\n${source.summary?.burnPerDayUsdCents === undefined ? "Daily burn not reported" : `${money(source.summary.burnPerDayUsdCents)} per day`} · ${source.summary?.runwayDays == null ? "Runway not reported" : `${source.summary.runwayDays} days runway`}`}
            onPress={
              source.link ? () => void platform.open(source.link!) : undefined
            }
            visuals={visuals}
          />
          <Section title="Daily metered spend" visuals={visuals} />
          {source.days.map((day) => (
            <Row
              key={day.key}
              title={day.key}
              detail={money(day.usdCents)}
              visuals={visuals}
            />
          ))}
        </View>
      ))}
      <Row
        title="Task agents’ calls"
        detail={money(callCost)}
        visuals={visuals}
      />
      <Section title="By resource" visuals={visuals} />
      {!byModel.size && (
        <MobileText muted visuals={visuals}>
          No metered resource calls recorded this month.
        </MobileText>
      )}
      {[...byModel]
        .sort((a, b) => b[1] - a[1])
        .map(([model, cents]) => (
          <Row
            key={model}
            title={model}
            detail={money(cents)}
            visuals={visuals}
          />
        ))}
      <Section title="By Task" visuals={visuals} />
      {!byTask.size && (
        <MobileText muted visuals={visuals}>
          No metered Task calls recorded this month.
        </MobileText>
      )}
      {[...byTask]
        .sort((a, b) => b[1] - a[1])
        .map(([task, cents]) => (
          <Row
            key={task}
            title={task || "Organization overhead"}
            detail={money(cents)}
            onPress={task ? () => go(`/console/tasks/${mid(task)}`) : undefined}
            visuals={visuals}
          />
        ))}
    </>
  );
}
