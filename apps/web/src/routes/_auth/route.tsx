import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { loadSession } from "@/lib/session";

export const Route = createFileRoute("/_auth")({
  component: AuthLayout,
  beforeLoad: async ({ context }) => {
    const session = await loadSession(context.queryClient);
    if (!session) {
      throw redirect({
        to: "/login",
      });
    }
    return { session };
  },
});

function AuthLayout() {
  const { session } = Route.useRouteContext();
  const user = session.user;
  return (
    <AppShell user={{ name: user?.name ?? "", email: user?.email ?? "" }}>
      <Outlet />
    </AppShell>
  );
}
