import { View } from 'react-native';
import { MobileText } from '@runhuman/workplace/mobile/MobilePage';
import { Row, Section } from '@runhuman/workplace/mobile/MobileScreens';
import { MobileMarkdown } from '@runhuman/workplace/mobile/MobileMarkdown';
import { money, mdate, type MobileWorkspaceProps } from '@runhuman/workplace/mobile/workspace-types';
import type { MobileWidgetHost } from '@runhuman/workplace/contributions/types';
import type { OverviewPart } from '@runhuman/workplace/overview/OverviewView';
type Widget = {
  sources?: {
    sourceKey: string;
    name: string;
    system: string;
    link?: string | null;
    observedAt?: string;
    model: {
      summary?: Record<string, unknown>;
      statements?: { key: string; title: string; text: string }[];
      jobs?: { key: string; title: string; state: string }[];
      sessions?: {
        key: string;
        name: string;
        title: string;
        runtimeStatus?: string | null;
      }[];
      runs?: {
        key: string;
        execution: string;
        startedAt: string;
        finishedAt?: string;
      }[];
    };
  }[];
  tasks?: {
    number?: number;
    taskId: string;
    roomId: string | null;
    title: string;
    status: string;
    updatedAt: string;
  }[];
  listing?: string;
  organizationId?: string;
  services?: {
    organizationId: string;
    listing: {
      offeringId: string;
      name?: string;
      title?: string;
      description?: string;
    };
  }[];
};
export function MobileOverviewWidget({ data, props, part }: { data: unknown; props: MobileWidgetHost; part: Exclude<OverviewPart, { kind: 'markdown'; text: string }> }) {
  const read = { value: data as Widget }; const { platform, visuals, go } = props;
  return <View style={{ gap: 12 }}><Section title={part.options.title ?? part.kind} visuals={visuals} />
      {read.value?.sources?.map((source) => (
        <View key={source.sourceKey} style={{ gap: 8 }}>
          <MobileText heading visuals={visuals}>
            {source.name}
          </MobileText>
          {source.observedAt && (
            <MobileText muted visuals={visuals}>
              Observed {mdate(source.observedAt)}
            </MobileText>
          )}
          {source.model.summary && (
            <>
              {[
                "balanceUsdCents",
                "inUsdCents",
                "spentUsdCents",
                "burnPerDayUsdCents",
              ]
                .filter((key) => typeof source.model.summary![key] === "number")
                .map((key) => (
                  <Row
                    key={key}
                    title={
                      (
                        {
                          balanceUsdCents: "Balance",
                          inUsdCents: "Put in",
                          spentUsdCents: "Spent",
                          burnPerDayUsdCents: "Burn per day",
                        } as Record<string, string>
                      )[key]!
                    }
                    detail={money(source.model.summary![key] as number)}
                    visuals={visuals}
                  />
                ))}
              <Row
                title="Runway"
                detail={
                  source.model.summary.runwayDays == null
                    ? "Not reported"
                    : `${source.model.summary.runwayDays} days · goal ${source.model.summary.goalDays ?? "not reported"}`
                }
                visuals={visuals}
              />
              {typeof source.model.summary.giveUrl === "string" && (
                <Row
                  title="Give"
                  onPress={() =>
                    void platform.open(source.model.summary!.giveUrl as string)
                  }
                  visuals={visuals}
                />
              )}
            </>
          )}
          {source.model.statements?.map((statement) => (
            <View key={statement.key}>
              <MobileText heading visuals={visuals}>
                {statement.title}
              </MobileText>
              <MobileMarkdown
                text={statement.text}
                onLink={(url) => void platform.open(url)}
                visuals={visuals}
              />
            </View>
          ))}
          {source.link && (
            <Row
              title={`Open in ${source.system}`}
              onPress={() => void platform.open(source.link!)}
              visuals={visuals}
            />
          )}
        </View>
      ))}
  {!read.value.sources?.length && <MobileText muted visuals={visuals}>Nothing published here yet.</MobileText>}</View>;
}
