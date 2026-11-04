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

type Field = "email" | "whatsapp" | "shop";
type Problem = { fields: Field[]; message: string };

const FIELD_MESSAGES: Record<Field, string> = {
  email: "alamat email tidak valid",
  whatsapp: "nomor WhatsApp tidak valid (contoh: 0812 3456 7890)",
  shop: "nama toko terlalu panjang (maksimal 120 karakter)",
};

/** What went wrong, in words the visitor can act on, and which fields to mark. */
function describe(error: unknown): Problem {
  const e = error as { status?: number; data?: { issues?: { path?: unknown[] }[] } } | null;
  if (e?.status === 429) {
    return { fields: [], message: "Terlalu banyak percobaan. Tunggu satu menit, lalu coba lagi." };
  }
  if (e?.status === 400) {
    const fields = [
      ...new Set(
        (e.data?.issues ?? [])
          .map((i) => i.path?.[0])
          .filter((f): f is Field => f === "email" || f === "whatsapp" || f === "shop"),
      ),
    ];
    if (fields.length === 0)
      return { fields: [], message: "Isian belum valid. Periksa lagi, lalu kirim ulang." };
    const list = fields.map((f) => FIELD_MESSAGES[f]).join("; ");
    return { fields, message: `Periksa lagi: ${list}.` };
  }
  return {
    fields: [],
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
  const invalid = (field: Field) =>
    problem?.fields.includes(field)
      ? { "aria-invalid": true as const, "aria-describedby": errorId }
      : {};

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
          maxLength={254}
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
          maxLength={32}
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
          maxLength={120}
          {...invalid("shop")}
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
