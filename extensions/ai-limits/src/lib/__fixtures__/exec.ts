import { vi, type Mock } from "vitest";
import { ExecFileFunction } from "../exec";

export type FakeExecFile = Mock<ExecFileFunction>;

export function fakeExecFile(stdout = "", stderr = ""): FakeExecFile {
  return vi.fn<ExecFileFunction>(async () => ({ stdout, stderr }));
}

export function fakeExecFileFails(message: string): FakeExecFile {
  return vi.fn<ExecFileFunction>(async () => {
    throw new Error(message);
  });
}
