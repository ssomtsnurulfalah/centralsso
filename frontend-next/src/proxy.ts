import { NextRequest, NextResponse } from "next/server";
import {
  createNonce,
  contentSecurityPolicy,
} from "./lib/server/content-security.mjs";
/** Hanya header. Autentikasi tetap dilakukan pada halaman server dan GAS. */
export function proxy(request: NextRequest) {
  const nonce = createNonce(),
    policy = contentSecurityPolicy(
      nonce,
      process.env.NODE_ENV === "development",
      request.nextUrl.pathname === "/login" &&
        process.env.SSO_RECAPTCHA_ENABLED === "true",
    );
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
