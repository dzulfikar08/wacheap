import { broadcastCost, currentMetaRates, type MessageCategory } from "@wacheap/api/lib/pricing";
import { useId, useState } from "react";

const rupiah = (n: number, fractions = 0) =>
  `Rp${new Intl.NumberFormat("id-ID", { minimumFractionDigits: fractions, maximumFractionDigits: fractions }).format(n)}`;

/** Example per-message promo price seen at providers that add a markup (spec, Nov 2026). */
const MARKED_UP_PROMO = 627;

const MIN = 50;
const MAX = 10_000;

export function Receipt() {
  const [buyers, setBuyers] = useState(1000);
  const [category, setCategory] = useState<MessageCategory>("marketing");
  const card = currentMetaRates();
  const cost = broadcastCost(buyers, category, card);
  const sliderId = useId();
  const numberId = useId();

  const markedUp = buyers * MARKED_UP_PROMO * (1 + card.vat);
  const asPromo = broadcastCost(buyers, "marketing", card).total;
  const effective = new Date(`${card.effectiveFrom}T00:00:00`).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <figure className="wc-receipt" aria-label="Kalkulator biaya broadcast">
      <div className="wc-receipt-controls">
        <div className="wc-segment" role="radiogroup" aria-label="Jenis pesan">
          {(
            [
              ["marketing", "Promo"],
              ["utility", "Update pesanan & resi"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={category === value}
              className="wc-segment-option"
              onClick={() => setCategory(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="wc-buyers">
          <label htmlFor={numberId}>Jumlah pembeli</label>
          <input
            id={numberId}
            className="wc-buyers-number"
            type="number"
            inputMode="numeric"
            min={MIN}
            max={MAX}
            step={50}
            value={buyers}
            onChange={(e) => {
              const n = Math.round(Number(e.target.value));
              if (Number.isFinite(n)) setBuyers(Math.min(MAX, Math.max(0, n)));
            }}
          />
        </div>
        <input
          id={sliderId}
          aria-label="Jumlah pembeli"
          className="wc-slider"
          type="range"
          min={MIN}
          max={MAX}
          step={50}
          value={Math.max(MIN, buyers)}
          onChange={(e) => setBuyers(Number(e.target.value))}
        />
      </div>

      <div className="wc-receipt-paper">
        <p className="wc-receipt-head">
          <strong>WACHEAP</strong>
          <span>Perkiraan biaya broadcast</span>
          <span>Tarif Meta per {effective}</span>
        </p>
        <dl className="wc-receipt-lines">
          <div>
            <dt>Tarif Meta / pesan</dt>
            <dd>{rupiah(cost.perMessage, 2)}</dd>
          </div>
          <div>
            <dt>× pembeli</dt>
            <dd>{new Intl.NumberFormat("id-ID").format(buyers)}</dd>
          </div>
          <div>
            <dt>Subtotal</dt>
            <dd>{rupiah(cost.subtotal)}</dd>
          </div>
          <div>
            <dt>PPN {Math.round(card.vat * 100)}%</dt>
            <dd>{rupiah(cost.vat)}</dd>
          </div>
          <div className="wc-receipt-markup">
            <dt>Markup WACheap</dt>
            <dd>Rp0</dd>
          </div>
          <div className="wc-receipt-total">
            <dt>Total ke Meta</dt>
            <dd aria-live="polite">{rupiah(cost.total)}</dd>
          </div>
        </dl>
        <p className="wc-receipt-foot">
          Dibayar langsung ke Meta dari akun WhatsApp Business kamu.
        </p>
      </div>

      <figcaption className="wc-receipt-compare">
        {category === "marketing" ? (
          <>
            Dengan tarif {rupiah(MARKED_UP_PROMO)}/pesan, contoh harga di penyedia yang menambah
            markup, totalnya {rupiah(markedUp)}. Selisihnya {rupiah(markedUp - cost.total)} untuk
            satu kali kirim.
          </>
        ) : (
          <>
            Update pesanan dan resi ditagih sebagai pesan utilitas. Dikirim sebagai promo, totalnya{" "}
            {rupiah(asPromo)}: kamu hemat {rupiah(asPromo - cost.total)}.
          </>
        )}
      </figcaption>
    </figure>
  );
}
