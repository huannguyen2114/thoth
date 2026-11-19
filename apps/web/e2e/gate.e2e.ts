import { expect, test } from "@playwright/test";

// Light smoke test. The gate's rules are unit-tested in src/features/access/*.test.ts.
//
// `next dev` and `next start` are the *untrusted* mode (docs/technical_design/14-phone-and-lan.md):
// Next fills x-forwarded-for from the socket only when the client sent none, so the gate cannot
// tell a forged "127.0.0.1" from the real one. That is why `pnpm start:lan` exists, and why dev
// binds 127.0.0.1 only. What must hold in every mode: a request that claims to come from a
// non-loopback address gets no data while no passcode is set.
test.describe("access gate (dev server, no passcode)", () => {
  test("a plain loopback request is allowed", async ({ request }) => {
    const res = await request.get("/", { maxRedirects: 0 });
    expect(res.status()).toBe(200);
  });

  test("a request forwarded for a remote address gets no page and no data", async ({ request }) => {
    const headers = { "x-forwarded-for": "203.0.113.9" };

    const page = await request.get("/", { headers, maxRedirects: 0 });
    expect(page.status()).toBe(403);
    expect(await page.text()).not.toContain("What should we learn?");

    const api = await request.get("/api/search?q=cristae", { headers, maxRedirects: 0 });
    expect(api.status()).toBe(403);
    expect(await api.json()).toEqual({ error: "Remote access is not set up." });
  });

  test("forwarding headers do not widen access for a Server Action either", async ({ request }) => {
    const res = await request.post("/", {
      headers: { "x-forwarded-for": "203.0.113.9", "next-action": "0".repeat(40) },
      data: "[]",
      maxRedirects: 0,
    });
    expect(res.status()).toBe(403);
  });
});
