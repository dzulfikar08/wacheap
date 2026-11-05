import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "../index";
import { billingRouter } from "./billing";
import { waitlistRouter } from "./waitlist";
import { whatsappRouter } from "./whatsapp";

export const appRouter = {
  healthCheck: publicProcedure.handler(() => {
    return "OK";
  }),
  waitlist: waitlistRouter,
  billing: billingRouter,
  whatsapp: whatsappRouter,
  privateData: protectedProcedure.handler(({ context }) => {
    return {
      message: "This is private",
      user: context.session?.user,
    };
  }),
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
