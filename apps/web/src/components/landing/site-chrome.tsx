import "@fontsource-variable/newsreader";
import "@fontsource-variable/geist";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./landing.css";

import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { Logo } from "./logo";

export { Logo };

export const GITHUB = "https://github.com/dzulfikar08/wacheap";
/** JoyoDigitama's mailbox for WACheap support, privacy and data requests. */
export const CONTACT_EMAIL = "dzulfikar.at@joyodigitama.com";
export const COMPANY = "PT Joyo Digitama Solusi";
export const COMPANY_ADDRESS =
  "Vila Bukit Tidar F2 No. 009, Karangbesuki, Sukun, Kota Malang, Jawa Timur";

/** The small arrow after a call to action; it nudges right on hover. */
export function Arrow() {
  return (
    <svg className="wc-arrow" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5 12h14M13 6l6 6-6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SiteChrome({ children }: { children: ReactNode }) {
  return (
    <div className="wc">
      <a className="wc-skip" href="#isi">
        Langsung ke isi
      </a>
      <header className="wc-nav">
        <div className="wc-nav-inner">
          <Link className="wc-wordmark" to="/">
            <Logo />
            WACheap
          </Link>
          <nav aria-label="Utama">
            <a href="/#harga">Harga</a>
            <a href="/#fitur">Fitur</a>
            <a href="/#tanya">Bantuan</a>
            <a href={GITHUB}>GitHub</a>
            <Link to="/login">Masuk</Link>
            <a className="wc-pill wc-pill-sm" href="/#daftar">
              Daftar akses awal
            </a>
          </nav>
        </div>
      </header>
      <main id="isi">{children}</main>
      <footer className="wc-footer">
        <div className="wc-footer-inner">
          <div className="wc-footer-brand">
            <Link className="wc-wordmark" to="/">
              <Logo />
              WACheap
            </Link>
            <p>Broadcast WhatsApp resmi untuk seller online. Bayar tarif Meta, markup 0%.</p>
            <p className="wc-footer-small">
              Contoh biaya memakai tarif Meta Indonesia per pesan, ditambah PPN 11%.
            </p>
            <a className="wc-by" href="https://joyodigitama.com">
              <span className="wc-by-mark" aria-hidden="true">
                JD
              </span>
              Oleh <strong>JoyoDigitama</strong>
              <span aria-hidden="true">↗</span>
            </a>
          </div>
          <div>
            <p className="wc-footer-head">Produk</p>
            <a href="/#harga">Harga</a>
            <a href="/#hitung">Kalkulator biaya</a>
            <a href="/#agent">API dan AI agent</a>
            <a href={GITHUB}>Kode terbuka</a>
            <a href={`${GITHUB}#readme`}>Self-host</a>
          </div>
          <div>
            <p className="wc-footer-head">Legal</p>
            <Link to="/ketentuan">Ketentuan layanan</Link>
            <Link to="/privasi">Kebijakan privasi</Link>
            <a href="/privasi#hapus-data">Hapus data</a>
          </div>
          <div>
            <p className="wc-footer-head">Kontak</p>
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </div>
        </div>
        <div className="wc-footer-inner wc-footer-legal">
          <p>
            © 2026 {COMPANY}, {COMPANY_ADDRESS}. Kode terbuka dengan lisensi AGPL-3.0.
          </p>
          <p>
            WhatsApp adalah merek dagang Meta Platforms, Inc. WACheap tidak berafiliasi dengan Meta.
          </p>
        </div>
      </footer>
    </div>
  );
}
