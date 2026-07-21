import { Color, Icon, MenuBarExtra } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useState } from "react";
import * as cache from "./lib/cache";
import { readCodexAuth, runCodexLoginStatus, shouldShowRedeemHint } from "./lib/codex";
import {
  buildMenuBarTitle,
  computeBucketSeverities,
  formatResetGerman,
  formatTimeShort,
  formatWeekdayAndTime,
  highestDisplaySeverity,
  TITLE_LAYOUTS,
  TitleLayout,
} from "./lib/format";
import { readAnthropicToken } from "./lib/keychain";
import { LoadDependencies, loadUsageData, staleSuffix } from "./lib/load";
import { sendMacNotification } from "./lib/notify";
import { projectLimitHit } from "./lib/projection";
import { Bucket, Severity } from "./lib/types";

const LAYOUT_LABELS: Record<TitleLayout, string> = {
  weekly: "Woche (Standard)",
  all: "Alle Werte",
  max: "Nur höchster Wert",
  icon: "Nur Icon",
};

const loadDependencies: LoadDependencies = {
  now: () => new Date(),
  cache: {
    getLastAnthropicAttemptAt: cache.getLastAnthropicAttemptAt,
    setLastAnthropicAttemptAt: cache.setLastAnthropicAttemptAt,
    getLastCodexLoginAttemptAt: cache.getLastCodexLoginAttemptAt,
    setLastCodexLoginAttemptAt: cache.setLastCodexLoginAttemptAt,
    getLastGoodBuckets: cache.getLastGoodBuckets,
    setLastGoodBuckets: cache.setLastGoodBuckets,
    getFiredAlertKeys: cache.getFiredAlertKeys,
    setFiredAlertKeys: cache.setFiredAlertKeys,
    getLastUpdatedAt: cache.getLastUpdatedAt,
    setLastUpdatedAt: cache.setLastUpdatedAt,
    getBucketHistory: cache.getBucketHistory,
    setBucketHistory: cache.setBucketHistory,
  },
  readToken: readAnthropicToken,
  readAuth: readCodexAuth,
  runLoginStatus: runCodexLoginStatus,
  fetchImplementation: fetch,
  notify: sendMacNotification,
};

function severityColor(severity: Severity): Color {
  if (severity === "critical") {
    return Color.Red;
  }
  if (severity === "warning") {
    return Color.Orange;
  }
  return Color.Green;
}

function BucketRow({ bucket, severity, now }: { bucket: Bucket; severity: Severity; now: Date }) {
  const history = cache.getBucketHistory(bucket.id);
  const projectedLimitHitAt = projectLimitHit(history, bucket.resetsAt, now);
  const projectionSuffix =
    projectedLimitHitAt === null ? "" : ` · Limit ~${formatWeekdayAndTime(projectedLimitHitAt, now)}`;

  return (
    <MenuBarExtra.Item
      title={`${bucket.label}: ${Math.round(bucket.percent)}%`}
      subtitle={`Reset ${formatResetGerman(bucket.resetsAt, now)}${projectionSuffix}`}
      icon={{ source: Icon.Circle, tintColor: severityColor(severity) }}
    />
  );
}

export default function MenuBar() {
  const [layout, setLayoutState] = useState<TitleLayout>(() => cache.getLayout());
  const { data, isLoading, revalidate } = useCachedPromise(() => loadUsageData(loadDependencies), []);

  const now = new Date();
  const allBuckets = data ? [...data.anthropicBuckets, ...data.codexBuckets] : [];
  const title = data ? buildMenuBarTitle(layout, allBuckets) : "…";

  // Computed once here (not once per BucketRow render) so the menu bar icon tint (worst-of-all)
  // and each row's own dot color share the same displaySeverity result per bucket.
  const anthropicSeverities = data ? computeBucketSeverities(data.anthropicBuckets, now) : [];
  const codexSeverities = data ? computeBucketSeverities(data.codexBuckets, now) : [];
  const tintColor = severityColor(highestDisplaySeverity([...anthropicSeverities, ...codexSeverities]));

  const primaryCodexBucket = data?.codexBuckets.find((bucket) => bucket.id === "openai:primary") ?? null;
  const showResetCredits =
    data !== undefined && data.codexResetCreditsAvailable !== null && data.codexResetCreditsAvailable > 0;

  function selectLayout(next: TitleLayout) {
    setLayoutState(next);
    cache.setLayout(next);
  }

  return (
    <MenuBarExtra icon={{ source: Icon.Gauge, tintColor }} title={title} isLoading={isLoading} tooltip="AI Limits">
      {data && (
        <>
          <MenuBarExtra.Section title="Claude">
            {data.anthropicBuckets.length === 0 ? (
              <MenuBarExtra.Item title="Keine Daten (Keychain-Token fehlt?)" icon={Icon.Warning} />
            ) : (
              anthropicSeverities.map(({ bucket, severity }) => (
                <BucketRow key={bucket.id} bucket={bucket} severity={severity} now={now} />
              ))
            )}
          </MenuBarExtra.Section>

          <MenuBarExtra.Section title="OpenAI">
            {data.codexHint && <MenuBarExtra.Item title={data.codexHint} icon={Icon.Warning} />}
            {data.codexBuckets.length === 0 && !data.codexHint ? (
              <MenuBarExtra.Item title="Keine Daten (Codex-Login fehlt?)" icon={Icon.Warning} />
            ) : (
              codexSeverities.map(({ bucket, severity }) => (
                <BucketRow key={bucket.id} bucket={bucket} severity={severity} now={now} />
              ))
            )}
            {showResetCredits && (
              <MenuBarExtra.Item
                title={`Reset-Credits: ${data.codexResetCreditsAvailable} verfügbar`}
                icon={Icon.Coins}
                subtitle={shouldShowRedeemHint(primaryCodexBucket) ? "Einlösen: codex → /usage" : undefined}
              />
            )}
          </MenuBarExtra.Section>

          <MenuBarExtra.Section title="Layout">
            {TITLE_LAYOUTS.map((option) => (
              <MenuBarExtra.Item
                key={option}
                title={LAYOUT_LABELS[option]}
                icon={option === layout ? Icon.Checkmark : undefined}
                onAction={() => selectLayout(option)}
              />
            ))}
          </MenuBarExtra.Section>

          <MenuBarExtra.Section>
            <MenuBarExtra.Item
              title="Aktualisieren"
              icon={Icon.ArrowClockwise}
              onAction={() => revalidate()}
              shortcut={{ modifiers: ["cmd"], key: "r" }}
            />
            <MenuBarExtra.Item title={`Aktualisiert ${formatTimeShort(data.lastUpdatedAt)}${staleSuffix(data)}`} />
          </MenuBarExtra.Section>
        </>
      )}
    </MenuBarExtra>
  );
}
