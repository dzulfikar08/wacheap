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

export const server = Cloudflare.Worker("server", {
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
    CORS_ORIGIN: Config.String("CORS_ORIGIN"),
    BETTER_AUTH_SECRET: Config.Redacted("BETTER_AUTH_SECRET"),
    BETTER_AUTH_URL: Cloudflare.Worker.URL,
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
      rootDir: "../../apps/web",
      assets: {
        htmlHandling: "auto-trailing-slash",
        notFoundHandling: "single-page-application",
      },
      env: {
        VITE_SERVER_URL: serverWorker.url.as<string>(),
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
