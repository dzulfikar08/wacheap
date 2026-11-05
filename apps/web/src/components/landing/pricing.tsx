import { CLOUD_PLAN, EXAMPLE_RESELLER_MARKUP } from "@wacheap/api/lib/pricing";
import { useId, useState } from "react";

import { Arrow, CONTACT_EMAIL } from "./site-chrome";

const rupiah = (n: number) => `Rp${new Intl.NumberFormat("id-ID").format(n)}`;
const short = (n: number) =>
  n >= 1_000_000
    ? `Rp${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(n / 1_000_000)} jt`
    : `Rp${Math.round(n / 1000)}rb`;

const STEPS = [1, 2, 3, 5, 10] as const;
const INCLUDED = [
  "Broadcast terjadwal",
  "Inbox bersama",
  "Admin tanpa batas",
  "Template Meta",
  "Impor kontak",
  "Opt-out otomatis",
  "Laporan biaya",
  "API dan AI agent",
];
const MARKUP_PCT = Math.round(EXAMPLE_RESELLER_MARKUP * 100);

function Check() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5 12.5 10 17 19 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Pricing() {
  const [index, setIndex] = useState(0);
  const [yearly, setYearly] = useState(false);
  const sliderId = useId();
  const numbers = STEPS[index]!;
  const perNumber = yearly ? CLOUD_PLAN.yearly : CLOUD_PLAN.monthly;
  const total = numbers * perNumber;
  const max = STEPS[STEPS.length - 1]! * perNumber;

  return (
    <>
      <div className="wc-price-card">
        <div className="wc-price-left">
          <div className="wc-price-row">
            <label htmlFor={sliderId}>Nomor WhatsApp</label>
            <div className="wc-toggle" role="group" aria-label="Periode tagihan">
              <button type="button" aria-pressed={!yearly} onClick={() => setYearly(false)}>
                Bulanan
              </button>
              <button type="button" aria-pressed={yearly} onClick={() => setYearly(true)}>
                Tahunan <span className="wc-free">2 bulan gratis</span>
              </button>
            </div>
          </div>
          <p className="wc-price-big">{numbers}</p>
          <p className="wc-price-caption">nomor, dengan admin dan kontak tanpa batas</p>
          <div className="wc-bars" aria-hidden="true">
            {STEPS.map((n, i) => (
              <button
                key={n}
                type="button"
                tabIndex={-1}
                className={i === index ? "is-on" : undefined}
                style={{ height: `${28 + (72 * n * perNumber) / max}%` }}
                onClick={() => setIndex(i)}
              >
                {short(n * perNumber)}
              </button>
            ))}
          </div>
          <input
            id={sliderId}
            className="wc-range"
            type="range"
            min={0}
            max={STEPS.length - 1}
            step={1}
            value={index}
            aria-valuetext={`${numbers} nomor`}
            onChange={(e) => setIndex(Number(e.target.value))}
          />
          <div className="wc-range-labels" aria-hidden="true">
            {STEPS.map((n) => (
              <span key={n}>{n}</span>
            ))}
          </div>
        </div>

        <div className="wc-price-right">
          <p className="wc-price-plan">
            Cloud
            <span className="wc-chip">
              {rupiah(perNumber)} per nomor{yearly ? " per tahun" : " per bulan"}
            </span>
          </p>
          <p className="wc-price-total">
            {rupiah(total)}
            <span>/{yearly ? "tahun" : "bulan"}</span>
          </p>
          <p className="wc-price-billed">
            {yearly ? "Dibayar per tahun" : "Dibayar per bulan"}, coba gratis {CLOUD_PLAN.trialDays}{" "}
            hari
          </p>
          <p className="wc-price-includes">Termasuk saat peluncuran</p>
          <ul className="wc-checks">
            {INCLUDED.map((item) => (
              <li key={item}>
                <Check />
                {item}
              </li>
            ))}
          </ul>
          <div className="wc-price-cta">
            <a className="wc-pill wc-pill-lg wc-pill-block" href="#daftar">
              Daftar akses awal <Arrow />
            </a>
            <p className="wc-compare">
              Tanpa markup {MARKUP_PCT}% per pesan seperti{" "}
              <span className="wc-compare-mark">contoh reseller</span>
              <span aria-hidden="true">*</span>
              <span className="wc-visually-hidden"> (ilustrasi, lihat catatan di bawah)</span>
            </p>
            <p className="wc-price-foot">
              *Ilustrasi penyedia yang menjual ulang pesan promo sekitar {MARKUP_PCT}% di atas tarif
              Meta, bukan harga penyedia tertentu. Biaya pesan dibayar langsung ke Meta dari akun
              WhatsApp Business kamu. Self-host gratis dengan lisensi AGPL-3.0.
            </p>
          </div>
        </div>
      </div>
      <p className="wc-price-more">
        Butuh lebih dari {STEPS[STEPS.length - 1]} nomor?{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>Email kami</a>
      </p>
    </>
  );
}
