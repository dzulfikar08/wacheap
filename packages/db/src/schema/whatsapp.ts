import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { user } from "./auth";

const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

/**
 * A WhatsApp Business number the seller connected. Owned by one user until workspaces exist (WAB-9). Meta reports
 * every webhook change with `phone_number_id`, so that id is unique across the whole server: it is how an inbound
 * message finds its owner.
 */
export const waNumber = sqliteTable(
  "wa_number",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    wabaId: text("waba_id").notNull(),
    phoneNumberId: text("phone_number_id").notNull(),
    /** As Meta prints it, e.g. "+62 812-3456-7890". */
    displayPhone: text("display_phone").notNull(),
    verifiedName: text("verified_name").notNull(),
    /** GREEN, YELLOW, RED or UNKNOWN. */
    qualityRating: text("quality_rating").default("UNKNOWN").notNull(),
    /** Meta's messaging limit, e.g. TIER_250, TIER_1K; null until Meta reports one. */
    messagingTier: text("messaging_tier"),
    /** The access token, AES-GCM sealed (packages/api/src/lib/whatsapp/seal.ts). Never sent to the browser. */
    tokenSealed: text("token_sealed").notNull(),
    /**
     * The secret of the Meta app the token belongs to, sealed. A manually connected number's webhooks come from the
     * seller's own app, signed with this secret, at /api/whatsapp/webhook/<webhookKey>.
     */
    appSecretSealed: text("app_secret_sealed").notNull(),
    /** Random path segment of this number's webhook URL; also the verify token typed into the seller's Meta app. */
    webhookKey: text("webhook_key").notNull(),
    /** Last signed webhook received for this number's URL: shows the seller their callback works. */
    lastWebhookAt: integer("last_webhook_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(now)
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("wa_number_phone_number_id_uidx").on(table.phoneNumberId),
    uniqueIndex("wa_number_webhook_key_uidx").on(table.webhookKey),
    index("wa_number_user_idx").on(table.userId),
  ],
);

/** A buyer the seller may message. `phone` is digits only with the country code (6281234567890), as Meta sends it. */
export const contact = sqliteTable(
  "contact",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    phone: text("phone").notNull(),
    name: text("name"),
    /** When and how the buyer agreed to be messaged; broadcasts only go to opted-in contacts (WAB-5). */
    optInAt: integer("opt_in_at", { mode: "timestamp_ms" }),
    optInSource: text("opt_in_source"),
    /** Set when the buyer replied STOP/BERHENTI; nothing more is sent until they opt in again. */
    optOutAt: integer("opt_out_at", { mode: "timestamp_ms" }),
    /** Last message from the buyer: opens Meta's 24-hour window for free-form replies. */
    lastInboundAt: integer("last_inbound_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(now)
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("contact_user_phone_uidx").on(table.userId, table.phone)],
);

export const MESSAGE_STATUSES = [
  "queued",
  "sent",
  "delivered",
  "read",
  "failed",
  "received",
] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

/** Every message in or out. Outbound rows get their `waMessageId` once Meta accepts the send. */
export const message = sqliteTable(
  "message",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    numberId: text("number_id")
      .notNull()
      .references(() => waNumber.id, { onDelete: "cascade" }),
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id, { onDelete: "cascade" }),
    direction: text("direction", { enum: ["in", "out"] }).notNull(),
    /**
     * Meta's id ("wamid...."); unique per number, which makes a re-delivered webhook a no-op. Not unique server-wide:
     * a seller signs their own number's webhooks, so one seller's rows must never be able to shadow another's.
     */
    waMessageId: text("wa_message_id"),
    /** text, image, template, button, interactive, ... as Meta names it. */
    type: text("type").notNull(),
    /** Text shown in the inbox: the text body, a caption, or the template name. */
    body: text("body"),
    status: text("status", { enum: MESSAGE_STATUSES }).notNull(),
    errorCode: integer("error_code"),
    errorTitle: text("error_title"),
    /** The time Meta stamped on the message or its latest status. */
    statusAt: integer("status_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (table) => [
    uniqueIndex("message_number_wa_message_id_uidx").on(table.numberId, table.waMessageId),
    index("message_contact_idx").on(table.contactId, table.createdAt),
    index("message_user_created_idx").on(table.userId, table.createdAt),
  ],
);
