export const rupiah = (n: number) => `Rp${new Intl.NumberFormat("id-ID").format(n)}`;

/** A date in WIB, e.g. "18 Desember 2026". */
export const tanggal = (d: Date | string) =>
  new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" }).format(
    new Date(d),
  );
