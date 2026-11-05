import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";

import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_auth/kontak")({
  component: () => (
    <ComingSoon
      title="Kontak"
      icon={Users}
      description="Daftar pembeli yang sudah setuju dihubungi lewat WhatsApp."
      plan="Nanti kamu bisa mengimpor kontak dari CSV atau XLSX, memberi label, dan mencatat dari mana tiap pembeli setuju dihubungi."
    />
  ),
  head: () => ({ meta: [{ title: "Kontak · WACheap" }] }),
});
