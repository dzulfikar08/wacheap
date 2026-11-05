import { createFileRoute } from "@tanstack/react-router";
import { Inbox } from "lucide-react";

import { ComingSoon } from "@/components/coming-soon";

export const Route = createFileRoute("/_auth/inbox")({
  component: () => (
    <ComingSoon
      title="Inbox"
      icon={Inbox}
      description="Balasan pembeli dari broadcast dan chat yang masuk ke nomormu."
      plan="Nanti semua balasan pembeli masuk ke sini, dan kamu bersama adminmu bisa membalasnya dari satu tempat."
    />
  ),
  head: () => ({ meta: [{ title: "Inbox · WACheap" }] }),
});
