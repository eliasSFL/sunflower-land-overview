import { describe, expect, it } from "vitest";

import { tradeDirection, unitPrice } from "./trades.ts";

// The farm whose profile we're reading.
const ME = 42;
const THEM = 99;

function sale(source: "listing" | "offer", initiator: number, taker: number) {
  return {
    source,
    initiatedBy: { id: initiator, username: `farm${initiator}` },
    fulfilledBy: { id: taker, username: `farm${taker}` },
  };
}

describe("tradeDirection", () => {
  // The whole point of the helper: `source` and the party fields have
  // to be read TOGETHER. Each row below flips one of them, and three of
  // the four would come out wrong if either were read alone.
  it("has me selling when I posted the listing", () => {
    // I listed it; they took it. I sold.
    expect(tradeDirection(sale("listing", ME, THEM), ME)).toEqual({
      sold: true,
      counterparty: { id: THEM, username: `farm${THEM}` },
    });
  });

  it("has me buying when I took someone's listing", () => {
    // They listed it; I took it. I bought.
    expect(tradeDirection(sale("listing", THEM, ME), ME)).toMatchObject({
      sold: false,
      counterparty: { id: THEM },
    });
  });

  it("has me buying when I posted the offer", () => {
    // An offer is a bid to BUY — so posting one and having it taken
    // means I bought, the opposite of the listing case above. Reading
    // `initiatedBy` alone would label this a sale.
    expect(tradeDirection(sale("offer", ME, THEM), ME)).toMatchObject({
      sold: false,
      counterparty: { id: THEM },
    });
  });

  it("has me selling when I filled someone's offer", () => {
    expect(tradeDirection(sale("offer", THEM, ME), ME)).toMatchObject({
      sold: true,
      counterparty: { id: THEM },
    });
  });

  it("names the other party regardless of which side I was on", () => {
    // Counterparty is always "not me" — never my own farm echoed back.
    for (const source of ["listing", "offer"] as const) {
      expect(tradeDirection(sale(source, ME, THEM), ME).counterparty.id).toBe(
        THEM,
      );
      expect(tradeDirection(sale(source, THEM, ME), ME).counterparty.id).toBe(
        THEM,
      );
    }
  });
});

describe("unitPrice", () => {
  it("divides the lot price by the quantity", () => {
    // 100 FLOWER for 4 units is 25/unit — the number that makes two
    // listings comparable.
    expect(unitPrice({ sfl: 100, quantity: 4 })).toBe(25);
  });

  it("ranks a cheap single unit below an expensive bundle", () => {
    const bundle = { sfl: 90, quantity: 10 }; // 9 each
    const single = { sfl: 20, quantity: 1 }; // 20 each
    // Sorting on raw `sfl` would put the bundle last despite being the
    // better price — this is the bug the helper exists to prevent.
    expect(unitPrice(bundle)).toBeLessThan(unitPrice(single));
  });

  it("treats a zero quantity as one rather than dividing by zero", () => {
    expect(unitPrice({ sfl: 7, quantity: 0 })).toBe(7);
  });
});
