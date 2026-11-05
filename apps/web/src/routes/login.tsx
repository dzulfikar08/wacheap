import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { Logo } from "@/components/landing/logo";
import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";

export const Route = createFileRoute("/login")({
  component: RouteComponent,
  head: () => ({ meta: [{ title: "Masuk · WACheap" }] }),
});

const MODES = [
  ["masuk", "Masuk"],
  ["daftar", "Daftar"],
] as const;
type Mode = (typeof MODES)[number][0];

const COPY: Record<Mode, { title: string; body: string }> = {
  masuk: { title: "Masuk ke WACheap", body: "Lanjutkan ke dasbor tokomu." },
  daftar: {
    title: "Buat akun WACheap",
    body: "Gratis untuk dicoba. Biaya pesan dibayar langsung ke Meta, tanpa markup.",
  },
};

function RouteComponent() {
  const [mode, setMode] = useState<Mode>("masuk");

  return (
    <div className="relative isolate flex min-h-svh flex-col items-center px-4 py-8 sm:py-12">
      {/* The landing hero's dot texture, faded out from the top centre. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[32rem] bg-[radial-gradient(circle_at_1px_1px,rgb(10_10_10/0.12)_1px,transparent_0)] bg-[length:22px_22px] [mask-image:radial-gradient(60%_70%_at_50%_0,#000_20%,transparent_70%)] dark:bg-[radial-gradient(circle_at_1px_1px,rgb(250_250_250/0.1)_1px,transparent_0)]"
      />
      <div className="w-full max-w-sm">
        <Link
          to="/"
          className="inline-flex items-center gap-1 rounded-md text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span aria-hidden="true">←</span> Kembali ke beranda
        </Link>
      </div>

      <main className="flex w-full flex-1 flex-col items-center justify-center py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 grid justify-items-center gap-4 text-center">
            <Link
              to="/"
              aria-label="WACheap, ke beranda"
              className="grid size-12 place-items-center rounded-2xl bg-card shadow-hairline outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Logo className="size-7" />
            </Link>
            <div className="grid gap-1.5">
              <h1 className="font-display text-[1.875rem] leading-tight font-medium tracking-tight">
                {COPY[mode].title}
              </h1>
              <p className="text-sm text-pretty text-muted-foreground">{COPY[mode].body}</p>
            </div>
          </div>

          <div className="rounded-2xl bg-card p-6 shadow-hairline sm:p-7">
            <div
              role="group"
              aria-label="Masuk atau daftar"
              className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-muted p-1"
            >
              {MODES.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={mode === value}
                  onClick={() => setMode(value)}
                  className="h-9 rounded-[9px] text-sm font-medium text-muted-foreground outline-none transition-[background-color,color,box-shadow] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-hairline"
                >
                  {label}
                </button>
              ))}
            </div>
            <div>{mode === "masuk" ? <SignInForm /> : <SignUpForm />}</div>
          </div>

          <p className="mt-6 text-center text-xs text-pretty text-muted-foreground">
            Dengan melanjutkan, kamu setuju dengan{" "}
            <Link to="/ketentuan" className="underline underline-offset-2 hover:text-foreground">
              Ketentuan layanan
            </Link>{" "}
            dan{" "}
            <Link to="/privasi" className="underline underline-offset-2 hover:text-foreground">
              Kebijakan privasi
            </Link>
            .
          </p>
        </div>
      </main>
    </div>
  );
}
