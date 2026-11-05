import { describe, expect, test } from "bun:test";

import { call } from "@orpc/server";
import type { Session } from "@wacheap/auth";
import { user } from "@wacheap/db/schema/auth";
import { waNumber } from "@wacheap/db/schema/whatsapp";
import { d1TestDb } from "@wacheap/db/test-d1";

import { BILLING_OFF } from "../lib/billing/config";
import { WHATSAPP_OFF, type WhatsAppConfig } from "../lib/whatsapp/config";
import { graphClient } from "../lib/whatsapp/graph";
import { openToken } from "../lib/whatsapp/seal";
import { whatsappRouter } from "./whatsapp";

const TOKEN = "EAAG-test-token-0123456789";
const WABA = "100000000000001";
const PHONE_ID = "200000000000001";
const APP_SECRET = "0123456789abcdef0123456789abcdef";

async function proof(secret: string, token: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return Buffer.from(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token)),
  ).toString("hex");
}

/** A fake Graph API: the WABA holds PHONE_ID; it accepts TOKEN only, with the appsecret_proof of APP_SECRET. */
function fakeGraph() {
  const calls: { method: string; url: string; body?: unknown }[] = [];
  const failOverride = { value: false };
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({
      method: init.method ?? "GET",
      url,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    });
    const auth = new Headers(init.headers).get("Authorization");
    if (auth !== `Bearer ${TOKEN}`)
      return Response.json(
        { error: { code: 190, message: "Invalid OAuth access token" } },
        { status: 401 },
      );
    if (new URL(url).searchParams.get("appsecret_proof") !== (await proof(APP_SECRET, TOKEN)))
      return Response.json(
        { error: { code: 100, message: "Invalid appsecret_proof provided in the API argument" } },
        { status: 400 },
      );
    const path = new URL(url).pathname;
    if (path.endsWith(`/${WABA}/phone_numbers`))
      return Response.json({
        data: [
          {
            id: PHONE_ID,
            display_phone_number: "+1 555-664-6765",
            verified_name: "Test Number",
            quality_rating: "GREEN",
            messaging_limit_tier: "TIER_250",
          },
        ],
      });
    if (path.endsWith(`/${WABA}/subscribed_apps`)) return Response.json({ success: true });
    if (path.endsWith(`/${PHONE_ID}`) && init.method === "POST")
      return failOverride.value
        ? Response.json(
            { error: { code: 2200, message: "Callback verification failed" } },
            { status: 400 },
          )
        : Response.json({ success: true });
    if (path.endsWith(`/${PHONE_ID}`))
      return Response.json({
        id: PHONE_ID,
        display_phone_number: "+1 555-664-6765",
        verified_name: "Toko Ani",
        quality_rating: "YELLOW",
        messaging_limit_tier: "TIER_1K",
      });
    return Response.json(
      { error: { code: 100, message: "Unsupported get request" } },
      { status: 400 },
    );
  }) as unknown as typeof fetch;
  return { calls, impl, failOverride };
}

async function setup() {
  const { db } = await d1TestDb();
  await db.insert(user).values({ id: "u1", name: "Toko Ani", email: "ani@example.test" });
  await db.insert(user).values({ id: "u2", name: "Toko Budi", email: "budi@example.test" });
  const graph = fakeGraph();
  const whatsapp: WhatsAppConfig = { ...WHATSAPP_OFF, graph: graphClient(graph.impl) };
  const as = (id: string) => ({
    context: {
      db,
      session: { user: { id, name: "Toko", email: `${id}@example.test` } } as unknown as Session,
      verifyHuman: async () => true,
      billing: BILLING_OFF,
      whatsapp,
    },
  });
  return { db, graph, as, whatsapp };
}

const input = { wabaId: WABA, phoneNumberId: PHONE_ID, accessToken: TOKEN, appSecret: APP_SECRET };

describe("whatsapp.numbers.connect", () => {
  test("stores the number with its details, seals the token and subscribes the app", async () => {
    const { db, graph, as, whatsapp } = await setup();
    const result = await call(whatsappRouter.numbers.connect, input, as("u1"));
    expect(result).toMatchObject({
      displayPhone: "+1 555-664-6765",
      messagingTier: "TIER_250",
      webhookInstalled: true,
    });
    const [listed] = await call(whatsappRouter.numbers.list, undefined, as("u1"));
    const override = graph.calls.find(
      (c) => c.method === "POST" && c.url.includes(`/${PHONE_ID}?`),
    );
    expect(override?.body).toEqual({
      webhook_configuration: {
        override_callback_uri: listed!.webhookUrl,
        verify_token: listed!.verifyToken,
      },
    });
    expect(graph.calls.some((c) => c.method === "POST" && c.url.includes("subscribed_apps"))).toBe(
      true,
    );

    const [row] = await db.select().from(waNumber);
    expect(row!.userId).toBe("u1");
    expect(row!.tokenSealed).not.toContain(TOKEN);
    expect(await openToken(whatsapp.tokenSecret, row!.tokenSealed, PHONE_ID)).toBe(TOKEN);
    expect(await openToken(whatsapp.tokenSecret, row!.appSecretSealed, `app:${PHONE_ID}`)).toBe(
      APP_SECRET,
    );
  });

  test("an app secret from another app is refused", async () => {
    const { db, as } = await setup();
    const error = await call(
      whatsappRouter.numbers.connect,
      { ...input, appSecret: "ffffffffffffffffffffffffffffffff" },
      as("u1"),
    ).catch((e) => e);
    expect(error.status).toBe(400);
    expect(error.message).toContain("App secret tidak cocok");
    expect(await db.select().from(waNumber)).toHaveLength(0);
  });

  test("connecting the same number again replaces its credentials and keeps its id and webhook", async () => {
    const { db, as } = await setup();
    const first = await call(whatsappRouter.numbers.connect, input, as("u1"));
    const [before] = await db.select().from(waNumber);
    const again = await call(whatsappRouter.numbers.connect, input, as("u1"));
    const [after] = await db.select().from(waNumber);
    expect(again).toMatchObject({ id: first.id, reconnected: true });
    expect(after!.webhookKey).toBe(before!.webhookKey);
    expect(after!.tokenSealed).not.toBe(before!.tokenSealed);
  });

  test("a number inserted by a racing connect is a 409, not a 500", async () => {
    const { db, as } = await setup();
    let raced = false;
    const original = db.select.bind(db);
    // The first lookup sees nothing; meanwhile another account's connect lands the same number.
    (db as { select: unknown }).select = ((...args: Parameters<typeof db.select>) => {
      if (!raced) {
        raced = true;
        return {
          from: () => ({ where: () => ({ limit: async () => [] }) }),
        };
      }
      return original(...args);
    }) as unknown;
    await db.insert(waNumber).values({
      id: "other",
      userId: "u2",
      wabaId: WABA,
      phoneNumberId: PHONE_ID,
      displayPhone: "+1",
      verifiedName: "x",
      tokenSealed: "v1.a.b",
      appSecretSealed: "v1.a.b",
      webhookKey: "k-other",
    });
    const error = await call(whatsappRouter.numbers.connect, input, as("u1")).catch((e) => e);
    expect(error.status).toBe(409);
  });

  test("list gives the webhook URL and verify token, never the token or app secret", async () => {
    const { as } = await setup();
    await call(whatsappRouter.numbers.connect, input, as("u1"));
    const list = await call(whatsappRouter.numbers.list, undefined, as("u1"));
    expect(list).toHaveLength(1);
    expect(list[0]!.webhookUrl).toBe(
      `https://api.example.test/api/whatsapp/webhook/${list[0]!.verifyToken}`,
    );
    expect(list[0]!.verifyToken.length).toBeGreaterThanOrEqual(43);
    const text = JSON.stringify(list);
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain(APP_SECRET);
    expect(text).not.toContain("Sealed");
    expect(await call(whatsappRouter.numbers.list, undefined, as("u2"))).toHaveLength(0);
  });

  test("a rejected token stores nothing", async () => {
    const { db, as } = await setup();
    const error = await call(
      whatsappRouter.numbers.connect,
      { ...input, accessToken: "EAAG-wrong-token-0000000" },
      as("u1"),
    ).catch((e) => e);
    expect(error.status).toBe(400);
    expect(error.message).toContain("Token akses ditolak");
    expect(await db.select().from(waNumber)).toHaveLength(0);
  });

  test("a number outside the WABA is refused before subscribing", async () => {
    const { db, graph, as } = await setup();
    const error = await call(
      whatsappRouter.numbers.connect,
      { ...input, phoneNumberId: "299999999999999" },
      as("u1"),
    ).catch((e) => e);
    expect(error.status).toBe(400);
    expect(graph.calls.some((c) => c.url.includes("subscribed_apps"))).toBe(false);
    expect(await db.select().from(waNumber)).toHaveLength(0);
  });

  test("a number connected by another account is refused", async () => {
    const { as } = await setup();
    await call(whatsappRouter.numbers.connect, input, as("u1"));
    const error = await call(whatsappRouter.numbers.connect, input, as("u2")).catch((e) => e);
    expect(error.status).toBe(409);
    expect(error.message).toContain("akun WACheap lain");
  });

  test("rejects ids that aren't Meta's numeric ids", async () => {
    const { as } = await setup();
    const error = await call(
      whatsappRouter.numbers.connect,
      { ...input, wabaId: "abc" },
      as("u1"),
    ).catch((e) => e);
    expect(error.status).toBe(400);
  });
});

describe("webhook override", () => {
  test("a refused override still connects the number and reports it; installWebhook retries", async () => {
    const { db, graph, as } = await setup();
    graph.failOverride.value = true;
    const result = await call(whatsappRouter.numbers.connect, input, as("u1"));
    expect(result.webhookInstalled).toBe(false);
    expect(await db.select().from(waNumber)).toHaveLength(1);
    expect(
      (
        await call(whatsappRouter.numbers.installWebhook, { id: result.id }, as("u1")).catch(
          (e) => e,
        )
      ).status,
    ).toBe(400);
    graph.failOverride.value = false;
    expect(await call(whatsappRouter.numbers.installWebhook, { id: result.id }, as("u1"))).toEqual({
      ok: true,
    });
  });

  test("reconnecting clears the last-webhook mark", async () => {
    const { db, graph, as } = await setup();
    const { id } = await call(whatsappRouter.numbers.connect, input, as("u1"));
    await db.update(waNumber).set({ lastWebhookAt: new Date() });
    const overrides = () =>
      graph.calls.filter((c) => c.method === "POST" && c.url.includes(`/${PHONE_ID}?`));
    const before = overrides().length;
    const again = await call(whatsappRouter.numbers.connect, input, as("u1"));
    const [row] = await db.select().from(waNumber);
    expect(row!.id).toBe(id);
    expect(row!.lastWebhookAt).toBeNull();
    expect(again.webhookInstalled).toBe(true);
    // Same app: no clearing, just the override registered again with the same URL and verify token.
    expect(overrides().length).toBe(before + 1);
    expect(overrides().at(-1)!.body).toEqual(overrides().at(0)!.body);
  });

  test("disconnect clears the override, and still disconnects when Meta refuses", async () => {
    const { db, graph, as } = await setup();
    const { id } = await call(whatsappRouter.numbers.connect, input, as("u1"));
    await call(whatsappRouter.numbers.disconnect, { id }, as("u1"));
    expect(graph.calls.at(-1)?.body).toEqual({
      webhook_configuration: { override_callback_uri: "" },
    });
    expect(await db.select().from(waNumber)).toHaveLength(0);

    const again = await call(whatsappRouter.numbers.connect, input, as("u1"));
    graph.failOverride.value = true;
    await call(whatsappRouter.numbers.disconnect, { id: again.id }, as("u1"));
    expect(await db.select().from(waNumber)).toHaveLength(0);
  });
});

test("disconnect with unreadable credentials still deletes, without calling Meta", async () => {
  const { db, graph, as } = await setup();
  const { id } = await call(whatsappRouter.numbers.connect, input, as("u1"));
  await db.update(waNumber).set({ tokenSealed: "v1.a.b" });
  const calls = graph.calls.length;
  await call(whatsappRouter.numbers.disconnect, { id }, as("u1"));
  expect(graph.calls.length).toBe(calls);
  expect(await db.select().from(waNumber)).toHaveLength(0);
});

describe("whatsapp.numbers.refresh and disconnect", () => {
  test("refresh rereads name, quality and tier", async () => {
    const { as } = await setup();
    const { id } = await call(whatsappRouter.numbers.connect, input, as("u1"));
    const fresh = await call(whatsappRouter.numbers.refresh, { id }, as("u1"));
    expect(fresh).toMatchObject({
      verifiedName: "Toko Ani",
      qualityRating: "YELLOW",
      messagingTier: "TIER_1K",
    });
  });

  test("only the owner can refresh or disconnect", async () => {
    const { db, as } = await setup();
    const { id } = await call(whatsappRouter.numbers.connect, input, as("u1"));
    expect(
      (await call(whatsappRouter.numbers.refresh, { id }, as("u2")).catch((e) => e)).status,
    ).toBe(404);
    expect(
      (await call(whatsappRouter.numbers.disconnect, { id }, as("u2")).catch((e) => e)).status,
    ).toBe(404);
    await call(whatsappRouter.numbers.disconnect, { id }, as("u1"));
    expect(await db.select().from(waNumber)).toHaveLength(0);
  });
});
