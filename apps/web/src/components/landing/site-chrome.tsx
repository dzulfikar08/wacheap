import "@fontsource-variable/bricolage-grotesque";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./landing.css";

import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export const GITHUB = "https://github.com/dzulfikar08/wacheap";
/** Until WACheap has its own domain and mailbox. */
export const CONTACT_EMAIL = "dzulfikar@joyorogo.com";
export const COMPANY = "PT Joyo Digitama Solusi";
export const COMPANY_ADDRESS =
  "Vila Bukit Tidar F2 No. 009, Karangbesuki, Sukun, Kota Malang, Jawa Timur";

export function SiteChrome({ children, home = false }: { children: ReactNode; home?: boolean }) {
  return (
    <div className="wc">
      <a className="wc-skip" href="#isi">
        Langsung ke isi
      </a>
      <header className={home ? "wc-nav" : "wc-nav wc-nav-plain"}>
        <Link className="wc-wordmark" to="/">
          WACheap
        </Link>
        <nav aria-label="Utama">
          <a href="/#harga">Harga</a>
          <a href="/#cara-kerja">Cara kerja</a>
          <a href={GITHUB}>GitHub</a>
          <Link to="/login">Masuk</Link>
        </nav>
      </header>
      <main id="isi">{children}</main>
      <footer className="wc-footer">
        <p>© 2026 {COMPANY} (JoyoDigitama). Kode terbuka, AGPL-3.0.</p>
        <p className="wc-footer-links">
          <Link to="/privasi">Kebijakan privasi</Link>
          <Link to="/ketentuan">Ketentuan layanan</Link>
        </p>
        <p>
          WhatsApp adalah merek dagang Meta Platforms, Inc. WACheap tidak berafiliasi dengan Meta.
        </p>
      </footer>
    </div>
  );
}
