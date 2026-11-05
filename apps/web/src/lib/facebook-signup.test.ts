import { describe, expect, test } from "bun:test";

import { isFacebookOrigin } from "./facebook-signup";

describe("isFacebookOrigin", () => {
  test("accepts facebook.com and its subdomains over https only", () => {
    expect(isFacebookOrigin("https://www.facebook.com")).toBe(true);
    expect(isFacebookOrigin("https://facebook.com")).toBe(true);
    expect(isFacebookOrigin("https://web.facebook.com")).toBe(true);
    expect(isFacebookOrigin("https://evilfacebook.com")).toBe(false);
    expect(isFacebookOrigin("https://facebook.com.evil.test")).toBe(false);
    expect(isFacebookOrigin("http://www.facebook.com")).toBe(false);
    expect(isFacebookOrigin("null")).toBe(false);
  });
});
