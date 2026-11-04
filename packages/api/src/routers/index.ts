import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "../index";
import { billingRouter } from "./billing";
import { waitlistRouter } from "./waitlist";

export const appRouter = {
  healthCheck: publicProcedure.handler(() => {
    return "OK";
  }),
  waitlist: waitlistRouter,
  billing: billingRouter,
  privateData: protectedProcedure.handler(({ context }) => {
    return {
      message: "This is private",
      user: context.session?.user,
    };
  }),
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
