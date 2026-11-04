import { describe, expect, test } from "bun:test";

import { call } from "@orpc/server";
import type { Session } from "@wacheap/auth";
import type { Database } from "@wacheap/db";
import { user } from "@wacheap/db/schema/auth";
import { billingAccount, billingOrder } from "@wacheap/db/schema/billing";
import { d1TestDb } from "@wacheap/db/test-d1";
import { eq } from "drizzle-orm";

import { BILLING_OFF, type BillingConfig } from "../lib/billing/config";
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
    return Response.json({ response: { payment: { url: "https://pay.doku.test/x" } } });
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
    expect(result.paymentUrl).toBe("https://pay.doku.test/x");
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
      paymentUrl: "https://pay.doku.test/x",
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
