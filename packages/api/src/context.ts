import type { Session } from "@wacheap/auth";
import type { Database } from "@wacheap/db";

import type { BillingConfig } from "./lib/billing/config";
import type { WhatsAppConfig } from "./lib/whatsapp/config";

export type Context = {
  session: Session | null;
  db: Database;
  /** Checks a Cloudflare Turnstile token from a public form; true when Cloudflare accepts it. */
  verifyHuman: (token: string) => Promise<boolean>;
  /** WACheap Cloud billing; `enabled: false` on self-hosted servers. */
  billing: BillingConfig;
  /** Meta Graph API client and token sealing for connected numbers. */
  whatsapp: WhatsAppConfig;
};
