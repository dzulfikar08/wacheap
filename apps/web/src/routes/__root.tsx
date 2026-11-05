import "@fontsource-variable/geist";
import "@fontsource-variable/newsreader";

import type { QueryClient } from "@tanstack/react-query";
import {
  HeadContent,
  Outlet,
  createRootRouteWithContext,
  useRouterState,
} from "@tanstack/react-router";
import { Toaster } from "@wacheap/ui/components/sonner";
import { Suspense, lazy } from "react";

import { isPublicPath } from "@/components/landing/public-paths";
import { ThemeProvider } from "@/components/theme-provider";
import type { orpc } from "@/utils/orpc";

import "../index.css";

// import.meta.env.DEV is false in a production build, so the bundler drops the import and both devtools with it.
const Devtools = import.meta.env.DEV ? lazy(() => import("@/components/devtools")) : () => null;

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
        content:
          "WACheap (segera hadir): broadcast WhatsApp resmi untuk seller online, bayar tarif Meta tanpa markup.",
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
  const isPublic = useRouterState({ select: (s) => isPublicPath(s.location.pathname) });
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
        defaultTheme="light"
        disableTransitionOnChange
        storageKey="vite-ui-theme"
      >
        <Outlet />
        <Toaster richColors position="top-center" />
      </ThemeProvider>
      <Suspense>
        <Devtools />
      </Suspense>
    </>
  );
}
