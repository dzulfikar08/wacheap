// DOKU Checkout v1: create a hosted payment page and verify payment notifications. Ported from joyorogo
// (packages/api/src/lib/doku.ts). Signature header = "HMACSHA256=" + base64(HMAC-SHA256(
//   "Client-Id:<id>\nRequest-Id:<id>\nRequest-Timestamp:<ts>\nRequest-Target:<path>\nDigest:<base64(sha256(body))>",
//   secretKey)), per developers.doku.com signature docs.

export const CHECKOUT_TARGET = "/checkout/v1/payment";
/** Path DOKU notifies (via override_notification_url); signed as Request-Target. */
export const WEBHOOK_TARGET = "/api/billing/webhook";
export const ORDER_PREFIX = "WAC-";
export const DOKU_PRODUCTION = "https://api.doku.com";
export const DOKU_SANDBOX = "https://api-sandbox.doku.com";

export type DokuConfig = {
  clientId: string;
  secretKey: string;
  baseUrl: string;
};

/** Config from env, or null when either key is missing. An empty DOKU_BASE_URL means production. */
export function dokuConfigFromEnv(env: {
  DOKU_CLIENT_ID?: string;
  DOKU_SECRET_KEY?: string;
  DOKU_BASE_URL?: string;
}): DokuConfig | null {
  if (!env.DOKU_CLIENT_ID || !env.DOKU_SECRET_KEY) return null;
  return {
    clientId: env.DOKU_CLIENT_ID,
    secretKey: env.DOKU_SECRET_KEY,
    baseUrl: (env.DOKU_BASE_URL || DOKU_PRODUCTION).replace(/\/$/, ""),
  };
}

export type DokuNotification = {
  invoiceNumber: string;
  amount: number;
  status: string;
};

export function parseNotification(raw: unknown): DokuNotification | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { order, transaction } = raw as { order?: unknown; transaction?: unknown };
  if (typeof order !== "object" || order === null) return null;
  if (typeof transaction !== "object" || transaction === null) return null;
  const { invoice_number: invoiceNumber, amount } = order as {
    invoice_number?: unknown;
    amount?: unknown;
  };
  const { status } = transaction as { status?: unknown };
  if (typeof invoiceNumber !== "string" || typeof status !== "string") return null;
  if (typeof amount !== "number" || !Number.isFinite(amount)) return null;
  return { invoiceNumber, amount, status };
}

/** Settled payment. Pending never counts. */
export function isPaid(n: DokuNotification): boolean {
  return n.status === "SUCCESS";
}

/** Terminal negative states: the order can never be paid. */
export function failedStatus(n: DokuNotification): "expired" | "failed" | null {
  if (n.status === "EXPIRED") return "expired";
  if (n.status === "FAILED" || n.status === "VOIDED") return "failed";
  return null;
}

/** "WAC-<yymmddHHMMSS>-<8 hex>": unique per checkout, opaque (no user id), well under DOKU's 64-char limit. */
export function buildOrderId(now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:T]/g, "").slice(2, 14);
  const nonce = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  return `${ORDER_PREFIX}${stamp}-${nonce}`;
}

export function isOrderId(value: string): boolean {
  return /^WAC-\d{12}-[0-9a-f]{8}$/.test(value);
}

export type SignatureInput = {
  clientId: string;
  requestId: string;
  timestamp: string;
  /** Path of the endpoint called or notified, e.g. "/checkout/v1/payment". */
  target: string;
  /** Raw body, byte-for-byte as sent or received; omitted for GET (no Digest line). */
  body?: string;
};

function b64(buf: ArrayBuffer): string {
  let bin = "";
  for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
  return btoa(bin);
}

const encoder = new TextEncoder();

export async function signRequest(input: SignatureInput, secretKey: string): Promise<string> {
  let components =
    `Client-Id:${input.clientId}\n` +
    `Request-Id:${input.requestId}\n` +
    `Request-Timestamp:${input.timestamp}\n` +
    `Request-Target:${input.target}`;
  if (input.body !== undefined) {
    const digest = b64(await crypto.subtle.digest("SHA-256", encoder.encode(input.body)));
    components += `\nDigest:${digest}`;
  }
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secretKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return `HMACSHA256=${b64(await crypto.subtle.sign("HMAC", key, encoder.encode(components)))}`;
}

/** Constant-time compare against the expected signature. */
export async function verifySignature(
  input: SignatureInput,
  signature: string,
  secretKey: string,
): Promise<boolean> {
  const expected = await signRequest(input, secretKey);
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

/** DOKU Request-Timestamp: ISO8601 UTC without millis, e.g. "2020-08-11T08:45:42Z". */
export function requestTimestamp(now = new Date()): string {
  return `${now.toISOString().slice(0, 19)}Z`;
}

/** Create a DOKU Checkout page; DOKU shows every channel enabled on the merchant (QRIS, virtual accounts). */
export async function createCheckout(
  config: DokuConfig,
  params: {
    orderId: string;
    amountIdr: number;
    itemName: string;
    quantity: number;
    customerEmail: string;
    customerName?: string;
    notifyUrl: string;
    returnUrl: string;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<{ paymentUrl: string }> {
  const requestId = crypto.randomUUID();
  const timestamp = requestTimestamp();
  const body = JSON.stringify({
    order: {
      amount: params.amountIdr,
      invoice_number: params.orderId,
      currency: "IDR",
      line_items: [
        {
          name: params.itemName,
          quantity: params.quantity,
          price: params.amountIdr / params.quantity,
        },
      ],
      callback_url: params.returnUrl,
      auto_redirect: true,
    },
    payment: { payment_due_date: 60 },
    customer: {
      email: params.customerEmail,
      ...(params.customerName ? { name: params.customerName } : {}),
    },
    additional_info: { override_notification_url: params.notifyUrl },
  });
  const signature = await signRequest(
    { clientId: config.clientId, requestId, timestamp, target: CHECKOUT_TARGET, body },
    config.secretKey,
  );
  const res = await fetchImpl(`${config.baseUrl}${CHECKOUT_TARGET}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Client-Id": config.clientId,
      "Request-Id": requestId,
      "Request-Timestamp": timestamp,
      Signature: signature,
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const parsed = (await res.json().catch(() => null)) as {
    response?: { payment?: { url?: unknown } };
  } | null;
  const url = parsed?.response?.payment?.url;
  if (!res.ok || typeof url !== "string") {
    throw new Error(`doku checkout failed: HTTP ${res.status}`);
  }
  if (!isDokuPaymentUrl(url))
    throw new Error("doku checkout returned a payment URL outside doku.com");
  return { paymentUrl: url };
}

/** The browser is sent here, so only an https URL on a doku.com host is accepted. */
export function isDokuPaymentUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "doku.com" || url.hostname.endsWith(".doku.com"))
    );
  } catch {
    return false;
  }
}

export const STATUS_TARGET = (orderId: string) =>
  `/orders/v1/status/${encodeURIComponent(orderId)}`;

/**
 * Ask DOKU for an order's state (Checkout Check Status API, ported from joyorogo). Same order/transaction shape as the
 * notification, so parseNotification reads it. Settles orders whose webhook never arrived.
 */
export async function checkStatus(
  config: DokuConfig,
  orderId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DokuNotification> {
  const target = STATUS_TARGET(orderId);
  const requestId = crypto.randomUUID();
  const timestamp = requestTimestamp();
  const signature = await signRequest(
    { clientId: config.clientId, requestId, timestamp, target },
    config.secretKey,
  );
  const res = await fetchImpl(`${config.baseUrl}${target}`, {
    headers: {
      "Client-Id": config.clientId,
      "Request-Id": requestId,
      "Request-Timestamp": timestamp,
      Signature: signature,
    },
    signal: AbortSignal.timeout(10_000),
  });
  const text = await res.text();
  let parsed: DokuNotification | null = null;
  try {
    parsed = parseNotification(JSON.parse(text));
  } catch {
    // Non-JSON error page; reported below.
  }
  if (!res.ok || !parsed || parsed.invoiceNumber !== orderId) {
    throw new Error(`doku check status failed: HTTP ${res.status}`);
  }
  return parsed;
}
