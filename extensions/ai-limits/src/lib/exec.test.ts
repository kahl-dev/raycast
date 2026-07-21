import { describe, it, expect } from "vitest";
import { defaultExecFile } from "./exec";

describe("defaultExecFile", () => {
  it("resolves with stdout for a successful command", async () => {
    const result = await defaultExecFile("echo", ["hello-ai-limits"]);
    expect(result.stdout.trim()).to.equal("hello-ai-limits");
  });

  it("rejects when the binary does not exist", async () => {
    await expect(defaultExecFile("ai-limits-nonexistent-binary-xyz", [])).rejects.toThrow();
  });

  it("rejects when the command exits non-zero", async () => {
    await expect(defaultExecFile("false", [])).rejects.toThrow();
  });
});
