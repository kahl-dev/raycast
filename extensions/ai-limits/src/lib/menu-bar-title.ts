import {
  findHighestWeeklyScopedBucket,
  findPrimaryOpenAiBucket,
  findSessionBucket,
  findWeeklyAllBucket,
} from "./format";
import { Bucket } from "./types";

// U+2009 THIN SPACE — the narrowest standard space character. A regular space between four slots
// would widen the menu-bar title more than the extra glyph is worth in the fixed-width menu bar.
const SLOT_SEPARATOR = " ";

// Superscript slot labels (Unicode modifier letters, not styled text) identify each of the four
// fixed slots at a glance without spelling out full words.
const SESSION_LABEL = "ˢ"; // ˢ MODIFIER LETTER SMALL S
const WEEKLY_ALL_LABEL = "ᵂ"; // ᵂ MODIFIER LETTER CAPITAL W
const WEEKLY_SCOPED_LABEL = "ᶠ"; // ᶠ MODIFIER LETTER SMALL F WITH HOOK
const OPENAI_PRIMARY_LABEL = "ᴳ"; // ᴳ MODIFIER LETTER CAPITAL G

// Rounded percent without a "%" sign — the menu-bar title is already crowded with four slots and
// every character costs horizontal space. "–" for a missing bucket keeps the slot itself always
// present (fixed width/order) rather than collapsing the title's shape.
const MISSING_VALUE_PLACEHOLDER = "–"; // – EN DASH

// Severity is deliberately not signalled in the title (narrowest possible title, user decision);
// pace/severity detail lives exclusively in the dropdown's per-row dots.
function renderSlot(bucket: Bucket | null, label: string): string {
  if (bucket === null) {
    return `${label}${MISSING_VALUE_PLACEHOLDER}`;
  }
  return `${label}${Math.round(bucket.percent)}`;
}

// Four fixed slots, always in this order, always all four, regardless of which buckets are
// actually present: session, the all-models weekly bucket, the highest-percent per-model weekly
// bucket, and OpenAI's (Codex's) primary bucket. Reuses format.ts's fixed-id finders so each
// slot's lookup logic stays in one place shared with the dropdown.
export function buildMenuBarTitle(buckets: Bucket[]): string {
  const session = findSessionBucket(buckets);
  const weeklyAll = findWeeklyAllBucket(buckets);
  const highestWeeklyScoped = findHighestWeeklyScopedBucket(buckets);
  const openAiPrimary = findPrimaryOpenAiBucket(buckets);

  return [
    renderSlot(session, SESSION_LABEL),
    renderSlot(weeklyAll, WEEKLY_ALL_LABEL),
    renderSlot(highestWeeklyScoped, WEEKLY_SCOPED_LABEL),
    renderSlot(openAiPrimary, OPENAI_PRIMARY_LABEL),
  ].join(SLOT_SEPARATOR);
}
