import { Color, Icon, MenuBarExtra } from "@raycast/api";
import * as cache from "./lib/cache";
import { buildDropdownModel, DropdownBucketRow } from "./lib/dropdown-model";
import { formatReset, formatWeekdayAndTime } from "./lib/format";
import { AiLimitsReport } from "./lib/report";
import { projectLimitHit } from "./lib/projection";
import { Severity } from "./lib/types";

export function severityColor(severity: Severity): Color {
  if (severity === "critical") {
    return Color.Red;
  }
  if (severity === "warning") {
    return Color.Orange;
  }
  return Color.Green;
}

function BucketRow({ row, now }: { row: DropdownBucketRow; now: Date }) {
  const history = cache.getBucketHistory(row.key);
  const projectedLimitHitAt = projectLimitHit(history, row.resetsAt, now);
  const projectionSuffix =
    projectedLimitHitAt === null ? "" : ` · Limit ~${formatWeekdayAndTime(projectedLimitHitAt, now)}`;

  return (
    <MenuBarExtra.Item
      title={`${row.label}: ${Math.round(row.percent)}%`}
      subtitle={`Reset ${formatReset(row.resetsAt, now)}${projectionSuffix}`}
      icon={{ source: Icon.Circle, tintColor: severityColor(row.severity) }}
    />
  );
}

export interface DropdownContentProps {
  report: AiLimitsReport | null;
  runError: string | null;
  now: Date;
  onRefresh: () => void;
}

export function DropdownContent(props: DropdownContentProps) {
  const model = props.report ? buildDropdownModel(props.report) : null;

  return (
    <>
      {model?.accountSections.map((section) => (
        <MenuBarExtra.Section key={section.title} title={section.title}>
          {section.rows.map((row) => (
            <BucketRow key={row.key} row={row} now={props.now} />
          ))}
          {/* Keyed by index, not by message: two limits failing the same way produce byte-identical
              messages, and a duplicate key drops one of the rows. */}
          {section.errorRows.map((error, index) => (
            <MenuBarExtra.Item key={`error-${index}`} title="Error" subtitle={error.message} icon={Icon.Warning} />
          ))}
          {section.skippedRows.map((skipped, index) => (
            <MenuBarExtra.Item
              key={`skipped-${index}`}
              title="Limit not readable"
              subtitle={skipped.reason}
              icon={Icon.Warning}
            />
          ))}
          {section.standLabel && <MenuBarExtra.Item title={section.standLabel} />}
        </MenuBarExtra.Section>
      ))}

      {model && (
        <MenuBarExtra.Section title="OpenAI">
          {model.codexSection.rows.map((row) => (
            <BucketRow key={row.key} row={row} now={props.now} />
          ))}
          {model.codexSection.errorRows.map((error, index) => (
            <MenuBarExtra.Item
              key={`codex-error-${index}`}
              title="Error"
              subtitle={error.message}
              icon={Icon.Warning}
            />
          ))}
          {model.codexSection.skippedRows.map((skipped, index) => (
            <MenuBarExtra.Item
              key={`codex-skipped-${index}`}
              title="Limit not readable"
              subtitle={skipped.reason}
              icon={Icon.Warning}
            />
          ))}
          <MenuBarExtra.Item
            title={model.codexSection.resetCreditsLabel}
            subtitle={model.codexSection.resetCreditsSubtitle ?? undefined}
            icon={Icon.Coins}
          />
          {model.codexSection.standLabel && <MenuBarExtra.Item title={model.codexSection.standLabel} />}
        </MenuBarExtra.Section>
      )}

      <MenuBarExtra.Section>
        <MenuBarExtra.Item
          title="Refresh"
          icon={Icon.ArrowClockwise}
          onAction={props.onRefresh}
          shortcut={{ modifiers: ["cmd"], key: "r" }}
        />
        {props.runError && <MenuBarExtra.Item title="ai-limits failed" subtitle={props.runError} icon={Icon.Warning} />}
      </MenuBarExtra.Section>
    </>
  );
}
