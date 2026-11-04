import { useEffect, useRef } from "react";

import { ENV } from "@/env.public";

interface TurnstileApi {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT;
    script.async = true;
    script.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile missing"));
    script.onerror = () => {
      loading = null;
      reject(new Error("Turnstile failed to load"));
    };
    document.head.append(script);
  });
  return loading;
}

/**
 * Cloudflare Turnstile, shown only when Cloudflare needs the visitor to interact. Calls `onToken` with a fresh token,
 * or null when it expires or fails. Bump `resetKey` after each submit: a token is valid once.
 */
export function Turnstile({
  onToken,
  onFail,
  onInteractive,
  resetKey,
}: {
  onToken: (token: string | null) => void;
  /** The check couldn't run (script blocked, network, Cloudflare error). */
  onFail: () => void;
  /** Cloudflare wants the visitor to tick the box before it issues a token. */
  onInteractive?: () => void;
  resetKey: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const callback = useRef(onToken);
  callback.current = onToken;
  const fail = useRef(onFail);
  fail.current = onFail;
  const interactive = useRef(onInteractive);
  interactive.current = onInteractive;

  useEffect(() => {
    let cancelled = false;
    loadTurnstile()
      .then((api) => {
        if (cancelled || !box.current) return;
        widget.current = api.render(box.current, {
          sitekey: ENV.VITE_TURNSTILE_SITE_KEY,
          appearance: "interaction-only",
          language: "id",
          action: "waitlist",
          callback: (token: string) => callback.current(token),
          "expired-callback": () => callback.current(null),
          "before-interactive-callback": () => interactive.current?.(),
          "error-callback": () => {
            callback.current(null);
            fail.current();
          },
        });
      })
      .catch(() => {
        callback.current(null);
        fail.current();
      });
    return () => {
      cancelled = true;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, []);

  useEffect(() => {
    if (resetKey > 0 && widget.current) {
      callback.current(null);
      window.turnstile?.reset(widget.current);
    }
  }, [resetKey]);

  return <div ref={box} className="wc-turnstile" />;
}
