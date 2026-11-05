import { graphClient, type GraphClient } from "./graph";

/** WhatsApp Cloud API as this server runs it. */
export interface WhatsAppConfig {
  /** Seals connected numbers' access tokens (the server's BETTER_AUTH_SECRET). */
  tokenSecret: string;
  graph: GraphClient;
  /** This server's public URL; a manually connected number's callback is `${serverUrl}/api/whatsapp/webhook/<key>`. */
  serverUrl: string;
  /** Meta's webhook settings; null when META_APP_SECRET or WHATSAPP_VERIFY_TOKEN is unset (the endpoint answers 503). */
  webhook: { appSecret: string; verifyToken: string } | null;
}

export interface WhatsAppEnv {
  BETTER_AUTH_SECRET: string;
  /** The server worker's own URL. */
  BETTER_AUTH_URL: string;
  META_APP_SECRET?: string;
  WHATSAPP_VERIFY_TOKEN?: string;
}

export function whatsappConfigFromEnv(env: WhatsAppEnv): WhatsAppConfig {
  const appSecret = env.META_APP_SECRET?.trim();
  const verifyToken = env.WHATSAPP_VERIFY_TOKEN?.trim();
  return {
    tokenSecret: env.BETTER_AUTH_SECRET,
    graph: graphClient(),
    serverUrl: env.BETTER_AUTH_URL.replace(/\/$/, ""),
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
  webhook: null,
};
