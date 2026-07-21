import { environment, launchCommand, LaunchType, MenuBarExtra } from "@raycast/api";
import { join } from "node:path";
import { DropdownContent } from "./dropdown";
import * as cache from "./lib/cache";
import { buildPillFileName, ensurePillPngFile } from "./lib/pill-files";
import { PillCommandKind, pillLabelForKind, selectPillBucket } from "./lib/pill-selection";
import {
  PillPalette,
  PillTheme,
  quantizeFillPercent,
  quantizeTickPercent,
  renderPillPng,
  severityToPalette,
} from "./lib/pill";
import { Bucket, computeElapsedPercent, displaySeverity } from "./lib/types";

const PILLS_DIRECTORY = join(environment.supportPath, "pills");

// The tick visualizes pace: how far the current window has elapsed (computeElapsedPercent),
// against the fill's usage percent — the same comparison paceSeverity/displaySeverity already
// make for the dropdown's severity coloring, now made visible on the icon itself. A missing
// bucket has neither a usage level nor a window to compute pace against, so it gets no tick.
function pillParameters(
  bucket: Bucket | null,
  now: Date,
): { fillPercent: number; tickPercent: number | null; palette: PillPalette } {
  if (bucket === null) {
    return { fillPercent: 0, tickPercent: null, palette: "neutral" };
  }
  return {
    fillPercent: quantizeFillPercent(bucket.percent),
    tickPercent: quantizeTickPercent(computeElapsedPercent(bucket.windowSeconds, bucket.resetsAt, now)),
    palette: severityToPalette(displaySeverity(bucket, now)),
  };
}

function resolvePillIconPath(
  theme: PillTheme,
  label: string,
  fillPercent: number,
  tickPercent: number | null,
  palette: PillPalette,
): string {
  const fileName = buildPillFileName(label, fillPercent, tickPercent, palette, theme);
  return ensurePillPngFile(PILLS_DIRECTORY, fileName, () =>
    renderPillPng({ fillPercent, tickPercent, palette, theme, label }),
  );
}

function resolvePillIconPaths(bucket: Bucket | null, label: string, now: Date): { light: string; dark: string } {
  const { fillPercent, tickPercent, palette } = pillParameters(bucket, now);
  return {
    light: resolvePillIconPath("light", label, fillPercent, tickPercent, palette),
    dark: resolvePillIconPath("dark", label, fillPercent, tickPercent, palette),
  };
}

function pillTitle(bucket: Bucket | null): string {
  return bucket === null ? "–" : `${Math.round(bucket.percent)}%`;
}

export function PillCommand({ kind }: { kind: PillCommandKind }) {
  const now = new Date();
  const anthropicBuckets = cache.getLastGoodBuckets("anthropic") ?? [];
  const codexBuckets = cache.getLastGoodBuckets("openai") ?? [];
  const bucket = selectPillBucket(kind, [...anthropicBuckets, ...codexBuckets]);
  const label = pillLabelForKind(kind);
  const iconPaths = resolvePillIconPaths(bucket, label, now);

  // Pill commands are pure cache readers — they never fetch, notify, or write history themselves
  // (menu-bar.tsx is the sole data owner). "Refresh" here means "ask the data-owning main command
  // to fetch", not doing it locally. A failure (e.g. the user has since disabled the menu-bar
  // command) is logged, not thrown, so it never surfaces as a broken dropdown action.
  async function refreshViaMainCommand() {
    try {
      await launchCommand({ name: "menu-bar", type: LaunchType.Background });
    } catch (error) {
      console.error("AI Limits: Aktualisierung über den Hauptbefehl fehlgeschlagen", error);
    }
  }

  return (
    <MenuBarExtra icon={{ source: iconPaths }} title={pillTitle(bucket)} tooltip="AI Limits">
      <DropdownContent
        anthropicBuckets={anthropicBuckets}
        codexBuckets={codexBuckets}
        codexHint={null}
        codexResetCreditsAvailable={null}
        lastUpdatedAt={cache.getLastUpdatedAt()}
        staleSuffixText=""
        now={now}
        onRefresh={refreshViaMainCommand}
      />
    </MenuBarExtra>
  );
}
