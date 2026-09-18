import { describe, expect, it } from "vitest";

import { formatCompact, formatYield } from "./format.ts";

describe("formatCompact", () => {
  it("leaves small numbers exactly as formatYield would", () => {
    // Below 1,000 there is nothing to save, so the two must agree —
    // otherwise a chart axis and its table would disagree on a value
    // that fits both.
    for (const n of [0, 1, 12.5, 999.99]) {
      expect(formatCompact(n)).toBe(formatYield(n));
    }
  });

  it("abbreviates thousands and millions to one decimal", () => {
    expect(formatCompact(12_500)).toBe("12.5k");
    expect(formatCompact(1_250_000)).toBe("1.3M");
  });

  it("drops a trailing .0 so round magnitudes stay short", () => {
    expect(formatCompact(1_000)).toBe("1k");
    expect(formatCompact(2_000_000)).toBe("2M");
  });

  it("keeps every result inside the axis gutter's budget", () => {
    // The charts give the y-axis label a 34px gutter at 8px type, which
    // is about six characters. A seven-figure volume formatted long
    // ("1250000") overflows it and collides with the plot — that is the
    // bug this function exists to prevent, so assert the bound rather
    // than just the happy cases.
    for (const n of [999, 1_000, 999_999, 1_000_000, 987_654_321]) {
      expect(formatCompact(n).length).toBeLessThanOrEqual(6);
    }
  });

  it("handles negatives and non-finite input without producing junk", () => {
    expect(formatCompact(-1_500)).toBe("-1.5k");
    expect(formatCompact(Number.NaN)).toBe("0");
    expect(formatCompact(Number.POSITIVE_INFINITY)).toBe("0");
  });
});
