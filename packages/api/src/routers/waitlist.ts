import { waitlist } from "@wacheap/db/schema/waitlist";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { publicProcedure } from "../index";

/**
 * Indonesian mobile number in any common form (0812…, +62 812…, +62 0812…, 0062 812…, 812…) to 62…; null when it
 * isn't one.
 */
export function normaliseWhatsapp(input: string): string | null {
  let digits = input.replace(/[\s().-]/g, "").replace(/^\+/, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("62")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.slice(1);
  return /^8\d{7,12}$/.test(digits) ? `62${digits}` : null;
}

export const joinWaitlistInput = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  whatsapp: z
    .string()
    .max(32)
    .optional()
    .transform((v, ctx) => {
      if (!v) return null;
      const normalised = normaliseWhatsapp(v);
      if (!normalised)
        ctx.addIssue({ code: "custom", message: "Nomor WhatsApp tidak valid", path: [] });
      return normalised;
    }),
  shop: z.string().trim().max(120).optional(),
  channel: z.enum(["marketplace", "instagram", "tiktok", "website", "other"]).optional(),
  /** Cloudflare Turnstile token from the form; checked before anything is written. */
  turnstileToken: z.string().min(1).max(2048),
});

export const waitlistRouter = {
  join: publicProcedure.input(joinWaitlistInput).handler(async ({ input, context }) => {
    if (!(await context.verifyHuman(input.turnstileToken))) {
      throw new ORPCError("FORBIDDEN", {
        message: "Verifikasi gagal. Muat ulang halaman, lalu coba lagi.",
      });
    }
    await context.db
      .insert(waitlist)
      .values({
        id: crypto.randomUUID(),
        email: input.email,
        whatsapp: input.whatsapp,
        shop: input.shop || null,
        channel: input.channel ?? null,
      })
      .onConflictDoNothing({ target: waitlist.email });
    // Same answer for a new and a repeat email, so the form can't be used to test who signed up.
    return { joined: true as const };
  }),
};
