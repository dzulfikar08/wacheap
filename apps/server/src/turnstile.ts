const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
/** Cloudflare's always-pass test secret: its responses carry no real hostname or action, so those checks are skipped. */
export const TEST_SECRET = "1x0000000000000000000000000000000AA";

export interface TurnstileCheck {
  secret: string;
  token: string;
  ip?: string;
  /** The page's hostname and the widget's action; both must match unless the test secret is in use. */
  expect: { hostname: string; action: string };
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Cloudflare Turnstile siteverify. Fails closed: a timeout, a network or API error, or a mismatch is "not verified".
 * Each failure logs why (error codes, status, or the exception name; never the token or the visitor's data), so a
 * broken secret is distinguishable from bot traffic.
 */
export async function verifyTurnstile(check: TurnstileCheck): Promise<boolean> {
  const body = new FormData();
  body.append("secret", check.secret);
  body.append("response", check.token);
  if (check.ip) body.append("remoteip", check.ip);
  try {
    const res = await (check.fetch ?? fetch)(SITEVERIFY, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(check.timeoutMs ?? 5000),
    });
    if (!res.ok) {
      console.warn(`turnstile: siteverify HTTP ${res.status}`);
      return false;
    }
    const result = (await res.json()) as {
      success?: boolean;
      hostname?: string;
      action?: string;
      "error-codes"?: string[];
    };
    if (result.success !== true) {
      console.warn(
        `turnstile: rejected (${(result["error-codes"] ?? []).join(", ") || "no error code"})`,
      );
      return false;
    }
    if (check.secret !== TEST_SECRET) {
      if (result.hostname !== check.expect.hostname || result.action !== check.expect.action) {
        console.warn(
          `turnstile: token for ${result.hostname}/${result.action}, expected ${check.expect.hostname}/${check.expect.action}`,
        );
        return false;
      }
    }
    return true;
  } catch (error) {
    console.warn(
      `turnstile: siteverify failed (${error instanceof Error ? error.name : "unknown"})`,
    );
    return false;
  }
}
