import { createFileRoute } from "@tanstack/react-router";
import {
  broadcastCost,
  CLOUD_PLAN,
  currentMetaRates,
  receiptLines,
} from "@wacheap/api/lib/pricing";
import { useEffect, useState } from "react";

import { Demo } from "@/components/landing/demo";
import { Pricing } from "@/components/landing/pricing";
import { Receipt } from "@/components/landing/receipt";
import { COMPANY, GITHUB, SiteChrome } from "@/components/landing/site-chrome";
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

const rupiah = (n: number, fractions = 0) =>
  `Rp${new Intl.NumberFormat("id-ID", { minimumFractionDigits: fractions, maximumFractionDigits: fractions }).format(n)}`;

/** The line under the headline cycles through what "cheap" means here; the full sentence is in the h1 for readers. */
const PROMISES = [
  "tanpa markup per pesan",
  "tanpa biaya per admin",
  "pakai nomor sendiri",
] as const;

function RotatingPromise() {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((n) => (n + 1) % PROMISES.length), 2800);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="wc-rotate" aria-hidden="true">
      {PROMISES.map((p, n) => (
        <span key={p} className={n === i ? "is-on" : undefined}>
          <mark>{p}</mark>
        </span>
      ))}
    </span>
  );
}

const FEATURES = [
  {
    title: "Jadwal kirim",
    text: "Pilih hari dan jam. Pengiriman diatur sesuai batas harian nomormu.",
    art: <ArtSchedule />,
    wide: false,
  },
  {
    title: "Template Meta",
    text: "Buat template, kirim ke Meta, dan lihat status persetujuannya di satu tempat.",
    art: <ArtTemplate />,
    wide: false,
  },
  {
    title: "Impor pembeli",
    text: "Unggah CSV atau XLSX. Hanya pembeli yang setuju dihubungi yang ikut masuk.",
    art: <ArtImport />,
    wide: true,
  },
  {
    title: "Inbox bersama",
    text: "Semua admin membalas dari satu inbox, dengan sisa jendela 24 jam di tiap chat.",
    art: <ArtInbox />,
    wide: true,
  },
  {
    title: "Opt-out otomatis",
    text: "Pembeli yang membalas STOP atau BERHENTI tidak akan dikirimi lagi.",
    art: <ArtStop />,
    wide: false,
  },
  {
    title: "Laporan biaya",
    text: "Lihat berapa yang ditagih Meta, per jenis pesan dan per broadcast.",
    art: <ArtCost />,
    wide: true,
  },
  {
    title: "Nomor kamu sendiri",
    text: "Hubungkan nomor WhatsApp Business milikmu. Nomor dan akunnya tetap milikmu.",
    art: <ArtNumber />,
    wide: false,
  },
] as const;

const AGENT_STEPS = [
  ["ChatGPT menulis template promo minggu ini", "create_template"],
  ["Claude menjadwalkan broadcast untuk Jumat malam", "schedule_broadcast"],
  ["Cursor mengirimnya, setelah kamu setuju", "send_broadcast"],
  ["Codex melaporkan biaya dan balasan", "get_broadcast_report"],
  ["Claude Code mengimpor pembeli baru", "import_contacts"],
] as const;

function faq() {
  const rates = currentMetaRates();
  return [
    [
      "Bagaimana nomor saya tetap aman?",
      "WACheap hanya memakai WhatsApp Cloud API resmi Meta, bukan gateway yang meniru WhatsApp Web. Nomor tetap harus mengikuti aturan Meta: kirim ke pembeli yang setuju, dan jaga kualitas pesan. WACheap akan menampilkan penilaian kualitas nomormu dan otomatis berhenti mengirim ke yang membalas STOP atau BERHENTI.",
    ],
    [
      "Kenapa tetap ada biaya per pesan?",
      "Meta menagih setiap pesan template yang dikirim lewat API resmi. Promo lebih mahal daripada update pesanan dan resi. Biaya itu ditagih Meta ke akun WhatsApp Business-mu, bukan lewat kami, jadi tidak ada selisih yang disembunyikan.",
    ],
    [
      "Bagaimana dengan AI agent saya?",
      "Semua yang bisa dilakukan di dashboard akan tersedia lewat API dan server MCP, jadi Claude, ChatGPT, atau Cursor bisa menyiapkan dan menjadwalkan broadcast. Pengiriman tetap menunggu persetujuanmu.",
    ],
    [
      "Bisa pindah dari penyedia lain?",
      "Bisa. Ekspor kontak dari penyedia lamamu (misalnya Qontak atau Wati) lalu impor ke WACheap. Tanda setuju dihubungi ikut dibawa, dan kontak tanpa tanda setuju dilewati.",
    ],
    [
      "Apa bedanya promo dan update pesanan?",
      `Promo ditagih sebagai pesan marketing, sekitar ${rupiah(rates.perMessage.marketing)} per pesan. Update pesanan dan resi ditagih sebagai pesan utilitas, sekitar ${rupiah(rates.perMessage.utility)}. Keduanya belum termasuk PPN ${Math.round(rates.vat * 100)}%.`,
    ],
    [
      "Ada uji coba gratis?",
      `Ada, ${CLOUD_PLAN.trialDays} hari untuk WACheap Cloud. Biaya pesan selama uji coba tetap ditagih Meta sesuai tarifnya.`,
    ],
    [
      "Bisa minta uang kembali?",
      "Masa aktif dibayar di muka dan tidak diperpanjang otomatis. Kalau layanan tidak bisa kami berikan, kami kembalikan sisanya. Detailnya ada di ketentuan layanan.",
    ],
    [
      "Siapa di balik WACheap?",
      `${COMPANY} (JoyoDigitama), di Malang. Kodenya terbuka di GitHub dengan lisensi AGPL-3.0, jadi kamu juga bisa menjalankannya sendiri secara gratis.`,
    ],
  ] as const;
}

function Landing() {
  const rates = currentMetaRates();
  const effective = new Date(`${rates.effectiveFrom}T00:00:00+07:00`).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });

  return (
    <SiteChrome>
      <section className="wc-hero">
        <h1>
          Broadcast WhatsApp resmi
          <span className="wc-visually-hidden">: {PROMISES.join(", ")}.</span>
          <RotatingPromise />
        </h1>
        <p className="wc-lede">
          Kamu bayar tarif resmi Meta per pesan, langsung ke Meta. Kami tidak mengambil selisih.
          Mulai {rupiah(CLOUD_PLAN.monthly)} per bulan per nomor.
        </p>
        <a className="wc-pill wc-pill-lg" href="#daftar">
          Daftar akses awal <span aria-hidden="true">→</span>
        </a>
        <p className="wc-status">
          Masih dibangun. Akses awal dibuka bertahap untuk seller pertama.
        </p>
        <Demo />
      </section>

      <section className="wc-proof" aria-labelledby="tarif">
        <p className="wc-agents">
          Semua yang kamu lihat di sini juga akan bisa dikerjakan AI agent kamu.{" "}
          <a href="#agent">Lihat caranya</a>
        </p>
        <ul className="wc-agent-names" aria-label="AI agent yang didukung">
          {["ChatGPT", "Claude", "Cursor", "Codex", "Claude Code"].map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        <h2 id="tarif" className="wc-quote">
          “Harga yang kamu lihat di Meta adalah harga yang kamu bayar. <mark>Markup kami Rp0.</mark>
          ”
        </h2>
        <div className="wc-stats">
          <div>
            <p className="wc-stat">{rupiah(rates.perMessage.marketing)}</p>
            <p>Promo, per pesan</p>
          </div>
          <div>
            <p className="wc-stat">{rupiah(rates.perMessage.utility)}</p>
            <p>Update pesanan, per pesan</p>
          </div>
          <div>
            <p className="wc-stat">Rp0</p>
            <p>Markup WACheap</p>
          </div>
        </div>
        <p className="wc-stats-note">
          Tarif Meta untuk Indonesia per {effective}, belum PPN {Math.round(rates.vat * 100)}%.{" "}
          <a href="#hitung">Hitung biaya broadcast</a>
        </p>
      </section>

      <section className="wc-section" id="fitur" aria-labelledby="fitur-judul">
        <h2 id="fitur-judul" className="wc-h2">
          Semua yang kamu butuhkan untuk broadcast WhatsApp
        </h2>
        <p className="wc-h2-sub">Yang sedang kami bangun untuk versi pertama.</p>
        <div className="wc-grid">
          <article className="wc-card wc-card-wide" id="hitung">
            <h3>Biaya pasti sebelum kirim</h3>
            <p>
              Geser jumlah pembeli. Total rupiah yang ditagih Meta muncul sebelum kamu menekan
              kirim.
            </p>
            <div className="wc-card-art">
              <Receipt />
            </div>
          </article>
          {FEATURES.map((f) => (
            <article key={f.title} className={f.wide ? "wc-card wc-card-wide" : "wc-card"}>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
              <div className="wc-card-art" aria-hidden="true">
                {f.art}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="wc-section" id="agent" aria-labelledby="agent-judul">
        <h2 id="agent-judul" className="wc-h2">
          AI agent kamu bisa mengerjakan semuanya
        </h2>
        <ul className="wc-agent-list">
          {AGENT_STEPS.map(([text, tool]) => (
            <li key={tool}>
              <span>{text}</span>
              <code>{tool}</code>
            </li>
          ))}
        </ul>
        <p className="wc-h2-sub">
          ChatGPT dan Claude akan tersambung lewat akun WACheap. Claude Code, Cursor, dan Codex
          memakai API key. Server MCP sedang dibangun.
        </p>
        <p className="wc-center">
          <a className="wc-pill wc-pill-ghost" href={GITHUB}>
            Lihat kodenya di GitHub
          </a>
        </p>
      </section>

      <section className="wc-section wc-letter" aria-labelledby="kenapa">
        <h2 id="kenapa" className="wc-h2">
          Kenapa kami membuat WACheap
        </h2>
        <div className="wc-letter-body">
          <p>
            Halo, kami JoyoDigitama, tim kecil di Malang yang membuat aplikasi untuk usaha kecil.
          </p>
          <p>
            Waktu membantu seller mengirim kabar restok dan resi ke pembeli, kami bingung dengan
            harga WhatsApp di Indonesia. Penyedia resmi menarik biaya bulanan ditambah selisih di
            tiap pesan. Gateway murah tidak memakai API resmi, dan nomornya bisa diblokir. Satuannya
            pun campur aduk: per percakapan, per pesan, sebelum atau sesudah PPN.
          </p>
          <p>
            Jadi kami membuat WACheap: hanya API resmi, biaya pesan langsung ditagih Meta ke akunmu,
            dan kalkulator yang menunjukkan rupiahnya sebelum kamu mengirim. Biaya kami satu: per
            nomor, per bulan.
          </p>
          <p>
            Kodenya terbuka. Kalau suatu hari kamu ingin menjalankannya sendiri, silakan, gratis.
          </p>
          <p className="wc-sign">JoyoDigitama</p>
        </div>
      </section>

      <section className="wc-section" id="harga" aria-labelledby="harga-judul">
        <h2 id="harga-judul" className="wc-h2">
          Semua fitur, di setiap paket
        </h2>
        <p className="wc-h2-sub">Harga naik sesuai jumlah nomor, bukan jumlah admin atau kontak.</p>
        <Pricing />
      </section>

      <section className="wc-section" id="tanya" aria-labelledby="tanya-judul">
        <h2 id="tanya-judul" className="wc-h2">
          Pertanyaan
        </h2>
        <div className="wc-faq">
          {faq().map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="wc-section wc-final" id="daftar" aria-labelledby="daftar-judul">
        <h2 id="daftar-judul" className="wc-h2">
          Bawa pembelimu. Simpan selisihnya.
        </h2>
        <p className="wc-h2-sub">
          Daftar akses awal. Kami kabari lewat email saat broadcast, inbox, dan impor siap untukmu.
        </p>
        <WaitlistForm />
      </section>
    </SiteChrome>
  );
}

/* Small drawn illustrations for the feature cards: plain HTML, no images. */

function ArtImport() {
  return (
    <div className="wc-mini">
      <p className="wc-mini-head">
        <span>pembeli-oktober.xlsx</span>
        <span className="wc-chip wc-chip-ok">1.248 masuk</span>
      </p>
      {[
        ["Sari Wulandari", "Checkout toko"],
        ["Bagus Pratama", "Chat duluan"],
        ["Nur Aini", "Formulir"],
      ].map(([n, v]) => (
        <p key={n} className="wc-mini-row">
          <span>{n}</span>
          <span>{v}</span>
        </p>
      ))}
      <p className="wc-mini-row wc-mini-muted">
        <span>37 kontak tanpa tanda setuju</span>
        <span>dilewati</span>
      </p>
    </div>
  );
}

function ArtSchedule() {
  return (
    <div className="wc-mini">
      <div className="wc-choices">
        {["Kam", "Jum", "Sab"].map((d) => (
          <span key={d} className={d === "Jum" ? "is-on" : undefined}>
            {d}
          </span>
        ))}
      </div>
      <div className="wc-choices">
        {["12.00", "19.00"].map((t) => (
          <span key={t} className={t === "19.00" ? "is-on" : undefined}>
            {t}
          </span>
        ))}
      </div>
      <p className="wc-btn-dark wc-btn-block">Jadwalkan Jumat, 19.00</p>
    </div>
  );
}

function ArtTemplate() {
  return (
    <div className="wc-mini wc-phone">
      <div className="wc-bubble">
        Pesanan #4821 sudah dikirim. Resi JNE 0128 4410 9921.
        <span className="wc-bubble-time">10.12</span>
      </div>
      <p className="wc-mini-row">
        <span>order_dikirim</span>
        <span className="wc-chip wc-chip-ok">Disetujui</span>
      </p>
    </div>
  );
}

function ArtInbox() {
  return (
    <div className="wc-mini wc-inbox-mini">
      <div>
        {[
          ["Sari", "19.04"],
          ["Bagus", "19.02"],
          ["Nur", "18.55"],
        ].map(([n, t], i) => (
          <p key={n} className={i === 0 ? "wc-mini-row is-on" : "wc-mini-row"}>
            <span>{n}</span>
            <span>{t}</span>
          </p>
        ))}
      </div>
      <div className="wc-chat">
        <span className="wc-chip wc-chip-ok">Sisa 23 jam</span>
        <div className="wc-bubble wc-bubble-in">Masih ada yang 1 kg?</div>
        <div className="wc-bubble">Ada kak, tinggal 6.</div>
      </div>
    </div>
  );
}

function ArtStop() {
  return (
    <div className="wc-mini wc-phone">
      <div className="wc-bubble wc-bubble-in">BERHENTI</div>
      <p className="wc-mini-row wc-mini-muted">
        <span>0857 •••• 9031</span>
        <span>tidak dikirimi lagi</span>
      </p>
    </div>
  );
}

function ArtCost() {
  const rows = [
    ["Promo restok, 1.248 pesan", receiptLines(broadcastCost(1248, "marketing")).total],
    ["Update resi, 500 pesan", receiptLines(broadcastCost(500, "utility")).total],
    ["Markup WACheap", 0],
  ] as const;
  return (
    <div className="wc-mini">
      {rows.map(([k, v]) => (
        <p key={k} className="wc-mini-row">
          <span>{k}</span>
          <span className="wc-mono">{rupiah(v)}</span>
        </p>
      ))}
    </div>
  );
}

function ArtNumber() {
  return (
    <div className="wc-mini">
      <p className="wc-mini-row">
        <span>+62 812 •••• 7788</span>
        <span className="wc-chip wc-chip-ok">Terhubung</span>
      </p>
      <p className="wc-mini-row wc-mini-muted">
        <span>Kualitas nomor</span>
        <span>Tinggi</span>
      </p>
    </div>
  );
}
