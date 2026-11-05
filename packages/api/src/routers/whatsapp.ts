import { ORPCError } from "@orpc/server";
import { waNumber } from "@wacheap/db/schema/whatsapp";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import type { Context } from "../context";
import { protectedProcedure } from "../index";
import {
  GraphError,
  clearNumberWebhook,
  getPhoneNumber,
  listWabaNumbers,
  setNumberWebhook,
  subscribeApp,
  type GraphCreds,
  type PhoneNumberInfo,
} from "../lib/whatsapp/graph";
import { openToken, sealToken } from "../lib/whatsapp/seal";
import { WHATSAPP_WEBHOOK_PATH } from "../lib/whatsapp/webhook";

const metaId = (label: string) =>
  z
    .string()
    .trim()
    .regex(/^\d{5,25}$/, `${label} berupa angka dari WhatsApp Manager`);

export const connectInput = z.object({
  wabaId: metaId("WhatsApp Business Account ID"),
  phoneNumberId: metaId("Phone number ID"),
  accessToken: z.string().trim().min(20, "Token akses terlalu pendek").max(1024),
  appSecret: z
    .string()
    .trim()
    .regex(/^[0-9a-f]{32}$/i, "App secret berupa 32 karakter dari Meta app > Settings > Basic"),
});

/** Associated data for each sealed value: a sealed token can't be passed off as an app secret, or moved to another number. */
const tokenContext = (phoneNumberId: string) => phoneNumberId;
const appSecretContext = (phoneNumberId: string) => `app:${phoneNumberId}`;

/** 32 random bytes, URL-safe: the per-number webhook path segment and verify token. */
function newWebhookKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** What the browser sees of a number: never the token or the app secret. */
const PUBLIC_COLUMNS = {
  id: waNumber.id,
  wabaId: waNumber.wabaId,
  phoneNumberId: waNumber.phoneNumberId,
  displayPhone: waNumber.displayPhone,
  verifiedName: waNumber.verifiedName,
  qualityRating: waNumber.qualityRating,
  messagingTier: waNumber.messagingTier,
  webhookKey: waNumber.webhookKey,
  lastWebhookAt: waNumber.lastWebhookAt,
  createdAt: waNumber.createdAt,
};

/** Meta's answer turned into something a seller can act on. */
function graphFailure(error: unknown): ORPCError<string, unknown> {
  if (error instanceof GraphError) {
    if (error.isBadAppSecret)
      return new ORPCError("BAD_REQUEST", {
        message:
          "App secret tidak cocok dengan token ini. Pakai App secret dari Meta app yang sama dengan system user pembuat token.",
      });
    if (error.isAuth)
      return new ORPCError("BAD_REQUEST", {
        message:
          "Token akses ditolak Meta (salah, kedaluwarsa, atau tanpa izin whatsapp_business_management dan whatsapp_business_messaging).",
      });
    if (error.status === 400 || error.status === 404 || error.code === 100)
      return new ORPCError("BAD_REQUEST", {
        message: `Meta tidak menemukan akun atau nomor itu dengan token ini: ${error.message}`,
      });
    return new ORPCError("BAD_GATEWAY", {
      message: `Meta menolak permintaan: ${error.message}`,
    });
  }
  console.error("whatsapp: graph call failed", error instanceof Error ? error.message : error);
  return new ORPCError("BAD_GATEWAY", {
    message: "Meta sedang tidak bisa dihubungi. Coba lagi sebentar lagi.",
  });
}

function details(info: PhoneNumberInfo) {
  return {
    displayPhone: info.display_phone_number,
    verifiedName: info.verified_name,
    qualityRating: info.quality_rating ?? "UNKNOWN",
    messagingTier: info.messaging_limit_tier ?? null,
  };
}

const webhookUrl = (context: Pick<Context, "whatsapp">, key: string) =>
  `${context.whatsapp.serverUrl}${WHATSAPP_WEBHOOK_PATH}/${key}`;

/**
 * Registers the number's own webhook URL with Meta (a phone-number override), so its messages come here even when the
 * seller's app has another callback URL or serves several numbers. Must run after the row exists: Meta verifies the URL
 * with a GET that is answered from the row. False when Meta refused; the page then shows the manual steps.
 */
async function installWebhook(
  context: Pick<Context, "whatsapp">,
  creds: GraphCreds,
  phoneNumberId: string,
  key: string,
): Promise<boolean> {
  try {
    await setNumberWebhook(
      context.whatsapp.graph,
      creds,
      phoneNumberId,
      webhookUrl(context, key),
      key,
    );
    return true;
  } catch (error) {
    console.warn(
      `whatsapp: webhook override for ${phoneNumberId} failed:`,
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}

async function credsOf(
  context: Pick<Context, "whatsapp">,
  row: { tokenSealed: string; appSecretSealed: string; phoneNumberId: string },
): Promise<GraphCreds> {
  try {
    return {
      token: await openToken(
        context.whatsapp.tokenSecret,
        row.tokenSealed,
        tokenContext(row.phoneNumberId),
      ),
      appSecret: await openToken(
        context.whatsapp.tokenSecret,
        row.appSecretSealed,
        appSecretContext(row.phoneNumberId),
      ),
    };
  } catch {
    throw new ORPCError("PRECONDITION_FAILED", {
      message:
        "Token nomor ini tidak bisa dibaca lagi. Hubungkan ulang nomornya dengan token baru; riwayatnya tetap ada.",
    });
  }
}

async function ownNumber(context: Context, id: string) {
  const row = (
    await context.db
      .select()
      .from(waNumber)
      .where(and(eq(waNumber.id, id), eq(waNumber.userId, context.session!.user.id)))
      .limit(1)
  )[0];
  if (!row) throw new ORPCError("NOT_FOUND", { message: "Nomor tidak ditemukan." });
  return row;
}

export const whatsappRouter = {
  numbers: {
    /** The user's numbers, with each one's webhook callback URL and verify token for their Meta app. */
    list: protectedProcedure.handler(async ({ context }) => {
      const rows = await context.db
        .select(PUBLIC_COLUMNS)
        .from(waNumber)
        .where(eq(waNumber.userId, context.session.user.id))
        .orderBy(asc(waNumber.createdAt));
      return rows.map(({ webhookKey, ...row }) => ({
        ...row,
        webhookUrl: webhookUrl(context, webhookKey),
        verifyToken: webhookKey,
      }));
    }),

    /**
     * Connects a number by its WABA ID, phone number ID, a permanent token (a system user's, from Meta Business
     * Settings) and the secret of the app that token belongs to. The token must see the WABA, the number must belong
     * to it, and the app secret must match the token (Meta checks appsecret_proof); then the app is subscribed to the
     * WABA's webhooks. Nothing is stored unless all of that succeeds. Connecting a number this user already has
     * replaces its token and app secret and keeps its history and webhook URL.
     */
    connect: protectedProcedure.input(connectInput).handler(async ({ input, context }) => {
      const { db, session, whatsapp } = context;
      const existing = (
        await db
          .select({
            id: waNumber.id,
            userId: waNumber.userId,
            webhookKey: waNumber.webhookKey,
            phoneNumberId: waNumber.phoneNumberId,
            tokenSealed: waNumber.tokenSealed,
            appSecretSealed: waNumber.appSecretSealed,
          })
          .from(waNumber)
          .where(eq(waNumber.phoneNumberId, input.phoneNumberId))
          .limit(1)
      )[0];
      if (existing && existing.userId !== session.user.id) {
        throw new ORPCError("CONFLICT", {
          message: "Nomor ini sudah terhubung ke akun WACheap lain.",
        });
      }

      const creds: GraphCreds = { token: input.accessToken, appSecret: input.appSecret };
      let info: PhoneNumberInfo;
      try {
        const numbers = await listWabaNumbers(whatsapp.graph, creds, input.wabaId);
        const found = numbers.find((n) => n.id === input.phoneNumberId);
        if (!found) {
          throw new ORPCError("BAD_REQUEST", {
            message:
              "Phone number ID itu tidak ada di WhatsApp Business Account ini. Cek keduanya di WhatsApp Manager > API Setup.",
          });
        }
        info = found;
        await subscribeApp(whatsapp.graph, creds, input.wabaId);
      } catch (error) {
        if (error instanceof ORPCError) throw error;
        throw graphFailure(error);
      }

      const sealed = {
        wabaId: input.wabaId,
        tokenSealed: await sealToken(
          whatsapp.tokenSecret,
          input.accessToken,
          tokenContext(input.phoneNumberId),
        ),
        appSecretSealed: await sealToken(
          whatsapp.tokenSecret,
          input.appSecret,
          appSecretContext(input.phoneNumberId),
        ),
        ...details(info),
      };

      if (existing) {
        // Moving to another Meta app: the old app's override would keep posting here, signed with a secret this URL no
        // longer accepts. Clear it with the old credentials first (best effort; they may be revoked already).
        const old = await credsOf(context, existing).catch(() => null);
        if (old && old.appSecret !== input.appSecret) {
          await clearNumberWebhook(whatsapp.graph, old, input.phoneNumberId).catch((error) =>
            console.warn(
              `whatsapp: clearing the previous app's override for ${input.phoneNumberId} failed:`,
              error instanceof Error ? error.message : error,
            ),
          );
        }
        // The new credentials may be another app's: "Aktif" waits for that app's first webhook.
        await db
          .update(waNumber)
          .set({ ...sealed, lastWebhookAt: null })
          .where(and(eq(waNumber.id, existing.id), eq(waNumber.userId, session.user.id)));
        const webhookInstalled = await installWebhook(
          context,
          creds,
          input.phoneNumberId,
          existing.webhookKey,
        );
        return { id: existing.id, reconnected: true, webhookInstalled, ...details(info) };
      }

      const id = crypto.randomUUID();
      const webhookKey = newWebhookKey();
      // Two connects of the same number may race past the check above; the unique index decides, quietly.
      const inserted = await db
        .insert(waNumber)
        .values({
          id,
          userId: session.user.id,
          phoneNumberId: input.phoneNumberId,
          webhookKey,
          ...sealed,
        })
        .onConflictDoNothing({ target: waNumber.phoneNumberId })
        .returning({ id: waNumber.id });
      if (inserted.length === 0)
        throw new ORPCError("CONFLICT", { message: "Nomor ini baru saja terhubung." });
      const webhookInstalled = await installWebhook(
        context,
        creds,
        input.phoneNumberId,
        webhookKey,
      );
      return { id, reconnected: false, webhookInstalled, ...details(info) };
    }),

    /** Registers the number's webhook URL with Meta again (after connecting failed to, or the seller removed it). */
    installWebhook: protectedProcedure
      .input(z.object({ id: z.string().min(1) }))
      .handler(async ({ input, context }) => {
        const row = await ownNumber(context, input.id);
        const creds = await credsOf(context, row);
        try {
          await setNumberWebhook(
            context.whatsapp.graph,
            creds,
            row.phoneNumberId,
            webhookUrl(context, row.webhookKey),
            row.webhookKey,
          );
        } catch (error) {
          if (error instanceof GraphError && !error.isAuth && !error.isBadAppSecret)
            throw new ORPCError("BAD_REQUEST", {
              message: `Meta menolak alamat webhook nomor ini: ${error.message}`,
            });
          throw graphFailure(error);
        }
        return { ok: true as const };
      }),

    /** Reads the number's name, quality rating and tier from Meta again. */
    refresh: protectedProcedure
      .input(z.object({ id: z.string().min(1) }))
      .handler(async ({ input, context }) => {
        const row = await ownNumber(context, input.id);
        const creds = await credsOf(context, row);
        let info: PhoneNumberInfo;
        try {
          info = await getPhoneNumber(context.whatsapp.graph, creds, row.phoneNumberId);
        } catch (error) {
          throw graphFailure(error);
        }
        const next = details(info);
        await context.db.update(waNumber).set(next).where(eq(waNumber.id, row.id));
        return { id: row.id, ...next };
      }),

    /**
     * Forgets the number, its token and its message history. Contacts stay. Our webhook override on the number is
     * removed (best effort), so Meta goes back to the seller's app's own callback URL; the app stays subscribed to the
     * WABA, since it is theirs and may serve other tools.
     */
    disconnect: protectedProcedure
      .input(z.object({ id: z.string().min(1) }))
      .handler(async ({ input, context }) => {
        const row = await ownNumber(context, input.id);
        try {
          await clearNumberWebhook(
            context.whatsapp.graph,
            await credsOf(context, row),
            row.phoneNumberId,
          );
        } catch (error) {
          // A revoked token or unreadable secret must not keep the seller from removing the number.
          console.warn(
            `whatsapp: clearing webhook override for ${row.phoneNumberId} failed:`,
            error instanceof Error ? error.message : error,
          );
        }
        await context.db
          .delete(waNumber)
          .where(and(eq(waNumber.id, row.id), eq(waNumber.userId, context.session.user.id)));
        return { ok: true as const };
      }),
  },
};
