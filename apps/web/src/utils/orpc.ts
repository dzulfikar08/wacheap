import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import type { AppRouterClient } from "@wacheap/api/routers/index";
import { toast } from "sonner";

import { ENV } from "../env.public";

export function createQueryClient() {
  return new QueryClient({
    // Revisiting a page within 30 s shows what was loaded instead of refetching first.
    defaultOptions: { queries: { staleTime: 30_000 } },
    queryCache: new QueryCache({
      onError: (error, query) => {
        // Background checks (the cached session) fail quietly; the next navigation tries again.
        if (query.meta?.silent) return;
        // The API no longer accepts the session (expired, revoked, signed out elsewhere): start over at sign-in.
        if ((error as { status?: number }).status === 401) {
          queryClient.clear();
          window.location.assign("/login");
          return;
        }
        toast.error(`Error: ${error.message}`, {
          action: {
            label: "retry",
            onClick: () => {
              query.invalidate();
            },
          },
        });
      },
    }),
  });
}

export const queryClient = createQueryClient();

export const link = new RPCLink({
  url: `${ENV.VITE_SERVER_URL.replace(/\/$/, "")}/rpc`,
  fetch(url, options) {
    return fetch(url, {
      ...options,
      credentials: "include",
    });
  },
});

export const client: AppRouterClient = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);
