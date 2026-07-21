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
function buildBucketFromRawLimit(raw: RawAnthropicLimit): Bucket {
  const percent = parsePercent(raw.kind, raw.percent);
  const resetsAt = parseResetsAt(raw.kind, raw.resets_at);
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

export function parseAnthropicUsage(json: unknown): Bucket[] {
  assertJsonObject(json, "Anthropic-Usage-Antwort");
  const response = json as RawAnthropicUsageResponse;

  if (Array.isArray(response.limits)) {
    return response.limits.map(buildBucketFromRawLimit);
  }

  if (response.limits !== undefined && response.limits !== null) {
    throw new Error(`Anthropic-Usage-Antwort hat ein ungültiges limits-Feld: ${JSON.stringify(response.limits)}`);
  }

  // Fallback auf Legacy-Felder nur wenn limits[] komplett fehlt (undefined/null).
  const buckets: Bucket[] = [];
  if (response.five_hour) {
    buckets.push(buildLegacyBucket("anthropic:session", "Session", response.five_hour, SESSION_WINDOW_SECONDS));
  }
  if (response.seven_day) {
    buckets.push(buildLegacyBucket("anthropic:weekly_all", "Woche", response.seven_day, WEEKLY_WINDOW_SECONDS));
  }
  return buckets;
}

export async function fetchAnthropicUsage(
  token: string,
  fetchImplementation: FetchFunction = fetch,
): Promise<Bucket[]> {
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

// Cooldown-Gate für den Fetch selbst: useCachedPromise re-executed bei jedem Dropdown-Öffnen
// (stale-while-revalidate, kein eingebautes Dedupe) — ohne dieses Gate würde der eng gedrosselte
// Endpoint (~1 req/min) bei schnellem wiederholtem Öffnen sofort 429en.
export function isWithinAnthropicCooldown(lastAttemptAt: Date | null, now: Date): boolean {
  return !hasElapsed(lastAttemptAt, now, ANTHROPIC_COOLDOWN_MS);
}

export interface AnthropicLoadDependencies {
  now: () => Date;
  lastAttemptAt: Date | null;
  lastGoodBuckets: Bucket[] | null;
  readToken: () => Promise<string>;
  fetchImplementation: FetchFunction;
}

export interface AnthropicLoadResult {
  buckets: Bucket[] | null;
  // false means the network call was skipped by the cooldown gate — check isWithinAnthropicCooldown
  // separately if that distinction matters; callers only need this to know whether to persist a
  // new lastAttemptAt timestamp.
  attempted: boolean;
  error: Error | null;
}

// Timestamp wird vom Aufrufer bei JEDEM Versuch (attempted:true) persistiert — Erfolg UND Fehler —
// damit ein wiederholt fehlschlagender Call den 60s-Cooldown trotzdem einhält.
export async function loadAnthropicBuckets(deps: AnthropicLoadDependencies): Promise<AnthropicLoadResult> {
  const now = deps.now();

  if (isWithinAnthropicCooldown(deps.lastAttemptAt, now)) {
    return { buckets: deps.lastGoodBuckets, attempted: false, error: null };
  }

  try {
    const token = await deps.readToken();
    const buckets = await fetchAnthropicUsage(token, deps.fetchImplementation);
    return { buckets, attempted: true, error: null };
  } catch (error) {
    return { buckets: deps.lastGoodBuckets, attempted: true, error: toError(error) };
  }
}
