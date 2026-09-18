import { AiLimitsReport } from "./report";

// U+2009 THIN SPACE — the narrowest standard space character. A regular space between slots would
// widen the menu-bar title more than the extra glyph is worth in the fixed-width menu bar.
const SLOT_SEPARATOR = " ";

// A missing bucket keeps its slot present (fixed width/order) rather than collapsing the title's
// shape — "–" for "no data" instead of dropping the slot outright.
const MISSING_VALUE_PLACEHOLDER = "–"; // EN DASH

// ᴳ MODIFIER LETTER CAPITAL G — the fixed Codex slot, always last.
const CODEX_LABEL = "ᴳ";

// Superscript account-label table (Unicode modifier letters, not styled text) for every character
// the registry's `label` field allows ([a-pr-z0-9] — "q" is excluded because no Unicode
// superscript "q" exists, see `bin/ai-limits`'s registry validation).
const SUPERSCRIPT_TABLE: Record<string, string> = {
  a: "ᵃ",
  b: "ᵇ",
  c: "ᶜ",
  d: "ᵈ",
  e: "ᵉ",
  f: "ᶠ",
  g: "ᵍ",
  h: "ʰ",
  i: "ⁱ",
  j: "ʲ",
  k: "ᵏ",
  l: "ˡ",
  m: "ᵐ",
  n: "ⁿ",
  o: "ᵒ",
  p: "ᵖ",
  r: "ʳ",
  s: "ˢ",
  t: "ᵗ",
  u: "ᵘ",
  v: "ᵛ",
  w: "ʷ",
  x: "ˣ",
  y: "ʸ",
  z: "ᶻ",
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
};

// ai-limits already validated the label against the same [a-pr-z0-9] rule (registry load), so an
// unknown label here means the contract between the two tools has drifted — that is a bug, not a
// degraded-render case, hence a throw rather than a silent placeholder.
function superscript(label: string): string {
  const glyph = SUPERSCRIPT_TABLE[label];
  if (glyph === undefined) {
    throw new Error(`ai-limits: no superscript glyph for account label "${label}" (expected [a-pr-z0-9])`);
  }
  return glyph;
}

function renderSlot(prefix: string, percent: number | null): string {
  if (percent === null) {
    return `${prefix}${MISSING_VALUE_PLACEHOLDER}`;
  }
  return `${prefix}${Math.round(percent)}`;
}

// Severity is deliberately not signalled in the title; pace/severity detail
// lives exclusively in the dropdown's per-row dots.
export function buildMenuBarTitle(report: AiLimitsReport): string {
  const accountSlots = report.accounts.map((account) => {
    const bucket = report.buckets.find(
      (candidate) =>
        candidate.provider === "anthropic" &&
        candidate.account === account.name &&
        candidate.id === "anthropic.weekly_all",
    );
    return renderSlot(superscript(account.label), bucket ? bucket.percent : null);
  });

  const codexBucket = report.buckets.find(
    (candidate) => candidate.provider === "codex" && candidate.id === "codex.primary",
  );
  const codexSlot = renderSlot(CODEX_LABEL, codexBucket ? codexBucket.percent : null);

  return [...accountSlots, codexSlot].join(SLOT_SEPARATOR);
}
