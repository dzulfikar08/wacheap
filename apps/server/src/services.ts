import { type BillingConfig, billingConfigFromEnv } from "@wacheap/api/lib/billing/config";
import { createAuth as createConfiguredAuth } from "@wacheap/auth";
import { type Database, createDb } from "@wacheap/db";

import { ENV } from "./env.server";
import { verifyTurnstile } from "./turnstile";

export function getDb(): Database {
  return createDb(ENV);
}
export async function createAuth(database?: Database) {
  return createConfiguredAuth(ENV, database ?? (await getDb()));
}

/** Turnstile check for the waitlist form, against the deployed web origin. */
export function verifyWaitlistToken(token: string, ip?: string): Promise<boolean> {
  return verifyTurnstile({
    secret: ENV.TURNSTILE_SECRET_KEY,
    token,
    ip,
    expect: { hostname: new URL(ENV.CORS_ORIGIN).hostname, action: "waitlist" },
  });
}

/** Billing as configured on this worker: off unless WACHEAP_CLOUD=true; DOKU only when both keys are set. */
export function billingConfig(): BillingConfig {
  return billingConfigFromEnv(ENV);
}
