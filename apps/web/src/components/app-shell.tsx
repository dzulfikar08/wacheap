import { Link, type LinkProps } from "@tanstack/react-router";
import { Button } from "@wacheap/ui/components/button";
import { Sheet, SheetContent, SheetTitle } from "@wacheap/ui/components/sheet";
import {
  CreditCard,
  FileText,
  Inbox,
  KeyRound,
  LayoutGrid,
  type LucideIcon,
  Megaphone,
  Menu,
  Phone,
  ReceiptText,
  Users,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { Logo } from "@/components/landing/logo";
import UserMenu, { type ShellUser } from "@/components/user-menu";

type NavItem = { to: LinkProps["to"]; label: string; icon: LucideIcon };

/** The same order as the drawn dashboard on the landing page (components/landing/demo.tsx). */
const NAV: NavItem[] = [
  { to: "/dashboard", label: "Ringkasan", icon: LayoutGrid },
  { to: "/broadcast", label: "Broadcast", icon: Megaphone },
  { to: "/kontak", label: "Kontak", icon: Users },
  { to: "/template", label: "Template", icon: FileText },
  { to: "/inbox", label: "Inbox", icon: Inbox },
  { to: "/biaya", label: "Biaya", icon: ReceiptText },
  { to: "/api-key", label: "API key", icon: KeyRound },
];

/** Account setup: connected numbers, and the WACheap subscription (kept apart from Biaya, what Meta bills per message). */
const ACCOUNT_NAV: NavItem[] = [
  { to: "/nomor", label: "Nomor WhatsApp", icon: Phone },
  { to: "/billing", label: "Langganan", icon: CreditCard },
];

function Brand({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link
      to="/dashboard"
      onClick={onNavigate}
      className="inline-flex items-center gap-2 rounded-lg px-1.5 py-1 text-[1.0625rem] font-semibold tracking-tight text-foreground outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
    >
      <Logo className="size-6 shrink-0" />
      WACheap
    </Link>
  );
}

function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  return (
    <ul className="grid gap-0.5">
      {items.map(({ to, label, icon: Icon }) => (
        <li key={to}>
          <Link
            to={to}
            onClick={onNavigate}
            className="group flex h-10 items-center gap-3 rounded-[10px] px-2.5 text-sm text-sidebar-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring data-[status=active]:bg-sidebar-accent data-[status=active]:font-medium data-[status=active]:text-sidebar-accent-foreground md:h-9"
          >
            <Icon
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-sidebar-accent-foreground group-data-[status=active]:text-sidebar-accent-foreground"
            />
            {label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function SidebarBody({ user, onNavigate }: { user: ShellUser; onNavigate?: () => void }) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-6 p-3">
      <div className="px-1 pt-1">
        <Brand onNavigate={onNavigate} />
      </div>
      <nav
        aria-label="Menu aplikasi"
        className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto"
      >
        <NavLinks items={NAV} onNavigate={onNavigate} />
        <div className="grid gap-1.5">
          <p className="px-2.5 text-xs font-medium text-muted-foreground">Akun</p>
          <NavLinks items={ACCOUNT_NAV} onNavigate={onNavigate} />
        </div>
      </nav>
      <div className="border-t border-sidebar-border pt-3">
        <UserMenu user={user} />
      </div>
    </div>
  );
}

/** Sidebar on md and up; below that a top bar whose menu button opens the same sidebar in a drawer. */
export function AppShell({ user, children }: { user: ShellUser; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <div className="min-h-svh bg-background md:flex">
      <a
        href="#isi"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:shadow-hairline"
      >
        Langsung ke isi
      </a>

      <aside className="sticky top-0 hidden h-svh w-64 shrink-0 border-r border-sidebar-border bg-sidebar md:block">
        <SidebarBody user={user} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-sidebar-border bg-background/85 px-2 backdrop-blur-md md:hidden">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Buka menu"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <Menu />
          </Button>
          <Brand />
        </header>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="left" className="w-72 max-w-[85vw] p-0">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <SidebarBody user={user} onNavigate={close} />
          </SheetContent>
        </Sheet>

        <main id="isi" className="flex-1 px-4 pt-6 pb-16 sm:px-6 md:px-10 md:pt-12">
          <div className="mx-auto w-full max-w-4xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
