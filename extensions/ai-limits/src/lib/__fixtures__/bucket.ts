import { Bucket } from "../types";

export function bucket(overrides: Partial<Bucket> = {}): Bucket {
  return {
    id: "anthropic:session",
    provider: "anthropic",
    label: "Session",
    percent: 23,
    resetsAt: new Date("2026-07-21T09:29:59.982Z"),
    windowSeconds: 18000,
    ...overrides,
  };
}
