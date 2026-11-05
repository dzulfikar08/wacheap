import { ORPCError } from "@orpc/server";
import { waNumber } from "@wacheap/db/schema/whatsapp";
import { and, asc, eq, ne } from "drizzle-orm";
import { z } from "zod";

import type { Context } from "../context";
import { protectedProcedure } from "../index";
import {
  GraphError,
  clearNumberWebhook,
  exchangeSignupCode,
  getPhoneNumber,
  registerPhone,
  listWabaNumbers,
  setNumberWebhook,
  subscribeApp,
  unsubscribeApp,
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
const pinContext = (phoneNumberId: string) => `pin:${phoneNumberId}`;

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
  source: waNumber.source,
  pinSealed: waNumber.pinSealed,
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
  row: { tokenSealed: string; appSecretSealed: string; phoneNumberId: string; source: string },
): Promise<GraphCreds> {
  try {
    // An embedded number's app is this server's: read its secret from the config, so rotating META_APP_SECRET
    // doesn't strand the numbers connected before.
    const serverSecret =
      row.source === "embedded"
        ? (context.whatsapp.embeddedSignup?.appSecret ?? context.whatsapp.webhook?.appSecret)
        : undefined;
    return {
      token: await openToken(
        context.whatsapp.tokenSecret,
        row.tokenSealed,
        tokenContext(row.phoneNumberId),
      ),
      appSecret:
        serverSecret ??
        (await openToken(
          context.whatsapp.tokenSecret,
          row.appSecretSealed,
          appSecretContext(row.phoneNumberId),
        )),
    };
  } catch {
    throw new ORPCError("PRECONDITION_FAILED", {
      message:
        "Token nomor ini tidak bisa dibaca lagi. Hubungkan ulang nomornya dengan token baru; riwayatnya tetap ada.",
    });
  }
}

/**
 * After `numberId` stops being an Embedded Signup number (disconnected, or reconnected manually): unsubscribe this
 * server's app from its WABA unless another embedded number still needs it there. Best effort.
 */
async function releaseServerApp(
  context: Context,
  row: {
    id: string;
    wabaId: string;
    phoneNumberId: string;
    tokenSealed: string;
    appSecretSealed: string;
  },
): Promise<void> {
  const others = await context.db
    .select({ id: waNumber.id })
    .from(waNumber)
    .where(
      and(
        eq(waNumber.wabaId, row.wabaId),
        eq(waNumber.source, "embedded"),
        ne(waNumber.id, row.id),
      ),
    )
    .limit(1);
  if (others.length > 0) return;
  try {
    await unsubscribeApp(
      context.whatsapp.graph,
      await credsOf(context, { ...row, source: "embedded" }),
      row.wabaId,
    );
  } catch (error) {
    console.warn(
      `whatsapp: unsubscribing this server's app from ${row.wabaId} failed:`,
      error instanceof Error ? error.message : error,
    );
    return;
  }
  // Another seller may have connected an embedded number on this WABA meanwhile: subscribe again for them.
  const arrived = (
    await context.db
      .select()
      .from(waNumber)
      .where(
        and(
          eq(waNumber.wabaId, row.wabaId),
          eq(waNumber.source, "embedded"),
          ne(waNumber.id, row.id),
        ),
      )
      .limit(1)
  )[0];
  if (arrived)
    await subscribeApp(context.whatsapp.graph, await credsOf(context, arrived), row.wabaId).catch(
      (error) =>
        console.warn(
          `whatsapp: resubscribing this server's app to ${row.wabaId} failed:`,
          error instanceof Error ? error.message : error,
        ),
    );
}

/** Clears the override a manually connected number's own app registered (best effort; its creds may be revoked). */
async function releaseManualOverride(
  context: Context,
  row: { phoneNumberId: string; tokenSealed: string; appSecretSealed: string },
): Promise<void> {
  const old = await credsOf(context, { ...row, source: "manual" }).catch(() => null);
  if (!old) return;
  await clearNumberWebhook(context.whatsapp.graph, old, row.phoneNumberId).catch((error) =>
    console.warn(
      `whatsapp: clearing the previous app's override for ${row.phoneNumberId} failed:`,
      error instanceof Error ? error.message : error,
    ),
  );
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

export const embeddedInput = z.object({
  /** From FB.login's authResponse; Meta lets it live about 30 seconds. */
  code: z.string().trim().min(10).max(2048),
  wabaId: metaId("WhatsApp Business Account ID"),
  phoneNumberId: metaId("Phone number ID"),
});

/** A random 6-digit two-step verification PIN for a number this server registers. */
function newPin(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000;
  return n.toString().padStart(6, "0");
}

export const whatsappRouter = {
  /** What the browser needs to start Embedded Signup; null when this server has no Meta app set up for it. */
  signupConfig: protectedProcedure.handler(({ context }) => {
    const signup = context.whatsapp.embeddedSignup;
    return signup
      ? {
          appId: signup.appId,
          configId: signup.configId,
          graphVersion: context.whatsapp.graph.version,
        }
      : null;
  }),

  numbers: {
    /** The user's numbers, with each one's webhook callback URL and verify token for their Meta app. */
    list: protectedProcedure.handler(async ({ context }) => {
      const rows = await context.db
        .select(PUBLIC_COLUMNS)
        .from(waNumber)
        .where(eq(waNumber.userId, context.session.user.id))
        .orderBy(asc(waNumber.createdAt));
      return rows.map(({ webhookKey, pinSealed, ...row }) => ({
        ...row,
        hasPin: pinSealed !== null,
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
            wabaId: waNumber.wabaId,
            source: waNumber.source,
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
        source: "manual" as const,
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
        if (existing.source === "embedded") {
          // From Embedded Signup to the seller's own app: stop this server's app from posting the same messages too.
          // Unless the "manual" app is this server's own: then the subscription just made is the one to keep.
          const serverSecret = whatsapp.embeddedSignup?.appSecret ?? whatsapp.webhook?.appSecret;
          if (input.appSecret !== serverSecret) await releaseServerApp(context, existing);
        } else {
          // Moving to another Meta app: the old app's override would keep posting here, signed with a secret this URL
          // no longer accepts. Clear it with the old credentials first.
          const old = await credsOf(context, existing).catch(() => null);
          if (old && old.appSecret !== input.appSecret)
            await releaseManualOverride(context, existing);
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

    /**
     * The one-button connect: the seller finished Meta's Embedded Signup in the browser, which handed back a code and
     * the WABA and number they picked. The code becomes the seller's business token for this server's own app, so the
     * number's webhooks arrive at /api/whatsapp/webhook (no per-number override). A number not yet on the Cloud API is
     * registered with a fresh PIN.
     */
    connectEmbedded: protectedProcedure.input(embeddedInput).handler(async ({ input, context }) => {
      const { db, session, whatsapp } = context;
      const signup = whatsapp.embeddedSignup;
      if (!signup)
        throw new ORPCError("PRECONDITION_FAILED", {
          message: "Koneksi lewat Facebook belum disiapkan di server ini. Pakai cara manual.",
        });
      const existing = (
        await db
          .select({
            id: waNumber.id,
            userId: waNumber.userId,
            source: waNumber.source,
            phoneNumberId: waNumber.phoneNumberId,
            tokenSealed: waNumber.tokenSealed,
            appSecretSealed: waNumber.appSecretSealed,
            pinSealed: waNumber.pinSealed,
          })
          .from(waNumber)
          .where(eq(waNumber.phoneNumberId, input.phoneNumberId))
          .limit(1)
      )[0];
      if (existing && existing.userId !== session.user.id)
        throw new ORPCError("CONFLICT", {
          message: "Nomor ini sudah terhubung ke akun WACheap lain.",
        });

      let token: string;
      try {
        token = await exchangeSignupCode(whatsapp.graph, signup, input.code);
      } catch (error) {
        console.warn(
          "whatsapp: signup code exchange failed:",
          error instanceof Error ? error.message : error,
        );
        throw new ORPCError("BAD_REQUEST", {
          message:
            "Kode dari Facebook sudah kedaluwarsa atau tidak valid. Ulangi Hubungkan dengan Facebook.",
        });
      }
      const creds: GraphCreds = { token, appSecret: signup.appSecret };

      let info: PhoneNumberInfo;
      let registered = true;
      try {
        const numbers = await listWabaNumbers(whatsapp.graph, creds, input.wabaId);
        const found = numbers.find((n) => n.id === input.phoneNumberId);
        if (!found)
          throw new ORPCError("BAD_REQUEST", {
            message:
              "Nomor yang dipilih tidak ditemukan di akun WhatsApp itu. Ulangi dan pilih nomornya.",
          });
        info = found;
        await subscribeApp(whatsapp.graph, creds, input.wabaId);
      } catch (error) {
        if (error instanceof ORPCError) throw error;
        throw graphFailure(error);
      }
      // A number already on the Cloud API (registered by another tool, or earlier) keeps its registration and PIN. A
      // number this server registered before is registered again with the PIN it set then (Meta refuses a new one).
      let pin: string | null = null;
      if (info.platform_type !== "CLOUD_API") {
        const stored = existing?.pinSealed
          ? await openToken(
              whatsapp.tokenSecret,
              existing.pinSealed,
              pinContext(input.phoneNumberId),
            ).catch(() => null)
          : null;
        const attempt = stored ?? newPin();
        try {
          await registerPhone(whatsapp.graph, creds, input.phoneNumberId, attempt);
          pin = attempt;
        } catch (error) {
          registered = false;
          console.warn(
            `whatsapp: registering ${input.phoneNumberId} failed:`,
            error instanceof Error ? error.message : error,
          );
        }
      }

      const values = {
        wabaId: input.wabaId,
        source: "embedded" as const,
        // Only a PIN this server just set replaces a stored one; an already-registered number keeps what it had.
        ...(pin
          ? {
              pinSealed: await sealToken(
                whatsapp.tokenSecret,
                pin,
                pinContext(input.phoneNumberId),
              ),
            }
          : {}),
        tokenSealed: await sealToken(
          whatsapp.tokenSecret,
          token,
          tokenContext(input.phoneNumberId),
        ),
        appSecretSealed: await sealToken(
          whatsapp.tokenSecret,
          signup.appSecret,
          appSecretContext(input.phoneNumberId),
        ),
        ...details(info),
      };
      if (existing) {
        if (existing.source === "manual") await releaseManualOverride(context, existing);
        await db
          .update(waNumber)
          .set({ ...values, lastWebhookAt: null })
          .where(and(eq(waNumber.id, existing.id), eq(waNumber.userId, session.user.id)));
        return { id: existing.id, reconnected: true, registered, ...details(info) };
      }
      const id = crypto.randomUUID();
      const inserted = await db
        .insert(waNumber)
        .values({
          id,
          userId: session.user.id,
          phoneNumberId: input.phoneNumberId,
          webhookKey: newWebhookKey(),
          ...values,
        })
        .onConflictDoNothing({ target: waNumber.phoneNumberId })
        .returning({ id: waNumber.id });
      if (inserted.length === 0)
        throw new ORPCError("CONFLICT", { message: "Nomor ini baru saja terhubung." });
      return { id, reconnected: false, registered, ...details(info) };
    }),

    /**
     * The two-step verification PIN this server set when it registered the number. The seller needs it to move the
     * number to another provider or register it again elsewhere.
     */
    revealPin: protectedProcedure
      .input(z.object({ id: z.string().min(1) }))
      .handler(async ({ input, context }) => {
        const row = await ownNumber(context, input.id);
        if (!row.pinSealed)
          throw new ORPCError("NOT_FOUND", {
            message:
              "WACheap tidak menyetel PIN nomor ini (sudah terdaftar sebelumnya). PIN-nya bisa diatur ulang di WhatsApp Manager.",
          });
        try {
          return {
            pin: await openToken(
              context.whatsapp.tokenSecret,
              row.pinSealed,
              pinContext(row.phoneNumberId),
            ),
          };
        } catch {
          throw new ORPCError("PRECONDITION_FAILED", {
            message: "PIN tidak bisa dibaca lagi. Atur ulang PIN-nya di WhatsApp Manager.",
          });
        }
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
     * Forgets the number, its token and its message history. Contacts stay. A manual number's override is removed, so
     * Meta goes back to the seller's app's own callback URL (their app stays subscribed: it is theirs). An embedded
     * number's WABA is unsubscribed from this server's app once no other embedded number uses it. Both best effort.
     */
    disconnect: protectedProcedure
      .input(z.object({ id: z.string().min(1) }))
      .handler(async ({ input, context }) => {
        const row = await ownNumber(context, input.id);
        if (row.source === "embedded") await releaseServerApp(context, row);
        else await releaseManualOverride(context, row);
        await context.db
          .delete(waNumber)
          .where(and(eq(waNumber.id, row.id), eq(waNumber.userId, context.session.user.id)));
        return { ok: true as const };
      }),
  },
};
