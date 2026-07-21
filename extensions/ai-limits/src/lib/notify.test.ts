import { describe, it, expect } from "vitest";
import { escapeAppleScriptString, sendMacNotification } from "./notify";
import { fakeExecFile, fakeExecFileFails } from "./__fixtures__/exec";

describe("escapeAppleScriptString", () => {
  it("escapes double quotes", () => {
    expect(escapeAppleScriptString('Fable "Limit" erreicht')).to.equal('Fable \\"Limit\\" erreicht');
  });

  it("escapes backslashes before quotes so escaping cannot be nested/broken", () => {
    expect(escapeAppleScriptString("C:\\path\\to\\file")).to.equal("C:\\\\path\\\\to\\\\file");
  });

  it("returns an empty string unchanged", () => {
    expect(escapeAppleScriptString("")).to.equal("");
  });

  it("passes through unicode and emoji unchanged", () => {
    expect(escapeAppleScriptString("Fäble ⚠️ 95%")).to.equal("Fäble ⚠️ 95%");
  });

  it("neutralizes a value that is entirely quotes and backslashes", () => {
    expect(escapeAppleScriptString('"\\"')).to.equal('\\"\\\\\\"');
  });
});

describe("sendMacNotification", () => {
  it("invokes osascript with an escaped display notification script", async () => {
    const execFile = fakeExecFile();

    await sendMacNotification("AI Limits", "Fable-Limit bei 82% — Reset Mo 22:00", execFile);

    expect(execFile).toHaveBeenCalledTimes(1);
    const [file, args] = execFile.mock.calls[0];
    expect(file).to.equal("osascript");
    expect(args[0]).to.equal("-e");
    expect(args[1]).to.contain('display notification "Fable-Limit bei 82% — Reset Mo 22:00"');
    expect(args[1]).to.contain('with title "AI Limits"');
  });

  it("escapes quotes in title and message before building the script", async () => {
    const execFile = fakeExecFile();

    await sendMacNotification('Title "x"', 'Message "y"', execFile);

    const script = execFile.mock.calls[0][1][1];
    expect(script).to.contain('display notification "Message \\"y\\""');
    expect(script).to.contain('with title "Title \\"x\\""');
  });

  it("rejects when the underlying osascript call fails", async () => {
    const execFile = fakeExecFileFails("osascript: not permitted");

    await expect(sendMacNotification("AI Limits", "boom", execFile)).rejects.toThrow(/osascript: not permitted/);
  });
});
