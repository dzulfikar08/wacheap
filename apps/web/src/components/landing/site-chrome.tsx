import "@fontsource-variable/newsreader";
import "@fontsource-variable/geist";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./landing.css";

import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export const GITHUB = "https://github.com/dzulfikar08/wacheap";
/** JoyoDigitama's mailbox for WACheap support, privacy and data requests. */
export const CONTACT_EMAIL = "dzulfikar.at@joyodigitama.com";
export const COMPANY = "PT Joyo Digitama Solusi";
export const COMPANY_ADDRESS =
  "Vila Bukit Tidar F2 No. 009, Karangbesuki, Sukun, Kota Malang, Jawa Timur";

export function Logo() {
  return (
    <svg className="wc-logo" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3Z" fill="currentColor" />
      <path
        d="M8.5 12.2h7M8.5 9.2h7M8.5 15.2h4"
        stroke="var(--wc-bg)"
        strokeWidth="1.6"
        strokeLinecap="round"
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
