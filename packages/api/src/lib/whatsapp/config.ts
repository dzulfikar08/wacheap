import { graphClient, type GraphClient } from "./graph";

/** WhatsApp Cloud API as this server runs it. */
export interface WhatsAppConfig {
  /** Seals connected numbers' access tokens (the server's BETTER_AUTH_SECRET). */
  tokenSecret: string;
  graph: GraphClient;
  /** This server's public URL; a manually connected number's callback is `${serverUrl}/api/whatsapp/webhook/<key>`. */
  serverUrl: string;
  /**
   * Embedded Signup (the one-button connect) with this server's Meta app; null unless META_APP_ID,
   * WHATSAPP_SIGNUP_CONFIG_ID and META_APP_SECRET are all set.
   */
  embeddedSignup: { appId: string; configId: string; appSecret: string } | null;
  /** Meta's webhook settings; null when META_APP_SECRET or WHATSAPP_VERIFY_TOKEN is unset (the endpoint answers 503). */
  webhook: { appSecret: string; verifyToken: string } | null;
}

export interface WhatsAppEnv {
  BETTER_AUTH_SECRET: string;
  /** The server worker's own URL. */
  BETTER_AUTH_URL: string;
  META_APP_SECRET?: string;
  WHATSAPP_VERIFY_TOKEN?: string;
  /** The Meta app's id (public). */
  META_APP_ID?: string;
  /** Facebook Login for Business configuration made from the "WhatsApp Embedded Signup" template (public). */
  WHATSAPP_SIGNUP_CONFIG_ID?: string;
}

export function whatsappConfigFromEnv(env: WhatsAppEnv): WhatsAppConfig {
  const appSecret = env.META_APP_SECRET?.trim();
  const verifyToken = env.WHATSAPP_VERIFY_TOKEN?.trim();
  const appId = env.META_APP_ID?.trim();
  const configId = env.WHATSAPP_SIGNUP_CONFIG_ID?.trim();
  return {
    tokenSecret: env.BETTER_AUTH_SECRET,
    graph: graphClient(),
    serverUrl: env.BETTER_AUTH_URL.replace(/\/$/, ""),
    embeddedSignup: appId && configId && appSecret ? { appId, configId, appSecret } : null,
    webhook: appSecret && verifyToken ? { appSecret, verifyToken } : null,
  };
}

/** For tests that don't touch WhatsApp: a fixed secret, a Graph client that refuses every call, no webhook. */
export const WHATSAPP_OFF: WhatsAppConfig = {
  tokenSecret: "test-secret-test-secret-test-secret!",
  graph: graphClient((async () => {
    throw new Error("Graph API called in a test that didn't expect it");
  }) as unknown as typeof fetch),
  serverUrl: "https://api.example.test",
  embeddedSignup: null,
  webhook: null,
};
