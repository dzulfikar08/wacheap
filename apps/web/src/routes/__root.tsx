import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
  HeadContent,
  Outlet,
  createRootRouteWithContext,
  useRouterState,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { Toaster } from "@wacheap/ui/components/sonner";

import Header from "@/components/header";
import { PUBLIC_PATHS } from "@/components/landing/site-chrome";
import { ThemeProvider } from "@/components/theme-provider";
import type { orpc } from "@/utils/orpc";

import "../index.css";

export interface RouterAppContext {
  orpc: typeof orpc;
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  head: () => ({
    meta: [
      {
        title: "WACheap",
      },
      {
        name: "description",
        content: "Official WhatsApp broadcast for online sellers. Pay Meta's rate, 0% markup.",
      },
    ],
    links: [
      {
        rel: "icon",
        href: "/favicon.svg",
        type: "image/svg+xml",
      },
    ],
  }),
});

function RootComponent() {
  // Public pages draw their own header and colours; the app chrome starts at sign-in.
  const isPublic = useRouterState({ select: (s) => PUBLIC_PATHS.has(s.location.pathname) });
  if (isPublic) {
    return (
      <>
        <HeadContent />
        <Outlet />
      </>
    );
  }
  return (
    <>
      <HeadContent />
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        disableTransitionOnChange
        storageKey="vite-ui-theme"
      >
        <div className="grid grid-rows-[auto_1fr] h-svh">
          <Header />
          <Outlet />
        </div>
        <Toaster richColors />
      </ThemeProvider>
      <TanStackRouterDevtools position="bottom-left" />
      <ReactQueryDevtools position="bottom" buttonPosition="bottom-right" />
    </>
  );
}
