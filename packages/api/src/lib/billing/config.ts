import { WEBHOOK_TARGET, dokuConfigFromEnv, type DokuConfig } from "./doku";

/** Billing as the server runs it: on or off, and the DOKU merchant when its keys are set. */
export interface BillingConfig {
  /** WACHEAP_CLOUD=true. Off on self-hosted installs: no trial, no gate, no checkout. */
  enabled: boolean;
  /** Null when DOKU_CLIENT_ID or DOKU_SECRET_KEY is missing: checkout refuses with a clear error. */
  doku: DokuConfig | null;
  /** Absolute URL DOKU posts payment notifications to. */
  notifyUrl: string;
  /** Web page DOKU sends the buyer back to; `?order=<ref>` is appended. */
  returnUrl: string;
  /** For tests; defaults to the global fetch. */
  fetch?: typeof fetch;
}

export interface BillingEnv {
  WACHEAP_CLOUD?: string;
  DOKU_CLIENT_ID?: string;
  DOKU_SECRET_KEY?: string;
  DOKU_BASE_URL?: string;
  /** The server worker's own URL. */
  BETTER_AUTH_URL: string;
  /** The web app's origin. */
  CORS_ORIGIN: string;
}

export function billingConfigFromEnv(env: BillingEnv): BillingConfig {
  return {
    enabled: env.WACHEAP_CLOUD === "true",
    doku: dokuConfigFromEnv(env),
    notifyUrl: `${env.BETTER_AUTH_URL.replace(/\/$/, "")}${WEBHOOK_TARGET}`,
    returnUrl: `${new URL(env.CORS_ORIGIN).origin}/billing/selesai`,
  };
}

/** Billing off: what a self-hosted server and most tests use. */
export const BILLING_OFF: BillingConfig = {
  enabled: false,
  doku: null,
  notifyUrl: "http://localhost:3000/api/billing/webhook",
  returnUrl: "http://localhost:3001/billing/selesai",
};
