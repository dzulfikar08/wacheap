import "@fontsource-variable/bricolage-grotesque";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@/components/landing/landing.css";

import { createFileRoute, Link } from "@tanstack/react-router";
import { CLOUD_PLAN } from "@wacheap/api/lib/pricing";

import { Receipt } from "@/components/landing/receipt";
import { WaitlistForm } from "@/components/landing/waitlist-form";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "WACheap: broadcast WhatsApp resmi, bayar tarif Meta tanpa markup" },
      {
        name: "description",
        content:
          "Broadcast dan inbox WhatsApp resmi untuk seller online. Pakai nomor sendiri, biaya pesan langsung ke Meta, markup 0%, admin tanpa batas. Open source.",
      },
    ],
  }),
});

const GITHUB = "https://github.com/dzulfikar08/wacheap";
const rupiah = (n: number) => `Rp${new Intl.NumberFormat("id-ID").format(n)}`;

function Landing() {
  return (
    <div className="wc">
      <a className="wc-skip" href="#isi">
        Langsung ke isi
      </a>
      <header className="wc-nav">
        <a className="wc-wordmark" href="/">
          WACheap
        </a>
        <nav aria-label="Utama">
          <a href="#harga">Harga</a>
          <a href="#cara-kerja">Cara kerja</a>
          <a href={GITHUB}>GitHub</a>
          <Link to="/login">Masuk</Link>
        </nav>
      </header>

      <main id="isi">
        <section className="wc-hero">
          <div className="wc-hero-copy">
            <h1>Broadcast WhatsApp resmi. Bayar tarif Meta, tanpa markup.</h1>
            <p className="wc-lede">
              Untuk seller marketplace, Instagram, dan TikTok Shop. Pakai nomor kamu sendiri lewat
              API resmi Meta. Biaya tiap pesan ditagih Meta langsung ke akun kamu, jadi kami tidak
              mengambil selisih.
            </p>
            <div className="wc-actions">
              <a className="wc-button" href="#daftar">
                Daftar akses awal
              </a>
              <a className="wc-link" href={GITHUB}>
                Lihat kodenya di GitHub
              </a>
            </div>
            <p className="wc-status">
              Masih dibangun. Akses awal dibuka bertahap untuk beberapa seller pertama.
            </p>
          </div>
          <Receipt />
        </section>

        <section className="wc-section" aria-labelledby="kenapa">
          <h2 id="kenapa">Kenapa harus yang resmi</h2>
          <div className="wc-facts">
            <div>
              <h3>Nomor kamu tidak berisiko diblokir</h3>
              <p>
                Gateway tidak resmi meniru WhatsApp Web, dan Meta bisa memblokir nomor yang
                memakainya. WACheap hanya memakai WhatsApp Cloud API resmi.
              </p>
            </div>
            <div>
              <h3>Tagihan pesan tidak lewat kami</h3>
              <p>
                Kartu kamu terpasang di Meta Business. Kami tidak menjual ulang pesan, jadi tidak
                ada selisih yang disembunyikan di tarif.
              </p>
            </div>
            <div>
              <h3>Semua admin masuk, tanpa biaya per orang</h3>
              <p>
                Inbox bersama untuk seluruh tim, dengan penanda jendela 24 jam dan pembagian chat ke
                tiap admin.
              </p>
            </div>
          </div>
        </section>

        <section className="wc-section" id="cara-kerja" aria-labelledby="cara-kerja-judul">
          <h2 id="cara-kerja-judul">Cara kerja</h2>
          <ol className="wc-steps">
            <li>
              <h3>Hubungkan nomor</h3>
              <p>
                Sambungkan nomor WhatsApp Business kamu lewat pendaftaran Meta, lalu pasang kartu di
                Meta Business.
              </p>
            </li>
            <li>
              <h3>Impor pembeli</h3>
              <p>
                Unggah ekspor pesanan dari Shopee, Tokopedia, atau TikTok Shop (CSV atau XLSX).
                Pembeli yang membalas STOP atau BERHENTI otomatis tidak dikirimi lagi.
              </p>
            </li>
            <li>
              <h3>Kirim dengan biaya pasti</h3>
              <p>
                Pilih template dan kelompok pembeli, misalnya yang membeli madu dalam 60 hari
                terakhir. Lihat total rupiahnya sebelum menjadwalkan.
              </p>
            </li>
          </ol>
        </section>

        <section className="wc-section" id="harga" aria-labelledby="harga-judul">
          <h2 id="harga-judul">Harga</h2>
          <div className="wc-plans">
            <div className="wc-plan">
              <h3>Cloud</h3>
              <p className="wc-price">
                {rupiah(CLOUD_PLAN.monthly)}
                <span> per bulan per nomor</span>
              </p>
              <ul>
                <li>Atau {rupiah(CLOUD_PLAN.yearly)} per tahun, setara 2 bulan gratis</li>
                <li>Coba {CLOUD_PLAN.trialDays} hari</li>
                <li>Admin tanpa batas</li>
                <li>Biaya pesan dibayar langsung ke Meta, markup 0%</li>
              </ul>
            </div>
            <div className="wc-plan">
              <h3>Self-host</h3>
              <p className="wc-price">
                Gratis<span> selamanya</span>
              </p>
              <ul>
                <li>Kode terbuka dengan lisensi AGPL-3.0</li>
                <li>Jalankan di akun Cloudflare kamu sendiri</li>
                <li>Fitur sama dengan Cloud</li>
              </ul>
            </div>
          </div>
          <p className="wc-note">Harga awal, bisa berubah sebelum peluncuran.</p>
        </section>

        <section className="wc-section wc-signup" id="daftar" aria-labelledby="daftar-judul">
          <div>
            <h2 id="daftar-judul">Daftar akses awal</h2>
            <p>
              Kami sedang menyiapkan broadcast, inbox, dan impor pembeli. Tinggalkan email, kami
              kabari saat akses kamu siap.
            </p>
          </div>
          <WaitlistForm />
        </section>

        <section className="wc-section" aria-labelledby="tanya">
          <h2 id="tanya">Pertanyaan</h2>
          <div className="wc-faq">
            <details>
              <summary>Kenapa tetap ada biaya per pesan?</summary>
              <p>
                Meta menagih setiap pesan template yang dikirim lewat API resmi. Tarifnya berbeda
                per jenis: promo lebih mahal daripada update pesanan dan resi. Biaya itu ditagih
                Meta ke akun kamu, bukan ke kami.
              </p>
            </details>
            <details>
              <summary>Apa bedanya dengan gateway WhatsApp yang murah?</summary>
              <p>
                Gateway murah umumnya tidak memakai API resmi Meta, jadi nomornya bisa diblokir.
                WACheap memakai API resmi, dan kamu tetap membayar tarif Meta yang sama tanpa
                tambahan.
              </p>
            </details>
            <details>
              <summary>Sudah bisa dipakai?</summary>
              <p>
                Belum. Kami sedang membangunnya dan membuka akses awal bertahap. Daftar di atas
                untuk dikabari.
              </p>
            </details>
            <details>
              <summary>Kodenya benar-benar terbuka?</summary>
              <p>
                Ya, dengan lisensi AGPL-3.0 di <a href={GITHUB}>GitHub</a>. Kamu boleh
                menjalankannya sendiri secara gratis.
              </p>
            </details>
          </div>
        </section>
      </main>

      <footer className="wc-footer">
        <p>© 2026 JoyoDigitama. Kode terbuka, AGPL-3.0.</p>
        <p>
          WhatsApp adalah merek dagang Meta Platforms, Inc. WACheap tidak berafiliasi dengan Meta.
        </p>
      </footer>
    </div>
  );
}
