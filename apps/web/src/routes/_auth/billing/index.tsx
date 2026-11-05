import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CLOUD_PLAN } from "@wacheap/api/lib/pricing";
import { Button } from "@wacheap/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@wacheap/ui/components/card";
import { Badge } from "@wacheap/ui/components/badge";
import { Skeleton } from "@wacheap/ui/components/skeleton";
import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { rupiah, tanggal } from "@/lib/billing-format";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/billing/")({
  component: BillingPage,
  head: () => ({ meta: [{ title: "Langganan · WACheap" }] }),
});

const MAX_NUMBERS = 50;

const STATUS_LABEL = { trial: "Masa coba", active: "Aktif", expired: "Habis" } as const;
const STATUS_BADGE = { trial: "success", active: "success", expired: "destructive" } as const;

const HEADER = (
  <PageHeader
    title="Langganan"
    description="WACheap Cloud, dibayar per nomor WhatsApp yang tersambung. Biaya pesan tetap ditagih Meta langsung ke akunmu."
  />
);

function BillingPage() {
  const status = useQuery(orpc.billing.status.queryOptions());
  const [numbers, setNumbers] = useState<number | null>(null);
  const checkout = useMutation(
    orpc.billing.checkout.mutationOptions({
      onSuccess: ({ paymentUrl }) => window.location.assign(paymentUrl),
      onError: (error) => toast.error(error.message),
    }),
  );

  if (status.isPending) {
    return (
      <>
        {HEADER}
        <div className="grid gap-4">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      </>
    );
  }
  const data = status.data;
  if (!data) {
    return (
      <>
        {HEADER}
        <Card size="sm">
          <CardHeader>
            <CardTitle>Status langganan tidak bisa dimuat</CardTitle>
            <CardDescription>Muat ulang halaman.</CardDescription>
          </CardHeader>
        </Card>
      </>
    );
  }

  if (!data.enabled) {
    return (
      <>
        {HEADER}
        <Card>
          <CardHeader>
            <CardTitle>Langganan tidak dipakai di server ini</CardTitle>
            <CardDescription>
              Server ini menjalankan WACheap self-host: semua fitur gratis, tanpa masa coba dan
              tanpa tagihan.
            </CardDescription>
          </CardHeader>
        </Card>
      </>
    );
  }

  // While paid time runs a renewal keeps the count (the server refuses a change), so the stepper is locked.
  const locked = data.status === "active";
  const qty = locked ? data.numbers : (numbers ?? data.numbers);
  const pay = (plan: "monthly" | "yearly") => checkout.mutate({ plan, numbers: qty });

  return (
    <>
      {HEADER}
      <div className="grid gap-4">
        <Card>
          <CardHeader className="gap-2">
            <Badge variant={STATUS_BADGE[data.status]}>{STATUS_LABEL[data.status]}</Badge>
            <CardTitle className="text-lg">
              {data.status !== "expired" ? `Sisa ${data.daysLeft} hari` : "Masa aktif sudah habis"}
            </CardTitle>
            <CardDescription>
              {data.status === "trial" && (
                <>Masa coba gratis berakhir {tanggal(data.trialEndsAt)}.</>
              )}
              {data.status === "active" && (
                <>
                  Aktif sampai {tanggal(data.endsAt)} untuk {data.numbers} nomor WhatsApp.
                </>
              )}
              {data.status === "expired" && (
                <>
                  Masa aktif habis {tanggal(data.endsAt)}. Perpanjang untuk mengirim broadcast lagi.
                </>
              )}
            </CardDescription>
          </CardHeader>
          {data.paidUntil && data.status !== "active" ? (
            <CardContent className="text-sm text-muted-foreground">
              Dibayar sampai {tanggal(data.paidUntil)}.
            </CardContent>
          ) : null}
        </Card>

        {!data.checkoutReady ? (
          <Card>
            <CardHeader>
              <CardTitle>Pembayaran belum disiapkan</CardTitle>
              <CardDescription>
                Kunci DOKU di server ini belum diisi, jadi pembayaran belum bisa dibuka. Hubungi
                admin.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Jumlah nomor WhatsApp</CardTitle>
            <CardDescription>
              {locked
                ? "Masa aktifmu berjalan untuk jumlah ini. Jumlah nomor bisa diubah setelah masa aktif habis."
                : "Harga dihitung per nomor yang tersambung."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="inline-flex items-center gap-1 rounded-xl bg-muted p-1">
              <Button
                variant="ghost"
                size="icon"
                className="bg-card shadow-hairline hover:bg-card/70"
                aria-label="Kurangi nomor"
                disabled={locked || qty <= 1}
                onClick={() => setNumbers(Math.max(1, qty - 1))}
              >
                <Minus />
              </Button>
              <output
                aria-live="polite"
                className="w-12 text-center text-lg font-semibold tabular-nums"
              >
                {qty}
              </output>
              <Button
                variant="ghost"
                size="icon"
                className="bg-card shadow-hairline hover:bg-card/70"
                aria-label="Tambah nomor"
                disabled={locked || qty >= MAX_NUMBERS}
                onClick={() => setNumbers(Math.min(MAX_NUMBERS, qty + 1))}
              >
                <Plus />
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          <PlanCard
            title="Bulanan"
            price={CLOUD_PLAN.monthly * qty}
            period="per bulan"
            note={`${rupiah(CLOUD_PLAN.monthly)} × ${qty} nomor`}
            disabled={!data.checkoutReady || checkout.isPending}
            onPay={() => pay("monthly")}
          />
          <PlanCard
            title="Tahunan"
            price={CLOUD_PLAN.yearly * qty}
            period="per tahun"
            note={`${rupiah(CLOUD_PLAN.yearly)} × ${qty} nomor, setara 2 bulan gratis`}
            disabled={!data.checkoutReady || checkout.isPending}
            onPay={() => pay("yearly")}
          />
        </div>

        <p className="max-w-prose text-xs/relaxed text-muted-foreground">
          Bayar lewat QRIS atau virtual account di halaman DOKU. Tidak diperpanjang otomatis: masa
          aktif bertambah setiap kali kamu membayar, dihitung dari akhir masa aktif yang tersisa.
          Biaya pesan WhatsApp ditagih langsung oleh Meta ke akun WhatsApp Business-mu, bukan lewat
          WACheap.
        </p>
      </div>
    </>
  );
}

function PlanCard(props: {
  title: string;
  price: number;
  period: string;
  note: string;
  disabled: boolean;
  onPay: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{props.title}</CardTitle>
        <CardDescription>{props.note}</CardDescription>
      </CardHeader>
      <CardContent>
        <span className="text-3xl font-semibold tracking-tight tabular-nums">
          {rupiah(props.price)}
        </span>{" "}
        <span className="text-sm text-muted-foreground">{props.period}</span>
      </CardContent>
      <CardFooter>
        <Button className="w-full" disabled={props.disabled} onClick={props.onPay}>
          Bayar {props.title.toLowerCase()}
        </Button>
      </CardFooter>
    </Card>
  );
}
