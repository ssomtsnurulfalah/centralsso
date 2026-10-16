// @vitest-environment node
import { test, expect, vi } from "vitest";
import {
  verifyRecaptcha,
  recaptchaPublicConfig,
} from "../src/lib/server/recaptcha.mjs";
import { contentSecurityPolicy } from "../src/lib/server/content-security.mjs";
const env = {
  SSO_RECAPTCHA_ENABLED: "true",
  SSO_RECAPTCHA_SITE_KEY: "site_key_".repeat(5),
  SSO_RECAPTCHA_SECRET_KEY: "private_key_".repeat(5),
  SSO_APP_ORIGIN: "https://sso.example.org",
};
const token = "challenge-token",
  now = Date.now();
const valid = {
  success: true,
  hostname: "sso.example.org",
  challenge_ts: new Date(now - 1000).toISOString(),
};
test("disabled feature makes no Google request; invalid flags fail closed", async () => {
  const fetchImpl = vi.fn();
  await verifyRecaptcha(undefined, { env: {}, fetchImpl });
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(() =>
    recaptchaPublicConfig({ ...env, SSO_RECAPTCHA_ENABLED: "TRUE" }),
  ).toThrow();
  expect(() =>
    recaptchaPublicConfig({
      ...env,
      NODE_ENV: "production",
      SSO_RECAPTCHA_SITE_KEY: "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI",
    }),
  ).toThrow();
});
test("valid checkbox response uses POST and server secret only", async () => {
  const fetchImpl = vi.fn<typeof fetch>(async () => Response.json(valid));
  await verifyRecaptcha(token, { env, fetchImpl, now });
  const [url, options] = fetchImpl.mock.calls[0];
  expect(url).toBe("https://www.google.com/recaptcha/api/siteverify");
  expect(options?.method).toBe("POST");
  expect(options?.redirect).toBe("error");
  expect(options?.cache).toBe("no-store");
  const body = new URLSearchParams(options?.body as string);
  expect(body.get("secret")).toBe(env.SSO_RECAPTCHA_SECRET_KEY);
  expect(body.get("response")).toBe(token);
  expect(recaptchaPublicConfig(env)).toEqual({
    enabled: true,
    siteKey: env.SSO_RECAPTCHA_SITE_KEY,
  });
});
test("missing token and missing config reject before outbound request", async () => {
  const fetchImpl = vi.fn();
  await expect(verifyRecaptcha("", { env, fetchImpl })).rejects.toMatchObject({
    code: "CAPTCHA_REQUIRED",
  });
  await expect(
    verifyRecaptcha(token, {
      env: { ...env, SSO_RECAPTCHA_SECRET_KEY: "" },
      fetchImpl,
    }),
  ).rejects.toMatchObject({ code: "CAPTCHA_CONFIGURATION_ERROR" });
  expect(fetchImpl).not.toHaveBeenCalled();
});
test.each([
  { ...valid, success: false },
  { ...valid, hostname: "attacker.example.org" },
  { ...valid, challenge_ts: new Date(now + 60000).toISOString() },
  { ...valid, challenge_ts: "bad" },
  { ...valid, "error-codes": ["timeout-or-duplicate"] },
])(
  "invalid, expired, duplicate or wrong-host token %# is rejected",
  async (value) => {
    await expect(
      verifyRecaptcha(token, {
        env,
        now,
        fetchImpl: async () => Response.json(value),
      }),
    ).rejects.toMatchObject({ code: "CAPTCHA_INVALID" });
  },
);
test.each([
  null,
  [],
  { ...valid, "error-codes": ["Over free quota."] },
  { ...valid, "error-codes": "unexpected" },
])(
  "malformed and quota response %# never bypasses verification",
  async (value) => {
    await expect(
      verifyRecaptcha(token, {
        env,
        now,
        fetchImpl: async () => Response.json(value),
      }),
    ).rejects.toMatchObject({ code: "CAPTCHA_UNAVAILABLE" });
  },
);
test("Google failure and malformed responses stay generic", async () => {
  for (const fetchImpl of [
    async () => {
      throw new Error("secret should not leak");
    },
    async () => new Response("not json"),
    async () => new Response("", { status: 503 }),
    async () => new Response("x".repeat(17000)),
  ])
    await expect(
      verifyRecaptcha(token, { env, now, fetchImpl }),
    ).rejects.toMatchObject({
      code: "CAPTCHA_UNAVAILABLE",
      message: "Verifikasi keamanan gagal.",
    });
});
test("invalid secret is a configuration issue", async () => {
  await expect(
    verifyRecaptcha(token, {
      env,
      fetchImpl: async () =>
        Response.json({
          success: false,
          "error-codes": ["invalid-input-secret"],
        }),
    }),
  ).rejects.toMatchObject({ code: "CAPTCHA_CONFIGURATION_ERROR" });
});
test("captcha CSP retains nonce/strict-dynamic without unsafe-inline scripts", () => {
  const nonce = "A".repeat(32),
    policy = contentSecurityPolicy(nonce, false, true);
  expect(policy).toContain("'nonce-" + nonce + "' 'strict-dynamic'");
  expect(policy).not.toContain("unsafe-inline");
  expect(policy).toContain("frame-src https://www.google.com/recaptcha/");
  expect(contentSecurityPolicy(nonce, false)).not.toContain("google.com");
});

test("AUDIT challenge load timestamp is not the two-minute token issue time", async () => {
  await expect(
    verifyRecaptcha(token, {
      env,
      now,
      fetchImpl: async () =>
        Response.json({
          ...valid,
          challenge_ts: new Date(now - 15 * 60000).toISOString(),
        }),
    }),
  ).resolves.toBeUndefined();
});
test("AUDIT blank enable flag cannot silently disable protection", () => {
  expect(() =>
    recaptchaPublicConfig({ ...env, SSO_RECAPTCHA_ENABLED: "" }),
  ).toThrow();
});
test("AUDIT page config detects missing secret before presenting a challenge", () => {
  expect(() =>
    recaptchaPublicConfig({ ...env, SSO_RECAPTCHA_SECRET_KEY: "" }),
  ).toThrow();
});
test("AUDIT malformed non-string timestamps and non-JSON responses fail closed", async () => {
  await expect(
    verifyRecaptcha(token, {
      env,
      now,
      fetchImpl: async () =>
        Response.json({ ...valid, challenge_ts: [valid.challenge_ts] }),
    }),
  ).rejects.toBeTruthy();
  await expect(
    verifyRecaptcha(token, {
      env,
      now,
      fetchImpl: async () =>
        new Response(JSON.stringify(valid), {
          headers: { "Content-Type": "text/html" },
        }),
    }),
  ).rejects.toBeTruthy();
});

test.each([
  { SSO_APP_ORIGIN: "https://sso.example.org/" },
  { SSO_APP_ORIGIN: "https://sso.example.org/path" },
  { SSO_APP_ORIGIN: "https://user:pass@sso.example.org" },
  { SSO_APP_ORIGIN: "file:///tmp/app" },
  { SSO_RECAPTCHA_SITE_KEY: 123456789012345678901 },
  { SSO_RECAPTCHA_SECRET_KEY: 123456789012345678901 },
  { NODE_ENV: "production", SSO_APP_ORIGIN: "http://sso.example.org" },
  {
    NODE_ENV: "production",
    SSO_RECAPTCHA_SECRET_KEY: "6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe",
  },
])("AUDIT invalid config %# is rejected before Google", async (patch) => {
  const fetchImpl = vi.fn();
  await expect(
    verifyRecaptcha(token, {
      env: { ...env, ...patch } as unknown as Record<string, string>,
      fetchImpl,
    }),
  ).rejects.toMatchObject({ code: "CAPTCHA_CONFIGURATION_ERROR" });
  expect(fetchImpl).not.toHaveBeenCalled();
});
test("AUDIT server clock is read after verification and malformed date type never passes", async () => {
  const order: string[] = [];
  await verifyRecaptcha(token, {
    env,
    now: () => {
      order.push("clock");
      return now + 30000;
    },
    fetchImpl: async () => {
      order.push("fetch");
      return Response.json({
        ...valid,
        challenge_ts: new Date(now + 20000).toISOString(),
      });
    },
  });
  expect(order).toEqual(["fetch", "clock"]);
  await expect(
    verifyRecaptcha(token, {
      env,
      now: NaN,
      fetchImpl: async () => Response.json(valid),
    }),
  ).rejects.toMatchObject({ code: "CAPTCHA_UNAVAILABLE" });
  for (const challenge_ts of [null, 12345678, [valid.challenge_ts], {}])
    await expect(
      verifyRecaptcha(token, {
        env,
        now,
        fetchImpl: async () => Response.json({ ...valid, challenge_ts }),
      }),
    ).rejects.toMatchObject({ code: "CAPTCHA_INVALID" });
});
test("AUDIT non-JSON content is rejected even if its body resembles a valid result", async () => {
  await expect(
    verifyRecaptcha(token, {
      env,
      now,
      fetchImpl: async () =>
        new Response(JSON.stringify(valid), {
          headers: { "Content-Type": "text/html" },
        }),
    }),
  ).rejects.toMatchObject({ code: "CAPTCHA_UNAVAILABLE" });
});
