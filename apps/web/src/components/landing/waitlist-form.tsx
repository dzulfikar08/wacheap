import { useMutation } from "@tanstack/react-query";
import { useId, useState } from "react";

import { orpc } from "@/utils/orpc";

const CHANNELS = [
  ["", "Pilih (opsional)"],
  ["marketplace", "Shopee, Tokopedia, atau marketplace lain"],
  ["instagram", "Instagram"],
  ["tiktok", "TikTok Shop"],
  ["website", "Website sendiri"],
  ["other", "Lainnya"],
] as const;

type Channel = Exclude<(typeof CHANNELS)[number][0], "">;

export function WaitlistForm() {
  const id = useId();
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [shop, setShop] = useState("");
  const [channel, setChannel] = useState<Channel | "">("");
  const join = useMutation(orpc.waitlist.join.mutationOptions());

  if (join.isSuccess) {
    return (
      <p className="wc-form-done" role="status">
        Terdaftar. Kami kabari lewat email saat akses kamu siap.
      </p>
    );
  }

  return (
    <form
      className="wc-form"
      onSubmit={(e) => {
        e.preventDefault();
        join.mutate({
          email,
          whatsapp: whatsapp || undefined,
          shop: shop || undefined,
          channel: channel || undefined,
        });
      }}
    >
      <div className="wc-field">
        <label htmlFor={`${id}-email`}>Email</label>
        <input
          id={`${id}-email`}
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="wc-field">
        <label htmlFor={`${id}-wa`}>Nomor WhatsApp (opsional)</label>
        <input
          id={`${id}-wa`}
          type="tel"
          autoComplete="tel"
          placeholder="0812…"
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
        />
      </div>
      <div className="wc-field">
        <label htmlFor={`${id}-shop`}>Nama toko (opsional)</label>
        <input
          id={`${id}-shop`}
          autoComplete="organization"
          value={shop}
          onChange={(e) => setShop(e.target.value)}
        />
      </div>
      <div className="wc-field">
        <label htmlFor={`${id}-channel`}>Jualan di</label>
        <select
          id={`${id}-channel`}
          value={channel}
          onChange={(e) => setChannel(e.target.value as Channel | "")}
        >
          {CHANNELS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <button className="wc-button" type="submit" disabled={join.isPending}>
        {join.isPending ? "Mendaftarkan…" : "Daftar akses awal"}
      </button>
      {join.isError ? (
        <p className="wc-form-error" role="alert">
          Belum terdaftar: periksa email dan nomor WhatsApp, lalu coba lagi.
        </p>
      ) : null}
    </form>
  );
}
