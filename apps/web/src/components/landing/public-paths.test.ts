import { expect, test } from "bun:test";

import { isPublicPath } from "./public-paths";

test("public pages, with or without a trailing slash", () => {
  for (const p of ["/", "/privasi", "/privasi/", "/ketentuan", "/ketentuan//"])
    expect(isPublicPath(p)).toBe(true);
  for (const p of ["/login", "/dashboard", "/privasi-lain"]) expect(isPublicPath(p)).toBe(false);
});
