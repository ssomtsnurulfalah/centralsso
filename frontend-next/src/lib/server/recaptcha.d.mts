export type RecaptchaConfig = { enabled: boolean; siteKey: string };
export function recaptchaPublicConfig(
  env?: Record<string, string | undefined>,
): RecaptchaConfig;
export function verifyRecaptcha(
  token: unknown,
  options?: {
    env?: Record<string, string | undefined>;
    fetchImpl?: typeof fetch;
    now?: number;
  },
): Promise<void>;
