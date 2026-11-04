import { createAuth as createConfiguredAuth } from "@wacheap/auth";
import { type Database, createDb } from "@wacheap/db";

import { ENV } from "./env.server";

export function getDb(): Database {
  return createDb(ENV);
}
export async function createAuth(database?: Database) {
  return createConfiguredAuth(ENV, database ?? (await getDb()));
}

/** Cloudflare Turnstile siteverify. Any network or API failure counts as "not verified". */
export async function verifyTurnstile(token: string, ip?: string): Promise<boolean> {
  const body = new FormData();
  body.append("secret", ENV.TURNSTILE_SECRET_KEY);
  body.append("response", token);
  if (ip) body.append("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
    });
    if (!res.ok) return false;
    const result = (await res.json()) as { success?: boolean };
    return result.success === true;
  } catch {
    return false;
  }
}
