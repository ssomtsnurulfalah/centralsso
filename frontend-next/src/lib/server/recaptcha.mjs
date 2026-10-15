/** reCAPTCHA v2 checkbox. Secret and token stay out of logs/GAS. */
import { readLimited } from "./gas-client.mjs";
const fail = (code) => {
  throw Object.assign(new Error("Verifikasi keamanan gagal."), { code });
};
export function recaptchaPublicConfig(env = process.env) {
  const flag = env.SSO_RECAPTCHA_ENABLED || "false";
  if (!["true", "false"].includes(flag)) fail("CAPTCHA_CONFIGURATION_ERROR");
  if (flag === "false") return { enabled: false, siteKey: "" };
  const siteKey = env.SSO_RECAPTCHA_SITE_KEY || "";
  if (!/^[a-zA-Z0-9_-]{20,200}$/.test(siteKey))
    fail("CAPTCHA_CONFIGURATION_ERROR");
  if (
    env.NODE_ENV === "production" &&
    siteKey === "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI"
  )
    fail("CAPTCHA_CONFIGURATION_ERROR");
  return { enabled: true, siteKey };
}
export async function verifyRecaptcha(
  token,
  { env = process.env, fetchImpl = fetch, now = Date.now() } = {},
) {
  const config = recaptchaPublicConfig(env);
  if (!config.enabled) return;
  const secret = env.SSO_RECAPTCHA_SECRET_KEY;
  let hostname;
  try {
    hostname = new URL(env.SSO_APP_ORIGIN).hostname;
  } catch {
    fail("CAPTCHA_CONFIGURATION_ERROR");
  }
  if (!secret || !/^[a-zA-Z0-9_-]{20,200}$/.test(secret) || !hostname)
    fail("CAPTCHA_CONFIGURATION_ERROR");
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
        body: new URLSearchParams({ secret, response: token }).toString(),
        signal: AbortSignal.timeout(8000),
        redirect: "error",
        cache: "no-store",
      },
    );
    if (!response.ok) fail("CAPTCHA_UNAVAILABLE");
    // Bound the upstream response using the same streaming reader as GAS.
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
      errors.every((e) =>
        [
          "missing-input-response",
          "invalid-input-response",
          "timeout-or-duplicate",
        ].includes(e),
      )
    )
      fail("CAPTCHA_INVALID");
    fail("CAPTCHA_UNAVAILABLE"); // Includes quota errors, even when success:true.
  }
  const timestamp = Date.parse(data.challenge_ts),
    age = now - timestamp;
  if (
    data.success !== true ||
    data.hostname !== hostname ||
    !Number.isFinite(timestamp) ||
    age > 120000 ||
    age < -10000
  )
    fail("CAPTCHA_INVALID");
}
