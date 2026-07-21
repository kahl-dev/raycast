import { Color, Icon, MenuBarExtra } from "@raycast/api";
import * as cache from "./lib/cache";
import { shouldShowRedeemHint } from "./lib/codex";
import {
  computeBucketSeverities,
  findPrimaryOpenAiBucket,
  formatResetGerman,
  formatTimeShort,
  formatWeekdayAndTime,
  TITLE_LAYOUTS,
  TitleLayout,
} from "./lib/format";
import { projectLimitHit } from "./lib/projection";
import { Bucket, Severity } from "./lib/types";

const LAYOUT_LABELS: Record<TitleLayout, string> = {
  weekly: "Woche (Standard)",
  all: "Alle Werte",
  max: "Nur höchster Wert",
  icon: "Nur Icon",
};

export function severityColor(severity: Severity): Color {
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

export interface LayoutSectionProps {
  layout: TitleLayout;
  onSelectLayout: (layout: TitleLayout) => void;
}

export interface DropdownContentProps {
  anthropicBuckets: Bucket[];
  codexBuckets: Bucket[];
  // Fetch-only signals (a live codex.ts load result) — null for the pill commands, which read
  // last-good buckets from Cache and never fetch, so they have no hint or credits count to show.
  codexHint: string | null;
  codexResetCreditsAvailable: number | null;
  lastUpdatedAt: Date | null;
  staleSuffixText: string;
  now: Date;
  onRefresh: () => void;
  // Present only for the main command — see menu-bar.tsx and pill-command.tsx for the "why":
  // changing title layout has no visible effect on a pill's fixed percent title, so pill dropdowns
  // omit this section rather than show a control that does nothing there.
  layoutSection?: LayoutSectionProps;
}

export function DropdownContent(props: DropdownContentProps) {
  const anthropicSeverities = computeBucketSeverities(props.anthropicBuckets, props.now);
  const codexSeverities = computeBucketSeverities(props.codexBuckets, props.now);
  const primaryCodexBucket = findPrimaryOpenAiBucket(props.codexBuckets);
  const showResetCredits = props.codexResetCreditsAvailable !== null && props.codexResetCreditsAvailable > 0;
  const lastUpdatedLabel =
    props.lastUpdatedAt === null
      ? "Noch nicht aktualisiert"
      : `Aktualisiert ${formatTimeShort(props.lastUpdatedAt)}${props.staleSuffixText}`;
  const layoutSection = props.layoutSection;

  return (
    <>
      <MenuBarExtra.Section title="Claude">
        {props.anthropicBuckets.length === 0 ? (
          <MenuBarExtra.Item title="Keine Daten (Keychain-Token fehlt?)" icon={Icon.Warning} />
        ) : (
          anthropicSeverities.map(({ bucket, severity }) => (
            <BucketRow key={bucket.id} bucket={bucket} severity={severity} now={props.now} />
          ))
        )}
      </MenuBarExtra.Section>

      <MenuBarExtra.Section title="OpenAI">
        {props.codexHint && <MenuBarExtra.Item title={props.codexHint} icon={Icon.Warning} />}
        {props.codexBuckets.length === 0 && !props.codexHint ? (
          <MenuBarExtra.Item title="Keine Daten (Codex-Login fehlt?)" icon={Icon.Warning} />
        ) : (
          codexSeverities.map(({ bucket, severity }) => (
            <BucketRow key={bucket.id} bucket={bucket} severity={severity} now={props.now} />
          ))
        )}
        {showResetCredits && (
          <MenuBarExtra.Item
            title={`Reset-Credits: ${props.codexResetCreditsAvailable} verfügbar`}
            icon={Icon.Coins}
            subtitle={shouldShowRedeemHint(primaryCodexBucket) ? "Einlösen: codex → /usage" : undefined}
          />
        )}
      </MenuBarExtra.Section>

      {layoutSection && (
        <MenuBarExtra.Section title="Layout">
          {TITLE_LAYOUTS.map((option) => (
            <MenuBarExtra.Item
              key={option}
              title={LAYOUT_LABELS[option]}
              icon={option === layoutSection.layout ? Icon.Checkmark : undefined}
              onAction={() => layoutSection.onSelectLayout(option)}
            />
          ))}
        </MenuBarExtra.Section>
      )}

      <MenuBarExtra.Section>
        <MenuBarExtra.Item
          title="Aktualisieren"
          icon={Icon.ArrowClockwise}
          onAction={props.onRefresh}
          shortcut={{ modifiers: ["cmd"], key: "r" }}
        />
        <MenuBarExtra.Item title={lastUpdatedLabel} />
      </MenuBarExtra.Section>
    </>
  );
}
