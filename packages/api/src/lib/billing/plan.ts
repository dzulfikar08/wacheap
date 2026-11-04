// WACheap Cloud billing rules, free of I/O. Access is prepaid time (DOKU has no auto-renew): a trial, then
// `paidUntil` moved forward by each paid order. Prices come from CLOUD_PLAN; message fees are Meta's, never ours.
import { ORPCError } from "@orpc/server";

import { CLOUD_PLAN } from "../pricing";

export type BillingPlan = "monthly" | "yearly";

export const BILLING_PLANS: readonly BillingPlan[] = ["monthly", "yearly"];
/** Upper bound for one checkout, until numbers are real rows (WAB-11). */
export const MAX_NUMBERS = 50;

export interface BillingState {
  trialEndsAt: Date;
  paidUntil: Date | null;
  numbers: number;
}

export interface BillingStatus {
  status: "trial" | "active" | "expired";
  /** When the current access ends: paidUntil when active, trialEndsAt in the trial, the later of both when expired. */
  endsAt: Date;
  /** Whole days left, rounded up (0 when expired). */
  daysLeft: number;
}

/** Whether this server bills at all (WACHEAP_CLOUD=true). Self-hosted installs leave it off. */
export interface BillingSwitch {
  enabled: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Calendar arithmetic runs on the WIB calendar, so "one month from 31 Jan 23:00 WIB" is the end of February in WIB. */
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Rupiah for `numbers` connected numbers on `plan`. */
export function orderAmount(plan: BillingPlan, numbers: number): number {
  if (!Number.isInteger(numbers) || numbers < 1 || numbers > MAX_NUMBERS)
    throw new Error(`numbers must be a whole number from 1 to ${MAX_NUMBERS}, got ${numbers}`);
  return CLOUD_PLAN[plan] * numbers;
}

export function trialEndsAt(now: Date): Date {
  return new Date(now.getTime() + CLOUD_PLAN.trialDays * DAY_MS);
}

/** `date` plus `months` calendar months, clamped to the last day of the target month (31 Jan + 1 = 28/29 Feb). */
export function addCalendarMonths(date: Date, months: number): Date {
  const wib = new Date(date.getTime() + WIB_OFFSET_MS);
  const year = wib.getUTCFullYear();
  const month = wib.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const shifted = Date.UTC(
    year,
    month,
    Math.min(wib.getUTCDate(), lastDay),
    wib.getUTCHours(),
    wib.getUTCMinutes(),
    wib.getUTCSeconds(),
    wib.getUTCMilliseconds(),
  );
  return new Date(shifted - WIB_OFFSET_MS);
}

/**
 * New end of the paid period after paying for `plan`: one calendar month or one year from the later of `current` and
 * `now`, so paying early stacks on the time left and paying after expiry starts today.
 */
export function extendPaidUntil(current: Date | null, now: Date, plan: BillingPlan): Date {
  const base = current && current.getTime() > now.getTime() ? current : now;
  return addCalendarMonths(base, plan === "yearly" ? 12 : 1);
}

/** The date a payment extends from: unused trial days are kept, so paying during the trial loses nothing. */
export function renewalBase(state: BillingState): Date {
  if (!state.paidUntil) return state.trialEndsAt;
  return state.paidUntil.getTime() > state.trialEndsAt.getTime()
    ? state.paidUntil
    : state.trialEndsAt;
}

/**
 * Where a paid order's time starts when it changes the number count. Paid time still running was bought for
 * `state.numbers`; it is rescaled to the new count (10 days for 1 number become 1 day for 10), so a payment can never
 * stretch or shrink time already paid for. Trial days aren't bought per number and stay as they are. With the same
 * count, or nothing paid left, this is renewalBase.
 */
export function rescaledBase(state: BillingState, now: Date, numbers: number): Date {
  const paidLeft = state.paidUntil ? state.paidUntil.getTime() - now.getTime() : 0;
  if (paidLeft <= 0 || numbers === state.numbers) return renewalBase(state);
  const paid = new Date(now.getTime() + Math.floor((paidLeft * state.numbers) / numbers));
  return paid.getTime() > state.trialEndsAt.getTime() ? paid : state.trialEndsAt;
}

function daysUntil(end: Date, now: Date): number {
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / DAY_MS));
}

export function billingStatus(state: BillingState, now: Date): BillingStatus {
  if (state.paidUntil && state.paidUntil.getTime() > now.getTime()) {
    return { status: "active", endsAt: state.paidUntil, daysLeft: daysUntil(state.paidUntil, now) };
  }
  if (state.trialEndsAt.getTime() > now.getTime()) {
    return {
      status: "trial",
      endsAt: state.trialEndsAt,
      daysLeft: daysUntil(state.trialEndsAt, now),
    };
  }
  return { status: "expired", endsAt: renewalBase(state), daysLeft: 0 };
}

export const PAYMENT_REQUIRED_MESSAGE =
  "Masa aktif WACheap Cloud habis. Perpanjang di halaman Langganan untuk mengirim pesan lagi.";

/** Throws PAYMENT_REQUIRED (402) when billing is on and the account has neither trial nor paid time left. */
export function assertCanSend(state: BillingState, now: Date, billing: BillingSwitch): void {
  if (!billing.enabled) return;
  if (billingStatus(state, now).status === "expired") {
    throw new ORPCError("PAYMENT_REQUIRED", { status: 402, message: PAYMENT_REQUIRED_MESSAGE });
  }
}
