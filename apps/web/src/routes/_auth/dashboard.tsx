import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Badge } from "@wacheap/ui/components/badge";
import { buttonVariants } from "@wacheap/ui/components/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@wacheap/ui/components/card";
import { Skeleton } from "@wacheap/ui/components/skeleton";

import { PageHeader } from "@/components/page-header";
import { tanggal } from "@/lib/billing-format";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/dashboard")({
  component: Ringkasan,
  head: () => ({ meta: [{ title: "Ringkasan · WACheap" }] }),
});

/** Greeting by the hour in WIB, where the sellers are. */
function salam(now = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: "Asia/Jakarta",
    }).format(now),
  );
  if (hour < 11) return "Selamat pagi";
  if (hour < 15) return "Selamat siang";
  if (hour < 18) return "Selamat sore";
  return "Selamat malam";
}

const STEPS = [
  {
    title: "Hubungkan nomor WhatsApp",
    body: "Sambungkan nomor bisnismu lewat WhatsApp Business Platform resmi dari Meta.",
  },
  {
    title: "Unggah kontak",
    body: "Impor pembeli yang sudah setuju dihubungi, dari CSV atau XLSX.",
  },
  {
    title: "Buat template",
    body: "Tulis pesan broadcast pertamamu dan kirim ke Meta untuk disetujui.",
  },
  {
    title: "Kirim broadcast pertama",
    body: "Pilih pembeli, cek perkiraan biaya Meta, lalu kirim atau jadwalkan.",
  },
];

function Ringkasan() {
  const { session } = Route.useRouteContext();
  const name = session.data?.user.name.trim();

  return (
    <>
      <PageHeader
        title={name ? `${salam()}, ${name}` : salam()}
        description="Ini ringkasan akun WACheap-mu. Fitur broadcast sedang kami bangun; langkah-langkahnya ada di bawah."
      />
      <div className="grid gap-6">
        <BillingCard />
        <section aria-labelledby="mulai" className="grid gap-3">
          <div>
            <h2 id="mulai" className="text-base font-semibold tracking-tight">
              Mulai
            </h2>
            <p className="text-sm text-muted-foreground">
              Empat langkah sampai broadcast pertamamu terkirim.
            </p>
          </div>
          <Card className="gap-0 py-0">
            <ol className="divide-y divide-border">
              {STEPS.map((step, i) => (
                <li key={step.title} className="flex items-start gap-4 px-5 py-4 sm:px-6">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border border-border text-xs font-medium text-muted-foreground tabular-nums"
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{step.title}</p>
                    <p className="text-sm text-muted-foreground">{step.body}</p>
                  </div>
                  <Badge variant="secondary" className="mt-0.5 text-muted-foreground">
                    Segera
                  </Badge>
                </li>
              ))}
            </ol>
          </Card>
        </section>
      </div>
    </>
  );
}

function BillingCard() {
  const status = useQuery(orpc.billing.status.queryOptions());

  if (status.isPending) {
    return <Skeleton className="h-[7.5rem] w-full rounded-2xl" />;
  }

  const data = status.data;
  if (!data || !data.enabled) {
    return (
      <Card size="sm">
        <CardHeader>
          <CardTitle>
            {data ? "Langganan tidak dipakai di server ini" : "Status langganan belum bisa dimuat"}
          </CardTitle>
          <CardDescription>
            {data
              ? "Server ini tidak memakai langganan, jadi tidak ada masa coba atau tagihan."
              : "Coba muat ulang halaman ini sebentar lagi."}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const { badge, title, body, cta } = {
    trial: {
      badge: <Badge variant="success">Masa coba</Badge>,
      title: `Sisa ${data.daysLeft} hari masa coba`,
      body: `Masa coba gratis berakhir ${tanggal(data.trialEndsAt)}.`,
      cta: "Lihat paket",
    },
    active: {
      badge: <Badge variant="success">Aktif</Badge>,
      title: `Sisa ${data.daysLeft} hari`,
      body: `Aktif sampai ${tanggal(data.endsAt)} untuk ${data.numbers} nomor WhatsApp.`,
      cta: "Kelola langganan",
    },
    expired: {
      badge: <Badge variant="destructive">Habis</Badge>,
      title: "Masa aktif sudah habis",
      body: `Habis sejak ${tanggal(data.endsAt)}. Perpanjang untuk mengirim broadcast lagi.`,
      cta: "Perpanjang",
    },
  }[data.status];

  return (
    <Card>
      <div className="flex flex-col gap-5 px-(--card-spacing) sm:flex-row sm:items-center sm:justify-between">
        <div className="grid min-w-0 justify-items-start gap-2">
          {badge}
          <CardTitle className="text-lg">{title}</CardTitle>
          <CardDescription>{body}</CardDescription>
        </div>
        <Link
          to="/billing"
          className={buttonVariants({
            variant: data.status === "expired" ? "default" : "outline",
            className: "w-full sm:w-auto",
          })}
        >
          {cta}
        </Link>
      </div>
    </Card>
  );
}
