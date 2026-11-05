import { describe, expect, test } from "bun:test";

import { call } from "@orpc/server";
import type { Session } from "@wacheap/auth";
import type { Database } from "@wacheap/db";
import { user } from "@wacheap/db/schema/auth";
import { billingAccount, billingOrder } from "@wacheap/db/schema/billing";
import { d1TestDb } from "@wacheap/db/test-d1";
import { eq } from "drizzle-orm";

import { BILLING_OFF, type BillingConfig } from "../lib/billing/config";
import { WHATSAPP_OFF } from "../lib/whatsapp/config";
import { WEBHOOK_TARGET, signRequest } from "../lib/billing/doku";
import { extendPaidUntil, trialEndsAt } from "../lib/billing/plan";
import { handleDokuNotification } from "../lib/billing/store";
import { CLOUD_PLAN } from "../lib/pricing";
import { billingRouter } from "./billing";

const DOKU = {
  clientId: "BRN-0001",
  secretKey: "SK-test",
  baseUrl: "https://api-sandbox.doku.test",
};

async function setup(billing: Partial<BillingConfig> = {}) {
  const { db } = await d1TestDb();
  await db.insert(user).values({ id: "u1", name: "Toko Ani", email: "ani@example.test" });
  await db.insert(user).values({ id: "u2", name: "Toko Budi", email: "budi@example.test" });
  const calls: { body: unknown }[] = [];
  const fakeFetch = (async (_url: string, init: RequestInit) => {
    calls.push({ body: JSON.parse(String(init.body)) });
    return Response.json({
      response: { payment: { url: "https://sandbox.doku.com/checkout-link-v2/x" } },
    });
  }) as unknown as typeof fetch;
  const config: BillingConfig = {
    enabled: true,
    doku: DOKU,
    notifyUrl: "https://api.example.test/api/billing/webhook",
    returnUrl: "https://app.example.test/billing/selesai",
    fetch: fakeFetch,
    ...billing,
  };
  const as = (id: string) => ({
    db,
    session: { user: { id, name: "Toko", email: `${id}@example.test` } } as unknown as Session,
    verifyHuman: async () => true,
    billing: config,
    whatsapp: WHATSAPP_OFF,
  });
  return { db, calls, as };
}

async function notify(
  db: Database,
  payload: { ref: string; amount: number; status?: string },
  secret = DOKU.secretKey,
  now?: Date,
) {
  const body = JSON.stringify({
    order: { invoice_number: payload.ref, amount: payload.amount },
    transaction: { status: payload.status ?? "SUCCESS" },
  });
  const requestId = crypto.randomUUID();
  const timestamp = "2026-11-04T05:00:00Z";
  const signature = await signRequest(
    { clientId: DOKU.clientId, requestId, timestamp, target: WEBHOOK_TARGET, body },
    secret,
  );
  const headers = new Headers({
    "Client-Id": DOKU.clientId,
    "Request-Id": requestId,
    "Request-Timestamp": timestamp,
    Signature: signature,
  });
  return handleDokuNotification({ db, doku: DOKU, headers, body, now });
}

const account = async (db: Database, userId: string) =>
  (await db.select().from(billingAccount).where(eq(billingAccount.userId, userId)))[0];

describe("billing.status", () => {
  test("billing off: reports disabled and writes nothing", async () => {
    const { db, as } = await setup();
    const result = await call(billingRouter.status, undefined, {
      context: { ...as("u1"), billing: BILLING_OFF },
    });
    expect(result).toEqual({ enabled: false });
    expect(await account(db, "u1")).toBeUndefined();
  });

  test("the first call starts a trial once; later calls keep it", async () => {
    const { as } = await setup();
    const before = Date.now();
    const first = await call(billingRouter.status, undefined, { context: as("u1") });
    if (!first.enabled) throw new Error("expected billing on");
    expect(first.status).toBe("trial");
    expect(first.daysLeft).toBe(CLOUD_PLAN.trialDays);
    expect(first.paidUntil).toBeNull();
    expect(first.numbers).toBe(1);
    expect(first.checkoutReady).toBe(true);
    expect(first.trialEndsAt.getTime()).toBeGreaterThanOrEqual(
      trialEndsAt(new Date(before)).getTime(),
    );

    const second = await call(billingRouter.status, undefined, { context: as("u1") });
    if (!second.enabled) throw new Error("expected billing on");
    expect(second.trialEndsAt).toEqual(first.trialEndsAt);
  });

  test("an elapsed trial reads as expired", async () => {
    const { db, as } = await setup();
    await db
      .insert(billingAccount)
      .values({ userId: "u1", trialEndsAt: new Date(Date.now() - 1000), numbers: 1 });
    const result = await call(billingRouter.status, undefined, { context: as("u1") });
    expect(result).toMatchObject({ enabled: true, status: "expired", daysLeft: 0 });
  });
});

describe("billing.checkout", () => {
  test("creates a pending order for the CLOUD_PLAN amount and returns DOKU's URL", async () => {
    const { db, calls, as } = await setup();
    const result = await call(
      billingRouter.checkout,
      { plan: "yearly", numbers: 3 },
      { context: as("u1") },
    );
    expect(result.paymentUrl).toBe("https://sandbox.doku.com/checkout-link-v2/x");
    expect(result.amount).toBe(CLOUD_PLAN.yearly * 3);
    const [order] = await db.select().from(billingOrder);
    expect(order).toMatchObject({
      userId: "u1",
      plan: "yearly",
      numbers: 3,
      amount: CLOUD_PLAN.yearly * 3,
      status: "pending",
      provider: "doku",
      providerRef: result.order,
      paymentUrl: "https://sandbox.doku.com/checkout-link-v2/x",
    });
    expect(calls[0]?.body).toMatchObject({
      order: {
        amount: CLOUD_PLAN.yearly * 3,
        invoice_number: result.order,
        callback_url: `https://app.example.test/billing/selesai?order=${result.order}`,
      },
    });
  });

  test("refuses clearly when billing is off or the DOKU keys are missing", async () => {
    const { as } = await setup();
    await expect(
      call(
        billingRouter.checkout,
        { plan: "monthly", numbers: 1 },
        {
          context: { ...as("u1"), billing: BILLING_OFF },
        },
      ),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    const { as: asNoKeys } = await setup({ doku: null });
    await expect(
      call(billingRouter.checkout, { plan: "monthly", numbers: 1 }, { context: asNoKeys("u1") }),
    ).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      message: expect.stringContaining("DOKU"),
    });
  });

  test("a DOKU failure marks the order failed", async () => {
    const failing = (async () => new Response("down", { status: 503 })) as unknown as typeof fetch;
    const { db, as } = await setup({ fetch: failing });
    await expect(
      call(billingRouter.checkout, { plan: "monthly", numbers: 1 }, { context: as("u1") }),
    ).rejects.toMatchObject({ code: "BAD_GATEWAY" });
    const [order] = await db.select().from(billingOrder);
    expect(order?.status).toBe("failed");
  });

  test("rejects a quantity outside 1..50", async () => {
    const { as } = await setup();
    await expect(
      call(billingRouter.checkout, { plan: "monthly", numbers: 0 }, { context: as("u1") }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("DOKU webhook", () => {
  test("a paid notification extends paid_until once, even when replayed", async () => {
    const { db, as } = await setup();
    const { order: ref, amount } = await call(
      billingRouter.checkout,
      { plan: "monthly", numbers: 2 },
      { context: as("u1") },
    );
    const before = await account(db, "u1");

    const now = new Date();
    const first = await notify(db, { ref, amount }, DOKU.secretKey, now);
    expect(first).toEqual({ status: 200, body: { received: true, activated: true } });
    const paid = await account(db, "u1");
    expect(paid?.paidUntil).toEqual(extendPaidUntil(before!.trialEndsAt, now, "monthly"));
    expect(paid?.numbers).toBe(2);

    const replay = await notify(
      db,
      { ref, amount },
      DOKU.secretKey,
      new Date(now.getTime() + 5000),
    );
    expect(replay).toEqual({ status: 200, body: { received: true, activated: false } });
    expect((await account(db, "u1"))?.paidUntil).toEqual(paid!.paidUntil);

    const [order] = await db.select().from(billingOrder).where(eq(billingOrder.providerRef, ref));
    expect(order).toMatchObject({ status: "paid", paidUntil: paid!.paidUntil });

    const status = await call(billingRouter.status, undefined, { context: as("u1") });
    expect(status).toMatchObject({ enabled: true, status: "active" });
    const polled = await call(billingRouter.order, { ref }, { context: as("u1") });
    expect(polled.status).toBe("paid");
  });

  test("two orders stack: the second extends from the first's end", async () => {
    const { db, as } = await setup();
    const a = await call(
      billingRouter.checkout,
      { plan: "monthly", numbers: 1 },
      { context: as("u1") },
    );
    const b = await call(
      billingRouter.checkout,
      { plan: "yearly", numbers: 1 },
      { context: as("u1") },
    );
    const now = new Date();
    await notify(db, { ref: a.order, amount: a.amount }, DOKU.secretKey, now);
    const afterA = (await account(db, "u1"))!.paidUntil!;
    await notify(db, { ref: b.order, amount: b.amount }, DOKU.secretKey, now);
    expect((await account(db, "u1"))!.paidUntil).toEqual(extendPaidUntil(afterA, now, "yearly"));
  });

  test("bad signature, wrong secret, wrong client and tampered body are 401 and change nothing", async () => {
    const { db, as } = await setup();
    const { order: ref, amount } = await call(
      billingRouter.checkout,
      { plan: "monthly", numbers: 1 },
      { context: as("u1") },
    );
    expect((await notify(db, { ref, amount }, "SK-wrong")).status).toBe(401);

    const body = JSON.stringify({
      order: { invoice_number: ref, amount },
      transaction: { status: "SUCCESS" },
    });
    const headers = {
      "Client-Id": DOKU.clientId,
      "Request-Id": "r1",
      "Request-Timestamp": "2026-11-04T05:00:00Z",
    };
    const signature = await signRequest(
      {
        clientId: DOKU.clientId,
        requestId: "r1",
        timestamp: headers["Request-Timestamp"],
        target: WEBHOOK_TARGET,
        body,
      },
      DOKU.secretKey,
    );
    const tampered = await handleDokuNotification({
      db,
      doku: DOKU,
      headers: new Headers({ ...headers, Signature: signature }),
      body: body.replace(String(amount), "1"),
    });
    expect(tampered.status).toBe(401);
    const otherClient = await handleDokuNotification({
      db,
      doku: DOKU,
      headers: new Headers({ ...headers, "Client-Id": "BRN-other", Signature: signature }),
      body,
    });
    expect(otherClient.status).toBe(401);
    const unsigned = await handleDokuNotification({
      db,
      doku: DOKU,
      headers: new Headers(headers),
      body,
    });
    expect(unsigned.status).toBe(401);

    expect((await account(db, "u1"))?.paidUntil).toBeNull();
    const [order] = await db.select().from(billingOrder);
    expect(order?.status).toBe("pending");
  });

  test("amount mismatch is refused; unknown orders are 404; keys missing is 404", async () => {
    const { db, as } = await setup();
    const { order: ref, amount } = await call(
      billingRouter.checkout,
      { plan: "monthly", numbers: 1 },
      { context: as("u1") },
    );
    expect((await notify(db, { ref, amount: amount - 1 })).status).toBe(400);
    expect((await notify(db, { ref: "WAC-261104050000-00000000", amount })).status).toBe(404);
    const disabled = await handleDokuNotification({
      db,
      doku: null,
      headers: new Headers(),
      body: "{}",
    });
    expect(disabled.status).toBe(404);
    expect((await account(db, "u1"))?.paidUntil).toBeNull();
  });

  test("EXPIRED marks a pending order expired without extending", async () => {
    const { db, as } = await setup();
    const { order: ref, amount } = await call(
      billingRouter.checkout,
      { plan: "monthly", numbers: 1 },
      { context: as("u1") },
    );
    expect((await notify(db, { ref, amount, status: "EXPIRED" })).status).toBe(200);
    const [order] = await db.select().from(billingOrder);
    expect(order?.status).toBe("expired");
    expect((await account(db, "u1"))?.paidUntil).toBeNull();
  });
});

describe("billing.order", () => {
  test("only the owner can read an order", async () => {
    const { as } = await setup();
    const { order: ref } = await call(
      billingRouter.checkout,
      { plan: "monthly", numbers: 1 },
      { context: as("u1") },
    );
    expect((await call(billingRouter.order, { ref }, { context: as("u1") })).status).toBe(
      "pending",
    );
    await expect(call(billingRouter.order, { ref }, { context: as("u2") })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("billing fixes from review", () => {
  test("while paid time runs, a renewal must keep the number count", async () => {
    const { db, as } = await setup();
    await call(billingRouter.status, undefined, { context: as("u1") });
    const { order } = await call(
      billingRouter.checkout,
      { plan: "monthly", numbers: 3 },
      { context: as("u1") },
    );
    expect((await notify(db, { ref: order, amount: CLOUD_PLAN.monthly * 3 })).status).toBe(200);
    expect((await account(db, "u1"))?.numbers).toBe(3);
    await expect(
      call(billingRouter.checkout, { plan: "monthly", numbers: 10 }, { context: as("u1") }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await call(billingRouter.checkout, { plan: "yearly", numbers: 3 }, { context: as("u1") });
  });

  test("an expired account can choose a new count", async () => {
    const { db, as } = await setup();
    await call(billingRouter.status, undefined, { context: as("u1") });
    await db
      .update(billingAccount)
      .set({
        trialEndsAt: new Date(Date.now() - 86_400_000),
        paidUntil: new Date(Date.now() - 3_600_000),
        numbers: 2,
      })
      .where(eq(billingAccount.userId, "u1"));
    await call(billingRouter.checkout, { plan: "monthly", numbers: 7 }, { context: as("u1") });
  });

  test("two checkouts with different counts can't stretch paid time: it is rescaled on activation", async () => {
    const { db, as } = await setup();
    await call(billingRouter.status, undefined, { context: as("u1") });
    // No paid time yet, trial over: both checkouts are allowed.
    await db
      .update(billingAccount)
      .set({ trialEndsAt: new Date(Date.now() - 1000) })
      .where(eq(billingAccount.userId, "u1"));
    const one = await call(
      billingRouter.checkout,
      { plan: "monthly", numbers: 1 },
      { context: as("u1") },
    );
    const ten = await call(
      billingRouter.checkout,
      { plan: "monthly", numbers: 10 },
      { context: as("u1") },
    );
    const t0 = new Date();
    await notify(db, { ref: one.order, amount: CLOUD_PLAN.monthly }, undefined, t0);
    const afterOne = (await account(db, "u1"))!.paidUntil!.getTime();
    const monthMs = afterOne - t0.getTime();
    await notify(db, { ref: ten.order, amount: CLOUD_PLAN.monthly * 10 }, undefined, t0);
    const acc = (await account(db, "u1"))!;
    expect(acc.numbers).toBe(10);
    // The 1-number month becomes a tenth of a month for 10 numbers, then the paid 10-number month stacks on it:
    // about 1.1 months, not 2 months for 10 numbers.
    const total = acc.paidUntil!.getTime() - t0.getTime();
    expect(total).toBeLessThan(monthMs * 1.2);
    expect(total).toBeGreaterThan(monthMs * 1.05);
  });

  test("a paid order whose webhook never came is settled from DOKU's status API when polled", async () => {
    const { db, as } = await setup();
    await call(billingRouter.status, undefined, { context: as("u1") });
    const { order } = await call(
      billingRouter.checkout,
      { plan: "monthly", numbers: 1 },
      { context: as("u1") },
    );
    // Age the order past the reconcile threshold.
    await db
      .update(billingOrder)
      .set({ createdAt: new Date(Date.now() - 60_000) })
      .where(eq(billingOrder.providerRef, order));
    let statusCalls = 0;
    const statusFetch = (async (url: string) => {
      statusCalls++;
      expect(String(url)).toContain(`/orders/v1/status/${order}`);
      return Response.json({
        order: { invoice_number: order, amount: CLOUD_PLAN.monthly },
        transaction: { status: "SUCCESS" },
      });
    }) as unknown as typeof fetch;
    const ctx = { ...as("u1"), billing: { ...as("u1").billing, fetch: statusFetch } };
    const polled = await call(billingRouter.order, { ref: order }, { context: ctx });
    expect(statusCalls).toBe(1);
    expect(polled.status).toBe("paid");
    expect((await account(db, "u1"))?.paidUntil).toBeTruthy();
  });

  test("a fresh pending order is not asked about yet, and a failed lookup changes nothing", async () => {
    const { db, as } = await setup();
    await call(billingRouter.status, undefined, { context: as("u1") });
    const { order } = await call(
      billingRouter.checkout,
      { plan: "monthly", numbers: 1 },
      { context: as("u1") },
    );
    let statusCalls = 0;
    const down = (async () => {
      statusCalls++;
      return new Response("bad gateway", { status: 502 });
    }) as unknown as typeof fetch;
    const ctx = { ...as("u1"), billing: { ...as("u1").billing, fetch: down } };
    expect((await call(billingRouter.order, { ref: order }, { context: ctx })).status).toBe(
      "pending",
    );
    expect(statusCalls).toBe(0);
    await db
      .update(billingOrder)
      .set({ createdAt: new Date(Date.now() - 60_000) })
      .where(eq(billingOrder.providerRef, order));
    expect((await call(billingRouter.order, { ref: order }, { context: ctx })).status).toBe(
      "pending",
    );
    expect(statusCalls).toBe(1);
  });

  test("EXPIRED then SUCCESS still credits the order once", async () => {
    const { db, as } = await setup();
    await call(billingRouter.status, undefined, { context: as("u1") });
    const { order } = await call(
      billingRouter.checkout,
      { plan: "monthly", numbers: 1 },
      { context: as("u1") },
    );
    await notify(db, { ref: order, amount: CLOUD_PLAN.monthly, status: "EXPIRED" });
    expect((await notify(db, { ref: order, amount: CLOUD_PLAN.monthly })).body).toMatchObject({
      activated: true,
    });
    expect((await notify(db, { ref: order, amount: CLOUD_PLAN.monthly })).body).toMatchObject({
      activated: false,
    });
  });
});

describe("status-API reconcile is bounded", () => {
  test("at most one DOKU call per order per window, however fast the page polls", async () => {
    const { db, as } = await setup();
    await call(billingRouter.status, undefined, { context: as("u1") });
    const { order } = await call(
      billingRouter.checkout,
      { plan: "monthly", numbers: 1 },
      { context: as("u1") },
    );
    await db
      .update(billingOrder)
      .set({ createdAt: new Date(Date.now() - 60_000) })
      .where(eq(billingOrder.providerRef, order));
    let calls = 0;
    const pending = (async () => {
      calls++;
      return Response.json({
        order: { invoice_number: order, amount: CLOUD_PLAN.monthly },
        transaction: { status: "PENDING" },
      });
    }) as unknown as typeof fetch;
    const ctx = { ...as("u1"), billing: { ...as("u1").billing, fetch: pending } };
    for (let i = 0; i < 5; i++) await call(billingRouter.order, { ref: order }, { context: ctx });
    expect(calls).toBe(1);
  });

  test("past DOKU's payment window a pending order is expired locally, without a call", async () => {
    const { db, as } = await setup();
    await call(billingRouter.status, undefined, { context: as("u1") });
    const { order } = await call(
      billingRouter.checkout,
      { plan: "monthly", numbers: 1 },
      { context: as("u1") },
    );
    await db
      .update(billingOrder)
      .set({ createdAt: new Date(Date.now() - 2 * 3_600_000) })
      .where(eq(billingOrder.providerRef, order));
    let calls = 0;
    const spy = (async () => (calls++, Response.json({}))) as unknown as typeof fetch;
    const ctx = { ...as("u1"), billing: { ...as("u1").billing, fetch: spy } };
    const res = await call(billingRouter.order, { ref: order }, { context: ctx });
    expect(res.status).toBe("expired");
    expect(calls).toBe(0);
    expect("createdAt" in res).toBe(false);
  });

  test("a failed order that was paid on the same link after all is settled by reconcile", async () => {
    const { db, as } = await setup();
    await call(billingRouter.status, undefined, { context: as("u1") });
    const { order } = await call(
      billingRouter.checkout,
      { plan: "monthly", numbers: 1 },
      { context: as("u1") },
    );
    await notify(db, { ref: order, amount: CLOUD_PLAN.monthly, status: "FAILED" });
    await db
      .update(billingOrder)
      .set({ createdAt: new Date(Date.now() - 60_000) })
      .where(eq(billingOrder.providerRef, order));
    const paid = (async () =>
      Response.json({
        order: { invoice_number: order, amount: CLOUD_PLAN.monthly },
        transaction: { status: "SUCCESS" },
      })) as unknown as typeof fetch;
    const ctx = { ...as("u1"), billing: { ...as("u1").billing, fetch: paid } };
    expect((await call(billingRouter.order, { ref: order }, { context: ctx })).status).toBe("paid");
  });
});
