import type { QueryClient } from "@tanstack/react-query";

import { authClient } from "./auth-client";

export const SESSION_KEY = ["session"] as const;

/**
 * How long a signed-in session is trusted without asking the API again. The API still checks the cookie on every
 * request, so this only decides how fast the app shell renders; a revoked session surfaces on the next API call.
 */
const SESSION_FRESH_MS = 5 * 60 * 1000;

type Session = Awaited<ReturnType<typeof authClient.getSession>>["data"];

/**
 * The signed-in session, from cache when fresh. Page changes would otherwise wait on a round trip to the API
 * (0.5 s or more from Indonesia) before anything renders. A signed-out answer is never cached, so signing in
 * takes effect straight away.
 */
export async function loadSession(queryClient: QueryClient): Promise<Session> {
  const session = await queryClient.ensureQueryData({
    queryKey: SESSION_KEY,
    queryFn: async () => {
      const { data, error } = await authClient.getSession();
      // better-auth returns errors instead of throwing. Only a clean answer means "signed out"; a 5xx or 429 throws,
      // which keeps the last good session cached and retries on the next navigation.
      if (error && error.status !== 401)
        throw new Error(error.message ?? `Session check failed (${error.status})`);
      return data ?? null;
    },
    meta: { silent: true },
    staleTime: SESSION_FRESH_MS,
    revalidateIfStale: true,
  });
  if (!session) queryClient.removeQueries({ queryKey: SESSION_KEY });
  return session;
}
