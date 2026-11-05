import { createFileRoute } from "@tanstack/react-router";
import {
  broadcastCost,
  CLOUD_PLAN,
  currentMetaRates,
  receiptLines,
} from "@wacheap/api/lib/pricing";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import { AGENT_MARKS, BrandTile, FileTile, SOURCE_MARKS } from "@/components/landing/brand-marks";
import { Demo } from "@/components/landing/demo";
import { Pricing } from "@/components/landing/pricing";
import { Receipt } from "@/components/landing/receipt";
import { Arrow, COMPANY, GITHUB, Logo, SiteChrome } from "@/components/landing/site-chrome";
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

/** Staggered entrance for the hero, as in the original: each block 80 ms after the one before. */
const stagger = (n: number) => ({ "--stagger": n }) as CSSProperties;

/** The line under the headline cycles through what "cheap" means here; the full sentence is in the h1 for readers. */
const PROMISES = [
  ["tanpa markup", "per pesan"],
  ["tanpa biaya", "per admin"],
  ["pakai nomor", "sendiri"],
] as const;

function RotatingPromise() {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // One pass through the promises, then rest on the first: nothing keeps moving on its own.
    let steps = 0;
    const t = setInterval(() => {
      steps += 1;
      setI(steps % PROMISES.length);
      if (steps >= PROMISES.length) clearInterval(t);
    }, 3000);
    return () => clearInterval(t);
  }, []);
  const prev = (i + PROMISES.length - 1) % PROMISES.length;
  return (
    <span className="wc-rotate" aria-hidden="true">
      {PROMISES.map(([hl, rest], n) => (
        <span key={hl} className={n === i ? "is-on" : n === prev ? "is-off" : undefined}>
          <mark>{hl}</mark> {rest}
        </span>
      ))}
    </span>
  );
}

type Span = 2 | 3 | 4;

/** Six-column bento, as on the original: rows of 4+2, 2+4, 4+2 and 3+3. */
const FEATURES: readonly { title: string; text: string; art: ReactNode; span: Span }[] = [
  {
    title: "Jadwal kirim",
    text: "Pilih hari dan jam. Pengiriman diatur sesuai batas harian nomormu.",
    art: <ArtSchedule />,
    span: 2,
  },
  {
    title: "Template Meta",
    text: "Buat template, kirim ke Meta, dan lihat status persetujuannya di satu tempat.",
    art: <ArtTemplate />,
    span: 2,
  },
  {
    title: "Inbox bersama",
    text: "Semua admin membalas dari satu inbox, dengan sisa jendela 24 jam di tiap chat.",
    art: <ArtInbox />,
    span: 4,
  },
  {
    title: "Laporan biaya",
    text: "Lihat berapa yang ditagih Meta, per jenis pesan dan per broadcast.",
    art: <ArtCost />,
    span: 4,
  },
  {
    title: "Impor pembeli",
    text: "Ekspor daftar pembeli yang sudah setuju dihubungi dari Google Sheets atau Excel, lalu unggah sebagai CSV atau XLSX.",
    art: <ArtImport />,
    span: 2,
  },
  {
    title: "Opt-out otomatis",
    text: "Pembeli yang membalas STOP atau BERHENTI tidak akan dikirimi lagi.",
    art: <ArtStop />,
    span: 3,
  },
  {
    title: "Nomor kamu sendiri",
    text: "Hubungkan nomor WhatsApp Business milikmu. Nomor dan akunnya tetap milikmu.",
    art: <ArtNumber />,
    span: 3,
  },
];

const AGENT_STEPS = [
  [AGENT_MARKS.chatgpt, "ChatGPT menulis pesan broadcast berikutnya", "create_broadcast"],
  [AGENT_MARKS.claude, "Claude menjadwalkannya hari Minggu", "schedule_broadcast"],
  [AGENT_MARKS.cursor, "Cursor mengirimnya setelah kamu bilang ya", "send_broadcast"],
  [AGENT_MARKS.codex, "Codex melaporkan hasilnya", "get_broadcast_report"],
  [AGENT_MARKS.grok, "Grok mengimpor kontak kamu", "import_contacts"],
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
      "Semua yang bisa dilakukan di dashboard akan tersedia lewat API dan server MCP, jadi Claude, ChatGPT, atau Cursor bisa menyiapkan dan menjadwalkan broadcast. Pengiriman tetap menunggu persetujuanmu. API dan server MCP-nya masih dibangun.",
    ],
    [
      "Bisa pindah dari penyedia lain?",
      "Akan bisa. Kamu akan bisa mengekspor kontak dari penyedia lamamu (misalnya Qontak atau Wati) lalu mengimpornya ke WACheap. Tanda setuju dihubungi ikut dibawa, dan kontak tanpa tanda setuju dilewati.",
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
  const [agentsPaused, setAgentsPaused] = useState(false);
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
        <div className="wc-dots" aria-hidden="true" />
        <h1 className="wc-enter">
          Broadcast WhatsApp resmi
          <span className="wc-visually-hidden">
            : {PROMISES.map((p) => p.join(" ")).join(", ")}.
          </span>
          <RotatingPromise />
        </h1>
        <p className="wc-lede wc-enter" style={stagger(1)}>
          Kamu bayar tarif resmi Meta per pesan, langsung ke Meta. Kami tidak mengambil selisih.
          Mulai {rupiah(CLOUD_PLAN.monthly)} per bulan per nomor.
        </p>
        <div className="wc-enter" style={stagger(2)}>
          <a className="wc-pill wc-pill-lg" href="#daftar">
            Daftar akses awal <Arrow />
          </a>
          <p className="wc-status">
            Masih dibangun. Akses awal dibuka bertahap untuk seller pertama.
          </p>
        </div>
        <div className="wc-enter wc-hero-demo" style={stagger(3)}>
          <Demo />
        </div>
        <div className="wc-hero-agents wc-enter" style={stagger(4)}>
          <p>
            Semua yang kamu lihat di sini juga akan bisa dikerjakan AI agent kamu.{" "}
            <a href="#agent">Lihat caranya</a>
          </p>
          <ul aria-label="AI agent yang akan didukung">
            {Object.values(AGENT_MARKS).map((m) => (
              <li key={m.name} title={m.name}>
                <BrandTile mark={m} />
                <span className="wc-visually-hidden">{m.name}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="wc-proof" aria-labelledby="tarif">
        <h2 id="tarif" className="wc-quote">
          “Harga yang kamu lihat di Meta adalah harga yang kamu bayar. <mark>Markup kami Rp0</mark>
          .”
        </h2>
        <p className="wc-quote-by">
          <span className="wc-quote-logo">
            <Logo />
          </span>
          Janji WACheap, untuk setiap paket
        </p>
        <dl className="wc-stats">
          <div>
            <dt>Promo, per pesan</dt>
            <dd>{rupiah(rates.perMessage.marketing)}</dd>
          </div>
          <div>
            <dt>Update pesanan, per pesan</dt>
            <dd>{rupiah(rates.perMessage.utility)}</dd>
          </div>
          <div>
            <dt>Markup WACheap</dt>
            <dd>Rp0</dd>
          </div>
        </dl>
        <p className="wc-stats-note">
          Tarif Meta untuk Indonesia per {effective}, belum PPN {Math.round(rates.vat * 100)}%.{" "}
          <a href="#hitung">Hitung biaya broadcast</a>
        </p>
      </section>

      <section className="wc-section" id="fitur" aria-labelledby="fitur-judul">
        <header className="wc-head">
          <h2 id="fitur-judul" className="wc-h2">
            Semua yang kamu butuhkan untuk broadcast WhatsApp
          </h2>
          <p className="wc-h2-sub">Yang sedang kami bangun untuk versi pertama.</p>
        </header>
        <div className="wc-grid">
          <article className="wc-card wc-span-4" id="hitung">
            <div className="wc-card-head">
              <h3>Biaya pasti sebelum kirim</h3>
              <p>
                Geser jumlah pembeli. Total rupiah yang ditagih Meta muncul sebelum kamu menekan
                kirim.
              </p>
            </div>
            <div className="wc-card-art">
              <Receipt />
            </div>
          </article>
          {FEATURES.map((f) => (
            <article key={f.title} className={`wc-card wc-span-${f.span}`}>
              <div className="wc-card-head">
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </div>
              <div className="wc-card-art" aria-hidden="true">
                {f.art}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="wc-agents-band" id="agent" aria-labelledby="agent-judul">
        <div className={agentsPaused ? "wc-agents-panel is-paused" : "wc-agents-panel"}>
          <button
            type="button"
            className="wc-agents-pause"
            aria-pressed={agentsPaused}
            onClick={() => setAgentsPaused((p) => !p)}
          >
            {agentsPaused ? "Putar animasi" : "Jeda animasi"}
          </button>
          <div className="wc-dots wc-dots-dark" aria-hidden="true" />
          <p className="wc-soon">Sedang dibangun</p>
          <h2 id="agent-judul" className="wc-h2">
            AI agent kamu akan bisa mengerjakan semua yang kamu bisa
          </h2>
          <ul className="wc-agent-tiles" aria-hidden="true">
            {AGENT_STEPS.map(([mark], n) => (
              <li key={mark.name} style={{ "--cycle": n } as CSSProperties}>
                <BrandTile mark={mark} size="3.5rem" />
              </li>
            ))}
          </ul>
          <ul className="wc-agent-cycle">
            {AGENT_STEPS.map(([, text, tool], n) => (
              <li key={tool} style={{ "--cycle": n } as CSSProperties}>
                <p>{text}</p>
                <code>{tool}</code>
              </li>
            ))}
          </ul>
          <p className="wc-agents-note">
            Rencananya, ChatGPT, Claude, dan Grok tersambung lewat akun WACheap, sedangkan Claude
            Code, Cursor, dan Codex memakai API key. API dan server MCP-nya belum ada: semuanya
            masih kami bangun, dan pengiriman selalu menunggu persetujuanmu.
          </p>
          <div className="wc-agents-links">
            <a href={GITHUB}>
              Lihat kodenya di GitHub <Arrow />
            </a>
            <a href="#tanya">
              Pertanyaan soal AI agent <Arrow />
            </a>
            <a href="#daftar">
              Daftar akses awal <Arrow />
            </a>
          </div>
        </div>
      </section>

      <section className="wc-section wc-letter" id="kenapa-kami" aria-labelledby="kenapa">
        <article className="wc-letter-body">
          <h2 id="kenapa" className="wc-h2">
            Kenapa kami membuat WACheap
          </h2>
          <p>
            Halo, kami <strong>JoyoDigitama</strong>, tim kecil di Malang yang membuat aplikasi
            untuk usaha kecil.
          </p>
          <p>
            Waktu membantu seller mengirim kabar restok dan resi ke pembeli, kami bingung dengan
            harga WhatsApp di Indonesia. Penyedia resmi menarik biaya bulanan ditambah selisih di
            tiap pesan. Gateway murah tidak memakai API resmi, dan nomornya bisa diblokir. Satuannya
            pun campur aduk: per percakapan, per pesan, sebelum atau sesudah PPN.
          </p>
          <p>Jadi kami membuat WACheap dengan tiga hal:</p>
          <ol>
            <li>
              <strong>Murah dan jelas.</strong> Hanya API resmi, biaya pesan langsung ditagih Meta
              ke akunmu, dan kalkulator yang menunjukkan rupiahnya sebelum kamu mengirim. Biaya kami
              satu: per nomor, per bulan.
            </li>
            <li>
              <strong>Kode terbuka.</strong> Baca kodenya di <a href={GITHUB}>GitHub</a>. Kalau
              suatu hari kamu ingin menjalankannya sendiri, silakan, gratis.
            </li>
            <li>
              <strong>Siap untuk AI agent.</strong> Semua yang bisa kamu lakukan di dashboard akan
              bisa dilakukan juga oleh AI agent kamu.
            </li>
          </ol>
          <p className="wc-byline">
            <span className="wc-quote-logo">
              <Logo />
            </span>
            Dibangun oleh Dzulfikar, JoyoDigitama
          </p>
        </article>
      </section>

      <section className="wc-section" id="harga" aria-labelledby="harga-judul">
        <header className="wc-head">
          <h2 id="harga-judul" className="wc-h2">
            Semua fitur, di setiap paket
          </h2>
          <p className="wc-h2-sub">
            Harga naik sesuai jumlah nomor, bukan jumlah admin atau kontak.
          </p>
        </header>
        <Pricing />
      </section>

      <section className="wc-section wc-faq-wrap" id="tanya" aria-labelledby="tanya-judul">
        <header>
          <h2 id="tanya-judul" className="wc-h2">
            Pertanyaan
          </h2>
        </header>
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
        <div className="wc-final-marks" aria-hidden="true">
          <span className="wc-final-stack">
            {SOURCE_MARKS.map((m) => (
              <BrandTile key={m.name} mark={m} size="2.5rem" />
            ))}
            <FileTile size="2.5rem" label="XLSX" />
            <FileTile size="2.5rem" label="CSV" />
          </span>
          <span className="wc-final-line" />
          <span className="wc-final-logo">
            <Logo />
          </span>
        </div>
        <h2 id="daftar-judul" className="wc-final-h2">
          Bawa pembelimu. <br />
          Simpan selisihnya.
        </h2>
        <p className="wc-final-sub">
          Unggah daftar pembelimu dari Google Sheets, Excel, atau CSV. <br className="wc-br-wide" />
          Daftar akses awal, kami kabari lewat email saat semuanya siap.
        </p>
        <WaitlistForm />
      </section>
    </SiteChrome>
  );
}

/* Small drawn illustrations for the feature cards: plain HTML, no screenshots. */

function ArtImport() {
  return (
    <div className="wc-import">
      <div className="wc-import-sources">
        {SOURCE_MARKS.map((m) => (
          <span key={m.name} className="wc-source">
            <BrandTile mark={m} size="1.25rem" />
            {m.name}
          </span>
        ))}
      </div>
      <div className="wc-mini">
        <p className="wc-mini-head">
          <FileTile size="2rem" label="XLSX" />
          <span className="wc-file">
            pembeli-oktober.xlsx
            <span>1.285 baris</span>
          </span>
          <span className="wc-chip wc-chip-ok">Selesai</span>
        </p>
        <span className="wc-progress">
          <span style={{ width: `${(1248 / 1285) * 100}%` }} />
        </span>
        <p className="wc-mini-row wc-mini-plain">
          <strong>1.248 masuk</strong>
          <span className="wc-mini-muted">37 tanpa tanda setuju, dilewati</span>
        </p>
      </div>
    </div>
  );
}

function ArtSchedule() {
  return (
    <div className="wc-mini">
      <p className="wc-field-label">Hari</p>
      <div className="wc-choices">
        {["Kam", "Jum", "Sab", "Min"].map((d) => (
          <span key={d} className={d === "Jum" ? "is-on" : undefined}>
            {d}
          </span>
        ))}
      </div>
      <p className="wc-field-label">Jam</p>
      <div className="wc-choices">
        {["12.00", "19.00", "20.00"].map((t) => (
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
    <div className="wc-mini wc-mini-wide">
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
