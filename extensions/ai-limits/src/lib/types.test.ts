import { describe, it, expect } from "vitest";
import { paceSeverity, toError } from "./types";

describe("toError", () => {
  it("passes an Error instance through unchanged", () => {
    const original = new Error("boom");
    expect(toError(original)).to.equal(original);
  });

  it("wraps a non-Error value in an Error", () => {
    const wrapped = toError("plain string failure");
    expect(wrapped).to.be.instanceOf(Error);
    expect(wrapped.message).to.equal("plain string failure");
  });

  it("wraps null and undefined without throwing", () => {
    expect(toError(null).message).to.equal("null");
    expect(toError(undefined).message).to.equal("undefined");
  });
});

describe("paceSeverity", () => {
  it("boundary: diff exactly 0 is normal", () => {
    expect(paceSeverity(50, 50)).to.equal("normal");
  });

  it("is normal when usage trails the elapsed window (diff negative)", () => {
    expect(paceSeverity(10, 50)).to.equal("normal");
  });

  it("boundary: diff exactly 15 is warning", () => {
    expect(paceSeverity(65, 50)).to.equal("warning");
  });

  it("is critical above a diff of 15", () => {
    expect(paceSeverity(66, 50)).to.equal("critical");
  });
});
