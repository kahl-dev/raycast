import { Clipboard, Color, Icon, MenuBarExtra } from "@raycast/api";
import * as cache from "./lib/cache";
import { buildDropdownModel, DropdownBucketRow } from "./lib/dropdown-model";
import { formatWeekdayAndTime } from "./lib/format";
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

// Every informational row needs an onAction — without one, macOS renders the MenuBarExtra.Item
// as disabled (washed-out text), which is indistinguishable from an actually-disabled item.
function rowText(title: string, subtitle?: string | null): string {
  return subtitle ? `${title}\n${subtitle}` : title;
}

function copyToClipboard(text: string): void {
  Clipboard.copy(text).catch((error: unknown) => {
    console.error("AI Limits: clipboard copy failed", error);
  });
}

function BucketRow({ row, now }: { row: DropdownBucketRow; now: Date }) {
  const history = cache.getBucketHistory(row.key);
  const projectedLimitHitAt = projectLimitHit(history, row.resetsAt, now);
  const subtitle = projectedLimitHitAt === null ? undefined : `~${formatWeekdayAndTime(projectedLimitHitAt, now)}`;
  const text = rowText(row.title, subtitle);

  return (
    <MenuBarExtra.Item
      title={row.title}
      subtitle={subtitle}
      tooltip={text}
      icon={{ source: Icon.Circle, tintColor: severityColor(row.severity) }}
      onAction={() => copyToClipboard(text)}
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
  const model = props.report ? buildDropdownModel(props.report, props.now) : null;
  const codexSection = model?.codexSection ?? null;
  const codexStandLabel = codexSection?.standLabel ?? null;

  return (
    <>
      {model?.accountSections.map((section) => {
        const standLabel = section.standLabel;
        return (
          <MenuBarExtra.Section key={section.title} title={section.title}>
            {section.rows.map((row) => (
              <BucketRow key={row.key} row={row} now={props.now} />
            ))}
            {/* Keyed by index, not by message: two limits failing the same way produce byte-identical
                messages, and a duplicate key drops one of the rows. */}
            {section.errorRows.map((error, index) => (
              <MenuBarExtra.Item
                key={`error-${index}`}
                title="Error"
                subtitle={error.message}
                icon={Icon.Warning}
                onAction={() => copyToClipboard(rowText("Error", error.message))}
              />
            ))}
            {section.skippedRows.map((skipped, index) => (
              <MenuBarExtra.Item
                key={`skipped-${index}`}
                title="Limit not readable"
                subtitle={skipped.reason}
                icon={Icon.Warning}
                onAction={() => copyToClipboard(rowText("Limit not readable", skipped.reason))}
              />
            ))}
            {standLabel && <MenuBarExtra.Item title={standLabel} onAction={() => copyToClipboard(standLabel)} />}
          </MenuBarExtra.Section>
        );
      })}

      {codexSection && (
        <MenuBarExtra.Section title="OpenAI">
          {codexSection.rows.map((row) => (
            <BucketRow key={row.key} row={row} now={props.now} />
          ))}
          {codexSection.errorRows.map((error, index) => (
            <MenuBarExtra.Item
              key={`codex-error-${index}`}
              title="Error"
              subtitle={error.message}
              icon={Icon.Warning}
              onAction={() => copyToClipboard(rowText("Error", error.message))}
            />
          ))}
          {codexSection.skippedRows.map((skipped, index) => (
            <MenuBarExtra.Item
              key={`codex-skipped-${index}`}
              title="Limit not readable"
              subtitle={skipped.reason}
              icon={Icon.Warning}
              onAction={() => copyToClipboard(rowText("Limit not readable", skipped.reason))}
            />
          ))}
          <MenuBarExtra.Item
            title={codexSection.resetCreditsLabel}
            subtitle={codexSection.resetCreditsSubtitle ?? undefined}
            icon={Icon.Coins}
            onAction={() => copyToClipboard(rowText(codexSection.resetCreditsLabel, codexSection.resetCreditsSubtitle))}
          />
          {codexStandLabel && (
            <MenuBarExtra.Item title={codexStandLabel} onAction={() => copyToClipboard(codexStandLabel)} />
          )}
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
