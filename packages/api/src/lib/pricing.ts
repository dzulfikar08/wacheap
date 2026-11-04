// Meta's WhatsApp rates and WACheap's plans. Meta changes its rates often, so they live here as data with the date
// they took effect; code reads `currentMetaRates()` and never hard-codes a price.

export type MessageCategory = "marketing" | "utility";

export interface MetaRateCard {
  /** First day these rates apply, YYYY-MM-DD. */
  effectiveFrom: string;
  /** Rupiah per delivered message, before VAT. */
  perMessage: Record<MessageCategory, number>;
  /** PPN charged on top by Meta, as a fraction. */
  vat: number;
  source: string;
}

/**
 * Newest last. Indonesia rates, before volume tiers. Utility templates sent inside an open customer-service window are
 * free (Meta, July 2025); the calculator prices business-initiated sends. Check Meta's IDR rate card before adding a row.
 */
export const META_RATE_CARDS: readonly MetaRateCard[] = [
  {
    effectiveFrom: "2026-11-01",
    perMessage: { marketing: 586.33, utility: 356.65 },
    vat: 0.11,
    source: "https://developers.facebook.com/docs/whatsapp/pricing",
  },
];

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * The card in force on `on`, by the calendar day in WIB (a card dated 2026-11-01 applies from 00:00 WIB). Before the
 * first card takes effect the first card is still returned: an estimate beats no number.
 */
export function currentMetaRates(
  on: Date = new Date(),
  cards: readonly MetaRateCard[] = META_RATE_CARDS,
): MetaRateCard {
  if (cards.length === 0) throw new Error("No Meta rate card configured");
  const day = new Date(on.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);
  const card = [...cards].reverse().find((c) => c.effectiveFrom <= day);
  return card ?? cards[0]!;
}

export interface BroadcastCost {
  messages: number;
  perMessage: number;
  subtotal: number;
  vat: number;
  /** What Meta bills to the customer's own WhatsApp Business account. */
  total: number;
  /** WACheap's markup on messages: always zero. */
  markup: 0;
}

/** Cost of sending `messages` messages of `category`, in rupiah, unrounded. For display use `receiptLines`. */
export function broadcastCost(
  messages: number,
  category: MessageCategory,
  card = currentMetaRates(),
): BroadcastCost {
  if (!Number.isInteger(messages) || messages < 0)
    throw new Error(`messages must be a whole number >= 0, got ${messages}`);
  const perMessage = card.perMessage[category];
  const subtotal = messages * perMessage;
  const vat = subtotal * card.vat;
  return { messages, perMessage, subtotal, vat, total: subtotal + vat, markup: 0 };
}

/**
 * Whole-rupiah lines for a receipt that adds up: subtotal and PPN are rounded on their own and the total is their sum,
 * so the shown lines never disagree with the shown total by Rp1.
 */
export function receiptLines(cost: BroadcastCost): {
  subtotal: number;
  vat: number;
  total: number;
} {
  const subtotal = Math.round(cost.subtotal);
  const vat = Math.round(cost.vat);
  return { subtotal, vat, total: subtotal + vat };
}

/**
 * Illustration for the landing page, not a quote: providers that resell messages showed about Rp627 per promo message
 * when Meta charged Rp586.33 (WACheap v1 spec, Nov 2026), a markup of about 7%. Applied to the current card so the
 * comparison can never go negative when Meta's rate changes.
 */
export const EXAMPLE_RESELLER_MARKUP = 627 / 586.33 - 1;

/** WACheap Cloud, per connected number. Self-hosting is free (AGPL). Draft until launch. */
export const CLOUD_PLAN = {
  monthly: 99_000,
  yearly: 990_000,
  trialDays: 14,
} as const;
