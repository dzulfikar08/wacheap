// Alchemy validates deployment inputs with Varlock; Workers use native env bindings.
import type { PublicCoercedEnvSchema } from "./env";

export const ENV = {
  VITE_SERVER_URL: import.meta.env.VITE_SERVER_URL!,
  VITE_TURNSTILE_SITE_KEY: import.meta.env.VITE_TURNSTILE_SITE_KEY!,
} satisfies Pick<PublicCoercedEnvSchema, "VITE_SERVER_URL" | "VITE_TURNSTILE_SITE_KEY">;
