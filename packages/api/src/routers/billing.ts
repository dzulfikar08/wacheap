import { ORPCError } from "@orpc/server";
import { billingOrder } from "@wacheap/db/schema/billing";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { buildOrderId, createCheckout } from "../lib/billing/doku";
import {
  BILLING_PLANS,
  MAX_NUMBERS,
  billingStatus,
  orderAmount,
  type BillingPlan,
} from "../lib/billing/plan";
import { ensureBillingAccount } from "../lib/billing/store";
import { CLOUD_PLAN } from "../lib/pricing";

export const checkoutInput = z.object({
  plan: z.enum(BILLING_PLANS as [BillingPlan, ...BillingPlan[]]),
  numbers: z.number().int().min(1).max(MAX_NUMBERS).default(1),
});

const PLAN_LABEL: Record<BillingPlan, string> = { monthly: "1 bulan", yearly: "1 tahun" };

export const billingRouter = {
  /** The signed-in user's plan. The first call on a billing server starts the trial. */
  status: protectedProcedure.handler(async ({ context }) => {
    if (!context.billing.enabled) return { enabled: false as const };
    const now = new Date();
    const state = await ensureBillingAccount(context.db, context.session.user.id, now);
    const status = billingStatus(state, now);
    return {
      enabled: true as const,
      /** False when the DOKU keys are missing: the page explains instead of offering checkout. */
      checkoutReady: context.billing.doku !== null,
      status: status.status,
      daysLeft: status.daysLeft,
      endsAt: status.endsAt,
      trialEndsAt: state.trialEndsAt,
      paidUntil: state.paidUntil,
      numbers: state.numbers,
      prices: CLOUD_PLAN,
    };
  }),

  /** Opens a DOKU Checkout page for `numbers` numbers on `plan`; the webhook credits the time once paid. */
  checkout: protectedProcedure.input(checkoutInput).handler(async ({ input, context }) => {
    const { billing, db, session } = context;
    if (!billing.enabled) {
      throw new ORPCError("PRECONDITION_FAILED", {
        message: "Langganan tidak aktif di server ini. WACheap self-host gratis tanpa langganan.",
      });
    }
    if (!billing.doku) {
      throw new ORPCError("SERVICE_UNAVAILABLE", {
        message:
          "Pembayaran belum disiapkan di server ini (DOKU_CLIENT_ID dan DOKU_SECRET_KEY kosong). Hubungi admin.",
      });
    }
    const now = new Date();
    await ensureBillingAccount(db, session.user.id, now);
    const amount = orderAmount(input.plan, input.numbers);
    const id = crypto.randomUUID();
    const ref = buildOrderId(now);
    await db.insert(billingOrder).values({
      id,
      userId: session.user.id,
      plan: input.plan,
      numbers: input.numbers,
      amount,
      status: "pending",
      provider: "doku",
      providerRef: ref,
    });
    let paymentUrl: string;
    try {
      ({ paymentUrl } = await createCheckout(
        billing.doku,
        {
          orderId: ref,
          amountIdr: amount,
          itemName: `WACheap Cloud ${PLAN_LABEL[input.plan]}`,
          quantity: input.numbers,
          customerEmail: session.user.email,
          customerName: session.user.name,
          notifyUrl: billing.notifyUrl,
          returnUrl: `${billing.returnUrl}?order=${encodeURIComponent(ref)}`,
        },
        billing.fetch,
      ));
    } catch (error) {
      console.error(`billing: checkout ${ref} failed:`, error);
      await db.update(billingOrder).set({ status: "failed" }).where(eq(billingOrder.id, id));
      throw new ORPCError("BAD_GATEWAY", {
        message: "DOKU sedang tidak bisa dihubungi. Coba lagi sebentar lagi.",
      });
    }
    await db.update(billingOrder).set({ paymentUrl }).where(eq(billingOrder.id, id));
    return { paymentUrl, order: ref, amount };
  }),

  /** One of the user's own orders, by its DOKU reference; the return page polls it. */
  order: protectedProcedure
    .input(z.object({ ref: z.string().min(1).max(64) }))
    .handler(async ({ input, context }) => {
      const [order] = await context.db
        .select({
          ref: billingOrder.providerRef,
          plan: billingOrder.plan,
          numbers: billingOrder.numbers,
          amount: billingOrder.amount,
          status: billingOrder.status,
          paidUntil: billingOrder.paidUntil,
        })
        .from(billingOrder)
        .where(
          and(
            eq(billingOrder.providerRef, input.ref),
            eq(billingOrder.userId, context.session.user.id),
          ),
        )
        .limit(1);
      if (!order) throw new ORPCError("NOT_FOUND", { message: "Pesanan tidak ditemukan." });
      return order;
    }),
};
