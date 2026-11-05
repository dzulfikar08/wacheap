// Meta's WhatsApp Embedded Signup (v4) in the browser: the seller logs in to Facebook in a popup, picks or creates a
// WhatsApp Business account and number, and Meta hands back a short-lived code (FB.login's callback) plus the picked
// account and number (a postMessage from facebook.com). The server trades the code for the seller's token.

interface FacebookSdk {
  init(options: {
    appId: string;
    autoLogAppEvents: boolean;
    xfbml: boolean;
    version: string;
  }): void;
  login(
    callback: (response: { authResponse?: { code?: string } | null; status?: string }) => void,
    options: Record<string, unknown>,
  ): void;
}

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

export interface SignupConfig {
  appId: string;
  configId: string;
  graphVersion: string;
}

export interface SignupResult {
  code: string;
  wabaId: string;
  phoneNumberId: string;
}

/** Why the flow ended without a number, worded for the seller. */
export class SignupCancelled extends Error {}

let sdk: Promise<FacebookSdk> | null = null;

/** Loads Meta's JS SDK once and initialises it for this app. */
function loadSdk(config: SignupConfig): Promise<FacebookSdk> {
  sdk ??= new Promise<FacebookSdk>((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB!.init({
        appId: config.appId,
        autoLogAppEvents: true,
        xfbml: false,
        version: config.graphVersion,
      });
      resolve(window.FB!);
    };
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.onerror = () => {
      sdk = null;
      reject(
        new SignupCancelled(
          "Tidak bisa memuat Facebook. Cek koneksi atau matikan pemblokir iklan untuk halaman ini.",
        ),
      );
    };
    document.head.appendChild(script);
  });
  return sdk;
}

/**
 * Loads the SDK ahead of the click. The button stays disabled until this resolves, so the click can call FB.login
 * synchronously: browsers block popups opened after an await on the network.
 */
export function preloadSignup(config: SignupConfig): Promise<void> {
  return loadSdk(config).then(() => undefined);
}

/** True for https://facebook.com and its subdomains only (not e.g. evilfacebook.com). */
export function isFacebookOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (
      url.protocol === "https:" &&
      (url.hostname === "facebook.com" || url.hostname.endsWith(".facebook.com"))
    );
  } catch {
    return false;
  }
}

/** The seller may sit in the popup a while (creating a business, verifying a number by SMS); then give up. */
const FLOW_TIMEOUT_MS = 15 * 60 * 1000;

interface SessionInfo {
  type?: string;
  event?: string;
  data?: {
    waba_id?: string;
    phone_number_id?: string;
    current_step?: string;
    error_message?: string;
  };
}

/**
 * Runs the popup. Resolves once both the code and the picked number are known; rejects with SignupCancelled when the
 * seller closes it, picks no number, or Meta reports an error.
 */
export function runEmbeddedSignup(config: SignupConfig): Promise<SignupResult> {
  const FB = window.FB;
  if (!FB)
    return Promise.reject(
      new SignupCancelled("Facebook belum siap. Tunggu sebentar lalu coba lagi."),
    );
  return new Promise<SignupResult>((resolve, reject) => {
    let code: string | null = null;
    let picked: { wabaId: string; phoneNumberId: string } | null = null;
    let settled = false;
    // Started once the code arrives: the session message may come just after it; wait a little, well inside 30 s.
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (outcome: SignupResult | Error) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", onMessage);
      clearTimeout(timer);
      clearTimeout(overall);
      if (outcome instanceof Error) reject(outcome);
      else resolve(outcome);
    };
    const tryResolve = () => {
      if (code && picked) finish({ code, ...picked });
    };

    const onMessage = (event: MessageEvent) => {
      if (!isFacebookOrigin(event.origin)) return;
      let info: SessionInfo;
      try {
        info = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (info?.type !== "WA_EMBEDDED_SIGNUP") return;
      if (info.event === "CANCEL") {
        finish(new SignupCancelled("Koneksi dibatalkan sebelum selesai."));
      } else if (info.event === "ERROR") {
        finish(
          new SignupCancelled(
            `Facebook melaporkan masalah: ${info.data?.error_message ?? "tidak diketahui"}`,
          ),
        );
      } else if (info.event?.startsWith("FINISH")) {
        const wabaId = info.data?.waba_id;
        const phoneNumberId = info.data?.phone_number_id;
        if (!wabaId || !phoneNumberId) {
          finish(
            new SignupCancelled(
              "Akun WhatsApp dibuat tanpa nomor. Ulangi dan tambahkan nomor telepon di langkah terakhir.",
            ),
          );
          return;
        }
        picked = { wabaId, phoneNumberId };
        tryResolve();
      }
    };
    window.addEventListener("message", onMessage);
    const overall = setTimeout(
      () => finish(new SignupCancelled("Waktu habis. Ulangi Hubungkan dengan Facebook.")),
      FLOW_TIMEOUT_MS,
    );

    FB.login(
      (response) => {
        const value = response.authResponse?.code;
        if (!value) {
          finish(new SignupCancelled("Koneksi dibatalkan sebelum selesai."));
          return;
        }
        code = value;
        tryResolve();
        if (!settled)
          timer = setTimeout(
            () =>
              finish(
                new SignupCancelled(
                  "Facebook tidak mengirim nomor yang dipilih. Ulangi Hubungkan dengan Facebook.",
                ),
              ),
            8000,
          );
      },
      {
        config_id: config.configId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {} },
      },
    );
  });
}
