import { describe, it, expect, vi, beforeEach } from "vitest";

const { execFileMock } = vi.hoisted(() => ({ execFileMock: vi.fn() }));

vi.mock("child_process", () => ({
  execFile: (...args: unknown[]) => execFileMock(...args),
}));

import { notePick } from "./hammerspoon";

type Cb = (err: Error | null, value?: { stdout: string; stderr: string }) => void;

function lastLua(): string {
  const call = execFileMock.mock.calls.at(-1);
  const args = call?.[1] as string[];
  return args[1];
}

beforeEach(() => {
  execFileMock.mockReset();
});

describe("notePick", () => {
  it("invokes hs -c with a noteExplicit call for the device", async () => {
    execFileMock.mockImplementation((_b: string, _a: string[], _o: unknown, cb: Cb) =>
      cb(null, { stdout: "", stderr: "" }),
    );

    await notePick("output", "WH-1000XM6");

    expect(execFileMock).toHaveBeenCalledTimes(1);
    const lua = lastLua();
    expect(lua).to.contain("noteExplicit('output'");
    expect(lua).to.contain("WH-1000XM6");
  });

  it("escapes double quotes in the device name into a valid Lua literal", async () => {
    execFileMock.mockImplementation((_b: string, _a: string[], _o: unknown, cb: Cb) =>
      cb(null, { stdout: "", stderr: "" }),
    );

    await notePick("input", 'Bose "QC"');

    expect(lastLua()).to.contain('\\"QC\\"');
  });

  it("passes non-ASCII names through unescaped (UTF-8 bytes)", async () => {
    execFileMock.mockImplementation((_b: string, _a: string[], _o: unknown, cb: Cb) =>
      cb(null, { stdout: "", stderr: "" }),
    );

    await notePick("output", "Wave:3 Kopfhörer");

    expect(lastLua()).to.contain("Kopfhörer");
  });

  it("escapes newlines so the device name stays a valid Lua literal", async () => {
    execFileMock.mockImplementation((_b: string, _a: string[], _o: unknown, cb: Cb) =>
      cb(null, { stdout: "", stderr: "" }),
    );

    await notePick("output", "Weird\nName");

    const lua = lastLua();
    expect(lua).to.contain("Weird\\nName");
    expect(lua).not.to.contain("\n");
  });

  it("resolves without throwing when the daemon or hs is absent", async () => {
    execFileMock.mockImplementation((_b: string, _a: string[], _o: unknown, cb: Cb) =>
      cb(new Error("spawn hs ENOENT")),
    );

    await expect(notePick("output", "AirPods")).resolves.toBeUndefined();
  });
});
