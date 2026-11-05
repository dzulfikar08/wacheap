import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";

import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_auth/template")({
  component: () => (
    <ComingSoon
      title="Template"
      icon={FileText}
      description="Template pesan yang dipakai untuk broadcast, setelah disetujui Meta."
      plan="Nanti kamu bisa menulis template, mengirimnya ke Meta untuk ditinjau, dan memantau statusnya dari sini."
    />
  ),
  head: () => ({ meta: [{ title: "Template · WACheap" }] }),
});
