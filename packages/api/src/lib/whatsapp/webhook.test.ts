import { describe, expect, test } from "bun:test";

import { user } from "@wacheap/db/schema/auth";
import { contact, message, waNumber } from "@wacheap/db/schema/whatsapp";
import { d1TestDb } from "@wacheap/db/test-d1";
import { eq } from "drizzle-orm";

import { openToken, sealToken } from "./seal";
import {
  handleWebhook,
  isOptOut,
  receiveWebhook,
  verifyChallenge,
  verifySignature,
  type WebhookPayload,
} from "./webhook";

const PHONE_ID = "200000000000001";
const SECRET = "test-secret-test-secret-test-secret!";

const APP_SECRET = "0123456789abcdef0123456789abcdef";
const KEY = "key-n1-0000000000000000000000000000000000000";

async function setup() {
  const { db } = await d1TestDb();
  await db.insert(user).values({ id: "u1", name: "Toko Ani", email: "ani@example.test" });
  await db.insert(user).values({ id: "u2", name: "Toko Budi", email: "budi@example.test" });
  await db.insert(waNumber).values({
    id: "n1",
    userId: "u1",
    wabaId: "100000000000001",
    phoneNumberId: PHONE_ID,
    displayPhone: "+1 555-664-6765",
    verifiedName: "Test",
    tokenSealed: "v1.x.y",
    appSecretSealed: await sealToken(SECRET, APP_SECRET, `app:${PHONE_ID}`),
    webhookKey: KEY,
  });
  await db.insert(waNumber).values({
    id: "n2",
    userId: "u2",
    wabaId: "100000000000002",
    phoneNumberId: "200000000000002",
    displayPhone: "+62 812-0000-0002",
    verifiedName: "Budi",
    tokenSealed: "v1.x.y",
    appSecretSealed: "v1.x.y",
    webhookKey: "key-n2",
  });
  return db;
}

async function sign(secret: string, body: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `sha256=${Buffer.from(mac).toString("hex")}`;
}

function messages(value: Record<string, unknown>, phoneNumberId = PHONE_ID): WebhookPayload {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "100000000000001",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "15556646765", phone_number_id: phoneNumberId },
              ...value,
            },
          },
        ],
      },
    ],
  };
}

const inbound = (id: string, body: string, from = "6281234567890") =>
  messages({
    contacts: [{ wa_id: from, profile: { name: "Budi" } }],
    messages: [{ from, id, timestamp: "1793836800", type: "text", text: { body } }],
  });

const status = (id: string, s: string, timestamp = "1793836900", errors?: unknown[]) =>
  messages({
    statuses: [{ id, status: s, timestamp, recipient_id: "6281234567890", errors }],
  });

describe("verifySignature", () => {
  test("accepts Meta's sha256 HMAC of the raw body and nothing else", async () => {
    const body = '{"object":"whatsapp_business_account"}';
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode("app-secret"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const mac = Buffer.from(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)),
    ).toString("hex");
    expect(await verifySignature("app-secret", body, `sha256=${mac}`)).toBe(true);
    expect(await verifySignature("app-secret", `${body} `, `sha256=${mac}`)).toBe(false);
    expect(await verifySignature("other", body, `sha256=${mac}`)).toBe(false);
    expect(await verifySignature("app-secret", body, mac)).toBe(false);
    expect(await verifySignature("app-secret", body, null)).toBe(false);
  });
});

describe("handleWebhook", () => {
  test("an inbound message creates the contact and the message once", async () => {
    const db = await setup();
    const first = await handleWebhook(db, inbound("wamid.1", "Halo kak"));
    const again = await handleWebhook(db, inbound("wamid.1", "Halo kak"));
    expect(first.events).toHaveLength(1);
    expect(again.events).toHaveLength(0);

    const contacts = await db.select().from(contact);
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({ userId: "u1", phone: "6281234567890", name: "Budi" });
    expect(contacts[0]!.lastInboundAt?.getTime()).toBe(1793836800_000);
    const rows = await db.select().from(message);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ direction: "in", body: "Halo kak", status: "received" });
  });

  test("keeps a name the seller set", async () => {
    const db = await setup();
    await db
      .insert(contact)
      .values({ id: "c1", userId: "u1", phone: "6281234567890", name: "Pak Budi (grosir)" });
    await handleWebhook(db, inbound("wamid.1", "Halo"));
    const [row] = await db.select().from(contact);
    expect(row!.name).toBe("Pak Budi (grosir)");
  });

  test("STOP and BERHENTI opt the contact out, once", async () => {
    const db = await setup();
    const result = await handleWebhook(db, inbound("wamid.1", "  berhenti! "));
    expect(result.events.map((e) => e.event.type)).toEqual(["message", "opt-out"]);
    const [row] = await db.select().from(contact);
    expect(row!.optOutAt?.getTime()).toBe(1793836800_000);
    const again = await handleWebhook(db, inbound("wamid.2", "stop promo"));
    expect(again.events.map((e) => e.event.type)).toEqual(["message"]);
    expect((await db.select().from(contact))[0]!.optOutAt?.getTime()).toBe(1793836800_000);
  });

  test("opt-out words, including Meta's own opt-out button", () => {
    for (const yes of [
      "STOP",
      "stop.",
      "Berhenti",
      "Stop promotions",
      "Hentikan promosi",
      "STOP  PROMO",
    ])
      expect(isOptOut(yes)).toBe(true);
    for (const no of ["Stop dulu ya, mau tanya", "stopkontak", "berhentinya kapan?", ""])
      expect(isOptOut(no)).toBe(false);
  });

  test("Meta's opt-out quick reply (a button message) opts out", async () => {
    const db = await setup();
    await handleWebhook(
      db,
      messages({
        messages: [
          {
            from: "6281234567890",
            id: "wamid.b",
            timestamp: "1793836800",
            type: "button",
            button: { text: "Hentikan promosi", payload: "x" },
          },
        ],
      }),
    );
    expect((await db.select().from(contact))[0]!.optOutAt).not.toBeNull();
  });

  test("one malformed message is skipped; the rest of the change still lands", async () => {
    const db = await setup();
    const result = await handleWebhook(
      db,
      messages({
        messages: [
          { id: "wamid.bad", timestamp: "1793836800", type: "text" },
          {
            from: "6281234567890",
            id: "wamid.ok",
            timestamp: "1793836800",
            type: "text",
            text: { body: "Halo" },
          },
        ],
      }),
    );
    expect(result.skipped).toBe(1);
    expect(await db.select().from(message)).toHaveLength(1);
  });

  test("statuses move an outbound message forward only", async () => {
    const db = await setup();
    await db.insert(contact).values({ id: "c1", userId: "u1", phone: "6281234567890" });
    await db.insert(message).values({
      id: "m1",
      userId: "u1",
      numberId: "n1",
      contactId: "c1",
      direction: "out",
      waMessageId: "wamid.out",
      type: "template",
      status: "sent",
      statusAt: new Date(0),
    });
    const read = async () => (await db.select().from(message).where(eq(message.id, "m1")))[0]!;

    await handleWebhook(db, status("wamid.out", "read"));
    expect((await read()).status).toBe("read");
    const late = await handleWebhook(db, status("wamid.out", "delivered"));
    expect(late.events).toHaveLength(0);
    expect((await read()).status).toBe("read");
    await handleWebhook(db, status("wamid.out", "failed", "1793837000", [{ code: 131026 }]));
    expect((await read()).status).toBe("read");
  });

  test("failed records Meta's error code", async () => {
    const db = await setup();
    await db.insert(contact).values({ id: "c1", userId: "u1", phone: "6281234567890" });
    await db.insert(message).values({
      id: "m1",
      userId: "u1",
      numberId: "n1",
      contactId: "c1",
      direction: "out",
      waMessageId: "wamid.out",
      type: "template",
      status: "sent",
      statusAt: new Date(0),
    });
    await handleWebhook(
      db,
      status("wamid.out", "failed", "1793837000", [
        { code: 131026, title: "Message undeliverable" },
      ]),
    );
    const [row] = await db.select().from(message);
    expect(row).toMatchObject({
      status: "failed",
      errorCode: 131026,
      errorTitle: "Message undeliverable",
    });
    await handleWebhook(db, status("wamid.out", "delivered", "1793837100"));
    const [later] = await db.select().from(message);
    expect(later).toMatchObject({ status: "delivered", errorCode: null, errorTitle: null });
  });

  test("changes for a number nobody connected are reported, not stored", async () => {
    const db = await setup();
    const result = await handleWebhook(db, {
      ...inbound("wamid.1", "Halo"),
      entry: messages({ messages: [] }, "999").entry,
    });
    expect(result.unknownNumbers).toEqual(["999"]);
    expect(await db.select().from(message)).toHaveLength(0);
  });

  test("quality updates set the tier on the number with that display phone", async () => {
    const db = await setup();
    await handleWebhook(db, {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "100000000000001",
          changes: [
            {
              field: "phone_number_quality_update",
              value: {
                display_phone_number: "15556646765",
                event: "UPGRADE",
                current_limit: "TIER_1K",
              },
            },
          ],
        },
      ],
    });
    const n1 = async () => (await db.select().from(waNumber).where(eq(waNumber.id, "n1")))[0]!;
    expect((await n1()).messagingTier).toBe("TIER_1K");
    await handleWebhook(db, {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "100000000000001",
          changes: [
            {
              field: "phone_number_quality_update",
              value: { display_phone_number: "15556646765", event: "FLAGGED" },
            },
          ],
        },
      ],
    });
    expect(await n1()).toMatchObject({ qualityRating: "RED", messagingTier: "TIER_1K" });
  });

  test("a per-number endpoint may not touch another user's number", async () => {
    const db = await setup();
    const result = await handleWebhook(db, inbound("wamid.x", "Halo"), { userId: "u2" });
    expect(result.unknownNumbers).toEqual([PHONE_ID]);
    expect(await db.select().from(message)).toHaveLength(0);
  });
});

describe("receiveWebhook", () => {
  const body = JSON.stringify(inbound("wamid.r", "Halo"));

  test("a number's own endpoint checks that number's app secret", async () => {
    const db = await setup();
    const endpoint = { kind: "number" as const, key: KEY, tokenSecret: SECRET };
    const bad = await receiveWebhook({
      db,
      endpoint,
      body,
      signature: await sign("x".repeat(32), body),
    });
    expect(bad.status).toBe(401);
    expect(await db.select().from(message)).toHaveLength(0);

    const now = new Date("2026-11-05T05:00:00Z");
    const ok = await receiveWebhook({
      db,
      endpoint,
      body,
      signature: await sign(APP_SECRET, body),
      now,
    });
    expect(ok.status).toBe(200);
    expect(ok.result?.events).toHaveLength(1);
    const [n1] = await db.select().from(waNumber).where(eq(waNumber.id, "n1"));
    expect(n1!.lastWebhookAt?.getTime()).toBe(now.getTime());
  });

  test("a number's endpoint also takes changes for the same user's other numbers on that app", async () => {
    const db = await setup();
    await db.insert(waNumber).values({
      id: "n3",
      userId: "u1",
      wabaId: "100000000000001",
      phoneNumberId: "200000000000003",
      displayPhone: "+62 812-0000-0003",
      verifiedName: "Ani 2",
      tokenSealed: "v1.x.y",
      appSecretSealed: "v1.x.y",
      webhookKey: "key-n3",
    });
    const other = JSON.stringify(
      messages(
        {
          messages: [
            {
              from: "6281234567890",
              id: "wamid.n3",
              timestamp: "1793836800",
              type: "text",
              text: { body: "Halo" },
            },
          ],
        },
        "200000000000003",
      ),
    );
    const ok = await receiveWebhook({
      db,
      endpoint: { kind: "number", key: KEY, tokenSecret: SECRET },
      body: other,
      signature: await sign(APP_SECRET, other),
    });
    expect(ok.result?.unknownNumbers).toEqual([]);
    const [row] = await db.select().from(message);
    expect(row!.numberId).toBe("n3");
  });

  test("the same wamid on two numbers is two messages", async () => {
    const db = await setup();
    await handleWebhook(db, inbound("wamid.same", "Halo"));
    const result = await handleWebhook(
      db,
      messages(
        {
          messages: [
            {
              from: "6281234567890",
              id: "wamid.same",
              timestamp: "1793836800",
              type: "text",
              text: { body: "Halo" },
            },
          ],
        },
        "200000000000002",
      ),
    );
    expect(result.events).toHaveLength(1);
    expect(await db.select().from(message)).toHaveLength(2);
  });

  test("an unknown key is a 404", async () => {
    const db = await setup();
    const answer = await receiveWebhook({
      db,
      endpoint: { kind: "number", key: "nope", tokenSecret: SECRET },
      body,
      signature: await sign(APP_SECRET, body),
    });
    expect(answer.status).toBe(404);
  });

  test("the server's app endpoint routes by phone number id; a signed non-JSON body is acknowledged", async () => {
    const db = await setup();
    const endpoint = { kind: "app" as const, appSecret: "server-app-secret" };
    expect((await receiveWebhook({ db, endpoint, body, signature: null })).status).toBe(401);
    const ok = await receiveWebhook({
      db,
      endpoint,
      body,
      signature: await sign("server-app-secret", body),
    });
    expect(ok.result?.events[0]?.userId).toBe("u1");
    const junk = await receiveWebhook({
      db,
      endpoint,
      body: "not json",
      signature: await sign("server-app-secret", "not json"),
    });
    expect(junk).toMatchObject({ status: 200, result: { skipped: 1 } });
  });
});

describe("verifyChallenge", () => {
  const query = (token: string) => ({ mode: "subscribe", token, challenge: "1158201444" });

  test("echoes the challenge for the right verify token only", async () => {
    const db = await setup();
    const app = { kind: "app" as const, verifyToken: "vt-server" };
    expect(await verifyChallenge({ db, endpoint: app, query: query("vt-server") })).toEqual({
      status: 200,
      body: "1158201444",
    });
    expect((await verifyChallenge({ db, endpoint: app, query: query("vt-other") })).status).toBe(
      403,
    );
    const number = { kind: "number" as const, key: KEY };
    expect((await verifyChallenge({ db, endpoint: number, query: query(KEY) })).status).toBe(200);
    expect((await verifyChallenge({ db, endpoint: number, query: query("key-n2") })).status).toBe(
      403,
    );
    expect(
      (
        await verifyChallenge({
          db,
          endpoint: { kind: "number", key: "gone" },
          query: query("gone"),
        })
      ).status,
    ).toBe(403);
  });
});

describe("sealToken", () => {
  test("round-trips, and refuses another context or secret", async () => {
    const sealed = await sealToken(SECRET, "EAAG-token", PHONE_ID);
    expect(await openToken(SECRET, sealed, PHONE_ID)).toBe("EAAG-token");
    await expect(openToken(SECRET, sealed, "other")).rejects.toThrow();
    await expect(openToken(`${SECRET}x`, sealed, PHONE_ID)).rejects.toThrow();
  });
});
