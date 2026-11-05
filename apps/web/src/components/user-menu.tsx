import { useNavigate } from "@tanstack/react-router";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@wacheap/ui/components/dropdown-menu";
import { ChevronsUpDown, LogOut, Monitor, Moon, Sun } from "lucide-react";

import { useTheme } from "@/components/theme-provider";
import { authClient } from "@/lib/auth-client";
import { queryClient } from "@/utils/orpc";

export type ShellUser = { name: string; email: string };

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    parts.length > 1 ? parts[0]![0]! + parts.at(-1)![0]! : (parts[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

/** The account button at the foot of the sidebar: who is signed in, the theme, and sign out. */
export default function UserMenu({ user }: { user: ShellUser }) {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex w-full min-w-0 items-center gap-3 rounded-xl p-2 text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring aria-expanded:bg-sidebar-accent"
        aria-label={`Akun ${user.name}`}
      >
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
        >
          {initials(user.name)}
        </span>
        <span className="grid min-w-0 flex-1 leading-tight">
          <span className="truncate text-sm font-medium text-foreground">{user.name}</span>
          <span className="truncate text-xs text-muted-foreground">{user.email}</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" sideOffset={6} className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="grid gap-0.5">
            <span className="truncate text-sm font-medium text-foreground">{user.name}</span>
            <span className="truncate">{user.email}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Tampilan</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={theme ?? "light"} onValueChange={(v) => setTheme(v)}>
            <DropdownMenuRadioItem value="light">
              <Sun />
              Terang
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">
              <Moon />
              Gelap
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system">
              <Monitor />
              Ikuti sistem
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => {
            authClient.signOut({
              fetchOptions: {
                onSuccess: () => {
                  // Drop the previous account's cached data (billing status etc.) before anyone else signs in.
                  queryClient.clear();
                  navigate({
                    to: "/",
                  });
                },
              },
            });
          }}
        >
          <LogOut />
          Keluar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
