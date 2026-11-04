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

/** Newest last. Indonesia rates; check Meta's rate card before adding a row. */
export const META_RATE_CARDS: readonly MetaRateCard[] = [
  {
    effectiveFrom: "2026-11-01",
    perMessage: { marketing: 586.33, utility: 356.65 },
    vat: 0.11,
    source: "https://developers.facebook.com/docs/whatsapp/pricing",
  },
];

export function currentMetaRates(on: Date = new Date()): MetaRateCard {
  const day = on.toISOString().slice(0, 10);
  const card = [...META_RATE_CARDS].reverse().find((c) => c.effectiveFrom <= day);
  return card ?? META_RATE_CARDS[0]!;
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

/** Exact cost of sending `messages` messages of `category`, in rupiah (not rounded). */
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

/** WACheap Cloud, per connected number. Self-hosting is free (AGPL). Draft until launch. */
export const CLOUD_PLAN = {
  monthly: 99_000,
  yearly: 990_000,
  trialDays: 14,
} as const;
