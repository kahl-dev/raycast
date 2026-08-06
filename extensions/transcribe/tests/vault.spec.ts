import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, utimesSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listProtocols, latestProtocol } from "../src/lib/vault";

let dir = "";

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = "";
});

function makeProtocolDir(): string {
  dir = mkdtempSync(join(tmpdir(), "vault-"));
  return dir;
}

describe("listProtocols", () => {
  it("returns only .md files sorted by mtime descending", () => {
    const protocolDir = makeProtocolDir();
    const older = join(protocolDir, "older.md");
    const newer = join(protocolDir, "newer.md");
    const notes = join(protocolDir, "notes.txt");
    writeFileSync(older, "# older");
    writeFileSync(newer, "# newer");
    writeFileSync(notes, "not markdown");

    const olderTime = new Date("2026-01-01T09:00:00Z");
    const newerTime = new Date("2026-01-02T09:00:00Z");
    utimesSync(older, olderTime, olderTime);
    utimesSync(newer, newerTime, newerTime);
    utimesSync(notes, newerTime, newerTime);

    return listProtocols(protocolDir).then((result) => {
      expect(result.map((entry) => entry.name)).toEqual(["newer.md", "older.md"]);
    });
  });

  it("reports each entry's path, name, and mtimeMs consistent with the filesystem", () => {
    const protocolDir = makeProtocolDir();
    const filePath = join(protocolDir, "single.md");
    writeFileSync(filePath, "# single");
    const stamp = new Date("2026-03-05T12:00:00Z");
    utimesSync(filePath, stamp, stamp);
    const expectedMtimeMs = statSync(filePath).mtimeMs;

    return listProtocols(protocolDir).then((result) => {
      expect(result).toEqual([{ path: filePath, name: "single.md", mtimeMs: expectedMtimeMs }]);
    });
  });

  it("resolves an empty array for a directory with no .md files", () => {
    const protocolDir = makeProtocolDir();
    writeFileSync(join(protocolDir, "notes.txt"), "not markdown");
    return listProtocols(protocolDir).then((result) => {
      expect(result).toEqual([]);
    });
  });

  it("resolves an empty array for an empty directory", () => {
    const protocolDir = makeProtocolDir();
    return listProtocols(protocolDir).then((result) => {
      expect(result).toEqual([]);
    });
  });

  it("rejects with an error naming the directory when it does not exist", async () => {
    dir = join(tmpdir(), "vault-missing-does-not-exist");
    await expect(listProtocols(dir)).rejects.toThrow();
    try {
      await listProtocols(dir);
      throw new Error("expected listProtocols to reject");
    } catch (error) {
      expect((error as Error).message).toContain(dir);
    }
  });

  it("rejects, naming the path, when the path is a file rather than a directory", async () => {
    dir = mkdtempSync(join(tmpdir(), "vault-"));
    const filePath = join(dir, "not-a-dir.md");
    writeFileSync(filePath, "# nope");
    try {
      await listProtocols(filePath);
      throw new Error("expected listProtocols to reject");
    } catch (error) {
      expect((error as Error).message).toContain(filePath);
    }
  });
});

describe("latestProtocol", () => {
  it("returns the most recently modified protocol", async () => {
    const protocolDir = makeProtocolDir();
    const older = join(protocolDir, "older.md");
    const newer = join(protocolDir, "newer.md");
    writeFileSync(older, "# older");
    writeFileSync(newer, "# newer");
    const olderTime = new Date("2026-01-01T09:00:00Z");
    const newerTime = new Date("2026-01-02T09:00:00Z");
    utimesSync(older, olderTime, olderTime);
    utimesSync(newer, newerTime, newerTime);
    const expectedMtimeMs = statSync(newer).mtimeMs;

    const result = await latestProtocol(protocolDir);
    expect(result).toEqual({ path: newer, name: "newer.md", mtimeMs: expectedMtimeMs });
  });

  it("returns null for an empty directory", async () => {
    const protocolDir = makeProtocolDir();
    expect(await latestProtocol(protocolDir)).toBeNull();
  });

  it("returns null for a directory with no .md files", async () => {
    const protocolDir = makeProtocolDir();
    writeFileSync(join(protocolDir, "notes.txt"), "not markdown");
    expect(await latestProtocol(protocolDir)).toBeNull();
  });

  it("rejects, naming the directory, when it does not exist", async () => {
    dir = join(tmpdir(), "vault-missing-latest");
    try {
      await latestProtocol(dir);
      throw new Error("expected latestProtocol to reject");
    } catch (error) {
      expect((error as Error).message).toContain(dir);
    }
  });
});
