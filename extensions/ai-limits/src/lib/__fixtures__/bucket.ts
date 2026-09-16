import { AlertBucket } from "../thresholds";

export function bucket(overrides: Partial<AlertBucket> = {}): AlertBucket {
  return {
    id: "anthropic:session",
    label: "Session",
    percent: 23,
    resetsAt: new Date("2026-07-21T09:29:59.982Z"),
    ...overrides,
  };
}
