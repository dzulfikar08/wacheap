import { waitlist } from "@wacheap/db/schema/waitlist";
import { z } from "zod";

import { publicProcedure } from "../index";

/** Indonesian mobile number in any common form (08…, +62…, 62…) to 62…; null when it isn't one. */
export function normaliseWhatsapp(input: string): string | null {
  const digits = input.replace(/[\s().-]/g, "").replace(/^\+/, "");
  const national = digits.startsWith("62")
    ? digits.slice(2)
    : digits.startsWith("0")
      ? digits.slice(1)
      : digits;
  return /^8\d{7,12}$/.test(national) ? `62${national}` : null;
}

export const joinWaitlistInput = z.object({
  email: z
    .email()
    .max(254)
    .transform((e) => e.trim().toLowerCase()),
  whatsapp: z
    .string()
    .max(32)
    .optional()
    .refine((v) => !v || normaliseWhatsapp(v) !== null, "Nomor WhatsApp tidak valid"),
  shop: z.string().trim().max(120).optional(),
  channel: z.enum(["marketplace", "instagram", "tiktok", "website", "other"]).optional(),
});

export const waitlistRouter = {
  join: publicProcedure.input(joinWaitlistInput).handler(async ({ input, context }) => {
    await context.db
      .insert(waitlist)
      .values({
        id: crypto.randomUUID(),
        email: input.email,
        whatsapp: input.whatsapp ? normaliseWhatsapp(input.whatsapp) : null,
        shop: input.shop || null,
        channel: input.channel ?? null,
      })
      .onConflictDoNothing({ target: waitlist.email });
    // Same answer for a new and a repeat email, so the form can't be used to test who signed up.
    return { joined: true as const };
  }),
};
