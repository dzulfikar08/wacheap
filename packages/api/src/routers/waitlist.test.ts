import { describe, expect, test } from "bun:test";

import { call } from "@orpc/server";
import { d1TestDb } from "@wacheap/db/test-d1";

import { normaliseWhatsapp, waitlistRouter } from "./waitlist";

describe("normaliseWhatsapp", () => {
  test("accepts the usual Indonesian forms", () => {
    for (const n of ["0812-3456-7890", "+62 812 3456 7890", "6281234567890", "81234567890"]) {
      expect(normaliseWhatsapp(n)).toBe("6281234567890");
    }
  });
  test("rejects landlines and junk", () => {
    expect(normaliseWhatsapp("021 555 1234")).toBeNull();
    expect(normaliseWhatsapp("hello")).toBeNull();
  });
});

describe("waitlist.join", () => {
  test("stores one row per email, case-insensitively, and answers the same for a repeat", async () => {
    const { db, client } = await d1TestDb();
    const context = { db, session: null };
    const first = await call(
      waitlistRouter.join,
      { email: "Toko@Example.test", whatsapp: "0812 3456 7890", channel: "marketplace" },
      { context },
    );
    const again = await call(waitlistRouter.join, { email: "toko@example.test" }, { context });
    expect(first).toEqual({ joined: true });
    expect(again).toEqual({ joined: true });
    const rows = await client.execute("select email, whatsapp, channel from waitlist");
    expect(rows.rows.length).toBe(1);
    expect(rows.rows[0]).toMatchObject({
      email: "toko@example.test",
      whatsapp: "6281234567890",
      channel: "marketplace",
    });
  });

  test("rejects an invalid WhatsApp number", async () => {
    const { db } = await d1TestDb();
    await expect(
      call(
        waitlistRouter.join,
        { email: "a@b.test", whatsapp: "123" },
        { context: { db, session: null } },
      ),
    ).rejects.toThrow();
  });
});
