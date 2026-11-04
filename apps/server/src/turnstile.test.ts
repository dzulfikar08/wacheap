import { describe, expect, test } from "bun:test";

import { TEST_SECRET, verifyTurnstile } from "./turnstile";

const expectOk = { hostname: "wacheap.example", action: "waitlist" };
const answer = (body: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("verifyTurnstile", () => {
  test("sends secret, token and remoteip as form fields", async () => {
    let sent: FormData | undefined;
    const spy = (async (_url: string, init: RequestInit) => {
      sent = init.body as FormData;
      return new Response(JSON.stringify({ success: true, ...expectOk }));
    }) as unknown as typeof fetch;
    expect(
      await verifyTurnstile({
        secret: "s",
        token: "t",
        ip: "1.2.3.4",
        expect: expectOk,
        fetch: spy,
      }),
    ).toBe(true);
    expect([sent?.get("secret"), sent?.get("response"), sent?.get("remoteip")]).toEqual([
      "s",
      "t",
      "1.2.3.4",
    ]);
  });

  test("success: false is refused", async () => {
    const ok = await verifyTurnstile({
      secret: "s",
      token: "t",
      expect: expectOk,
      fetch: answer({ success: false, "error-codes": ["invalid-input-response"] }),
    });
    expect(ok).toBe(false);
  });

  test("a non-OK response is refused", async () => {
    expect(
      await verifyTurnstile({ secret: "s", token: "t", expect: expectOk, fetch: answer({}, 500) }),
    ).toBe(false);
  });

  test("a throwing fetch (network, timeout) is refused", async () => {
    const boom = (async () => {
      throw new DOMException("timed out", "TimeoutError");
    }) as unknown as typeof fetch;
    expect(await verifyTurnstile({ secret: "s", token: "t", expect: expectOk, fetch: boom })).toBe(
      false,
    );
  });

  test("a token minted for another hostname or action is refused", async () => {
    expect(
      await verifyTurnstile({
        secret: "s",
        token: "t",
        expect: expectOk,
        fetch: answer({ success: true, hostname: "evil.example", action: "waitlist" }),
      }),
    ).toBe(false);
    expect(
      await verifyTurnstile({
        secret: "s",
        token: "t",
        expect: expectOk,
        fetch: answer({ success: true, hostname: "wacheap.example", action: "login" }),
      }),
    ).toBe(false);
  });

  test("the test secret skips the hostname and action checks", async () => {
    expect(
      await verifyTurnstile({
        secret: TEST_SECRET,
        token: "t",
        expect: expectOk,
        fetch: answer({ success: true, hostname: "example.com" }),
      }),
    ).toBe(true);
  });
});
