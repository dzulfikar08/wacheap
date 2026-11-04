import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { user } from "./auth";

/**
 * WACheap Cloud billing state, one row per user until workspaces exist (WAB-11). DOKU has no auto-renew, so access is
 * prepaid time: every paid order moves `paidUntil` forward. Only used when the server runs with WACHEAP_CLOUD=true;
 * self-hosted installs never write here.
 */
export const billingAccount = sqliteTable("billing_account", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  trialEndsAt: integer("trial_ends_at", { mode: "timestamp_ms" }).notNull(),
  /** End of the paid period; null until the first payment. */
  paidUntil: integer("paid_until", { mode: "timestamp_ms" }),
  /** Connected WhatsApp numbers paid for, as of the last paid order. */
  numbers: integer("numbers").default(1).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

/**
 * One checkout. The payment webhook flips pending -> paid exactly once, and only that flip extends
 * `billing_account.paid_until`, so a replayed notification extends once.
 */
export const billingOrder = sqliteTable(
  "billing_order",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    plan: text("plan", { enum: ["monthly", "yearly"] }).notNull(),
    numbers: integer("numbers").notNull(),
    /** Rupiah charged. */
    amount: integer("amount").notNull(),
    status: text("status", { enum: ["pending", "paid", "expired", "failed"] })
      .default("pending")
      .notNull(),
    provider: text("provider", { enum: ["doku"] })
      .default("doku")
      .notNull(),
    /** The provider's order key: DOKU's invoice_number. */
    providerRef: text("provider_ref").notNull(),
    paymentUrl: text("payment_url"),
    /** The paid-until this order produced, set on the paid flip. */
    paidUntil: integer("paid_until", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    paidAt: integer("paid_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("billing_order_provider_ref_uidx").on(table.provider, table.providerRef),
    index("billing_order_user_created_idx").on(table.userId, table.createdAt),
  ],
);
