import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { appRouter } from "@wacheap/api/routers/index";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { createContext } from "./context";
import { ENV } from "./env.server";
import { createAuth } from "./services";
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

export const apiHandler = new OpenAPIHandler(appRouter, {
  plugins: [
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    }),
  ],
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

export const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

// The waitlist is a public insert: cap it per IP before it reaches the database.
app.use("/rpc/waitlist/*", async (c, next) => {
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const { success } = await ENV.SIGNUP_LIMIT.limit({ key: `waitlist:${ip}` });
  if (!success)
    return c.json({ message: "Terlalu banyak percobaan. Coba lagi sebentar lagi." }, 429);
  await next();
});

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
