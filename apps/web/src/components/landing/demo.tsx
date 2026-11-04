import { broadcastCost, receiptLines } from "@wacheap/api/lib/pricing";
import { useId, useState, type KeyboardEvent, type ReactNode } from "react";

import { Logo } from "./site-chrome";

const rupiah = (n: number) => `Rp${new Intl.NumberFormat("id-ID").format(n)}`;
const count = (n: number) => new Intl.NumberFormat("id-ID").format(n);

const BUYERS = 1248;
const TABS = [
  ["impor", "Impor"],
  ["template", "Template"],
  ["broadcast", "Broadcast"],
  ["inbox", "Inbox"],
] as const;
type Tab = (typeof TABS)[number][0];

const NAV: Record<Tab, string> = {
  impor: "Kontak",
  template: "Template",
  broadcast: "Broadcast",
  inbox: "Inbox",
};

/** A drawn preview of the dashboard (WACheap is still being built), one tab per step. */
export function Demo() {
  const [tab, setTab] = useState<Tab>("broadcast");
  const id = useId();

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = TABS[(i + step + TABS.length) % TABS.length]![0];
    setTab(next);
    document.getElementById(`${id}-${next}`)?.focus();
  };

  return (
    <div className="wc-demo">
      <div className="wc-tabs" role="tablist" aria-label="Tampilan WACheap">
        {TABS.map(([value, label], i) => (
          <button
            key={value}
            id={`${id}-${value}`}
            type="button"
            role="tab"
            aria-selected={tab === value}
            aria-controls={`${id}-panel`}
            tabIndex={tab === value ? 0 : -1}
            className="wc-tab"
            onClick={() => setTab(value)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        className="wc-window"
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-${tab}`}
      >
        <div className="wc-window-bar" aria-hidden="true">
          <span />
          <span />
          <span />
          <p>wacheap / {NAV[tab].toLowerCase()}</p>
        </div>
        <div className="wc-app">
          <aside className="wc-app-side" aria-hidden="true">
            <p className="wc-app-brand">
              <Logo /> WACheap
            </p>
            {["Ringkasan", "Broadcast", "Kontak", "Template", "Inbox", "Biaya", "API key"].map(
              (item) => (
                <p key={item} className={item === NAV[tab] ? "is-on" : undefined}>
                  {item}
                </p>
              ),
            )}
            <p className="wc-app-user">Toko Madu Lawang</p>
          </aside>
          <div className="wc-app-main">{PANELS[tab]()}</div>
        </div>
      </div>
      <p className="wc-demo-note">Tampilan rancangan. WACheap masih dibangun.</p>
    </div>
  );
}

function Crumbs({ here, children }: { here: string; children?: ReactNode }) {
  return (
    <div className="wc-app-top">
      <p>
        <span>{here.split(" / ")[0]}</span>
        {here.includes(" / ") ? <> › {here.split(" / ")[1]}</> : null}
      </p>
      <div className="wc-app-actions">{children}</div>
    </div>
  );
}

const PANELS: Record<Tab, () => ReactNode> = {
  impor: () => (
    <>
      <Crumbs here="Kontak / Impor">
        <span className="wc-chip">CSV / XLSX</span>
      </Crumbs>
      <div className="wc-app-body">
        <p className="wc-app-title">Impor selesai</p>
        <p className="wc-app-sub">
          {count(BUYERS)} pembeli masuk. 37 dilewati karena tidak ada tanda setuju dihubungi.
        </p>
        <table className="wc-table">
          <thead>
            <tr>
              <th>Nama</th>
              <th>Nomor</th>
              <th>Label</th>
              <th>Setuju lewat</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["Sari Wulandari", "0812 •••• 2210", "beli-madu", "Checkout toko"],
              ["Bagus Pratama", "0857 •••• 9031", "beli-madu", "Chat duluan"],
              ["Nur Aini", "0813 •••• 4478", "reseller", "Formulir"],
              ["Dimas Saputra", "0878 •••• 1205", "beli-madu", "Checkout toko"],
            ].map(([name, phone, tag, via]) => (
              <tr key={name}>
                <td>{name}</td>
                <td className="wc-mono">{phone}</td>
                <td>
                  <span className="wc-chip">{tag}</span>
                </td>
                <td>{via}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  ),
  template: () => (
    <>
      <Crumbs here="Template / restock_madu">
        <span className="wc-chip wc-chip-ok">Disetujui Meta</span>
      </Crumbs>
      <div className="wc-app-body wc-app-split">
        <div>
          <p className="wc-app-title">restock_madu</p>
          <p className="wc-app-sub">Kategori marketing, Bahasa Indonesia.</p>
          <dl className="wc-kv">
            <div>
              <dt>Isi</dt>
              <dd>Halo {"{{1}}"}, Madu Hutan 500 g sudah ada lagi…</dd>
            </div>
            <div>
              <dt>Tombol</dt>
              <dd>Pesan sekarang</dd>
            </div>
            <div>
              <dt>Berhenti</dt>
              <dd>Balas STOP atau BERHENTI</dd>
            </div>
          </dl>
        </div>
        <div className="wc-phone" aria-hidden="true">
          <p className="wc-phone-head">Toko Madu Lawang</p>
          <div className="wc-bubble">
            Halo Sari, Madu Hutan 500 g sudah ada lagi. Stok 40 botol, kirim hari ini sebelum 15.00.
            <span className="wc-bubble-time">19.00</span>
          </div>
          <p className="wc-bubble-button">Pesan sekarang</p>
        </div>
      </div>
    </>
  ),
  broadcast: () => {
    const lines = receiptLines(broadcastCost(BUYERS, "marketing"));
    return (
      <>
        <Crumbs here="Broadcast / Restock madu hutan">
          <span className="wc-chip">Draf</span>
          <span className="wc-btn-ghost">Kirim tes</span>
          <span className="wc-btn-dark">Jadwalkan</span>
        </Crumbs>
        <div className="wc-app-body">
          <div className="wc-sheet">
            <p className="wc-app-title">Jadwalkan</p>
            <p className="wc-app-sub">
              Ke {count(BUYERS)} pembeli berlabel beli-madu, 60 hari terakhir.
            </p>
            <p className="wc-field-label">Hari</p>
            <div className="wc-choices">
              {["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((d) => (
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
            <div className="wc-cost">
              <p>
                <span>Biaya ke Meta, termasuk PPN</span>
                <strong>{rupiah(lines.total)}</strong>
              </p>
              <p>
                <span>Markup WACheap</span>
                <strong>Rp0</strong>
              </p>
            </div>
            <p className="wc-btn-dark wc-btn-block">Jadwalkan Jumat, 19.00</p>
          </div>
        </div>
      </>
    );
  },
  inbox: () => (
    <>
      <Crumbs here="Inbox">
        <span className="wc-chip">3 belum dibalas</span>
      </Crumbs>
      <div className="wc-app-body wc-inbox">
        <ul className="wc-threads">
          {[
            ["Sari Wulandari", "Masih ada yang 1 kg?", "19.04", true],
            ["Bagus Pratama", "Ongkir ke Batu berapa kak?", "19.02", false],
            ["Nur Aini", "Saya ambil 10 botol ya", "18.55", false],
          ].map(([name, last, time, on]) => (
            <li key={name as string} className={on ? "is-on" : undefined}>
              <p>
                <strong>{name}</strong>
                <span>{time}</span>
              </p>
              <p>{last}</p>
            </li>
          ))}
        </ul>
        <div className="wc-chat">
          <p className="wc-chat-meta">
            <span className="wc-chip wc-chip-ok">Jendela 24 jam: sisa 23 jam</span>
            <span className="wc-chip">Ditangani: Rina</span>
          </p>
          <div className="wc-bubble wc-bubble-in">
            Masih ada yang 1 kg?<span className="wc-bubble-time">19.04</span>
          </div>
          <div className="wc-bubble">
            Ada kak, tinggal 6. Mau dikirim hari ini?<span className="wc-bubble-time">19.05</span>
          </div>
        </div>
      </div>
    </>
  ),
};
