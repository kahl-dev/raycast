import { describe, it, expect, afterEach } from "vitest";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readToken,
  getState,
  enqueueAudioJob,
  TokenMissingError,
  MTApiUnreachableError,
  MTApiAuthError,
} from "../src/lib/mt-api";

interface CapturedRequest {
  method: string | undefined;
  url: string | undefined;
  authorization: string | undefined;
  body: string;
}

interface RunningServer {
  baseUrl: string;
  requests: CapturedRequest[];
  close: () => Promise<void>;
}

function startServer(
  handler: (req: IncomingMessage, res: ServerResponse, body: string) => void
): Promise<RunningServer> {
  const requests: CapturedRequest[] = [];
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        requests.push({
          method: req.method,
          url: req.url,
          authorization: req.headers.authorization,
          body,
        });
        handler(req, res, body);
      });
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        requests,
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}

async function closedPortBaseUrl(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      server.close((err) => {
        if (err) reject(err);
        else resolve(`http://127.0.0.1:${address.port}`);
      });
    });
    server.on("error", reject);
  });
}

let activeServers: RunningServer[] = [];

async function server(handler: (req: IncomingMessage, res: ServerResponse, body: string) => void) {
  const instance = await startServer(handler);
  activeServers.push(instance);
  return instance;
}

afterEach(async () => {
  await Promise.all(activeServers.map((instance) => instance.close()));
  activeServers = [];
});

function jsonResponse(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

describe("readToken", () => {
  let dir = "";

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("reads and trims the token file contents", () => {
    dir = mkdtempSync(join(tmpdir(), "mt-api-"));
    const tokenPath = join(dir, "token.txt");
    writeFileSync(tokenPath, "  abc-123-token  \n", "utf8");
    expect(readToken(tokenPath)).toEqual("abc-123-token");
  });

  it("returns unusual but non-whitespace content verbatim (trimmed)", () => {
    dir = mkdtempSync(join(tmpdir(), "mt-api-"));
    const tokenPath = join(dir, "token.txt");
    writeFileSync(tokenPath, "🔑-token-™-değer\n", "utf8");
    expect(readToken(tokenPath)).toEqual("🔑-token-™-değer");
  });

  it("throws TokenMissingError naming the Local Automation API setting when the file is missing", () => {
    dir = mkdtempSync(join(tmpdir(), "mt-api-"));
    const tokenPath = join(dir, "does-not-exist.txt");
    expect(() => readToken(tokenPath)).toThrow(TokenMissingError);
    try {
      readToken(tokenPath);
      throw new Error("expected readToken to throw");
    } catch (error) {
      if (!(error instanceof TokenMissingError)) throw error;
      expect(error.message).toContain("Local Automation API");
      expect(error.message).toContain("Advanced");
    }
  });

  it("throws TokenMissingError for an empty token file", () => {
    dir = mkdtempSync(join(tmpdir(), "mt-api-"));
    const tokenPath = join(dir, "empty.txt");
    writeFileSync(tokenPath, "", "utf8");
    expect(() => readToken(tokenPath)).toThrow(TokenMissingError);
  });

  it("throws TokenMissingError for a whitespace-only token file", () => {
    dir = mkdtempSync(join(tmpdir(), "mt-api-"));
    const tokenPath = join(dir, "whitespace.txt");
    writeFileSync(tokenPath, "   \n\t  \n", "utf8");
    expect(() => readToken(tokenPath)).toThrow(TokenMissingError);
  });
});

describe("getState", () => {
  it("maps a known watchState and preserves the full body as raw", async () => {
    const { baseUrl, requests } = await server((req, res) => {
      jsonResponse(res, 200, { watchState: "recording", extra: "detail" });
    });
    const state = await getState(baseUrl, "tok-1");
    expect(state).toEqual({ watchState: "recording", raw: { watchState: "recording", extra: "detail" } });
    expect(requests[0]).toEqual({
      method: "GET",
      url: "/state",
      authorization: "Bearer tok-1",
      body: "",
    });
  });

  it("maps every documented watchState value through unchanged", async () => {
    for (const value of ["idle", "watching", "recording", "error"] as const) {
      const { baseUrl } = await server((req, res) => {
        jsonResponse(res, 200, { watchState: value });
      });
      const state = await getState(baseUrl, "tok");
      expect(state.watchState).toEqual(value);
    }
  });

  it("maps an unrecognized watchState value to \"error\"", async () => {
    const { baseUrl } = await server((req, res) => {
      jsonResponse(res, 200, { watchState: "totally-bogus" });
    });
    const state = await getState(baseUrl, "tok");
    expect(state.watchState).toEqual("error");
    expect(state.raw).toEqual({ watchState: "totally-bogus" });
  });

  it("maps a missing watchState field to \"error\"", async () => {
    const { baseUrl } = await server((req, res) => {
      jsonResponse(res, 200, { somethingElse: true });
    });
    const state = await getState(baseUrl, "tok");
    expect(state.watchState).toEqual("error");
  });

  it("sends the Authorization header verbatim", async () => {
    const { baseUrl, requests } = await server((req, res) => {
      jsonResponse(res, 200, { watchState: "idle" });
    });
    const token = "6b08597a2696d89a7cbead4e46ac248041743a4ecc1c837377b2c6971f5f4a5f";
    await getState(baseUrl, token);
    expect(requests[0]?.authorization).toEqual(`Bearer ${token}`);
  });

  it("rejects with MTApiAuthError on 401", async () => {
    const { baseUrl } = await server((req, res) => {
      jsonResponse(res, 401, { error: "unauthorized" });
    });
    await expect(getState(baseUrl, "bad-token")).rejects.toBeInstanceOf(MTApiAuthError);
  });

  it("rejects with MTApiAuthError on 403", async () => {
    const { baseUrl } = await server((req, res) => {
      jsonResponse(res, 403, { error: "forbidden" });
    });
    await expect(getState(baseUrl, "bad-token")).rejects.toBeInstanceOf(MTApiAuthError);
  });

  it("rejects with MTApiUnreachableError on a non-2xx, non-auth status", async () => {
    const { baseUrl } = await server((req, res) => {
      jsonResponse(res, 500, { error: "boom" });
    });
    await expect(getState(baseUrl, "tok")).rejects.toBeInstanceOf(MTApiUnreachableError);
  });

  it("rejects with MTApiUnreachableError when the connection is refused", async () => {
    const baseUrl = await closedPortBaseUrl();
    await expect(getState(baseUrl, "tok")).rejects.toBeInstanceOf(MTApiUnreachableError);
  });
});

describe("enqueueAudioJob", () => {
  it("POSTs the file path as JSON to /v1/jobs with the Authorization header", async () => {
    const { baseUrl, requests } = await server((req, res) => {
      jsonResponse(res, 200, { jobId: "job-1" });
    });
    await enqueueAudioJob(baseUrl, "tok-2", "/Users/kahl/recording.wav");
    expect(requests[0]).toEqual({
      method: "POST",
      url: "/v1/jobs",
      authorization: "Bearer tok-2",
      body: JSON.stringify({ path: "/Users/kahl/recording.wav" }),
    });
  });

  it("accepts the { jobId } success shape", async () => {
    const { baseUrl } = await server((req, res) => {
      jsonResponse(res, 200, { jobId: "job-abc" });
    });
    const result = await enqueueAudioJob(baseUrl, "tok", "/tmp/a.wav");
    expect(result).toEqual({ jobId: "job-abc" });
  });

  it("accepts the { jobs: [{ id }] } success shape and returns the first id", async () => {
    const { baseUrl } = await server((req, res) => {
      jsonResponse(res, 200, { jobs: [{ id: "job-xyz" }, { id: "job-second" }] });
    });
    const result = await enqueueAudioJob(baseUrl, "tok", "/tmp/a.wav");
    expect(result).toEqual({ jobId: "job-xyz" });
  });

  it("rejects with MTApiAuthError on 401", async () => {
    const { baseUrl } = await server((req, res) => {
      jsonResponse(res, 401, { error: "unauthorized" });
    });
    await expect(enqueueAudioJob(baseUrl, "bad", "/tmp/a.wav")).rejects.toBeInstanceOf(MTApiAuthError);
  });

  it("rejects with MTApiAuthError on 403", async () => {
    const { baseUrl } = await server((req, res) => {
      jsonResponse(res, 403, { error: "forbidden" });
    });
    await expect(enqueueAudioJob(baseUrl, "bad", "/tmp/a.wav")).rejects.toBeInstanceOf(MTApiAuthError);
  });

  it("rejects with MTApiUnreachableError on a non-2xx, non-auth status", async () => {
    const { baseUrl } = await server((req, res) => {
      jsonResponse(res, 500, { error: "boom" });
    });
    await expect(enqueueAudioJob(baseUrl, "tok", "/tmp/a.wav")).rejects.toBeInstanceOf(MTApiUnreachableError);
  });

  it("rejects with MTApiUnreachableError when the connection is refused", async () => {
    const baseUrl = await closedPortBaseUrl();
    await expect(enqueueAudioJob(baseUrl, "tok", "/tmp/a.wav")).rejects.toBeInstanceOf(MTApiUnreachableError);
  });
});
