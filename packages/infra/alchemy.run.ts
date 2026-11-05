import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Alchemy from "alchemy";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import "varlock/auto-load";

import type { InboxRoom } from "../../apps/server/src/inbox-room";

// Flat copies of drizzle-kit's migrations (db:generate copies them): Alchemy refuses drizzle-kit 0.x's meta/ layout.
export const db = Cloudflare.D1.Database("database", {
  migrations: "../../packages/db/migrations-deploy",
});

// Broadcast fan-out: the API enqueues one job per slice of recipients; the server's queue() handler sends them at
// the number's tier. Messages that keep failing land in the dead-letter queue instead of being lost.
export const broadcastQueue = Cloudflare.Queues.Queue("broadcast");
export const broadcastDeadLetters = Cloudflare.Queues.Queue("broadcast-dlq");

// Production gets fixed script names, so its URLs are known before the first deploy (CORS_ORIGIN must name the web
// origin): https://wacheap.dzulfikar-at.workers.dev and https://wacheap-api.dzulfikar-at.workers.dev. Every other
// stage keeps Alchemy's generated names so personal stages never collide with production.
const production = process.env.ALCHEMY_STAGE === "production";

export const server = Cloudflare.Worker("server", {
  name: production ? "wacheap-api" : undefined,
  main: "../../apps/server/src/index.ts",
  compatibility: {
    // Pinned so an Alchemy upgrade doesn't silently change runtime behaviour. nodejs_compat is on by default from
    // 2026-08-04, and Cloudflare rejects naming it again after that date.
    date: "2026-08-31",
  },
  env: {
    DB: db,
    BROADCAST_QUEUE: broadcastQueue,
    // One room per workspace: live inbox updates to every agent's open tab over hibernating WebSockets.
    INBOX: Cloudflare.DurableObject<InboxRoom>("InboxRoom"),
    // Public sign-up endpoints: 5 calls a minute per IP (Cloudflare counts per location, so it's approximate).
    // Namespace ids are account-wide and shared between Workers that use the same one (joyorogo and mailflare hold
    // 1001-1005, 2001-2003, 7101-7106, 10001-10003). WACheap owns 4711 (production) and 4712 (every other stage).
    SIGNUP_LIMIT: Cloudflare.RateLimit("SIGNUP_LIMIT", {
      namespaceId: production ? 4711 : 4712,
      simple: { limit: 5, period: 60 },
    }),
    CORS_ORIGIN: Config.String("CORS_ORIGIN"),
    BETTER_AUTH_SECRET: Config.Redacted("BETTER_AUTH_SECRET"),
    TURNSTILE_SECRET_KEY: Config.Redacted("TURNSTILE_SECRET_KEY"),
    BETTER_AUTH_URL: Cloudflare.Worker.URL,
    // WACheap Cloud billing: on only with WACHEAP_CLOUD=true (production sets the GitHub variable at launch; until then
    // nobody's trial starts before there is anything to send), off on every self-hosted install. Without the DOKU keys
    // the deploy still succeeds and checkout answers with a clear error.
    WACHEAP_CLOUD: Config.String("WACHEAP_CLOUD").pipe(Config.withDefault("false")),
    DOKU_CLIENT_ID: Config.String("DOKU_CLIENT_ID").pipe(Config.withDefault("")),
    DOKU_SECRET_KEY: Config.Redacted("DOKU_SECRET_KEY").pipe(Config.withDefault("")),
    // Empty = DOKU production; https://api-sandbox.doku.com for the sandbox.
    DOKU_BASE_URL: Config.String("DOKU_BASE_URL").pipe(Config.withDefault("")),
    // WhatsApp webhook at <server>/api/whatsapp/webhook. Optional: without them the webhook answers 503.
    META_APP_SECRET: Config.Redacted("META_APP_SECRET").pipe(Config.withDefault("")),
    WHATSAPP_VERIFY_TOKEN: Config.Redacted("WHATSAPP_VERIFY_TOKEN").pipe(Config.withDefault("")),
  },
  dev: {
    port: 3000,
  },
});

export type ServerEnv = Cloudflare.InferEnv<typeof server>;

export default Alchemy.Stack(
  "wacheap",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const serverWorker = yield* server;
    const queue = yield* broadcastQueue;
    const deadLetters = yield* broadcastDeadLetters;
    yield* Cloudflare.Queues.Consumer("broadcast-consumer", {
      queueId: queue.queueId,
      scriptName: serverWorker.workerName,
      deadLetterQueue: deadLetters.queueName,
      settings: { batchSize: 50, maxRetries: 5, maxWaitTimeMs: 2000, retryDelay: 30 },
    });
    const webWorker = yield* Cloudflare.Website.Vite("web", {
      name: production ? "wacheap" : undefined,
      rootDir: "../../apps/web",
      assets: {
        htmlHandling: "auto-trailing-slash",
        notFoundHandling: "single-page-application",
      },
      env: {
        VITE_SERVER_URL: serverWorker.url.as<string>(),
        // Public site keys: the "wacheap-waitlist" widget in production, Cloudflare's always-pass test key elsewhere.
        VITE_TURNSTILE_SITE_KEY: production
          ? "0x4AAAAAAFzjCkTHRoTeA5Kr"
          : "1x00000000000000000000AA",
      },
      dev: {
        port: 3001,
      },
    });

    return {
      web: webWorker.url,
      server: serverWorker.url,
    };
  }),
);
