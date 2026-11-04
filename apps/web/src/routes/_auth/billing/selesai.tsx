import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { buttonVariants } from "@wacheap/ui/components/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@wacheap/ui/components/card";
import { useEffect, useState } from "react";
import { z } from "zod";

import { rupiah, tanggal } from "@/lib/billing-format";
import { orpc, queryClient } from "@/utils/orpc";

// DOKU sends the buyer back here (callback_url) with ?order=<ref>. The webhook is what credits the time; this page
// only waits for it.
export const Route = createFileRoute("/_auth/billing/selesai")({
  component: ReturnPage,
  validateSearch: z.object({ order: z.string().max(64).optional() }),
  head: () => ({ meta: [{ title: "Pembayaran · WACheap" }] }),
});

const POLL_MS = 3000;
/** Stop polling after 10 minutes; a later webhook still credits the time. */
const POLL_FOR_MS = 10 * 60 * 1000;

function ReturnPage() {
  const { order: ref } = Route.useSearch();
  const [startedAt] = useState(() => Date.now());
  // Date.now() isn't state: a timer flips this so the page re-renders when polling gives up.
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGaveUp(true), POLL_FOR_MS);
    return () => clearTimeout(t);
  }, []);
  const order = useQuery({
    ...orpc.billing.order.queryOptions({ input: { ref: ref ?? "" } }),
    enabled: Boolean(ref),
    refetchInterval: (query) =>
      query.state.data?.status === "pending" && !gaveUp && Date.now() - startedAt < POLL_FOR_MS
        ? POLL_MS
        : false,
  });
  const status = order.data?.status;

  useEffect(() => {
    if (status === "paid")
      void queryClient.invalidateQueries({ queryKey: orpc.billing.status.key() });
  }, [status]);

  let title = "Menunggu konfirmasi pembayaran…";
  let description =
    "Halaman ini diperbarui sendiri begitu DOKU mengabari kami. Biasanya beberapa detik.";
  if (!ref) {
    title = "Pesanan tidak dikenal";
    description = "Buka halaman Langganan untuk melihat status terbaru.";
  } else if (order.isError) {
    const notFound = (order.error as { code?: string } | null)?.code === "NOT_FOUND";
    title = notFound ? "Pesanan tidak ditemukan" : "Status belum bisa dimuat";
    description = notFound
      ? "Buka halaman Langganan untuk melihat status terbaru."
      : "Koneksi ke server terputus. Muat ulang halaman ini; pembayaranmu tetap tercatat.";
  } else if (status === "paid" && order.data) {
    title = "Pembayaran diterima";
    description = `${rupiah(order.data.amount)} untuk ${order.data.numbers} nomor. Aktif sampai ${
      order.data.paidUntil ? tanggal(order.data.paidUntil) : "-"
    }.`;
  } else if (status === "expired" || status === "failed") {
    title = status === "expired" ? "Pembayaran kedaluwarsa" : "Pembayaran gagal";
    description = "Pesanan ini tidak terbayar. Buat pembayaran baru dari halaman Langganan.";
  } else if (status === "pending" && gaveUp) {
    description =
      "Belum ada konfirmasi dari DOKU. Jika Anda sudah membayar, muat ulang halaman ini nanti: kami menanyakan status pesanan ke DOKU setiap kali halaman ini dibuka.";
  }

  return (
    <main className="mx-auto w-full max-w-xl p-4">
      <Card>
        <CardHeader>
          <CardTitle aria-live="polite">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Link to="/billing" className={buttonVariants({ variant: "outline" })}>
            Kembali ke Langganan
          </Link>
        </CardFooter>
      </Card>
    </main>
  );
}
