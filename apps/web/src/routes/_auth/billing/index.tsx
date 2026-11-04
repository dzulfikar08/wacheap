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
import { Skeleton } from "@wacheap/ui/components/skeleton";
import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { rupiah, tanggal } from "@/lib/billing-format";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_auth/billing/")({
  component: BillingPage,
  head: () => ({ meta: [{ title: "Langganan · WACheap" }] }),
});

const MAX_NUMBERS = 50;

const STATUS_LABEL = { trial: "Masa coba", active: "Aktif", expired: "Habis" } as const;

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
      <main className="mx-auto w-full max-w-3xl space-y-4 p-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </main>
    );
  }
  const data = status.data;
  if (!data) {
    return (
      <main className="mx-auto w-full max-w-3xl p-4 text-sm">
        Status langganan tidak bisa dimuat. Muat ulang halaman.
      </main>
    );
  }

  if (!data.enabled) {
    return (
      <main className="mx-auto w-full max-w-3xl p-4">
        <Card>
          <CardHeader>
            <CardTitle>Langganan tidak dipakai di server ini</CardTitle>
            <CardDescription>
              Server ini menjalankan WACheap self-host: semua fitur gratis, tanpa masa coba dan
              tanpa tagihan.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  // While paid time runs a renewal keeps the count (the server refuses a change), so the stepper is locked.
  const locked = data.status === "active";
  const qty = locked ? data.numbers : (numbers ?? data.numbers);
  const pay = (plan: "monthly" | "yearly") => checkout.mutate({ plan, numbers: qty });

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 p-4">
      <h1 className="text-xl font-semibold">Langganan WACheap Cloud</h1>

      <Card>
        <CardHeader>
          <CardTitle>
            {STATUS_LABEL[data.status]}
            {data.status !== "expired" ? ` · sisa ${data.daysLeft} hari` : null}
          </CardTitle>
          <CardDescription>
            {data.status === "trial" && <>Masa coba gratis berakhir {tanggal(data.trialEndsAt)}.</>}
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
          <CardContent className="text-muted-foreground">
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
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="Kurangi nomor"
              disabled={locked || qty <= 1}
              onClick={() => setNumbers(Math.max(1, qty - 1))}
            >
              <Minus />
            </Button>
            <output
              aria-live="polite"
              className="w-10 text-center text-base font-medium tabular-nums"
            >
              {qty}
            </output>
            <Button
              variant="outline"
              size="icon"
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

      <p className="text-xs text-muted-foreground">
        Bayar lewat QRIS atau virtual account di halaman DOKU. Tidak diperpanjang otomatis: masa
        aktif bertambah setiap kali Anda membayar, dihitung dari akhir masa aktif yang tersisa.
        Biaya pesan WhatsApp ditagih langsung oleh Meta ke akun WhatsApp Business Anda, bukan lewat
        WACheap.
      </p>
    </main>
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
        <span className="text-2xl font-semibold tabular-nums">{rupiah(props.price)}</span>{" "}
        <span className="text-muted-foreground">{props.period}</span>
      </CardContent>
      <CardFooter>
        <Button className="w-full" disabled={props.disabled} onClick={props.onPay}>
          Bayar {props.title.toLowerCase()}
        </Button>
      </CardFooter>
    </Card>
  );
}
