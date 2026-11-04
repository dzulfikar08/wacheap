import { createFileRoute, Link } from "@tanstack/react-router";

import { COMPANY, CONTACT_EMAIL, GITHUB, SiteChrome } from "@/components/landing/site-chrome";

export const Route = createFileRoute("/ketentuan")({
  component: Ketentuan,
  head: () => ({
    meta: [
      { title: "Ketentuan layanan WACheap" },
      {
        name: "description",
        content:
          "Aturan pemakaian WACheap Cloud: pesan resmi, persetujuan pembeli, biaya, dan tanggung jawab.",
      },
    ],
  }),
});

function Ketentuan() {
  return (
    <SiteChrome>
      <article className="wc-doc">
        <h1>Ketentuan layanan</h1>
        <p className="wc-doc-meta">
          Berlaku sejak 4 November 2026 untuk WACheap Cloud, yang dijalankan oleh {COMPANY}. WACheap
          masih dalam pengembangan, dan ketentuan ini bisa diperbarui sebelum peluncuran.
        </p>

        <h2>Layanan</h2>
        <p>
          WACheap menghubungkan nomor WhatsApp Business milikmu ke WhatsApp Cloud API resmi Meta
          untuk broadcast, inbox bersama, dan laporan biaya. Nomor dan akun WhatsApp Business tetap
          milikmu.
        </p>

        <h2>Pesan yang boleh dikirim</h2>
        <ul>
          <li>Kirim hanya ke pembeli yang sudah setuju menerima pesan dari tokomu.</li>
          <li>
            Patuhi WhatsApp Business Messaging Policy dan Commerce Policy dari Meta, termasuk
            larangan menjual barang yang dilarang.
          </li>
          <li>Jangan mengirim spam, penipuan, atau konten yang melanggar hukum Indonesia.</li>
        </ul>
        <p>
          Kami boleh menghentikan pengiriman atau menangguhkan akun yang melanggar aturan ini, atau
          yang membuat Meta menurunkan penilaian kualitas nomor secara berulang.
        </p>

        <h2>Biaya</h2>
        <ul>
          <li>
            Biaya pesan ditagih Meta langsung ke akun WhatsApp Business-mu sesuai tarif Meta.
            WACheap tidak menambah markup dan tidak menagih biaya pesan.
          </li>
          <li>
            Biaya WACheap Cloud dibayar di muka per nomor, bulanan atau tahunan, dan tidak
            diperpanjang otomatis. Harga tercantum di <Link to="/">halaman utama</Link>.
          </li>
          <li>
            Pembayaran yang sudah diterima tidak dikembalikan, kecuali layanan tidak bisa kami
            berikan.
          </li>
        </ul>

        <h2>Ketersediaan dan tanggung jawab</h2>
        <p>
          Kami berusaha menjaga layanan tetap berjalan, tetapi WACheap bergantung pada Meta dan
          Cloudflare, dan bisa terganggu di luar kendali kami. Layanan disediakan apa adanya. Kami
          tidak bertanggung jawab atas kerugian tidak langsung, termasuk pemblokiran nomor oleh Meta
          karena isi atau cara pengiriman pesanmu.
        </p>

        <h2>Kode terbuka</h2>
        <p>
          Kode WACheap tersedia di <a href={GITHUB}>GitHub</a> dengan lisensi AGPL-3.0. Ketentuan
          ini berlaku untuk WACheap Cloud; menjalankan kode sendiri diatur oleh lisensinya.
        </p>

        <h2>Data</h2>
        <p>
          Cara kami menyimpan dan memproses data dijelaskan di{" "}
          <Link to="/privasi">kebijakan privasi</Link>.
        </p>

        <h2>Hukum dan kontak</h2>
        <p>
          Ketentuan ini tunduk pada hukum Republik Indonesia. Pertanyaan:{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </article>
    </SiteChrome>
  );
}
