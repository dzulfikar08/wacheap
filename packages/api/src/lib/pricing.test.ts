import { describe, expect, test } from "bun:test";

import { broadcastCost, currentMetaRates, META_RATE_CARDS } from "./pricing";

describe("broadcastCost", () => {
  test("1,000 promo messages: Meta's rate plus 11% PPN, no markup", () => {
    const cost = broadcastCost(1000, "marketing");
    expect(cost.subtotal).toBeCloseTo(586_330, 2);
    expect(cost.vat).toBeCloseTo(64_496.3, 2);
    expect(cost.total).toBeCloseTo(650_826.3, 2);
    expect(cost.markup).toBe(0);
  });

  test("order and resi updates are billed as utility, cheaper than promo", () => {
    expect(broadcastCost(100, "utility").total).toBeLessThan(broadcastCost(100, "marketing").total);
  });

  test("refuses a fractional or negative count", () => {
    expect(() => broadcastCost(1.5, "marketing")).toThrow();
    expect(() => broadcastCost(-1, "utility")).toThrow();
  });
});

describe("currentMetaRates", () => {
  test("picks the newest card that has taken effect", () => {
    expect(currentMetaRates(new Date("2030-01-01"))).toBe(META_RATE_CARDS.at(-1)!);
  });
  test("cards are in date order", () => {
    const dates = META_RATE_CARDS.map((c) => c.effectiveFrom);
    expect([...dates].sort()).toEqual(dates);
  });
});
