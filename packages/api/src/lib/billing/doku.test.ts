import { describe, expect, test } from "bun:test";

import {
  WEBHOOK_TARGET,
  buildOrderId,
  createCheckout,
  dokuConfigFromEnv,
  failedStatus,
  isOrderId,
  isPaid,
  parseNotification,
  requestTimestamp,
  signRequest,
  verifySignature,
} from "./doku";

const SECRET = "SK-test-secret";
const BODY = JSON.stringify({
  order: { invoice_number: "WAC-261104050000-abcdef12", amount: 99000 },
  transaction: { status: "SUCCESS" },
});
const INPUT = {
  clientId: "BRN-0001-0000000000001",
  requestId: "4b0e2f1a-1111-2222-3333-444455556666",
  timestamp: "2026-11-04T05:00:00Z",
  target: WEBHOOK_TARGET,
  body: BODY,
};

async function hmac(components: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return btoa(
    String.fromCharCode(
      ...new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(components))),
    ),
  );
}

describe("DOKU signature", () => {
  test("known vector: components string, sha256 digest, HMAC-SHA256", async () => {
    const digest = btoa(
      String.fromCharCode(
        ...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(BODY))),
      ),
    );
    const components = `Client-Id:${INPUT.clientId}\nRequest-Id:${INPUT.requestId}\nRequest-Timestamp:${INPUT.timestamp}\nRequest-Target:${INPUT.target}\nDigest:${digest}`;
    expect(await signRequest(INPUT, SECRET)).toBe(`HMACSHA256=${await hmac(components, SECRET)}`);
  });

  test("a valid signature verifies", async () => {
    const sig = await signRequest(INPUT, SECRET);
    expect(await verifySignature(INPUT, sig, SECRET)).toBe(true);
  });

  test("a tampered body, target, timestamp or signature is rejected", async () => {
    const sig = await signRequest(INPUT, SECRET);
    const tampered = BODY.replace("99000", "1");
    expect(await verifySignature({ ...INPUT, body: tampered }, sig, SECRET)).toBe(false);
    expect(await verifySignature({ ...INPUT, target: "/other" }, sig, SECRET)).toBe(false);
    expect(
      await verifySignature({ ...INPUT, timestamp: "2026-11-04T05:00:01Z" }, sig, SECRET),
    ).toBe(false);
    expect(await verifySignature(INPUT, `${sig.slice(0, -2)}AA`, SECRET)).toBe(false);
    expect(await verifySignature(INPUT, "", SECRET)).toBe(false);
  });

  test("a signature made with the wrong secret is rejected", async () => {
    const sig = await signRequest(INPUT, "SK-someone-else");
    expect(await verifySignature(INPUT, sig, SECRET)).toBe(false);
  });
});

describe("parseNotification", () => {
  test("reads invoice, amount and status", () => {
    expect(parseNotification(JSON.parse(BODY))).toEqual({
      invoiceNumber: "WAC-261104050000-abcdef12",
      amount: 99000,
      status: "SUCCESS",
    });
  });

  test("rejects malformed payloads", () => {
    expect(parseNotification(null)).toBeNull();
    expect(parseNotification({ order: {} })).toBeNull();
    expect(
      parseNotification({
        order: { invoice_number: "x", amount: "1" },
        transaction: { status: "SUCCESS" },
      }),
    ).toBeNull();
  });

  test("only SUCCESS is paid; EXPIRED, FAILED and VOIDED are terminal", () => {
    const n = (status: string) => ({ invoiceNumber: "x", amount: 1, status });
    expect(isPaid(n("SUCCESS"))).toBe(true);
    expect(isPaid(n("PENDING"))).toBe(false);
    expect(failedStatus(n("PENDING"))).toBeNull();
    expect(failedStatus(n("EXPIRED"))).toBe("expired");
    expect(failedStatus(n("FAILED"))).toBe("failed");
    expect(failedStatus(n("VOIDED"))).toBe("failed");
  });
});

describe("order ids and config", () => {
  test("order ids are opaque, unique and recognised", () => {
    const a = buildOrderId(new Date("2026-11-04T05:00:00Z"));
    const b = buildOrderId(new Date("2026-11-04T05:00:00Z"));
    expect(a).toMatch(/^WAC-261104050000-[0-9a-f]{8}$/);
    expect(a).not.toBe(b);
    expect(isOrderId(a)).toBe(true);
    expect(isOrderId("JRG-261104050000-abcdef12")).toBe(false);
  });

  test("timestamp drops millis", () => {
    expect(requestTimestamp(new Date("2026-11-04T05:00:00.123Z"))).toBe("2026-11-04T05:00:00Z");
  });

  test("config needs both keys; empty base URL means production", () => {
    expect(dokuConfigFromEnv({})).toBeNull();
    expect(dokuConfigFromEnv({ DOKU_CLIENT_ID: "BRN-1", DOKU_SECRET_KEY: "" })).toBeNull();
    expect(dokuConfigFromEnv({ DOKU_CLIENT_ID: "BRN-1", DOKU_SECRET_KEY: "SK" })).toEqual({
      clientId: "BRN-1",
      secretKey: "SK",
      baseUrl: "https://api.doku.com",
    });
    expect(
      dokuConfigFromEnv({
        DOKU_CLIENT_ID: "BRN-1",
        DOKU_SECRET_KEY: "SK",
        DOKU_BASE_URL: "https://api-sandbox.doku.com/",
      })?.baseUrl,
    ).toBe("https://api-sandbox.doku.com");
  });
});

describe("createCheckout", () => {
  const config = { clientId: "BRN-1", secretKey: SECRET, baseUrl: "https://api-sandbox.doku.com" };
  const params = {
    orderId: "WAC-261104050000-abcdef12",
    amountIdr: 198000,
    itemName: "WACheap Cloud 1 bulan",
    quantity: 2,
    customerEmail: "toko@example.test",
    notifyUrl: "https://api.example.test/api/billing/webhook",
    returnUrl: "https://app.example.test/billing/selesai?order=WAC-261104050000-abcdef12",
  };

  test("sends a signed request DOKU can verify and returns the payment URL", async () => {
    let seen: { url: string; headers: Headers; body: string } | null = null;
    const fake = (async (url: string, init: RequestInit) => {
      seen = { url, headers: new Headers(init.headers), body: String(init.body) };
      return Response.json({
        response: { payment: { url: "https://sandbox.doku.com/checkout-link-v2/abc" } },
      });
    }) as unknown as typeof fetch;
    const { paymentUrl } = await createCheckout(config, params, fake);
    expect(paymentUrl).toBe("https://sandbox.doku.com/checkout-link-v2/abc");
    const req = seen!;
    expect(req.url).toBe("https://api-sandbox.doku.com/checkout/v1/payment");
    const body = JSON.parse(req.body);
    expect(body.order).toMatchObject({
      amount: 198000,
      invoice_number: params.orderId,
      currency: "IDR",
      line_items: [{ quantity: 2, price: 99000 }],
      callback_url: params.returnUrl,
    });
    expect(body.additional_info.override_notification_url).toBe(params.notifyUrl);
    expect(
      await verifySignature(
        {
          clientId: "BRN-1",
          requestId: req.headers.get("Request-Id")!,
          timestamp: req.headers.get("Request-Timestamp")!,
          target: "/checkout/v1/payment",
          body: req.body,
        },
        req.headers.get("Signature")!,
        SECRET,
      ),
    ).toBe(true);
  });

  test("throws when DOKU answers without a payment URL", async () => {
    const fake = (async () =>
      Response.json({ error: "nope" }, { status: 400 })) as unknown as typeof fetch;
    await expect(createCheckout(config, params, fake)).rejects.toThrow("HTTP 400");
  });
});

describe("isDokuPaymentUrl", () => {
  test("accepts https on doku.com hosts only", async () => {
    const { isDokuPaymentUrl } = await import("./doku");
    expect(isDokuPaymentUrl("https://sandbox.doku.com/checkout-link-v2/abc")).toBe(true);
    expect(isDokuPaymentUrl("https://jokul.doku.com/checkout/link/abc")).toBe(true);
    for (const bad of [
      "http://jokul.doku.com/x",
      "https://doku.com.evil.example/x",
      "https://evil.example/doku.com",
      "javascript:alert(1)",
      "nope",
    ]) {
      expect(isDokuPaymentUrl(bad)).toBe(false);
    }
  });
});

describe("createCheckout refuses a payment URL outside doku.com", () => {
  test("throws instead of returning it", async () => {
    const { createCheckout } = await import("./doku");
    const evil = (async () =>
      Response.json({
        response: { payment: { url: "https://evil.example/pay" } },
      })) as unknown as typeof fetch;
    await expect(
      createCheckout(
        { clientId: "BRN-1", secretKey: "s", baseUrl: "https://api-sandbox.doku.com" },
        {
          orderId: "WAC-1",
          amountIdr: 99_000,
          itemName: "x",
          quantity: 1,
          customerEmail: "a@b.test",
          notifyUrl: "https://n.test",
          returnUrl: "https://r.test",
        },
        evil,
      ),
    ).rejects.toThrow(/outside doku.com/);
  });
});
