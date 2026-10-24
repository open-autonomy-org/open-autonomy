import { MobileSectionPicker } from "@runhuman/workplace/mobile/MobileScreens";
import { useState } from "react";
import { View } from "react-native";
import { MobilePage, MobileText } from "@runhuman/workplace/mobile/MobilePage";
import { MobileNotice, Row, Section } from "@runhuman/workplace/mobile/MobileScreens";
import {
  MobileActionForm,
  MobileFields,
  useMobileAction,
} from "@runhuman/workplace/mobile/MobileAction";
import {
  MobileRecords,
  type MobileRecordSection,
} from "@runhuman/workplace/mobile/MobileWorkspaceScreens";
import { MobileMarkdown } from "@runhuman/workplace/mobile/MobileMarkdown";
import { MobileMeter, MobileWeek, monday } from "@runhuman/workplace/mobile/MobileMeasurements";
import { request, useRead } from "@runhuman/workplace/mobile/data";
import {
  mid,
  money,
  mdate,
  type MobileWorkspaceProps,
} from "@runhuman/workplace/mobile/workspace-types";
import type { BooksSource, BooksControl } from "./BooksView.js";
import type { UsageSeat } from "@runhuman/workplace/organization/Usage";
import type { AlertEntry } from "@runhuman/workplace/inbox/AlertList";
import type { TaskRecord } from "@runhuman/workplace/api";

export function MobileBooks(props: MobileWorkspaceProps) {
  const { platform, organization, visuals, onBack } = props,
    root = `/api/v3/organizations/${mid(organization)}/books`;
  const read = useRead<{ sources: BooksSource[]; controls: BooksControl[] }>(
    platform,
    root,
    organization,
    15000,
  );
  const [selected, setSelected] = useState<string>(),
    [section, setSection] = useState("Summary");
  const action = useMobileAction(platform, organization, read.retry);
  if (action.action)
    return (
      <MobileActionForm
        key={action.action.title}
        action={action.action}
        onBack={action.dismiss}
        visuals={visuals}
      />
    );
  const source = read.value?.sources.find(
    (source) => source.sourceKey === selected,
  );
  if (!source)
    return (
      <MobilePage title="Books" onBack={onBack} visuals={visuals}>
        {read.error && (
          <MobileNotice
            message={read.error}
            retry={read.retry}
            visuals={visuals}
          />
        )}
        {!read.value && !read.error && (
          <MobileNotice message="Loading books…" busy visuals={visuals} />
        )}
        {read.value?.sources.map((source) => (
          <Row
            key={source.sourceKey}
            title={source.name}
            detail={`${source.system} · ${money(source.model.summary.balanceUsdCents)}\nObserved ${mdate(source.observedAt)}`}
            onPress={() => setSelected(source.sourceKey)}
            visuals={visuals}
          />
        ))}
        {read.value && !read.value.sources.length && (
          <MobileText muted visuals={visuals}>
            No funding system has published books.
          </MobileText>
        )}
      </MobilePage>
    );
  const { summary, flows, envelopes, limits, statements, daily } = source.model,
    controls = read.value!.controls.filter(
      (control) => control.sourceKey === source.sourceKey,
    ),
    asked = controls.find((control) => control.state === "requested");
  const sections: MobileRecordSection[] =
    section === "Summary"
      ? [
          {
            title: "Funding",
            rows: [
              { key: "standing", title: "Standing", detail: summary.standing },
              {
                key: "balance",
                title: "Balance",
                detail: money(summary.balanceUsdCents),
              },
              { key: "in", title: "Put in", detail: money(summary.inUsdCents) },
              {
                key: "out",
                title: "Given out",
                detail: money(summary.outUsdCents),
              },
              {
                key: "spent",
                title: "Spent",
                detail: money(summary.spentUsdCents),
              },
              {
                key: "burn",
                title: "Burn per day",
                detail: money(summary.burnPerDayUsdCents),
              },
              {
                key: "runway",
                title: "Runway",
                detail:
                  summary.runwayDays === null
                    ? "Not reported"
                    : `${summary.runwayDays} days · goal ${summary.goalDays} days${summary.runwayConfident ? "" : " · estimate uncertain"}`,
              },
            ],
          },
          {
            title: "Spending controls",
            rows: [
              {
                key: "freeze",
                title: summary.freeze
                  ? "Spending is frozen"
                  : "Spending is open",
                detail: summary.freeze
                  ? `${mdate(summary.freeze.at)} · ${summary.freeze.by}${summary.freeze.from ? ` · from ${summary.freeze.from}` : ""}\n${summary.freeze.reason ?? ""}`
                  : "A freeze sets a cap of zero on every spending rail.",
              },
              ...controls.map((control) => ({
                key: control.controlId,
                title: `${control.action} · ${control.state}`,
                detail: `${mdate(control.requestedAt)}${control.note ? ` · ${control.note}` : ""}`,
              })),
            ],
          },
        ]
      : section === "Flows"
        ? [
            {
              title: "Money in and out",
              rows: flows.map((flow) => ({
                key: flow.key,
                title: `${flow.direction === "in" ? "In" : "Out"} ${money(flow.usdCents)} · ${flow.party}`,
                detail: `${flow.what}\n${mdate(flow.at)}`,
              })),
            },
          ]
        : section === "Earmarked"
          ? [
              {
                title: "Earmarked balances",
                rows: envelopes.map((envelope) => ({
                  key: envelope.key,
                  title: envelope.purpose,
                  detail: `${money(envelope.balanceUsdCents)}${envelope.from ? ` · from ${envelope.from}` : ""}`,
                })),
              },
            ]
          : section === "Limits"
            ? [
                {
                  title: "Spending caps",
                  rows: limits.map((limit) => ({
                    key: limit.key,
                    title: `${limit.model ?? limit.key} · per ${limit.window}`,
                    detail: `${money(limit.used.usdCents)} spent${limit.usdCents === undefined ? "" : ` / ${money(limit.usdCents)}`}\n${limit.used.calls} calls${limit.calls === undefined ? "" : ` / ${limit.calls}`} · ${limit.used.tokens} tokens${limit.tokens === undefined ? "" : ` / ${limit.tokens}`}`,
                  })),
                },
              ]
            : section === "Statements"
              ? [
                  {
                    title: "Statements",
                    rows: statements.map((statement) => ({
                      key: statement.key,
                      title: statement.title,
                      detail: `${statement.text}\n${mdate(statement.at)}`,
                    })),
                  },
                ]
              : [{ title: "Daily spend", rows: [] }];
  return (
    <MobileRecords
      title={source.name}
      subtitle={`${source.system} · observed ${mdate(source.observedAt)}`}
      onBack={() => {
        setSelected(undefined);
        setSection("Summary");
      }}
      sections={sections}
      visuals={visuals}
    >
      {read.error && (
        <MobileNotice
          message={read.error}
          retry={read.retry}
          visuals={visuals}
        />
      )}
      <MobileSectionPicker items={["Summary", "Flows", "Earmarked", "Limits", "Statements", "Daily"].map(key => ({ key, label: key }))} selected={section} onSelect={setSection} visuals={visuals} />
      {section === "Summary" && (
        <>
          {summary.giveUrl && (
            <Row
              title="Give"
              onPress={() => void platform.open(summary.giveUrl!)}
              visuals={visuals}
            />
          )}
          {source.link && (
            <Row
              title={`Open books in ${source.system}`}
              onPress={() => void platform.open(source.link!)}
              visuals={visuals}
            />
          )}
          {summary.canFreeze &&
            !asked &&
            (!summary.freeze || !summary.freeze.from) && (
              <Row
                title={
                  summary.freeze ? "Lift spending freeze" : "Freeze spending"
                }
                onPress={() =>
                  action.edit({
                    title: summary.freeze
                      ? "Lift spending freeze"
                      : "Freeze spending",
                    retry: false,
                    impact:
                      "This asks the funding system to change its spending cap. The current state changes only when its next publication confirms it.",
                    fields: [
                      {
                        key: "reason",
                        label: "Reason (optional)",
                        optional: true,
                      },
                    ],
                    run: (value) =>
                      request(
                        platform,
                        `${root}/${mid(source.sourceKey)}/controls`,
                        {
                          organization,
                          body: {
                            action: summary.freeze ? "unfreeze" : "freeze",
                            targetKey: summary.account,
                            ...(value.reason?.trim()
                              ? { reason: value.reason.trim() }
                              : {}),
                          },
                        },
                      ),
                  })
                }
                visuals={visuals}
              />
            )}
        </>
      )}
      {section === "Daily" &&
        daily.map((day) => (
          <MobileMeter
            key={day.key}
            label={day.key}
            value={day.usdCents}
            maximum={Math.max(1, ...daily.map((day) => day.usdCents))}
            detail={`${money(day.usdCents)} · ${day.calls} calls`}
            visuals={visuals}
          />
        ))}
    </MobileRecords>
  );
}
