import { describe, expect, it } from "vitest";
import { FailureLimiter } from "./rate-limit";

describe("FailureLimiter", () => {
  it("allows until the max, then reports the wait", () => {
    const l = new FailureLimiter(3, 60_000);
    for (let i = 0; i < 3; i++) {
      expect(l.retryAfterSec("a", i)).toBe(0);
      l.recordFailure("a", i);
    }
    expect(l.retryAfterSec("a", 1000)).toBe(59);
  });
  it("keys are independent", () => {
    const l = new FailureLimiter(1, 60_000);
    l.recordFailure("a", 0);
    expect(l.retryAfterSec("a", 1)).toBeGreaterThan(0);
    expect(l.retryAfterSec("b", 1)).toBe(0);
  });
  it("frees up after the window", () => {
    const l = new FailureLimiter(2, 1000);
    l.recordFailure("a", 0);
    l.recordFailure("a", 10);
    expect(l.retryAfterSec("a", 500)).toBeGreaterThan(0);
    expect(l.retryAfterSec("a", 1011)).toBe(0);
  });
  it("reset clears the key", () => {
    const l = new FailureLimiter(1, 60_000);
    l.recordFailure("a", 0);
    l.reset("a");
    expect(l.retryAfterSec("a", 1)).toBe(0);
  });
});
