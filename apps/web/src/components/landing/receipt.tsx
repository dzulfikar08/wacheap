import {
  broadcastCost,
  currentMetaRates,
  EXAMPLE_RESELLER_MARKUP,
  receiptLines,
  type MessageCategory,
} from "@wacheap/api/lib/pricing";
import { useEffect, useId, useRef, useState } from "react";

const rupiah = (n: number, fractions = 0) =>
  `Rp${new Intl.NumberFormat("id-ID", { minimumFractionDigits: fractions, maximumFractionDigits: fractions }).format(n)}`;
const count = (n: number) => new Intl.NumberFormat("id-ID").format(n);

const MIN = 50;
const MAX = 10_000;
const STEP = 50;
const clamp = (n: number) => Math.min(MAX, Math.max(MIN, Math.round(n)));

const CATEGORIES = [
  ["marketing", "Promo"],
  ["utility", "Update pesanan & resi"],
] as const;

export function Receipt() {
  const [buyers, setBuyers] = useState(1000);
  // What's in the number field while typing; committed (clamped) on blur or Enter.
  const [draft, setDraft] = useState("1000");
  const [category, setCategory] = useState<MessageCategory>("marketing");
  const [announcement, setAnnouncement] = useState("");
  const numberId = useId();
  const hintId = useId();

  const card = currentMetaRates();
  const cost = broadcastCost(buyers, category, card);
  const lines = receiptLines(cost);
  const promoTotal = receiptLines(broadcastCost(buyers, "marketing", card)).total;
  const resellerTotal = Math.round(promoTotal * (1 + EXAMPLE_RESELLER_MARKUP));
  const effective = new Date(`${card.effectiveFrom}T00:00:00+07:00`).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
  const label = category === "marketing" ? "pesan promo" : "update pesanan";

  // One sentence for screen readers once the value settles, not a bare number on every slider step, and nothing on
  // page load (the visitor hasn't changed anything yet).
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const t = setTimeout(
      () =>
        setAnnouncement(`Total ke Meta untuk ${count(buyers)} ${label}: ${rupiah(lines.total)}.`),
      700,
    );
    return () => clearTimeout(t);
  }, [buyers, label, lines.total]);

  const commit = (value: string) => {
    const n = Number(value);
    const next = Number.isFinite(n) && value.trim() !== "" ? clamp(n) : buyers;
    setBuyers(next);
    setDraft(String(next));
  };

  return (
    <figure className="wc-receipt" aria-label="Kalkulator biaya broadcast">
      <div className="wc-receipt-controls">
        <div className="wc-segment" role="group" aria-label="Jenis pesan">
          {CATEGORIES.map(([value, text]) => (
            <button
              key={value}
              type="button"
              aria-pressed={category === value}
              className="wc-segment-option"
              onClick={() => setCategory(value)}
            >
              {text}
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
            step={STEP}
            aria-describedby={hintId}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit(e.currentTarget.value);
            }}
          />
          <span id={hintId} className="wc-visually-hidden">
            Antara {count(MIN)} dan {count(MAX)} pembeli.
          </span>
        </div>
        <input
          aria-label="Jumlah pembeli"
          className="wc-slider"
          type="range"
          min={MIN}
          max={MAX}
          step={STEP}
          value={buyers}
          onChange={(e) => {
            const n = Number(e.target.value);
            setBuyers(n);
            setDraft(String(n));
          }}
        />
      </div>

      <div className="wc-receipt-shadow">
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
              <dd>{count(buyers)}</dd>
            </div>
            <div>
              <dt>Subtotal</dt>
              <dd>{rupiah(lines.subtotal)}</dd>
            </div>
            <div>
              <dt>PPN {Math.round(card.vat * 100)}%</dt>
              <dd>{rupiah(lines.vat)}</dd>
            </div>
            <div className="wc-receipt-markup">
              <dt>Markup WACheap</dt>
              <dd>Rp0</dd>
            </div>
            <div className="wc-receipt-total">
              <dt>Total ke Meta</dt>
              <dd>{rupiah(lines.total)}</dd>
            </div>
          </dl>
          <p className="wc-receipt-foot">
            Dibayar langsung ke Meta dari akun WhatsApp Business kamu.
          </p>
        </div>
      </div>
      <p className="wc-visually-hidden" role="status">
        {announcement}
      </p>

      <figcaption className="wc-receipt-compare">
        {category === "marketing" ? (
          <>
            Kalau penyedia menjual ulang pesan dengan markup sekitar{" "}
            {Math.round(EXAMPLE_RESELLER_MARKUP * 100)}%, totalnya sekitar {rupiah(resellerTotal)}.
            Selisihnya {rupiah(resellerTotal - lines.total)} untuk satu kali kirim.
          </>
        ) : (
          <>
            Update pesanan dan resi ditagih sebagai pesan utilitas. Dikirim sebagai promo, totalnya{" "}
            {rupiah(promoTotal)}: kamu hemat {rupiah(promoTotal - lines.total)}.
          </>
        )}
      </figcaption>
    </figure>
  );
}
