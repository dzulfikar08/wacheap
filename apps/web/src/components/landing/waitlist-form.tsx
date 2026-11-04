import { useMutation } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";

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

type Problem = { field: "whatsapp" | "email" | null; message: string };

/** What went wrong, in words the visitor can act on. */
function describe(error: unknown): Problem {
  const status = (error as { status?: number } | null)?.status;
  const detail = JSON.stringify((error as { data?: unknown } | null)?.data ?? "");
  if (status === 429)
    return { field: null, message: "Terlalu banyak percobaan. Tunggu satu menit, lalu coba lagi." };
  if (status === 400) {
    if (detail.includes("whatsapp")) {
      return { field: "whatsapp", message: "Nomor WhatsApp tidak valid. Contoh: 0812 3456 7890." };
    }
    return { field: "email", message: "Alamat email tidak valid." };
  }
  return {
    field: null,
    message: "Belum terkirim karena koneksi atau server bermasalah. Coba lagi.",
  };
}

export function WaitlistForm() {
  const id = useId();
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [shop, setShop] = useState("");
  const [channel, setChannel] = useState<Channel | "">("");
  const join = useMutation(orpc.waitlist.join.mutationOptions());
  const done = useRef<HTMLParagraphElement>(null);
  const problem = join.isError ? describe(join.error) : null;
  const errorId = `${id}-error`;
  const invalid = (field: Problem["field"]) =>
    problem?.field === field ? { "aria-invalid": true as const, "aria-describedby": errorId } : {};

  // The form is replaced on success; keep keyboard focus on the confirmation instead of dropping it to <body>.
  useEffect(() => {
    if (join.isSuccess) done.current?.focus();
  }, [join.isSuccess]);

  if (join.isSuccess) {
    return (
      <p className="wc-form-done" ref={done} tabIndex={-1}>
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
          {...invalid("email")}
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
          {...invalid("whatsapp")}
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
      {problem ? (
        <p className="wc-form-error" id={errorId} role="alert">
          {problem.message}
        </p>
      ) : null}
    </form>
  );
}
