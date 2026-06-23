import { describe, it, expect, vi, beforeEach } from "vitest";

const { execFileMock } = vi.hoisted(() => ({ execFileMock: vi.fn() }));

vi.mock("child_process", () => ({
  execFile: (...args: unknown[]) => execFileMock(...args),
}));

import { notePick, clearPick, toggleInputMute, toggleAutomation, isAutomationPaused } from "./hammerspoon";

type Cb = (err: Error | null, value?: { stdout: string; stderr: string }) => void;

function lastLua(): string {
  const call = execFileMock.mock.calls.at(-1);
  const args = call?.[1] as string[];
  return args[1];
}

function resolveWith(stdout: string) {
  execFileMock.mockImplementation((_b: string, _a: string[], _o: unknown, cb: Cb) =>
    cb(null, { stdout, stderr: "" }),
  );
}

function rejectWith(message: string) {
  execFileMock.mockImplementation((_b: string, _a: string[], _o: unknown, cb: Cb) =>
    cb(new Error(message)),
  );
}

beforeEach(() => {
  execFileMock.mockReset();
});

describe("notePick", () => {
  it("invokes hs -c with a noteExplicit call for the device", async () => {
    resolveWith("");
    await notePick("output", "WH-1000XM6");
    expect(execFileMock).toHaveBeenCalledTimes(1);
    const lua = lastLua();
    expect(lua).to.contain("noteExplicit('output'");
    expect(lua).to.contain("WH-1000XM6");
  });

  it("escapes double quotes in the device name into a valid Lua literal", async () => {
    resolveWith("");
    await notePick("input", 'Bose "QC"');
    expect(lastLua()).to.contain('\\"QC\\"');
  });

  it("passes non-ASCII names through unescaped (UTF-8 bytes)", async () => {
    resolveWith("");
    await notePick("output", "Wave:3 Kopfhörer");
    expect(lastLua()).to.contain("Kopfhörer");
  });

  it("escapes newlines so the device name stays a valid Lua literal", async () => {
    resolveWith("");
    await notePick("output", "Weird\nName");
    const lua = lastLua();
    expect(lua).to.contain("Weird\\nName");
    expect(lua).not.to.contain("\n");
  });

  it("resolves without throwing when the daemon or hs is absent", async () => {
    rejectWith("spawn hs ENOENT");
    await expect(notePick("output", "AirPods")).resolves.toBeUndefined();
  });
});

describe("clearPick", () => {
  it("invokes hs -c with a clearExplicit call for the kind", async () => {
    resolveWith("");
    await clearPick("input");
    expect(lastLua()).to.contain("clearExplicit('input')");
  });

  it("resolves without throwing when the daemon or hs is absent", async () => {
    rejectWith("spawn hs ENOENT");
    await expect(clearPick("output")).resolves.toBeUndefined();
  });
});

describe("toggleInputMute", () => {
  it("returns true when the daemon reports the mic is now muted", async () => {
    resolveWith("MUTED");
    expect(await toggleInputMute()).to.equal(true);
  });

  it("returns false when the daemon reports the mic is now on", async () => {
    resolveWith("ON");
    expect(await toggleInputMute()).to.equal(false);
  });

  it("returns null when the Wave:3 device is not found", async () => {
    resolveWith("NODEV");
    expect(await toggleInputMute()).to.equal(null);
  });

  it("returns null when the device has no controllable input volume", async () => {
    resolveWith("NOVOL");
    expect(await toggleInputMute()).to.equal(null);
  });

  it("returns null (caller falls back) when hs is absent", async () => {
    rejectWith("spawn hs ENOENT");
    expect(await toggleInputMute()).to.equal(null);
  });
});

describe("toggleAutomation", () => {
  it("returns PAUSED when the daemon reports paused", async () => {
    resolveWith("PAUSED");
    expect(await toggleAutomation()).to.equal("PAUSED");
    const lua = lastLua();
    expect(lua).to.contain("togglePause");
    expect(lua).to.contain("pcall(require, 'modules.audio-manager')");
  });

  it("returns ACTIVE when the daemon reports active", async () => {
    resolveWith("ACTIVE");
    expect(await toggleAutomation()).to.equal("ACTIVE");
  });

  it("returns null when the daemon is absent", async () => {
    rejectWith("spawn hs ENOENT");
    expect(await toggleAutomation()).to.equal(null);
  });
});

describe("isAutomationPaused", () => {
  it("is true when the daemon reports true", async () => {
    resolveWith("true");
    expect(await isAutomationPaused()).to.equal(true);
    expect(lastLua()).to.contain("isPaused");
  });

  it("is false when the daemon reports false", async () => {
    resolveWith("false");
    expect(await isAutomationPaused()).to.equal(false);
  });

  it("is false (no automation to pause) when the daemon is absent", async () => {
    rejectWith("spawn hs ENOENT");
    expect(await isAutomationPaused()).to.equal(false);
  });
});
