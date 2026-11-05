import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError, ORPCError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { WEBHOOK_TARGET } from "@wacheap/api/lib/billing/doku";
import { handleDokuNotification } from "@wacheap/api/lib/billing/store";
import {
  WHATSAPP_WEBHOOK_PATH,
  receiveWebhook,
  verifyChallenge,
  type WebhookResult,
} from "@wacheap/api/lib/whatsapp/webhook";
import { appRouter } from "@wacheap/api/routers/index";
import { Hono, type Context, type Next } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { createContext } from "./context";
import { ENV } from "./env.server";
import { billingConfig, createAuth, getDb, whatsappConfig } from "./services";
import { handleQueue } from "./queue";

export { InboxRoom } from "./inbox-room";

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: ENV.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.on(["POST", "GET"], "/api/auth/*", async (c) => (await createAuth()).handler(c.req.raw));

// DOKU payment notification: a server-to-server POST with no Origin and no session. It is registered ahead of the
// oRPC catch-all and outside the waitlist rate limit; CORS only adds response headers. Trust comes from the
// signature alone (bad signature = 401), and a replay extends paid time once. Live whenever the DOKU keys are set,
// so orders paid just before billing was switched off still settle.
app.post(WEBHOOK_TARGET, async (c) => {
  const result = await handleDokuNotification({
    db: getDb(),
    doku: billingConfig().doku,
    headers: c.req.raw.headers,
    body: await c.req.text(),
  });
  if (result.status !== 200)
    console.warn(`billing webhook: ${result.status} ${String(result.body.error)}`);
  return c.json(result.body, result.status);
});

// Meta's WhatsApp webhooks (packages/api/src/lib/whatsapp/webhook.ts). /api/whatsapp/webhook is this server's own
// Meta app; /api/whatsapp/webhook/<key> belongs to one manually connected number and its own app. GET is Meta's
// one-time check when the callback URL is saved; POST is trusted only with a valid X-Hub-Signature-256.
const challengeQuery = (c: Context) => ({
  mode: c.req.query("hub.mode"),
  token: c.req.query("hub.verify_token"),
  challenge: c.req.query("hub.challenge"),
});

/** Logs what the handler skipped and tells the owners' open inbox tabs. A failed publish only delays a tab. */
function publishInbox(c: Context, result: WebhookResult | undefined) {
  if (!result) return;
  if (result.unknownNumbers.length > 0)
    console.warn(`whatsapp webhook: no matching number for ${result.unknownNumbers.join(", ")}`);
  if (result.skipped > 0)
    console.warn(`whatsapp webhook: skipped ${result.skipped} unparsable item(s)`);
  const byUser = Map.groupBy(result.events, (e) => e.userId);
  if (byUser.size === 0) return;
  c.executionCtx.waitUntil(
    Promise.allSettled(
      [...byUser].map(([userId, events]) =>
        ENV.INBOX.getByName(`user:${userId}`).publish({
          type: "batch",
          events: events.map((e) => e.event),
        }),
      ),
    ),
  );
}

app.get(WHATSAPP_WEBHOOK_PATH, async (c) => {
  const webhook = whatsappConfig().webhook;
  if (!webhook) return c.text("WhatsApp webhook not configured", 503);
  const answer = await verifyChallenge({
    db: getDb(),
    endpoint: { kind: "app", verifyToken: webhook.verifyToken },
    query: challengeQuery(c),
  });
  return c.text(answer.body, answer.status);
});

app.get(`${WHATSAPP_WEBHOOK_PATH}/:key`, async (c) => {
  const answer = await verifyChallenge({
    db: getDb(),
    endpoint: { kind: "number", key: c.req.param("key") },
    query: challengeQuery(c),
  });
  return c.text(answer.body, answer.status);
});

app.post(WHATSAPP_WEBHOOK_PATH, async (c) => {
  const webhook = whatsappConfig().webhook;
  if (!webhook) return c.text("WhatsApp webhook not configured", 503);
  const answer = await receiveWebhook({
    db: getDb(),
    endpoint: { kind: "app", appSecret: webhook.appSecret },
    body: await c.req.text(),
    signature: c.req.header("X-Hub-Signature-256"),
  });
  publishInbox(c, answer.result);
  return c.text(answer.status === 200 ? "OK" : "Rejected", answer.status);
});

app.post(`${WHATSAPP_WEBHOOK_PATH}/:key`, async (c) => {
  const answer = await receiveWebhook({
    db: getDb(),
    endpoint: {
      kind: "number",
      key: c.req.param("key"),
      tokenSecret: whatsappConfig().tokenSecret,
    },
    body: await c.req.text(),
    signature: c.req.header("X-Hub-Signature-256"),
  });
  publishInbox(c, answer.result);
  return c.text(answer.status === 200 ? "OK" : "Rejected", answer.status);
});

export const apiHandler = new OpenAPIHandler(appRouter, {
  plugins: [
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    }),
  ],
  interceptors: [onError(logError)],
});

export const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [onError(logError)],
});

// The waitlist is a public insert: cap it per IP before it reaches the database.
/**
 * Validation failures are the caller's mistake and carry the rejected input (emails, phone numbers): log the code only,
 * so personal data stays out of Workers logs. Everything else is logged in full.
 */
function logError(error: unknown) {
  if (error instanceof ORPCError && error.status < 500) {
    console.warn(`orpc ${error.code} (${error.status})`);
    return;
  }
  console.error(error);
}

// Both handlers serve every procedure (RPC at /rpc, OpenAPI at /api-reference), so the cap covers both paths.
const limitSignups = async (c: Context, next: Next) => {
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const { success } = await ENV.SIGNUP_LIMIT.limit({ key: `waitlist:${ip}` });
  if (!success)
    return c.json({ message: "Terlalu banyak percobaan. Coba lagi sebentar lagi." }, 429);
  await next();
};
app.use("/rpc/waitlist/*", limitSignups);
app.use("/api-reference/waitlist/*", limitSignups);

app.use("/*", async (c, next) => {
  const context = await createContext({ context: c });

  const rpcResult = await rpcHandler.handle(c.req.raw, {
    prefix: "/rpc",
    context: context,
  });

  if (rpcResult.matched) {
    return c.newResponse(rpcResult.response.body, rpcResult.response);
  }

  const apiResult = await apiHandler.handle(c.req.raw, {
    prefix: "/api-reference",
    context: context,
  });

  if (apiResult.matched) {
    return c.newResponse(apiResult.response.body, apiResult.response);
  }

  await next();
});

app.get("/", (c) => {
  return c.text("OK");
});

// Live inbox socket. Until workspaces exist (WAB-9), each signed-in user gets their own room. Browsers don't apply
// CORS to WebSocket handshakes and the session cookie is SameSite=None, so the Origin check is what keeps another
// site from opening a socket with the agent's cookie.
app.get("/api/inbox/ws", async (c) => {
  if (c.req.header("Origin") !== new URL(ENV.CORS_ORIGIN).origin) return c.text("Forbidden", 403);
  const session = await (await createAuth()).api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.text("Unauthorized", 401);
  return ENV.INBOX.getByName(`user:${session.user.id}`).fetch(c.req.raw);
});

export default {
  fetch: app.fetch,
  queue: handleQueue,
} satisfies ExportedHandler<Env>;
