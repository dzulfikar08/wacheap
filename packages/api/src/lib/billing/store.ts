// Billing rows in D1. D1 has no interactive transactions, so the paid flip and the extension go in one db.batch, each
// statement guarded so a replayed or concurrent notification extends paid_until exactly once.
import type { Database } from "@wacheap/db";
import { billingAccount, billingOrder } from "@wacheap/db/schema/billing";
import { and, eq, ne, sql } from "drizzle-orm";

import {
  type DokuConfig,
  type DokuNotification,
  WEBHOOK_TARGET,
  checkStatus,
  failedStatus,
  isOrderId,
  isPaid,
  parseNotification,
  verifySignature,
} from "./doku";
import { type BillingState, extendPaidUntil, renewalBase, trialEndsAt } from "./plan";

/** The user's billing row, created with a fresh trial on first use. */
export async function ensureBillingAccount(
  db: Database,
  userId: string,
  now: Date,
): Promise<BillingState> {
  await db
    .insert(billingAccount)
    .values({ userId, trialEndsAt: trialEndsAt(now), numbers: 1 })
    .onConflictDoNothing({ target: billingAccount.userId });
  const [row] = await db
    .select({
      trialEndsAt: billingAccount.trialEndsAt,
      paidUntil: billingAccount.paidUntil,
      numbers: billingAccount.numbers,
    })
    .from(billingAccount)
    .where(eq(billingAccount.userId, userId))
    .limit(1);
  if (!row) throw new Error(`billing account for ${userId} missing after insert`);
  return row;
}

export type ActivateResult = "activated" | "already" | "conflict";

/**
 * Flip an order to paid and extend its owner's paid_until, in one batch. The flip lands only while the order is not
 * yet paid AND paid_until still holds the value we extended from; the extension lands only after that flip. So a
 * replay changes nothing, and two payments racing on the same base can't both stack on it (the loser gets "conflict"
 * and DOKU retries the notification).
 */
export async function activateOrder(
  db: Database,
  order: { id: string; userId: string; plan: "monthly" | "yearly"; numbers: number },
  now: Date,
): Promise<{ result: ActivateResult; paidUntil?: Date }> {
  const state = await ensureBillingAccount(db, order.userId, now);
  const previous = state.paidUntil?.getTime() ?? null;
  const until = extendPaidUntil(renewalBase(state), now, order.plan);

  const [flipped] = await db.batch([
    db
      .update(billingOrder)
      .set({ status: "paid", paidAt: now, paidUntil: until })
      .where(
        and(
          eq(billingOrder.id, order.id),
          ne(billingOrder.status, "paid"),
          sql`(select ${billingAccount.paidUntil} from ${billingAccount} where ${billingAccount.userId} = ${order.userId}) is ${previous}`,
        ),
      )
      .returning({ id: billingOrder.id }),
    db
      .update(billingAccount)
      .set({ paidUntil: until, numbers: order.numbers })
      .where(
        and(
          eq(billingAccount.userId, order.userId),
          sql`${billingAccount.paidUntil} is ${previous}`,
          sql`exists (select 1 from ${billingOrder} where ${billingOrder.id} = ${order.id} and ${billingOrder.status} = 'paid' and ${billingOrder.paidAt} = ${now.getTime()})`,
        ),
      ),
  ]);
  if (flipped.length === 1) return { result: "activated", paidUntil: until };

  const [again] = await db
    .select({ status: billingOrder.status })
    .from(billingOrder)
    .where(eq(billingOrder.id, order.id))
    .limit(1);
  return { result: again?.status === "paid" ? "already" : "conflict" };
}

export interface WebhookResponse {
  status: 200 | 400 | 401 | 404 | 409;
  body: Record<string, unknown>;
}

/**
 * DOKU payment notification. Public: trust comes from the signature only (Client-Id must be ours and the HMAC over
 * the raw body must match). Unknown orders, bad JSON and amount mismatches are refused; failures mark a pending order
 * failed or expired; SUCCESS activates it once.
 */
export async function handleDokuNotification(input: {
  db: Database;
  doku: DokuConfig | null;
  headers: Headers;
  body: string;
  now?: Date;
}): Promise<WebhookResponse> {
  const { db, doku, headers, body } = input;
  if (!doku) return { status: 404, body: { error: "billing disabled" } };

  const clientId = headers.get("Client-Id") ?? "";
  const valid =
    clientId === doku.clientId &&
    (await verifySignature(
      {
        clientId,
        requestId: headers.get("Request-Id") ?? "",
        timestamp: headers.get("Request-Timestamp") ?? "",
        target: WEBHOOK_TARGET,
        body,
      },
      headers.get("Signature") ?? "",
      doku.secretKey,
    ));
  if (!valid) return { status: 401, body: { error: "invalid signature" } };

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { status: 400, body: { error: "invalid json" } };
  }
  const n = parseNotification(parsed);
  if (!n || !isOrderId(n.invoiceNumber))
    return { status: 400, body: { error: "invalid notification" } };
  return applyNotification(db, n, input.now ?? new Date());
}

/**
 * Settle an order from DOKU's word on it, whether it came as a signed webhook or from the Check Status API: unknown
 * orders and amount mismatches are refused, failures mark a pending order failed or expired, SUCCESS activates it once.
 */
export async function applyNotification(
  db: Database,
  n: DokuNotification,
  now: Date,
): Promise<WebhookResponse> {
  const [order] = await db
    .select()
    .from(billingOrder)
    .where(and(eq(billingOrder.provider, "doku"), eq(billingOrder.providerRef, n.invoiceNumber)))
    .limit(1);
  if (!order) return { status: 404, body: { error: "order not found" } };

  const failed = failedStatus(n);
  if (failed) {
    await db
      .update(billingOrder)
      .set({ status: failed })
      .where(and(eq(billingOrder.id, order.id), eq(billingOrder.status, "pending")));
    return { status: 200, body: { received: true } };
  }
  if (!isPaid(n)) return { status: 200, body: { received: true } };
  if (order.status === "paid") return { status: 200, body: { received: true, activated: false } };
  if (Math.round(n.amount) !== order.amount)
    return { status: 400, body: { error: "amount mismatch" } };

  const { result } = await activateOrder(db, order, now);
  if (result === "activated") return { status: 200, body: { received: true, activated: true } };
  if (result === "already") return { status: 200, body: { received: true, activated: false } };
  return { status: 409, body: { error: "concurrent update, retry" } };
}

/** A pending order older than this is asked about at DOKU when its owner polls it (the webhook may have been lost). */
export const RECONCILE_AFTER_MS = 30_000;

/**
 * Ask DOKU about a still-pending order and settle it the same way a webhook would. A failed lookup changes nothing;
 * the next poll, or DOKU's own retry of the webhook, tries again.
 */
export async function reconcileOrder(
  db: Database,
  doku: DokuConfig,
  ref: string,
  now: Date,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const n = await checkStatus(doku, ref, fetchImpl);
    const res = await applyNotification(db, n, now);
    return res.status === 200;
  } catch (error) {
    console.warn(
      `billing: status check for ${ref} failed (${error instanceof Error ? error.message : "unknown"})`,
    );
    return false;
  }
}
