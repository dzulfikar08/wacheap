// Meta's WhatsApp webhooks. Two kinds of endpoint feed the same handler:
//   - /api/whatsapp/webhook: this server's own Meta app (META_APP_SECRET). Numbers connected through it (Embedded
//     Signup, or a self-hoster whose token comes from the server's app) may be any user's: the change's
//     phone_number_id finds the owner.
//   - /api/whatsapp/webhook/<key>: one per manually connected number, signed with that number's own app secret. A
//     seller controls that secret, so such a request may only touch numbers owned by the same user.
// Handling is idempotent (Meta re-delivers until it gets a 200): a message is stored once per wamid, and a status
// only ever moves a message forward.
import type { Database } from "@wacheap/db";
import { contact, message, waNumber, type MessageStatus } from "@wacheap/db/schema/whatsapp";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { openToken } from "./seal";

/** This server's app-level callback; a manually connected number's is `${WHATSAPP_WEBHOOK_PATH}/<key>`. */
export const WHATSAPP_WEBHOOK_PATH = "/api/whatsapp/webhook";

const encoder = new TextEncoder();

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compares two strings in time that depends only on their length. */
export function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True when `header` ("sha256=<hex>") is the HMAC-SHA256 of the raw `body` under the app secret. */
export async function verifySignature(
  appSecret: string,
  body: string,
  header: string | null | undefined,
): Promise<boolean> {
  if (!header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = hex(await crypto.subtle.sign("HMAC", key, encoder.encode(body)));
  return sameText(expected, header.slice("sha256=".length).toLowerCase());
}

/**
 * Replies that stop marketing messages, compared after upper-casing, dropping punctuation and collapsing spaces.
 * "STOP PROMOTIONS" / "HENTIKAN PROMOSI" are Meta's own opt-out button on marketing templates (English, Indonesian).
 */
export const OPT_OUT_WORDS = new Set([
  "STOP",
  "BERHENTI",
  "UNSUBSCRIBE",
  "STOP PROMO",
  "STOP PROMOTIONS",
  "HENTIKAN PROMOSI",
]);

export function isOptOut(text: string): boolean {
  const normal = text
    .toUpperCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return OPT_OUT_WORDS.has(normal);
}

const inboundSchema = z.object({
  from: z.string().min(1),
  id: z.string().min(1),
  timestamp: z.string(),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
  image: z.object({ caption: z.string().optional() }).optional(),
  video: z.object({ caption: z.string().optional() }).optional(),
  document: z
    .object({ caption: z.string().optional(), filename: z.string().optional() })
    .optional(),
  button: z.object({ text: z.string() }).optional(),
  interactive: z
    .object({
      button_reply: z.object({ title: z.string() }).optional(),
      list_reply: z.object({ title: z.string() }).optional(),
    })
    .optional(),
});
type Inbound = z.infer<typeof inboundSchema>;

const statusSchema = z.object({
  id: z.string().min(1),
  status: z.string(),
  timestamp: z.string(),
  errors: z
    .array(z.object({ code: z.number().optional(), title: z.string().optional() }))
    .optional(),
});

/** Only the envelope is checked here; messages and statuses are parsed one by one, so one odd item drops alone. */
const messagesValueSchema = z.object({
  metadata: z.object({ phone_number_id: z.string() }),
  contacts: z
    .array(
      z.object({
        wa_id: z.string().optional(),
        profile: z.object({ name: z.string().optional() }).optional(),
      }),
    )
    .optional()
    .catch(undefined),
  messages: z.array(z.unknown()).optional(),
  statuses: z.array(z.unknown()).optional(),
});

const qualityValueSchema = z.object({
  display_phone_number: z.string(),
  event: z.string().optional(),
  current_limit: z.string().optional(),
});

export const webhookPayloadSchema = z.object({
  object: z.string(),
  entry: z.array(
    z.object({
      id: z.string(),
      changes: z.array(z.object({ field: z.string(), value: z.unknown() })),
    }),
  ),
});
export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;

/** What changed, for the owner's open inbox tabs. */
export type InboxEvent =
  | { type: "message"; contactId: string; messageId: string }
  | { type: "status"; messageId: string; status: MessageStatus }
  | { type: "opt-out"; contactId: string };

export interface WebhookResult {
  /** Events per owner (user id). */
  events: Array<{ userId: string; event: InboxEvent }>;
  /** Changes for numbers this endpoint may not touch (not connected here, or another user's); logged, never retried. */
  unknownNumbers: string[];
  /** Items that didn't parse; logged so a Meta format change is noticed. */
  skipped: number;
}

/** A status never moves back: "delivered" arriving after "read" is dropped. "failed" outranks only sent/queued. */
const STATUS_RANK: Record<MessageStatus, number> = {
  queued: 0,
  sent: 1,
  failed: 2,
  delivered: 3,
  read: 4,
  received: 5,
};

function toStatus(value: string): MessageStatus | null {
  return value === "sent" || value === "delivered" || value === "read" || value === "failed"
    ? value
    : null;
}

function inboundText(m: Inbound): string | null {
  return (
    m.text?.body ??
    m.button?.text ??
    m.interactive?.button_reply?.title ??
    m.interactive?.list_reply?.title ??
    m.image?.caption ??
    m.video?.caption ??
    m.document?.caption ??
    m.document?.filename ??
    null
  );
}

const fromUnix = (seconds: string) => new Date(Number(seconds) * 1000);
const digits = (s: string) => s.replace(/\D/g, "");

/** FLAGGED: quality dropped to low. UNFLAGGED: back to medium or better (Meta doesn't say which; Perbarui reads it). */
const QUALITY_EVENT: Record<string, string> = { FLAGGED: "RED", UNFLAGGED: "GREEN" };

export interface HandleOptions {
  /** Only numbers owned by this user may be touched (a per-number endpoint). Unset: the server's own app. */
  userId?: string;
  newId?: () => string;
}

export async function handleWebhook(
  db: Database,
  payload: WebhookPayload,
  options: HandleOptions = {},
): Promise<WebhookResult> {
  const result: WebhookResult = { events: [], unknownNumbers: [], skipped: 0 };
  if (payload.object !== "whatsapp_business_account") return result;
  const newId = options.newId ?? (() => crypto.randomUUID());

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      if (change.field === "messages") {
        const value = messagesValueSchema.safeParse(change.value);
        if (!value.success) {
          result.skipped++;
          continue;
        }
        await handleMessages(db, value.data, options.userId, newId, result);
      } else if (change.field === "phone_number_quality_update") {
        const value = qualityValueSchema.safeParse(change.value);
        if (!value.success) {
          result.skipped++;
          continue;
        }
        await handleQuality(db, entry.id, value.data, options.userId);
      }
      // message_template_status_update arrives with templates (WAB-6).
    }
  }
  return result;
}

async function handleQuality(
  db: Database,
  wabaId: string,
  value: z.infer<typeof qualityValueSchema>,
  userId: string | undefined,
): Promise<void> {
  // This change names the number by its display form, not its id: match it within the WABA.
  const numbers = await db
    .select({ id: waNumber.id, displayPhone: waNumber.displayPhone })
    .from(waNumber)
    .where(
      userId
        ? and(eq(waNumber.wabaId, wabaId), eq(waNumber.userId, userId))
        : eq(waNumber.wabaId, wabaId),
    );
  const target = numbers.find((n) => digits(n.displayPhone) === digits(value.display_phone_number));
  if (!target) return;
  const quality = value.event ? QUALITY_EVENT[value.event] : undefined;
  const set = {
    ...(value.current_limit ? { messagingTier: value.current_limit } : {}),
    ...(quality ? { qualityRating: quality } : {}),
  };
  if (Object.keys(set).length > 0)
    await db.update(waNumber).set(set).where(eq(waNumber.id, target.id));
}

async function handleMessages(
  db: Database,
  value: z.infer<typeof messagesValueSchema>,
  userId: string | undefined,
  newId: () => string,
  result: WebhookResult,
): Promise<void> {
  const phoneNumberId = value.metadata.phone_number_id;
  const number = (
    await db
      .select({ id: waNumber.id, userId: waNumber.userId })
      .from(waNumber)
      .where(
        userId
          ? and(eq(waNumber.phoneNumberId, phoneNumberId), eq(waNumber.userId, userId))
          : eq(waNumber.phoneNumberId, phoneNumberId),
      )
      .limit(1)
  )[0];
  if (!number) {
    result.unknownNumbers.push(phoneNumberId);
    return;
  }
  const names = new Map<string, string>();
  for (const c of value.contacts ?? [])
    if (c.wa_id && c.profile?.name) names.set(c.wa_id, c.profile.name);

  for (const item of value.messages ?? []) {
    const parsed = inboundSchema.safeParse(item);
    if (!parsed.success) {
      result.skipped++;
      continue;
    }
    const m = parsed.data;
    const at = fromUnix(m.timestamp);
    const [row] = await db
      .insert(contact)
      .values({
        id: newId(),
        userId: number.userId,
        phone: m.from,
        name: names.get(m.from) ?? null,
        lastInboundAt: at,
      })
      .onConflictDoUpdate({
        target: [contact.userId, contact.phone],
        set: {
          // Keep a name the seller typed; fill one in from the WhatsApp profile otherwise.
          name: sql`coalesce(${contact.name}, excluded.name)`,
          lastInboundAt: sql`max(coalesce(${contact.lastInboundAt}, 0), excluded.last_inbound_at)`,
        },
      })
      .returning({ id: contact.id });
    const contactId = row!.id;
    const body = inboundText(m);
    const inserted = await db
      .insert(message)
      .values({
        id: newId(),
        userId: number.userId,
        numberId: number.id,
        contactId,
        direction: "in",
        waMessageId: m.id,
        type: m.type,
        body,
        status: "received",
        statusAt: at,
      })
      .onConflictDoNothing({ target: [message.numberId, message.waMessageId] })
      .returning({ id: message.id });
    if (inserted.length === 0) continue; // re-delivered

    result.events.push({
      userId: number.userId,
      event: { type: "message", contactId, messageId: inserted[0]!.id },
    });

    if (body && isOptOut(body)) {
      const changed = await db
        .update(contact)
        .set({ optOutAt: at })
        .where(and(eq(contact.id, contactId), isNull(contact.optOutAt)))
        .returning({ id: contact.id });
      if (changed.length > 0)
        result.events.push({ userId: number.userId, event: { type: "opt-out", contactId } });
    }
  }

  for (const item of value.statuses ?? []) {
    const parsed = statusSchema.safeParse(item);
    if (!parsed.success) {
      result.skipped++;
      continue;
    }
    const s = parsed.data;
    const status = toStatus(s.status);
    if (!status) continue;
    const lower = (Object.keys(STATUS_RANK) as MessageStatus[]).filter(
      (k) => STATUS_RANK[k] < STATUS_RANK[status],
    );
    const error = status === "failed" ? s.errors?.[0] : undefined;
    const updated = await db
      .update(message)
      .set({
        status,
        statusAt: fromUnix(s.timestamp),
        // A later "delivered" after "failed" clears the old error.
        errorCode: error?.code ?? null,
        errorTitle: error?.title ?? null,
      })
      .where(
        and(
          eq(message.waMessageId, s.id),
          eq(message.numberId, number.id),
          sql`${message.status} in (${sql.join(
            lower.map((k) => sql`${k}`),
            sql`, `,
          )})`,
        ),
      )
      .returning({ id: message.id });
    for (const u of updated)
      result.events.push({
        userId: number.userId,
        event: { type: "status", messageId: u.id, status },
      });
  }
}

/** Where a webhook request came in, and what it is checked against. */
export type WebhookEndpoint =
  | { kind: "app"; appSecret: string }
  | { kind: "number"; key: string; tokenSecret: string };

export interface ReceiveResult {
  status: 200 | 401 | 404;
  result?: WebhookResult;
}

/**
 * One POST from Meta: checks the signature against the endpoint's app secret, then handles the payload. Anything that
 * passed the signature gets a 200, even an unexpected body: Meta retries everything else for days.
 */
export async function receiveWebhook(args: {
  db: Database;
  endpoint: WebhookEndpoint;
  body: string;
  signature: string | null | undefined;
  now?: Date;
}): Promise<ReceiveResult> {
  const { db, endpoint, body, signature } = args;
  let appSecret: string;
  let userId: string | undefined;
  let numberId: string | undefined;
  if (endpoint.kind === "app") {
    appSecret = endpoint.appSecret;
  } else {
    const row = (
      await db
        .select({
          id: waNumber.id,
          userId: waNumber.userId,
          phoneNumberId: waNumber.phoneNumberId,
          appSecretSealed: waNumber.appSecretSealed,
        })
        .from(waNumber)
        .where(eq(waNumber.webhookKey, endpoint.key))
        .limit(1)
    )[0];
    if (!row) return { status: 404 };
    try {
      appSecret = await openToken(
        endpoint.tokenSecret,
        row.appSecretSealed,
        `app:${row.phoneNumberId}`,
      );
    } catch {
      return { status: 401 };
    }
    userId = row.userId;
    numberId = row.id;
  }
  if (!(await verifySignature(appSecret, body, signature))) return { status: 401 };

  if (numberId)
    await db
      .update(waNumber)
      .set({ lastWebhookAt: args.now ?? new Date() })
      .where(eq(waNumber.id, numberId));

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return { status: 200, result: { events: [], unknownNumbers: [], skipped: 1 } };
  }
  const parsed = webhookPayloadSchema.safeParse(payload);
  if (!parsed.success)
    return { status: 200, result: { events: [], unknownNumbers: [], skipped: 1 } };
  return { status: 200, result: await handleWebhook(db, parsed.data, { userId }) };
}

/**
 * Meta's one-time GET when a callback URL is saved: echo `hub.challenge` when the verify token matches. A per-number
 * endpoint's verify token is its key.
 */
export async function verifyChallenge(args: {
  db: Database;
  endpoint: { kind: "app"; verifyToken: string } | { kind: "number"; key: string };
  query: { mode?: string; token?: string; challenge?: string };
}): Promise<{ status: 200 | 403; body: string }> {
  const { mode, token, challenge } = args.query;
  if (mode !== "subscribe" || !token || !challenge) return { status: 403, body: "Forbidden" };
  if (args.endpoint.kind === "app")
    return sameText(token, args.endpoint.verifyToken)
      ? { status: 200, body: challenge }
      : { status: 403, body: "Forbidden" };
  if (!sameText(token, args.endpoint.key)) return { status: 403, body: "Forbidden" };
  const row = (
    await args.db
      .select({ id: waNumber.id })
      .from(waNumber)
      .where(eq(waNumber.webhookKey, args.endpoint.key))
      .limit(1)
  )[0];
  return row ? { status: 200, body: challenge } : { status: 403, body: "Forbidden" };
}
