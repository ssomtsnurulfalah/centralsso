import { AuthForm } from "@/components/auth-form";
import { headers } from "next/headers";
import { recaptchaPublicConfig } from "@/lib/server/recaptcha.mjs";
export default async function Page() {
  const nonce = (await headers()).get("x-nonce") || "";
  let captcha;
  try {
    captcha = { ...recaptchaPublicConfig(), nonce };
  } catch {
    captcha = { enabled: true, siteKey: "", nonce, configurationError: true };
  }
  return <AuthForm captcha={captcha} />;
}
