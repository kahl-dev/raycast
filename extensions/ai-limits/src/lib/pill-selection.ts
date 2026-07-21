import {
  findHighestWeeklyScopedBucket,
  findPrimaryOpenAiBucket,
  findSessionBucket,
  findWeeklyAllBucket,
} from "./format";
import { Bucket } from "./types";

export type PillCommandKind = "claude-week" | "fable" | "openai" | "session";

export const PILL_COMMAND_KINDS: PillCommandKind[] = ["claude-week", "fable", "openai", "session"];

// Every pill kind maps to its package.json command name by the same "pill-" + kind convention —
// used both by the pill commands themselves and by the main command's manual-refresh fan-out
// (menu-bar.tsx).
export function pillCommandName(kind: PillCommandKind): string {
  return `pill-${kind}`;
}

// Total (Record, not Partial) so a future PillCommandKind without a wired selector is a compile
// error rather than a silently-always-null pill. Each entry reuses format.ts's bucket finders
// instead of re-deriving the same id/prefix lookups — "fable" is not a special case in the
// dispatch logic, just a different (but equally first-class) selector than the other three.
const SELECTOR_BY_KIND: Record<PillCommandKind, (buckets: Bucket[]) => Bucket | null> = {
  "claude-week": findWeeklyAllBucket,
  fable: findHighestWeeklyScopedBucket,
  openai: findPrimaryOpenAiBucket,
  session: findSessionBucket,
};

export function selectPillBucket(kind: PillCommandKind, buckets: Bucket[]): Bucket | null {
  return SELECTOR_BY_KIND[kind](buckets);
}

// Mimics iStat Menus' stacked-letter label column: every kind gets a fixed 3-letter abbreviation
// so the pill identifies itself in the menu bar even when selectPillBucket returns null (missing
// bucket) — the label is a property of the command, not of the bucket it happens to find.
const LABEL_BY_KIND: Record<PillCommandKind, string> = {
  "claude-week": "CLD",
  fable: "FAB",
  openai: "OAI",
  session: "SES",
};

export function pillLabelForKind(kind: PillCommandKind): string {
  return LABEL_BY_KIND[kind];
}
