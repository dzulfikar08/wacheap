import { describe, expect, test } from "bun:test";

import { CLOUD_PLAN } from "../pricing";
import {
  PAYMENT_REQUIRED_MESSAGE,
  assertCanSend,
  billingStatus,
  extendPaidUntil,
  orderAmount,
  renewalBase,
  trialEndsAt,
} from "./plan";

/** A WIB wall-clock time (UTC+7) as a Date. */
const wib = (local: string) => new Date(`${local}+07:00`);
const DAY = 24 * 60 * 60 * 1000;

describe("orderAmount", () => {
  test("is the CLOUD_PLAN price per number", () => {
    expect(orderAmount("monthly", 1)).toBe(CLOUD_PLAN.monthly);
    expect(orderAmount("monthly", 3)).toBe(CLOUD_PLAN.monthly * 3);
    expect(orderAmount("yearly", 2)).toBe(CLOUD_PLAN.yearly * 2);
  });

  test("refuses zero, fractions and absurd quantities", () => {
    expect(() => orderAmount("monthly", 0)).toThrow();
    expect(() => orderAmount("monthly", 1.5)).toThrow();
    expect(() => orderAmount("monthly", 51)).toThrow();
  });
});

describe("extendPaidUntil", () => {
  const now = wib("2026-11-04T10:00:00");

  test("early renewal stacks on the time left", () => {
    const current = wib("2026-11-20T10:00:00");
    expect(extendPaidUntil(current, now, "monthly")).toEqual(wib("2026-12-20T10:00:00"));
  });

  test("renewal after expiry starts from now", () => {
    expect(extendPaidUntil(wib("2026-10-01T10:00:00"), now, "monthly")).toEqual(
      wib("2026-12-04T10:00:00"),
    );
    expect(extendPaidUntil(null, now, "monthly")).toEqual(wib("2026-12-04T10:00:00"));
  });

  test("31 January plus a month is the last day of February, in WIB", () => {
    const jan31 = wib("2027-01-31T23:30:00");
    expect(extendPaidUntil(null, jan31, "monthly")).toEqual(wib("2027-02-28T23:30:00"));
    // Leap year.
    expect(extendPaidUntil(null, wib("2028-01-31T08:00:00"), "monthly")).toEqual(
      wib("2028-02-29T08:00:00"),
    );
    // Across the year boundary.
    expect(extendPaidUntil(null, wib("2026-12-31T08:00:00"), "monthly")).toEqual(
      wib("2027-01-31T08:00:00"),
    );
  });

  test("yearly adds a calendar year (29 Feb lands on 28 Feb)", () => {
    expect(extendPaidUntil(null, now, "yearly")).toEqual(wib("2027-11-04T10:00:00"));
    expect(extendPaidUntil(wib("2028-02-29T12:00:00"), now, "yearly")).toEqual(
      wib("2029-02-28T12:00:00"),
    );
  });
});

describe("billingStatus", () => {
  const start = wib("2026-11-04T10:00:00");
  const trial = { trialEndsAt: trialEndsAt(start), paidUntil: null, numbers: 1 };

  test("a new account is in its trial with the full trial left", () => {
    expect(trial.trialEndsAt.getTime() - start.getTime()).toBe(CLOUD_PLAN.trialDays * DAY);
    expect(billingStatus(trial, start)).toEqual({
      status: "trial",
      endsAt: trial.trialEndsAt,
      daysLeft: CLOUD_PLAN.trialDays,
    });
    // Days round up: an hour into the trial still shows 14.
    expect(billingStatus(trial, new Date(start.getTime() + 3600_000)).daysLeft).toBe(
      CLOUD_PLAN.trialDays,
    );
  });

  test("trial -> expired -> active -> expired", () => {
    const afterTrial = new Date(trial.trialEndsAt.getTime() + 1);
    expect(billingStatus(trial, afterTrial)).toMatchObject({ status: "expired", daysLeft: 0 });

    const paid = { ...trial, paidUntil: extendPaidUntil(null, afterTrial, "monthly") };
    expect(billingStatus(paid, afterTrial)).toMatchObject({
      status: "active",
      endsAt: paid.paidUntil,
    });
    expect(billingStatus(paid, paid.paidUntil)).toMatchObject({ status: "expired", daysLeft: 0 });
  });

  test("paying during the trial keeps the unused trial days", () => {
    expect(renewalBase(trial)).toEqual(trial.trialEndsAt);
    const until = extendPaidUntil(renewalBase(trial), start, "monthly");
    expect(until).toEqual(wib("2026-12-18T10:00:00"));
  });
});

describe("assertCanSend", () => {
  const now = wib("2026-11-04T10:00:00");
  const expired = { trialEndsAt: wib("2026-10-01T00:00:00"), paidUntil: null, numbers: 1 };
  const inTrial = { ...expired, trialEndsAt: wib("2026-11-10T00:00:00") };
  const active = { ...expired, paidUntil: wib("2026-12-01T00:00:00") };

  test("billing on: expired throws PAYMENT_REQUIRED, trial and active pass", () => {
    const on = { enabled: true };
    expect(() => assertCanSend(expired, now, on)).toThrow(PAYMENT_REQUIRED_MESSAGE);
    try {
      assertCanSend(expired, now, on);
    } catch (error) {
      expect(error).toMatchObject({ code: "PAYMENT_REQUIRED", status: 402 });
    }
    expect(() => assertCanSend(inTrial, now, on)).not.toThrow();
    expect(() => assertCanSend(active, now, on)).not.toThrow();
  });

  test("billing off (self-host): never blocks", () => {
    expect(() => assertCanSend(expired, now, { enabled: false })).not.toThrow();
  });
});

describe("extendPaidUntil, WIB vs UTC", () => {
  test("31 Mar 05:00 WIB + 1 month is 30 Apr (UTC arithmetic would land on 1 May WIB)", () => {
    // 31 Mar 05:00 WIB is still 30 Mar in UTC, so a UTC-calendar month would give 30 Apr 22:00 UTC = 1 May 05:00 WIB.
    expect(extendPaidUntil(null, wib("2027-03-31T05:00:00"), "monthly")).toEqual(
      wib("2027-04-30T05:00:00"),
    );
  });
});
