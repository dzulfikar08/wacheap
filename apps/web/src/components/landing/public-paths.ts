// Kept free of imports so the app shell can read it without pulling in the landing page's CSS and fonts.

/** Paths that use the public site chrome instead of the app header. */
const PUBLIC_PATHS = new Set(["/", "/privasi", "/ketentuan"]);

/** `/privasi/` (the asset server keeps trailing slashes) counts as `/privasi`. */
export function isPublicPath(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return PUBLIC_PATHS.has(path || "/");
}
