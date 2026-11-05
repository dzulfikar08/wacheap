// better-auth answers in English; the sign-in page shows these instead.
const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Email atau kata sandi salah.",
  INVALID_PASSWORD: "Kata sandi salah.",
  INVALID_EMAIL: "Alamat email tidak valid.",
  USER_ALREADY_EXISTS: "Email ini sudah terdaftar. Masuk saja, atau pakai email lain.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
    "Email ini sudah terdaftar. Masuk saja, atau pakai email lain.",
  PASSWORD_TOO_SHORT: "Kata sandi terlalu pendek.",
  PASSWORD_TOO_LONG: "Kata sandi terlalu panjang.",
  EMAIL_NOT_VERIFIED: "Email kamu belum diverifikasi. Cek kotak masukmu.",
  FAILED_TO_CREATE_USER: "Akun belum bisa dibuat. Coba lagi sebentar lagi.",
};

/** An Indonesian message for a failed better-auth call, from its error code or HTTP status. */
export function authErrorMessage(error: { code?: string; status?: number }, fallback: string) {
  if (error.code && MESSAGES[error.code]) return MESSAGES[error.code]!;
  if (error.status === 429) return "Terlalu banyak percobaan. Tunggu sebentar, lalu coba lagi.";
  if (error.status && error.status >= 500)
    return "Server sedang bermasalah. Coba lagi sebentar lagi.";
  return fallback;
}
