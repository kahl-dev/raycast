import fs from "fs";

export interface MTState {
  watchState: "idle" | "watching" | "recording" | "error";
  raw: unknown;
}

export class TokenMissingError extends Error {}
export class MTApiUnreachableError extends Error {}
export class MTApiAuthError extends Error {}

const KNOWN_WATCH_STATES = ["idle", "watching", "recording", "error"];

export function readToken(tokenPath: string): string {
  let raw: string;
  try {
    raw = fs.readFileSync(tokenPath, "utf-8");
  } catch {
    throw new TokenMissingError(
      `No MeetingTranscriber automation token found at "${tokenPath}". Enable "Local Automation API" in MeetingTranscriber Settings -> Advanced.`,
    );
  }

  const token = raw.trim();
  if (token === "") {
    throw new TokenMissingError(
      `MeetingTranscriber automation token at "${tokenPath}" is empty. Enable "Local Automation API" in MeetingTranscriber Settings -> Advanced.`,
    );
  }

  return token;
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

async function assertOkStatus(response: Response, action: string): Promise<void> {
  if (response.status === 401 || response.status === 403) {
    throw new MTApiAuthError(`MeetingTranscriber rejected the automation token while ${action} (HTTP ${response.status}).`);
  }
  if (!response.ok) {
    throw new MTApiUnreachableError(`MeetingTranscriber API returned HTTP ${response.status} while ${action}.`);
  }
}

function mapWatchState(value: unknown): MTState["watchState"] {
  if (typeof value === "string" && KNOWN_WATCH_STATES.includes(value)) {
    return value as MTState["watchState"];
  }
  return "error";
}

function bodySnippet(text: string): string {
  const trimmed = text.trim();
  if (trimmed === "") return "(empty body)";
  return trimmed.length > 200 ? `${trimmed.slice(0, 200)}...` : trimmed;
}

// Reads and JSON-parses the response body itself, mapping every failure mode (non-JSON body,
// empty body, a literal JSON `null`) to MTApiUnreachableError instead of letting response.json()
// throw an uncaught SyntaxError, or a caller's property access throw TypeError on a null body.
async function parseJsonBody(response: Response, action: string): Promise<Record<string, unknown>> {
  const text = await response.text();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new MTApiUnreachableError(`MeetingTranscriber returned a non-JSON response while ${action}: ${bodySnippet(text)}`);
  }

  if (parsed === null || typeof parsed !== "object") {
    throw new MTApiUnreachableError(`MeetingTranscriber returned an unexpected response while ${action}: ${bodySnippet(text)}`);
  }

  return parsed as Record<string, unknown>;
}

export async function getState(baseUrl: string, token: string): Promise<MTState> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/state`, { headers: authHeaders(token) });
  } catch (error) {
    throw new MTApiUnreachableError(
      `Could not reach MeetingTranscriber at ${baseUrl}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  await assertOkStatus(response, "fetching state");

  const body = await parseJsonBody(response, "fetching state");
  return { watchState: mapWatchState(body.watchState), raw: body };
}

export async function enqueueAudioJob(baseUrl: string, token: string, filePath: string): Promise<{ jobId: string }> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/v1/jobs`, {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ path: filePath }),
    });
  } catch (error) {
    throw new MTApiUnreachableError(
      `Could not reach MeetingTranscriber at ${baseUrl}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  await assertOkStatus(response, "enqueueing an audio job");

  const body = (await parseJsonBody(response, "enqueueing an audio job")) as {
    jobs?: Array<{ id?: unknown }>;
    jobId?: unknown;
  };
  const jobId = body.jobId ?? body.jobs?.[0]?.id;

  if (typeof jobId !== "string") {
    throw new MTApiUnreachableError(`MeetingTranscriber returned an unexpected job response: ${JSON.stringify(body)}`);
  }

  return { jobId };
}
