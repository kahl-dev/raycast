// Trust boundary: the only place that turns the untyped JSON `ai-limits --json` prints on stdout
// into typed data the rest of the extension can rely on. Every field is validated once here;
// callers never re-check what this function already guaranteed.
export interface ReportAccount {
  name: string;
  label: string;
}

export type ReportProvider = "anthropic" | "codex";

export interface ReportBucket {
  // `${provider}:${account}:${id}` — the unique identity for a bucket across every account and
  // provider. Used as the History/Alert/Reset dedup key instead of the bare `id`, which repeats
  // across accounts (every Anthropic account has an "anthropic.session" bucket).
  key: string;
  id: string;
  provider: ReportProvider;
  account: string;
  label: string;
  percent: number;
  resetsAt: Date;
  windowSeconds: number;
  observedAt: Date;
  elapsedPercent: number;
}

export interface ReportError {
  provider: string;
  account: string;
  message: string;
}

export interface ReportSkipped {
  provider: string;
  account: string;
  reason: string;
}

export interface ReportPlan {
  provider: string;
  account: string;
  plan: string | null;
  source: string | null;
}

export interface ReportSource {
  provider: string;
  account: string;
  source: string;
}

export interface AiLimitsReport {
  fetchedAt: Date;
  stale: boolean;
  accounts: ReportAccount[];
  buckets: ReportBucket[];
  errors: ReportError[];
  skipped: ReportSkipped[];
  resetCredits: number | null;
  plans: ReportPlan[];
  sources: ReportSource[];
}

function assertObject(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    throw new Error(`ai-limits: ${context} ist kein Objekt: ${JSON.stringify(value)}`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, context: string): string {
  if (typeof value !== "string") {
    throw new Error(`ai-limits: ${context} ist kein String: ${JSON.stringify(value)}`);
  }
  return value;
}

function requireBoolean(value: unknown, context: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`ai-limits: ${context} ist kein Boolean: ${JSON.stringify(value)}`);
  }
  return value;
}

function requireDate(value: unknown, context: string): Date {
  const raw = requireString(value, context);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`ai-limits: ${context} ist kein valides ISO-8601-Datum: ${raw}`);
  }
  return date;
}

function requireFiniteNumber(value: unknown, context: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`ai-limits: ${context} ist keine endliche Zahl: ${JSON.stringify(value)}`);
  }
  return value;
}

function requireStringOrNull(value: unknown, context: string): string | null {
  if (value === null) {
    return null;
  }
  return requireString(value, context);
}

function requireNumberOrNull(value: unknown, context: string): number | null {
  if (value === null) {
    return null;
  }
  return requireFiniteNumber(value, context);
}

function requireArray(value: unknown, context: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`ai-limits: ${context} ist keine Liste: ${JSON.stringify(value)}`);
  }
  return value;
}

function parseAccount(raw: unknown, index: number): ReportAccount {
  const object = assertObject(raw, `accounts[${index}]`);
  const name = requireString(object.name, `accounts[${index}].name`);
  const label = requireString(object.label, `accounts[${index}].label`);
  if (label.length !== 1) {
    throw new Error(`ai-limits: accounts[${index}].label muss genau ein Zeichen sein, war "${label}"`);
  }
  return { name, label };
}

function parseProvider(value: unknown, context: string): ReportProvider {
  const raw = requireString(value, context);
  if (raw !== "anthropic" && raw !== "codex") {
    throw new Error(`ai-limits: ${context} ist kein bekannter Provider (anthropic|codex): "${raw}"`);
  }
  return raw;
}

function parseBucket(raw: unknown, index: number): ReportBucket {
  const object = assertObject(raw, `buckets[${index}]`);
  const id = requireString(object.id, `buckets[${index}].id`);
  const provider = parseProvider(object.provider, `buckets[${index}].provider`);
  const account = requireString(object.account, `buckets[${index}].account`);
  const label = requireString(object.label, `buckets[${index}].label`);
  const percent = requireFiniteNumber(object.percent, `buckets[${index}].percent`);
  const resetsAt = requireDate(object.resets_at, `buckets[${index}].resets_at`);
  const windowSeconds = requireFiniteNumber(object.window_seconds, `buckets[${index}].window_seconds`);
  if (windowSeconds <= 0) {
    throw new Error(`ai-limits: buckets[${index}].window_seconds muss > 0 sein, war ${windowSeconds}`);
  }
  const observedAt = requireDate(object.observed_at, `buckets[${index}].observed_at`);
  const elapsedPercent = requireFiniteNumber(object.elapsed_percent, `buckets[${index}].elapsed_percent`);
  if (elapsedPercent < 0 || elapsedPercent > 100) {
    throw new Error(
      `ai-limits: buckets[${index}].elapsed_percent muss zwischen 0 und 100 liegen, war ${elapsedPercent}`,
    );
  }
  return {
    key: `${provider}:${account}:${id}`,
    id,
    provider,
    account,
    label,
    percent,
    resetsAt,
    windowSeconds,
    observedAt,
    elapsedPercent,
  };
}

function parseError(raw: unknown, index: number): ReportError {
  const object = assertObject(raw, `errors[${index}]`);
  return {
    provider: requireString(object.provider, `errors[${index}].provider`),
    account: requireString(object.account, `errors[${index}].account`),
    message: requireString(object.message, `errors[${index}].message`),
  };
}

function parseSkipped(raw: unknown, index: number): ReportSkipped {
  const object = assertObject(raw, `skipped[${index}]`);
  return {
    provider: requireString(object.provider, `skipped[${index}].provider`),
    account: requireString(object.account, `skipped[${index}].account`),
    reason: requireString(object.reason, `skipped[${index}].reason`),
  };
}

function parsePlan(raw: unknown, index: number): ReportPlan {
  const object = assertObject(raw, `plans[${index}]`);
  return {
    provider: requireString(object.provider, `plans[${index}].provider`),
    account: requireString(object.account, `plans[${index}].account`),
    plan: requireStringOrNull(object.plan, `plans[${index}].plan`),
    source: requireStringOrNull(object.source, `plans[${index}].source`),
  };
}

function parseSource(raw: unknown, index: number): ReportSource {
  const object = assertObject(raw, `sources[${index}]`);
  return {
    provider: requireString(object.provider, `sources[${index}].provider`),
    account: requireString(object.account, `sources[${index}].account`),
    source: requireString(object.source, `sources[${index}].source`),
  };
}

export function parseAiLimitsReport(raw: unknown): AiLimitsReport {
  const object = assertObject(raw, "ai-limits-Report");

  const fetchedAt = requireDate(object.fetched_at, "fetched_at");
  const stale = requireBoolean(object.stale, "stale");
  const accounts = requireArray(object.accounts, "accounts").map((entry, index) => parseAccount(entry, index));
  const buckets = requireArray(object.buckets, "buckets").map((entry, index) => parseBucket(entry, index));
  const errors = requireArray(object.errors, "errors").map((entry, index) => parseError(entry, index));
  const skipped = requireArray(object.skipped, "skipped").map((entry, index) => parseSkipped(entry, index));
  if (!("reset_credits" in object)) {
    throw new Error("ai-limits: reset_credits fehlt");
  }
  const resetCredits = requireNumberOrNull(object.reset_credits, "reset_credits");
  const plans = requireArray(object.plans, "plans").map((entry, index) => parsePlan(entry, index));
  const sources = requireArray(object.sources, "sources").map((entry, index) => parseSource(entry, index));

  return { fetchedAt, stale, accounts, buckets, errors, skipped, resetCredits, plans, sources };
}
