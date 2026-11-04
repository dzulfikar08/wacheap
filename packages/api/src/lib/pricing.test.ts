import { describe, expect, test } from "bun:test";

import {
  broadcastCost,
  currentMetaRates,
  META_RATE_CARDS,
  receiptLines,
  type MetaRateCard,
} from "./pricing";

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

describe("currentMetaRates, more cases", () => {
  const card = (effectiveFrom: string, marketing: number): MetaRateCard => ({
    effectiveFrom,
    perMessage: { marketing, utility: 1 },
    vat: 0.11,
    source: "test",
  });
  const cards = [card("2026-11-01", 500), card("2027-01-01", 600)];

  test("a future-dated card is not used yet", () => {
    expect(currentMetaRates(new Date("2026-12-15T12:00:00Z"), cards).perMessage.marketing).toBe(
      500,
    );
  });
  test("a card applies from 00:00 WIB, which is 17:00 UTC the day before", () => {
    expect(currentMetaRates(new Date("2026-12-31T16:59:00Z"), cards).perMessage.marketing).toBe(
      500,
    );
    expect(currentMetaRates(new Date("2026-12-31T17:00:00Z"), cards).perMessage.marketing).toBe(
      600,
    );
  });
  test("before the first card, the first card is the estimate", () => {
    expect(currentMetaRates(new Date("2020-01-01"), cards).perMessage.marketing).toBe(500);
  });
  test("no cards is a configuration error", () => {
    expect(() => currentMetaRates(new Date(), [])).toThrow(/No Meta rate card/);
  });
});

describe("receiptLines", () => {
  test("the shown lines always add up to the shown total", () => {
    for (const category of ["marketing", "utility"] as const) {
      for (let n = 0; n <= 10_000; n++) {
        const lines = receiptLines(broadcastCost(n, category));
        if (lines.subtotal + lines.vat !== lines.total)
          throw new Error(`${category} ${n} does not add up`);
      }
    }
  });
  test("7 utility messages: Rp2.497 + Rp275 = Rp2.772 (unrounded total would show Rp2.771)", () => {
    expect(receiptLines(broadcastCost(7, "utility"))).toEqual({
      subtotal: 2497,
      vat: 275,
      total: 2772,
    });
  });
  test("1,000 promo and utility totals match the issue", () => {
    expect(receiptLines(broadcastCost(1000, "marketing")).total).toBe(650_826);
    expect(receiptLines(broadcastCost(1000, "utility")).total).toBe(395_882);
  });
});
