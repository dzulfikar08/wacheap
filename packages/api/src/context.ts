import type { Session } from "@wacheap/auth";
import type { Database } from "@wacheap/db";

export type Context = {
  session: Session | null;
  db: Database;
  /** Checks a Cloudflare Turnstile token from a public form; true when Cloudflare accepts it. */
  verifyHuman: (token: string) => Promise<boolean>;
};
