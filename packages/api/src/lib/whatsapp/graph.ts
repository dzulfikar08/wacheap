// The slice of Meta's Graph API that WACheap calls. Every call takes the number's own token, so a seller's requests
// always run as their own WABA, and every Meta error comes back as a GraphError with Meta's code and message.

export const GRAPH_BASE = "https://graph.facebook.com";
/** Released 2026-07-29; Meta supports each version for about two years. */
export const GRAPH_VERSION = "v26.0";

export interface GraphClient {
  base: string;
  version: string;
  fetch: typeof fetch;
}

export function graphClient(fetchImpl: typeof fetch = fetch): GraphClient {
  return { base: GRAPH_BASE, version: GRAPH_VERSION, fetch: fetchImpl };
}

export class GraphError extends Error {
  constructor(
    readonly status: number,
    readonly code: number | undefined,
    message: string,
  ) {
    super(message);
    this.name = "GraphError";
  }

  /** Meta's "invalid or expired token" family. */
  get isAuth(): boolean {
    return this.status === 401 || this.code === 190;
  }

  /** The app secret doesn't belong to the token's app (Meta: "Invalid appsecret_proof"). */
  get isBadAppSecret(): boolean {
    return /appsecret_proof/i.test(this.message);
  }
}

/** A number's credentials. With `appSecret`, every call carries appsecret_proof, which Meta checks against the token's app. */
export interface GraphCreds {
  token: string;
  appSecret?: string;
}

async function appSecretProof(appSecret: string, token: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function call<T>(
  graph: GraphClient,
  creds: GraphCreds,
  path: string,
  init: { method?: "GET" | "POST" | "DELETE"; query?: Record<string, string>; body?: unknown } = {},
): Promise<T> {
  const url = new URL(`${graph.base}/${graph.version}/${path}`);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
  if (creds.appSecret)
    url.searchParams.set("appsecret_proof", await appSecretProof(creds.appSecret, creds.token));
  const response = await graph.fetch(url.toString(), {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${creds.token}`,
      ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await response.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }
  if (!response.ok) {
    const error = (json as { error?: { code?: number; message?: string } }).error;
    throw new GraphError(
      response.status,
      error?.code,
      error?.message ?? `Graph API ${response.status}`,
    );
  }
  return json as T;
}

export interface PhoneNumberInfo {
  id: string;
  display_phone_number: string;
  verified_name: string;
  quality_rating?: string;
  messaging_limit_tier?: string;
}

const PHONE_FIELDS = "id,display_phone_number,verified_name,quality_rating,messaging_limit_tier";

/** The WABA's numbers. A token that can't see the WABA fails here, which is how `connect` proves ownership. */
export async function listWabaNumbers(
  graph: GraphClient,
  creds: GraphCreds,
  wabaId: string,
): Promise<PhoneNumberInfo[]> {
  const result = await call<{ data?: PhoneNumberInfo[] }>(
    graph,
    creds,
    `${encodeURIComponent(wabaId)}/phone_numbers`,
    { query: { fields: PHONE_FIELDS, limit: "100" } },
  );
  return result.data ?? [];
}

export async function getPhoneNumber(
  graph: GraphClient,
  creds: GraphCreds,
  phoneNumberId: string,
): Promise<PhoneNumberInfo> {
  return call<PhoneNumberInfo>(graph, creds, encodeURIComponent(phoneNumberId), {
    query: { fields: PHONE_FIELDS },
  });
}

/** Subscribes the token's app to the WABA's webhooks: Meta then posts them to that app's callback URL. Idempotent. */
export async function subscribeApp(
  graph: GraphClient,
  creds: GraphCreds,
  wabaId: string,
): Promise<void> {
  await call(graph, creds, `${encodeURIComponent(wabaId)}/subscribed_apps`, { method: "POST" });
}

/**
 * Points this number's message webhooks at `url`, ahead of the app's own callback URL (Meta checks the phone-number
 * override first, then the WABA's, then the app's). Meta verifies the URL with a GET carrying `verifyToken`. Template
 * and account webhooks don't follow overrides; they keep going to the app's own URL.
 */
export async function setNumberWebhook(
  graph: GraphClient,
  creds: GraphCreds,
  phoneNumberId: string,
  url: string,
  verifyToken: string,
): Promise<void> {
  await call(graph, creds, encodeURIComponent(phoneNumberId), {
    method: "POST",
    body: { webhook_configuration: { override_callback_uri: url, verify_token: verifyToken } },
  });
}

/** Removes this number's override: its webhooks go back to the app's own callback URL. */
export async function clearNumberWebhook(
  graph: GraphClient,
  creds: GraphCreds,
  phoneNumberId: string,
): Promise<void> {
  await call(graph, creds, encodeURIComponent(phoneNumberId), {
    method: "POST",
    body: { webhook_configuration: { override_callback_uri: "" } },
  });
}
