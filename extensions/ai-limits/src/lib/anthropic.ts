import { assertJsonObject, Bucket, FetchFunction, hasElapsed, parseFiniteNumber, readJsonBody, toError } from "./types";

const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const ANTHROPIC_COOLDOWN_MS = 60 * 1000;

const SESSION_WINDOW_SECONDS = 5 * 60 * 60; // 18000 — five_hour / kind:session
const WEEKLY_WINDOW_SECONDS = 7 * 24 * 60 * 60; // 604800 — seven_day / group:weekly

interface RawAnthropicModelScope {
  model?: {
    id?: unknown;
    display_name?: unknown;
  } | null;
  surface?: unknown;
}

interface RawAnthropicLimit {
  kind: string;
  group?: unknown;
  percent: unknown;
  resets_at: unknown;
  scope?: RawAnthropicModelScope | null;
}

interface RawAnthropicLegacyLimit {
  utilization: unknown;
  resets_at: unknown;
}

interface RawAnthropicUsageResponse {
  five_hour?: RawAnthropicLegacyLimit | null;
  seven_day?: RawAnthropicLegacyLimit | null;
  limits?: RawAnthropicLimit[] | null;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function humanizeKind(kind: string): string {
  return kind
    .split("_")
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function weeklyScopedId(scope: RawAnthropicModelScope | null | undefined): string {
  const modelId = scope?.model?.id;
  if (typeof modelId === "string" && modelId.length > 0) {
    return `anthropic:weekly_scoped:${slugify(modelId)}`;
  }
  const displayName = scope?.model?.display_name;
  if (typeof displayName === "string" && displayName.length > 0) {
    return `anthropic:weekly_scoped:${slugify(displayName)}`;
  }
  return "anthropic:weekly_scoped:unknown";
}

function weeklyScopedLabel(scope: RawAnthropicModelScope | null | undefined): string {
  const displayName = scope?.model?.display_name;
  return typeof displayName === "string" && displayName.length > 0 ? displayName : "Woche (Modell)";
}

function parsePercent(kind: string, percent: unknown): number {
  return parseFiniteNumber(percent, `Anthropic-Limit "${kind}" percent`);
}

function parseResetsAt(kind: string, resetsAt: unknown): Date {
  const date = new Date(resetsAt as string);
  if (typeof resetsAt !== "string" || Number.isNaN(date.getTime())) {
    throw new Error(`Anthropic-Limit "${kind}" hat kein valides resets_at: ${JSON.stringify(resetsAt)}`);
  }
  return date;
}

// Limits are grouped ("session", "weekly") and every limit in a group shares that group's window
// boundary. `group` is optional in the payload; `kind` is the fallback key so a limit that omits it
// still lands in its own bucket rather than colliding with unrelated ones.
function groupKey(raw: RawAnthropicLimit): string {
  return typeof raw.group === "string" && raw.group.length > 0 ? raw.group : raw.kind;
}

// The API reports resets_at:null for a limit with no window open — a per-model weekly limit only
// materializes once that model is actually used, so at 0% there is no reset time to report. Every
// observed response has the scoped weekly limit sharing the all-models weekly boundary, so the
// group's anchor is the right substitute. Without this the null propagates into a thrown parse.
function collectGroupResetAnchors(limits: RawAnthropicLimit[]): Map<string, Date> {
  const anchors = new Map<string, Date>();
  for (const raw of limits) {
    const key = groupKey(raw);
    if (anchors.has(key) || typeof raw.resets_at !== "string") {
      continue;
    }
    const date = new Date(raw.resets_at);
    if (!Number.isNaN(date.getTime())) {
      anchors.set(key, date);
    }
  }
  return anchors;
}

// A missing resets_at falls back to the group anchor; anything else (including a malformed string)
// stays a hard parse error for this one limit — callers isolate it, see parseAnthropicUsage.
function resolveResetsAt(raw: RawAnthropicLimit, anchors: Map<string, Date>): Date {
  if (raw.resets_at !== null && raw.resets_at !== undefined) {
    return parseResetsAt(raw.kind, raw.resets_at);
  }

  const anchor = anchors.get(groupKey(raw));
  if (anchor === undefined) {
    throw new Error(
      `Anthropic-Limit "${raw.kind}" hat kein resets_at und seine Gruppe "${groupKey(raw)}" enthält kein Limit mit Reset-Zeitpunkt`,
    );
  }
  return anchor;
}

// Rein datenbasierte Label-Sonderfälle; nur weekly_scoped braucht echte Struktur-Logik (liest scope).
// "session" fehlt bewusst: humanizeKind("session") ergibt bereits "Session".
const KIND_LABEL_OVERRIDES: Record<string, string> = {
  weekly_all: "Woche",
};

// The session window ("five_hour") is 18000s, the weekly window ("seven_day") is 604800s — the
// API does not send a window duration, so it is derived from kind/group. Any group other than
// "session" (weekly, or an unrecognized future group) falls back to the weekly window, since
// "session" is the only short-lived window family today.
function windowSecondsForRawLimit(raw: RawAnthropicLimit): number {
  if (raw.kind === "session" || raw.group === "session") {
    return SESSION_WINDOW_SECONDS;
  }
  return WEEKLY_WINDOW_SECONDS;
}

function makeAnthropicBucket(
  id: string,
  label: string,
  percent: number,
  resetsAt: Date,
  windowSeconds: number,
): Bucket {
  return { id, provider: "anthropic", label, percent, resetsAt, windowSeconds };
}

// Rendert limits[] generisch — NICHT nach is_active filtern. In der verifizierten Response
// haben weekly_all und weekly_scoped (Fable) is_active:false, die Claude-App zeigt sie trotzdem.
// is_active markiert nur "das gerade bindende Limit", nicht "Enforcement" — alle Einträge zählen.
function buildBucketFromRawLimit(raw: RawAnthropicLimit, anchors: Map<string, Date>): Bucket {
  const percent = parsePercent(raw.kind, raw.percent);
  const resetsAt = resolveResetsAt(raw, anchors);
  const windowSeconds = windowSecondsForRawLimit(raw);

  if (raw.kind === "weekly_scoped") {
    return makeAnthropicBucket(
      weeklyScopedId(raw.scope),
      weeklyScopedLabel(raw.scope),
      percent,
      resetsAt,
      windowSeconds,
    );
  }

  const label = KIND_LABEL_OVERRIDES[raw.kind] ?? humanizeKind(raw.kind);
  return makeAnthropicBucket(`anthropic:${raw.kind}`, label, percent, resetsAt, windowSeconds);
}

function buildLegacyBucket(id: string, label: string, raw: RawAnthropicLegacyLimit, windowSeconds: number): Bucket {
  return makeAnthropicBucket(
    id,
    label,
    parsePercent(id, raw.utilization),
    parseResetsAt(id, raw.resets_at),
    windowSeconds,
  );
}

export interface AnthropicUsageParseResult {
  buckets: Bucket[];
  // Human-readable reason per limit that could not be turned into a bucket. Surfaced in the
  // dropdown so a degraded parse is visible instead of looking like "that limit is just unused".
  skipped: string[];
}

// Collects buckets one limit at a time, isolating failures. A single unparseable entry must not
// cost the whole response: the API shipping resets_at:null on one limit silently froze all four
// menu-bar slots on last-good data for days (2026-07-27), because one throw discarded everything.
function collectBuckets(builders: Array<() => Bucket>): AnthropicUsageParseResult {
  const buckets: Bucket[] = [];
  const skipped: string[] = [];
  for (const build of builders) {
    try {
      buckets.push(build());
    } catch (error) {
      skipped.push(toError(error).message);
    }
  }
  return { buckets, skipped };
}

export function parseAnthropicUsage(json: unknown): AnthropicUsageParseResult {
  assertJsonObject(json, "Anthropic-Usage-Antwort");
  const response = json as RawAnthropicUsageResponse;

  if (Array.isArray(response.limits)) {
    const limits = response.limits;
    const anchors = collectGroupResetAnchors(limits);
    return collectBuckets(limits.map((raw) => () => buildBucketFromRawLimit(raw, anchors)));
  }

  if (response.limits !== undefined && response.limits !== null) {
    throw new Error(`Anthropic-Usage-Antwort hat ein ungültiges limits-Feld: ${JSON.stringify(response.limits)}`);
  }

  // Fallback auf Legacy-Felder nur wenn limits[] komplett fehlt (undefined/null).
  const builders: Array<() => Bucket> = [];
  const fiveHour = response.five_hour;
  if (fiveHour) {
    builders.push(() => buildLegacyBucket("anthropic:session", "Session", fiveHour, SESSION_WINDOW_SECONDS));
  }
  const sevenDay = response.seven_day;
  if (sevenDay) {
    builders.push(() => buildLegacyBucket("anthropic:weekly_all", "Woche", sevenDay, WEEKLY_WINDOW_SECONDS));
  }
  return collectBuckets(builders);
}

export async function fetchAnthropicUsage(
  token: string,
  fetchImplementation: FetchFunction = fetch,
): Promise<AnthropicUsageParseResult> {
  const response = await fetchImplementation(USAGE_URL, {
    headers: {
      authorization: `Bearer ${token}`,
      "anthropic-beta": "oauth-2025-04-20",
    },
  });

  if (!response.ok) {
    throw new Error(`Anthropic-Usage-API antwortete mit Status ${response.status}`);
  }

  const json = await readJsonBody(response, "Anthropic-Usage-Antwort");

  return parseAnthropicUsage(json);
}

// Cooldown-Prädikat für den Fetch: useCachedPromise re-executed bei jedem Dropdown-Öffnen
// (stale-while-revalidate, kein eingebautes Dedupe) — ohne dieses Gate würde der eng gedrosselte
// Endpoint (~1 req/min) bei schnellem wiederholtem Öffnen sofort 429en. Die Entscheidung selbst
// trifft loadUsageData (load.ts), damit sie zusammen mit dem Timestamp-Write vor dem Await liegt.
export function isWithinAnthropicCooldown(lastAttemptAt: Date | null, now: Date): boolean {
  return !hasElapsed(lastAttemptAt, now, ANTHROPIC_COOLDOWN_MS);
}

export interface AnthropicLoadDependencies {
  // Decided by the caller (load.ts) via isWithinAnthropicCooldown, so that the gate check and the
  // attempt-timestamp write happen together, before any await.
  skipFetch: boolean;
  lastGoodBuckets: Bucket[] | null;
  readToken: () => Promise<string>;
  fetchImplementation: FetchFunction;
}

export interface AnthropicLoadResult {
  buckets: Bucket[] | null;
  // Limits the API returned that could not be parsed. Only ever populated by a fresh successful
  // fetch — a cooldown-skip or a failure reports none, since neither produced a fresh parse.
  skipped: string[];
  // false means the network call was skipped by the cooldown gate.
  attempted: boolean;
  error: Error | null;
}

export async function loadAnthropicBuckets(deps: AnthropicLoadDependencies): Promise<AnthropicLoadResult> {
  if (deps.skipFetch) {
    return { buckets: deps.lastGoodBuckets, skipped: [], attempted: false, error: null };
  }

  try {
    const token = await deps.readToken();
    const usage = await fetchAnthropicUsage(token, deps.fetchImplementation);
    return { buckets: usage.buckets, skipped: usage.skipped, attempted: true, error: null };
  } catch (error) {
    return { buckets: deps.lastGoodBuckets, skipped: [], attempted: true, error: toError(error) };
  }
}
