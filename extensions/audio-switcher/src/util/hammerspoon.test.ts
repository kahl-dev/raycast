import { describe, it, expect, vi, beforeEach } from "vitest";

const { execFileMock } = vi.hoisted(() => ({ execFileMock: vi.fn() }));

vi.mock("child_process", () => ({
  execFile: (...args: unknown[]) => execFileMock(...args),
}));

import {
  notePick,
  revertPick,
  toggleInputMute,
  toggleAutomation,
  isAutomationPaused,
  followOutputPriority,
  resetInputToGuard,
} from "./hammerspoon";

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

describe("revertPick", () => {
  it("invokes hs -c with a revertExplicit call for the kind", async () => {
    resolveWith("");
    await revertPick("input");
    expect(lastLua()).to.contain("revertExplicit('input')");
  });

  it("resolves without throwing when Hammerspoon is unreachable", async () => {
    rejectWith("spawn hs ENOENT");
    await expect(revertPick("output")).resolves.toBeUndefined();
  });
});

describe("followOutputPriority", () => {
  it("invokes hs -c with the daemon's followPriority call", async () => {
    resolveWith("");
    await followOutputPriority();
    const lua = lastLua();
    expect(lua).to.contain("followPriority()");
    expect(lua).to.contain("pcall(require, 'modules.audio-manager')");
  });

  it("resolves without throwing when Hammerspoon is unreachable", async () => {
    rejectWith("spawn hs ENOENT");
    await expect(followOutputPriority()).resolves.toBeUndefined();
  });
});

describe("resetInputToGuard", () => {
  it("invokes hs -c with the daemon's resetInputToGuard call", async () => {
    resolveWith("");
    await resetInputToGuard();
    expect(lastLua()).to.contain("resetInputToGuard()");
  });

  it("resolves without throwing when Hammerspoon is unreachable", async () => {
    rejectWith("spawn hs ENOENT");
    await expect(resetInputToGuard()).resolves.toBeUndefined();
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
  it("returns PAUSED docked when the daemon reports paused while docked", async () => {
    resolveWith("PAUSED");
    expect(await toggleAutomation()).to.deep.equal({ state: "PAUSED", docked: true });
    const lua = lastLua();
    expect(lua).to.contain("togglePause");
    expect(lua).to.contain("pcall(require, 'modules.audio-manager')");
  });

  it("returns ACTIVE docked when the daemon reports active while docked", async () => {
    resolveWith("ACTIVE");
    expect(await toggleAutomation()).to.deep.equal({ state: "ACTIVE", docked: true });
  });

  it("returns PAUSED undocked when the daemon reports paused while undocked", async () => {
    resolveWith("PAUSED_UNDOCKED");
    expect(await toggleAutomation()).to.deep.equal({ state: "PAUSED", docked: false });
  });

  it("returns ACTIVE undocked when the daemon reports active while undocked", async () => {
    resolveWith("ACTIVE_UNDOCKED");
    expect(await toggleAutomation()).to.deep.equal({ state: "ACTIVE", docked: false });
  });

  it("returns null on an unparseable 'nil' response", async () => {
    resolveWith("nil");
    expect(await toggleAutomation()).to.equal(null);
  });

  it("returns null on garbage output", async () => {
    resolveWith("garbage");
    expect(await toggleAutomation()).to.equal(null);
  });

  it("returns null when Hammerspoon is unreachable", async () => {
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

  it("is false (safe default) when Hammerspoon is unreachable", async () => {
    rejectWith("spawn hs ENOENT");
    expect(await isAutomationPaused()).to.equal(false);
  });
});
