import type { Context as ApiContext } from "@wacheap/api/context";
import type { Context as HonoContext } from "hono";

import { billingConfig, getDb, verifyWaitlistToken } from "./services";
import { createAuth } from "./services";

export type CreateContextOptions = {
  context: HonoContext;
};

export async function createContext({ context }: CreateContextOptions): Promise<ApiContext> {
  const db = await getDb();
  const session = await (
    await createAuth(db)
  ).api.getSession({
    headers: context.req.raw.headers,
  });
  const ip = context.req.header("CF-Connecting-IP");
  return {
    db,
    session,
    verifyHuman: (token: string) => verifyWaitlistToken(token, ip),
    billing: billingConfig(),
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
