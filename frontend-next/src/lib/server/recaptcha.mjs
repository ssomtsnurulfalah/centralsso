/** reCAPTCHA v2 checkbox. Never log secrets or tokens. */
import { readLimited } from "./gas-client.mjs";
const fail = (code) => {
  throw Object.assign(new Error("Verifikasi keamanan gagal."), { code });
};
const validKey = (value) =>
  typeof value === "string" && /^[a-zA-Z0-9_-]{20,200}$/.test(value);
const TEST_SITE_KEY = "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI";
const TEST_SECRET_KEY = "6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe";
function configuration(env) {
  const flag = env.SSO_RECAPTCHA_ENABLED ?? "false";
  if (!["true", "false"].includes(flag)) fail("CAPTCHA_CONFIGURATION_ERROR");
  if (flag === "false") return { enabled: false, siteKey: "" };
  const siteKey = env.SSO_RECAPTCHA_SITE_KEY,
    secret = env.SSO_RECAPTCHA_SECRET_KEY;
  if (
    !validKey(siteKey) ||
    !validKey(secret) ||
    (env.NODE_ENV === "production" &&
      (siteKey === TEST_SITE_KEY || secret === TEST_SECRET_KEY))
  )
    fail("CAPTCHA_CONFIGURATION_ERROR");
  let origin;
  try {
    origin = new URL(env.SSO_APP_ORIGIN);
  } catch {
    fail("CAPTCHA_CONFIGURATION_ERROR");
  }
  if (
    origin.origin !== env.SSO_APP_ORIGIN ||
    origin.username ||
    origin.password ||
    (env.NODE_ENV === "production"
      ? origin.protocol !== "https:"
      : !["http:", "https:"].includes(origin.protocol))
  )
    fail("CAPTCHA_CONFIGURATION_ERROR");
  return { enabled: true, siteKey, secret, hostname: origin.hostname };
}
export function recaptchaPublicConfig(env = process.env) {
  const { enabled, siteKey } = configuration(env);
  return { enabled, siteKey }; // Explicit projection: never return secret/hostname to the browser.
}
export async function verifyRecaptcha(
  token,
  { env = process.env, fetchImpl = fetch, now = Date.now } = {},
) {
  const config = configuration(env);
  if (!config.enabled) return;
  if (
    typeof token !== "string" ||
    !token ||
    token.length > 4096 ||
    /\s/.test(token)
  )
    fail("CAPTCHA_REQUIRED");
  let data;
  try {
    const response = await fetchImpl(
      "https://www.google.com/recaptcha/api/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          secret: config.secret,
          response: token,
        }).toString(),
        signal: AbortSignal.timeout(8000),
        redirect: "error",
        cache: "no-store",
      },
    );
    if (
      !response.ok ||
      response.redirected ||
      response.headers
        .get("content-type")
        ?.split(";")[0]
        .trim()
        .toLowerCase() !== "application/json"
    )
      fail("CAPTCHA_UNAVAILABLE");
    data = JSON.parse(
      await readLimited(response, 16384, "CAPTCHA_UNAVAILABLE"),
    );
  } catch {
    fail("CAPTCHA_UNAVAILABLE");
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    fail("CAPTCHA_UNAVAILABLE");
  const errors = data["error-codes"];
  if (errors !== undefined && (!Array.isArray(errors) || errors.length)) {
    if (
      Array.isArray(errors) &&
      errors.some((e) =>
        [
          "missing-input-secret",
          "invalid-input-secret",
          "invalid-keys",
        ].includes(e),
      )
    )
      fail("CAPTCHA_CONFIGURATION_ERROR");
    if (
      Array.isArray(errors) &&
      errors.length > 0 &&
      errors.every((e) =>
        [
          "missing-input-response",
          "invalid-input-response",
          "timeout-or-duplicate",
        ].includes(e),
      )
    )
      fail("CAPTCHA_INVALID");
    fail("CAPTCHA_UNAVAILABLE"); // Includes quota errors, even if success:true.
  }
  const current = typeof now === "function" ? now() : now;
  if (!Number.isFinite(current)) fail("CAPTCHA_UNAVAILABLE");
  // Google challenge_ts is widget-load time, NOT the token issue time.
  // Google success/timeout-or-duplicate enforce token expiry and single use.
  const stamp = data.challenge_ts;
  const validStamp =
    typeof stamp === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:?\d{2})$/.test(
      stamp,
    );
  const timestamp = validStamp ? Date.parse(stamp) : NaN;
  if (
    data.success !== true ||
    data.hostname !== config.hostname ||
    !Number.isFinite(timestamp) ||
    timestamp - current > 10000
  )
    fail("CAPTCHA_INVALID");
}
