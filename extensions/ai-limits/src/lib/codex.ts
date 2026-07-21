import { homedir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { ExecFileFunction, defaultExecFile } from "./exec";
import {
  assertJsonObject,
  Bucket,
  FetchFunction,
  hasElapsed,
  parseFiniteNumber,
  parseJsonOrThrow,
  readJsonBody,
  toError,
} from "./types";

const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const CODEX_AUTH_PATH = join(homedir(), ".codex", "auth.json");
const CODEX_LOGIN_COOLDOWN_MS = 60 * 60 * 1000;
const CODEX_UNAUTHORIZED_ERROR_NAME = "CodexUnauthorizedError";

interface RawCodexWindow {
  used_percent: unknown;
  reset_at: unknown;
  limit_window_seconds: unknown;
}

interface RawCodexRateLimit {
  primary_window?: RawCodexWindow | null;
  secondary_window?: RawCodexWindow | null;
}

interface RawCodexResetCredits {
  available_count?: unknown;
}

interface RawCodexUsageResponse {
  rate_limit?: RawCodexRateLimit | null;
  rate_limit_reset_credits?: RawCodexResetCredits | null;
}

function buildCodexBucket(id: string, label: string, window: RawCodexWindow): Bucket {
  const percent = parseFiniteNumber(window.used_percent, `Codex-Window "${id}" used_percent`);
  const resetAtEpochSeconds = parseFiniteNumber(window.reset_at, `Codex-Window "${id}" reset_at`);
  const windowSeconds = parseFiniteNumber(window.limit_window_seconds, `Codex-Window "${id}" limit_window_seconds`);
  return {
    id,
    provider: "openai",
    label,
    percent,
    resetsAt: new Date(resetAtEpochSeconds * 1000),
    windowSeconds,
  };
}

export function parseCodexUsage(json: unknown): Bucket[] {
  assertJsonObject(json, "Codex-Usage-Antwort");
  const response = json as RawCodexUsageResponse;
  const rateLimit = response.rate_limit;
  if (!rateLimit || typeof rateLimit !== "object") {
    throw new Error("Codex-Usage-Antwort enthält kein rate_limit-Objekt");
  }

  const buckets: Bucket[] = [];
  if (rateLimit.primary_window) {
    buckets.push(buildCodexBucket("openai:primary", "OpenAI", rateLimit.primary_window));
  }
  if (rateLimit.secondary_window) {
    buckets.push(buildCodexBucket("openai:secondary", "OpenAI (sekundär)", rateLimit.secondary_window));
  }
  return buckets;
}

// Display-only: how many reset credits (manual limit resets) the account has available. Absent
// or explicitly null at any level means "not offered to this account" rather than a parse error.
export function parseCodexResetCreditsAvailable(json: unknown): number | null {
  assertJsonObject(json, "Codex-Usage-Antwort");
  const response = json as RawCodexUsageResponse;
  const resetCredits = response.rate_limit_reset_credits;
  if (resetCredits === undefined || resetCredits === null) {
    return null;
  }
  const availableCount = resetCredits.available_count;
  if (availableCount === undefined || availableCount === null) {
    return null;
  }
  return parseFiniteNumber(availableCount, "Codex rate_limit_reset_credits.available_count");
}

export interface CodexAuthTokens {
  accessToken: string;
  accountId: string;
}

export type ReadFileFunction = (path: string) => Promise<string>;

const defaultReadFile: ReadFileFunction = (path) => readFile(path, "utf-8");

export async function readCodexAuth(
  readFileImplementation: ReadFileFunction = defaultReadFile,
): Promise<CodexAuthTokens> {
  let raw: string;
  try {
    raw = await readFileImplementation(CODEX_AUTH_PATH);
  } catch (error) {
    throw new Error(`Codex-Auth-Datei nicht lesbar (${CODEX_AUTH_PATH}): ${toError(error).message}`);
  }

  const parsed = parseJsonOrThrow(raw, "Codex-Auth-Datei");

  const tokens = (parsed as { tokens?: { access_token?: unknown; account_id?: unknown } })?.tokens;
  const accessToken = tokens?.access_token;
  const accountId = tokens?.account_id;
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    throw new Error("Codex-Auth-Datei enthält keinen gültigen access_token");
  }
  if (typeof accountId !== "string" || accountId.length === 0) {
    throw new Error("Codex-Auth-Datei enthält keine gültige account_id");
  }

  return { accessToken, accountId };
}

export function isCodexUnauthorizedError(error: unknown): boolean {
  return error instanceof Error && error.name === CODEX_UNAUTHORIZED_ERROR_NAME;
}

export interface CodexUsageResult {
  buckets: Bucket[];
  resetCreditsAvailable: number | null;
}

export async function fetchCodexUsage(
  auth: CodexAuthTokens,
  fetchImplementation: FetchFunction = fetch,
): Promise<CodexUsageResult> {
  const response = await fetchImplementation(USAGE_URL, {
    headers: {
      authorization: `Bearer ${auth.accessToken}`,
      "chatgpt-account-id": auth.accountId,
    },
  });

  if (response.status === 401) {
    const error = new Error("Codex-Usage-API antwortete mit 401 (Token abgelaufen)");
    error.name = CODEX_UNAUTHORIZED_ERROR_NAME;
    throw error;
  }

  if (!response.ok) {
    throw new Error(`Codex-Usage-API antwortete mit Status ${response.status}`);
  }

  const json = await readJsonBody(response, "Codex-Usage-Antwort");

  return { buckets: parseCodexUsage(json), resetCreditsAvailable: parseCodexResetCreditsAvailable(json) };
}

export async function runCodexLoginStatus(execFileImplementation: ExecFileFunction = defaultExecFile): Promise<void> {
  await execFileImplementation("codex", ["login", "status"]);
}

// Debounced auf max. 1x/h, damit ein hartnäckig 401ender Endpoint nicht bei jedem 5-Minuten-Tick
// erneut `codex login status` anstößt.
export function shouldAttemptCodexLogin(lastAttemptAt: Date | null, now: Date): boolean {
  return hasElapsed(lastAttemptAt, now, CODEX_LOGIN_COOLDOWN_MS);
}

// >=100 rather than ===100: Codex used_percent can exceed 100 (see parseCodexUsage's boundary
// test), and the API also reports fractional values (e.g. 100.4) that round to "100%" in the UI
// but would silently miss a strict equality check.
export function shouldShowRedeemHint(primaryBucket: Bucket | null): boolean {
  return primaryBucket !== null && primaryBucket.percent >= 100;
}

export interface CodexLoadDependencies {
  now: () => Date;
  lastLoginAttemptAt: Date | null;
  lastGoodBuckets: Bucket[] | null;
  readAuth: () => Promise<CodexAuthTokens>;
  fetchImplementation: FetchFunction;
  runLoginStatus: () => Promise<void>;
}

export interface CodexLoadResult {
  buckets: Bucket[] | null;
  loginAttempted: boolean;
  hint: string | null;
  error: Error | null;
  // Display-only, never persisted across failures — a stale reset-credits count is misleading,
  // so a failed or fallback load simply shows nothing rather than an outdated number.
  resetCreditsAvailable: number | null;
}

export async function loadCodexBuckets(deps: CodexLoadDependencies): Promise<CodexLoadResult> {
  const fallback = (loginAttempted: boolean, hint: string | null, error: unknown): CodexLoadResult => ({
    buckets: deps.lastGoodBuckets,
    loginAttempted,
    hint,
    error: toError(error),
    resetCreditsAvailable: null,
  });

  let auth: CodexAuthTokens;
  try {
    auth = await deps.readAuth();
  } catch (error) {
    return fallback(false, "Codex-Login nicht gefunden", error);
  }

  try {
    const usage = await fetchCodexUsage(auth, deps.fetchImplementation);
    return {
      buckets: usage.buckets,
      loginAttempted: false,
      hint: null,
      error: null,
      resetCreditsAvailable: usage.resetCreditsAvailable,
    };
  } catch (error) {
    if (!isCodexUnauthorizedError(error)) {
      return fallback(false, null, error);
    }

    const now = deps.now();
    if (!shouldAttemptCodexLogin(deps.lastLoginAttemptAt, now)) {
      return fallback(false, "Login abgelaufen", error);
    }

    try {
      await deps.runLoginStatus();
      const refreshedAuth = await deps.readAuth();
      const usage = await fetchCodexUsage(refreshedAuth, deps.fetchImplementation);
      return {
        buckets: usage.buckets,
        loginAttempted: true,
        hint: null,
        error: null,
        resetCreditsAvailable: usage.resetCreditsAvailable,
      };
    } catch (retryError) {
      return fallback(true, "Login abgelaufen", retryError);
    }
  }
}
