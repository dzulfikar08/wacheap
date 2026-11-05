import { Link, createFileRoute } from "@tanstack/react-router";
import { buttonVariants } from "@wacheap/ui/components/button";
import { ReceiptText } from "lucide-react";

import { ComingSoon } from "@/components/coming-soon";

// Biaya is what Meta bills per message; the WACheap subscription lives on its own page, Langganan (/billing).
export const Route = createFileRoute("/_auth/biaya")({
  component: () => (
    <ComingSoon
      title="Biaya"
      icon={ReceiptText}
      description="Biaya pesan yang ditagih Meta langsung ke akun WhatsApp Business-mu. WACheap tidak menambah markup."
      plan="Nanti kamu bisa melihat rincian biaya Meta per broadcast, termasuk PPN, dan totalnya per bulan."
    >
      <Link to="/billing" className={buttonVariants({ variant: "outline" })}>
        Lihat langganan WACheap
      </Link>
    </ComingSoon>
  ),
  head: () => ({ meta: [{ title: "Biaya · WACheap" }] }),
});
