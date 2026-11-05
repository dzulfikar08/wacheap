import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { AppRouterClient } from "@wacheap/api/routers/index";
import { Badge } from "@wacheap/ui/components/badge";
import { Button } from "@wacheap/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wacheap/ui/components/card";
import { Input } from "@wacheap/ui/components/input";
import { Label } from "@wacheap/ui/components/label";
import { Skeleton } from "@wacheap/ui/components/skeleton";
import { ChevronDown, Copy, Phone, RefreshCw } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/nomor")({
  component: NomorPage,
  head: () => ({ meta: [{ title: "Nomor WhatsApp · WACheap" }] }),
});

const QUALITY: Record<string, { label: string; variant: "success" | "secondary" | "destructive" }> =
  {
    GREEN: { label: "Kualitas tinggi", variant: "success" },
    YELLOW: { label: "Kualitas sedang", variant: "secondary" },
    RED: { label: "Kualitas rendah", variant: "destructive" },
  };

/** "TIER_1K" -> "1.000 penerima/hari". */
function tierLabel(tier: string | null): string | null {
  if (!tier) return null;
  const m = /^TIER_(\d+)(K)?$/.exec(tier);
  if (m) {
    const n = Number(m[1]) * (m[2] ? 1000 : 1);
    return `${n.toLocaleString("id-ID")} penerima/hari`;
  }
  if (tier === "TIER_UNLIMITED") return "Tanpa batas harian";
  return tier;
}

function NomorPage() {
  const numbers = useQuery(orpc.whatsapp.numbers.list.queryOptions());
  const hasNumbers = (numbers.data?.length ?? 0) > 0;

  return (
    <>
      <PageHeader
        title="Nomor WhatsApp"
        description="Nomor bisnis yang dipakai untuk broadcast dan inbox. Tagihan pesan langsung dari Meta ke akunmu, tanpa markup."
      />
      <div className="grid gap-8">
        <section aria-labelledby="terhubung" className="grid gap-3">
          <h2 id="terhubung" className="text-base font-semibold tracking-tight">
            Terhubung
          </h2>
          {numbers.isPending ? (
            <Skeleton className="h-24 w-full rounded-2xl" />
          ) : hasNumbers ? (
            <ul className="grid gap-3">
              {numbers.data!.map((n) => (
                <li key={n.id}>
                  <NumberCard number={n} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Belum ada nomor. Hubungkan nomor pertamamu di bawah.
            </p>
          )}
        </section>
        <ConnectForm />
      </div>
    </>
  );
}

type NumberRow = Awaited<ReturnType<AppRouterClient["whatsapp"]["numbers"]["list"]>>[number];

function NumberCard({ number }: { number: NumberRow }) {
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: orpc.whatsapp.numbers.list.key() });
  const refresh = useMutation(
    orpc.whatsapp.numbers.refresh.mutationOptions({
      onSuccess: () => {
        toast.success("Data nomor diperbarui dari Meta");
        void invalidate();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const disconnect = useMutation(
    orpc.whatsapp.numbers.disconnect.mutationOptions({
      onSuccess: () => {
        toast.success("Nomor diputus");
        void invalidate();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const quality = QUALITY[number.qualityRating];
  const tier = tierLabel(number.messagingTier);

  return (
    <Card size="sm">
      <div className="flex flex-col gap-4 px-(--card-spacing) sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"
          >
            <Phone className="size-4" />
          </span>
          <div className="grid min-w-0 gap-1">
            <p className="font-medium tabular-nums">{number.displayPhone}</p>
            <p className="truncate text-sm text-muted-foreground">{number.verifiedName}</p>
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {quality ? <Badge variant={quality.variant}>{quality.label}</Badge> : null}
              {tier ? <Badge variant="outline">{tier}</Badge> : null}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={refresh.isPending}
            onClick={() => refresh.mutate({ id: number.id })}
          >
            <RefreshCw data-icon="inline-start" aria-hidden="true" />
            Perbarui
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={disconnect.isPending}
            onClick={() => {
              if (
                window.confirm(
                  `Putuskan ${number.displayPhone}? Riwayat pesan nomor ini ikut terhapus dari WACheap, dan webhook-nya kembali ke Meta app-mu.`,
                )
              )
                disconnect.mutate({ id: number.id });
            }}
          >
            Putuskan
          </Button>
        </div>
      </div>
      <WebhookSetup number={number} />
    </Card>
  );
}

const FIELDS = [
  {
    name: "wabaId",
    label: "WhatsApp Business Account ID",
    hint: "WhatsApp Manager > Account tools > API Setup, atau Business Settings > Accounts > WhatsApp accounts.",
    inputMode: "numeric",
  },
  {
    name: "phoneNumberId",
    label: "Phone number ID",
    hint: "Di halaman API Setup yang sama, di bawah nomor yang mau dipakai. Bukan nomor teleponnya.",
    inputMode: "numeric",
  },
  {
    name: "accessToken",
    label: "Token akses permanen",
    hint: "Buat system user di Business Settings > Users > System users, beri akses ke akun WhatsApp ini, lalu Generate token dengan izin whatsapp_business_messaging dan whatsapp_business_management. Token disimpan terenkripsi dan tidak pernah ditampilkan lagi.",
    inputMode: "text",
  },
  {
    name: "appSecret",
    label: "App secret",
    hint: "Dari Meta app yang dipakai untuk membuat token itu: developers.facebook.com > app-mu > App settings > Basic > App secret. Dipakai untuk memastikan webhook memang dari Meta.",
    inputMode: "text",
  },
] as const;

type FieldName = (typeof FIELDS)[number]["name"];

function ConnectForm() {
  const empty: Record<FieldName, string> = {
    wabaId: "",
    phoneNumberId: "",
    accessToken: "",
    appSecret: "",
  };
  const [values, setValues] = useState(empty);
  const connect = useMutation(
    orpc.whatsapp.numbers.connect.mutationOptions({
      onSuccess: (number) => {
        const done = number.reconnected
          ? `Token ${number.displayPhone} diperbarui.`
          : `${number.displayPhone} terhubung.`;
        if (number.webhookInstalled) toast.success(done);
        else
          toast.warning(
            `${done} Webhook belum bisa didaftarkan ke Meta; coba "Pasang webhook lagi" di kartunya.`,
          );
        setValues(empty);
        void queryClient.invalidateQueries({ queryKey: orpc.whatsapp.numbers.list.key() });
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    connect.mutate(values);
  };

  return (
    <section aria-labelledby="hubungkan">
      <Card>
        <CardHeader>
          <CardTitle id="hubungkan" className="text-lg">
            Hubungkan nomor
          </CardTitle>
          <CardDescription>
            Pakai nomor dari WhatsApp Business Platform (Cloud API) milikmu sendiri. Untuk mencoba,
            nomor tes dari Meta juga bisa. Menghubungkan nomor yang sudah ada mengganti token dan
            app secret-nya tanpa menghapus riwayat. Koneksi satu klik lewat Facebook menyusul
            setelah verifikasi Meta selesai.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-5">
            {FIELDS.map((field) => (
              <div key={field.name} className="grid gap-1.5">
                <Label htmlFor={field.name}>{field.label}</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  required
                  autoComplete="off"
                  spellCheck={false}
                  inputMode={field.inputMode}
                  type={
                    field.name === "accessToken" || field.name === "appSecret" ? "password" : "text"
                  }
                  aria-describedby={`${field.name}-hint`}
                  value={values[field.name]}
                  onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                />
                <p id={`${field.name}-hint`} className="text-[13px] text-muted-foreground">
                  {field.hint}
                </p>
              </div>
            ))}
            <div>
              <Button type="submit" disabled={connect.isPending}>
                {connect.isPending ? "Menghubungkan..." : "Hubungkan"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}

function copy(label: string, value: string) {
  // navigator.clipboard only exists on HTTPS (or localhost); a self-hosted install on plain http has none.
  if (!navigator.clipboard?.writeText) {
    toast.error(
      "Browser tidak mengizinkan salin otomatis di sini. Pilih teksnya lalu salin manual.",
    );
    return;
  }
  navigator.clipboard.writeText(value).then(
    () => toast.success(`${label} disalin`),
    () => toast.error("Gagal menyalin. Pilih teksnya lalu salin manual."),
  );
}

function CopyField({ id, label, value }: { id: string; label: string; value: string }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          readOnly
          value={value}
          className="font-mono text-xs"
          onFocus={(e) => e.target.select()}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={`Salin ${label}`}
          onClick={() => copy(label, value)}
        >
          <Copy aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

/**
 * Whether Meta reaches this number's webhook. Connecting registers the URL with Meta by itself; until the first webhook
 * arrives the section stays open with a retry and the manual steps.
 */
function WebhookSetup({ number }: { number: NumberRow }) {
  const received = number.lastWebhookAt;
  const install = useMutation(
    orpc.whatsapp.numbers.installWebhook.mutationOptions({
      onSuccess: () =>
        toast.success("Webhook terpasang. Kirim pesan ke nomor ini untuk mengujinya."),
      onError: (error) => toast.error(error.message),
    }),
  );
  return (
    <details className="group border-t border-border px-(--card-spacing) pt-4" open={!received}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-1.5">
          <ChevronDown
            aria-hidden="true"
            className="size-4 -rotate-90 text-muted-foreground transition-transform group-open:rotate-0"
          />
          Webhook
        </span>
        {received ? (
          <Badge variant="success">
            Aktif, terakhir{" "}
            {new Date(received).toLocaleString("id-ID", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </Badge>
        ) : (
          <Badge variant="secondary">Belum ada pesan dari Meta</Badge>
        )}
      </summary>
      <div className="grid gap-4 pt-4">
        <p className="text-[13px] text-muted-foreground">
          Saat menghubungkan, WACheap mendaftarkan alamat webhook nomor ini ke Meta. Kirim pesan
          WhatsApp ke nomor ini untuk mengujinya; status di atas berubah jadi Aktif.
        </p>
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={install.isPending}
            onClick={() => install.mutate({ id: number.id })}
          >
            {install.isPending ? "Memasang..." : "Pasang webhook lagi"}
          </Button>
        </div>
        <p className="text-[13px] text-muted-foreground">
          Masih belum masuk? Pastikan di Meta app-mu (developers.facebook.com &gt; WhatsApp &gt;
          Configuration) kolom <span className="font-medium text-foreground">messages</span> di
          Webhook fields aktif. Kalau perlu memasang manual, pakai alamat ini:
        </p>
        <CopyField id={`url-${number.id}`} label="Callback URL" value={number.webhookUrl} />
        <CopyField id={`vt-${number.id}`} label="Verify token" value={number.verifyToken} />
      </div>
    </details>
  );
}
