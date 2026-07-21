import { describe, it, expect } from "vitest";
import { readAnthropicToken } from "./keychain";
import { fakeExecFile, fakeExecFileFails } from "./__fixtures__/exec";

describe("readAnthropicToken", () => {
  it("extracts accessToken from a valid keychain payload", async () => {
    const execFile = fakeExecFile(JSON.stringify({ claudeAiOauth: { accessToken: "sk-ant-fixture-token" } }));

    const token = await readAnthropicToken(execFile);

    expect(token).to.equal("sk-ant-fixture-token");
  });

  it("rejects when the keychain entry is missing", async () => {
    const execFile = fakeExecFileFails("security: SecKeychainSearchCopyNext: The specified item could not be found");

    await expect(readAnthropicToken(execFile)).rejects.toThrow(/Anthropic-Token nicht im Keychain gefunden/);
  });

  it("rejects when the keychain payload is not valid JSON", async () => {
    const execFile = fakeExecFile("not valid json{{{");

    await expect(readAnthropicToken(execFile)).rejects.toThrow(/ist kein valides JSON/);
  });

  it("rejects when claudeAiOauth.accessToken is missing", async () => {
    const execFile = fakeExecFile(JSON.stringify({ claudeAiOauth: {} }));

    await expect(readAnthropicToken(execFile)).rejects.toThrow(/enthält keinen gültigen accessToken/);
  });

  it("rejects when accessToken is an empty string", async () => {
    const execFile = fakeExecFile(JSON.stringify({ claudeAiOauth: { accessToken: "" } }));

    await expect(readAnthropicToken(execFile)).rejects.toThrow(/enthält keinen gültigen accessToken/);
  });

  it("rejects when the top-level payload has no claudeAiOauth key", async () => {
    const execFile = fakeExecFile(JSON.stringify({ unrelated: true }));

    await expect(readAnthropicToken(execFile)).rejects.toThrow(/enthält keinen gültigen accessToken/);
  });
});
