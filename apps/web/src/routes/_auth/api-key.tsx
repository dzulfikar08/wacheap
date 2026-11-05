import { createFileRoute } from "@tanstack/react-router";
import { KeyRound } from "lucide-react";

import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_auth/api-key")({
  component: () => (
    <ComingSoon
      title="API key"
      icon={KeyRound}
      description="Kunci untuk memakai WACheap dari sistem tokomu sendiri atau dari AI agent."
      plan="Nanti kamu bisa membuat, menamai, dan mencabut API key untuk mengirim pesan lewat API."
    />
  ),
  head: () => ({ meta: [{ title: "API key · WACheap" }] }),
});
