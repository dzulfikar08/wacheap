import { createFileRoute, Link } from "@tanstack/react-router";

import {
  COMPANY,
  COMPANY_ADDRESS,
  CONTACT_EMAIL,
  SiteChrome,
} from "@/components/landing/site-chrome";

export const Route = createFileRoute("/privasi")({
  component: Privasi,
  head: () => ({
    meta: [
      { title: "Kebijakan privasi WACheap" },
      {
        name: "description",
        content:
          "Data apa yang disimpan WACheap, untuk apa, siapa yang memprosesnya, dan cara menghapusnya.",
      },
    ],
  }),
});

const deleteMail = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Hapus data WACheap")}`;

function Privasi() {
  return (
    <SiteChrome>
      <article className="wc-doc">
        <h1>Kebijakan privasi</h1>
        <p className="wc-doc-meta">
          Berlaku sejak 4 November 2026. Layanan WACheap Cloud dijalankan oleh {COMPANY}.
        </p>

        <h2>Yang kami simpan sekarang</h2>
        <ul>
          <li>
            <strong>Daftar akses awal:</strong> email, dan kalau kamu isi, nomor WhatsApp, nama
            toko, dan tempat kamu berjualan. Dipakai hanya untuk mengabari kamu soal akses WACheap.
          </li>
          <li>
            <strong>Akun:</strong> nama, email, dan kata sandi dalam bentuk hash (bukan kata sandi
            aslinya). Untuk tiap sesi masuk kami menyimpan alamat IP dan jenis browser, supaya kamu
            bisa tetap masuk dan kami bisa mengenali penyalahgunaan.
          </li>
        </ul>

        <h2>Yang akan kami simpan saat fitur WhatsApp aktif</h2>
        <ul>
          <li>
            <strong>Sambungan ke Meta:</strong> ID akun WhatsApp Business, ID nomor telepon, dan
            token akses yang diberikan Meta saat kamu menghubungkan nomor. Token itu hanya dipakai
            untuk mengirim dan menerima pesan atas namamu.
          </li>
          <li>
            <strong>Kontak pembeli yang kamu unggah:</strong> nama, nomor WhatsApp, label, status
            persetujuan menerima pesan, dan data pesanan dari file ekspor yang kamu pilih.
          </li>
          <li>
            <strong>Pesan:</strong> isi pesan yang dikirim dan diterima lewat nomormu, serta status
            terkirim, dibaca, atau gagal dari Meta, supaya inbox dan laporan biaya bisa ditampilkan.
          </li>
          <li>
            <strong>Tagihan WACheap Cloud:</strong> paket, masa aktif, dan riwayat pembayaran. Data
            kartu atau rekening diproses oleh penyedia pembayaran, bukan disimpan oleh kami.
          </li>
        </ul>

        <h2>Data pembeli: siapa yang bertanggung jawab</h2>
        <p>
          Untuk data pembeli yang kamu unggah atau yang mengirim pesan ke nomormu, kamu adalah
          pengendali data dan WACheap adalah prosesor data, sesuai Undang-Undang Nomor 27 Tahun 2022
          tentang Pelindungan Data Pribadi. Kami memproses data itu hanya untuk menjalankan fitur
          yang kamu pakai. Kamu bertanggung jawab memastikan pembeli setuju menerima pesan, dan
          WACheap otomatis berhenti mengirim ke nomor yang membalas STOP atau BERHENTI.
        </p>

        <h2>Untuk apa data dipakai</h2>
        <ul>
          <li>Menjalankan layanan: mengirim broadcast, menampilkan inbox, dan menghitung biaya.</li>
          <li>Keamanan: mencegah spam, penyalahgunaan, dan akses tanpa izin.</li>
          <li>Menghubungi kamu soal akun, tagihan, dan perubahan layanan.</li>
        </ul>
        <p>
          Kami tidak menjual data, tidak memakainya untuk iklan, dan tidak memakai isi pesan untuk
          melatih model AI.
        </p>

        <h2>Pihak lain yang memproses data</h2>
        <ul>
          <li>Cloudflare, Inc.: server dan basis data tempat WACheap Cloud berjalan.</li>
          <li>Meta Platforms, Inc.: WhatsApp Cloud API, yang mengirim dan menerima pesanmu.</li>
          <li>Penyedia pembayaran (DOKU atau Pakasir) saat kamu membayar WACheap Cloud.</li>
        </ul>
        <p>Data bisa disimpan di server di luar Indonesia sesuai jaringan Cloudflare dan Meta.</p>

        <h2>Berapa lama disimpan</h2>
        <ul>
          <li>Daftar akses awal: sampai kamu mendapat akses atau minta dihapus.</li>
          <li>
            Akun dan datanya: selama akun aktif. Setelah akun dihapus, datanya dihapus dalam 30
            hari.
          </li>
          <li>Catatan pembayaran: sesuai kewajiban pembukuan dan pajak yang berlaku.</li>
        </ul>

        <h2 id="hapus-data">Cara menghapus data</h2>
        <p>
          Kirim email dari alamat yang kamu daftarkan ke <a href={deleteMail}>{CONTACT_EMAIL}</a>{" "}
          dengan subjek "Hapus data WACheap". Kami menghapus akun, daftar akses awal, sambungan ke
          Meta, kontak, dan pesanmu, lalu mengonfirmasi lewat email setelah selesai, paling lambat
          30 hari. Halaman ini juga petunjuk penghapusan data untuk aplikasi WACheap di Meta.
        </p>
        <p>
          Kalau kamu pembeli dari seller yang memakai WACheap, balas STOP atau BERHENTI ke nomor
          seller itu untuk berhenti menerima pesan, dan hubungi seller untuk menghapus datamu. Kamu
          juga bisa menghubungi kami di alamat di atas.
        </p>

        <h2>Kalau kamu menjalankan WACheap sendiri</h2>
        <p>
          Kode WACheap terbuka. Kalau kamu menjalankannya di akun Cloudflare sendiri, datanya ada di
          akunmu dan kebijakan ini tidak berlaku untuk instalasi itu.
        </p>

        <h2>Kontak</h2>
        <p>
          {COMPANY}, {COMPANY_ADDRESS}. Email:{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. Lihat juga{" "}
          <Link to="/ketentuan">ketentuan layanan</Link>.
        </p>
      </article>
    </SiteChrome>
  );
}
