import { createFileRoute } from "@tanstack/react-router";
import { Megaphone } from "lucide-react";

import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_auth/broadcast")({
  component: () => (
    <ComingSoon
      title="Broadcast"
      icon={Megaphone}
      description="Kirim satu pesan ke banyak pembeli sekaligus, lewat nomor WhatsApp resmimu."
      plan="Nanti kamu bisa memilih template, menyaring pembeli berdasarkan label, melihat perkiraan biaya Meta, lalu mengirim atau menjadwalkan broadcast."
    />
  ),
  head: () => ({ meta: [{ title: "Broadcast · WACheap" }] }),
});
