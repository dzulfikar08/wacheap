import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Early-access sign-ups from the landing page. One row per email; a repeat sign-up keeps the first row. The endpoint is
 * public, so an address here is unconfirmed: confirm it (a reply or a confirmation link) before sending anything else.
 */
export const waitlist = sqliteTable("waitlist", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  /** Normalised to 62… (no plus sign), or null. */
  whatsapp: text("whatsapp"),
  shop: text("shop"),
  /** Where the visitor sells, as they told us: marketplace, instagram, tiktok, website, other. */
  channel: text("channel"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
});
