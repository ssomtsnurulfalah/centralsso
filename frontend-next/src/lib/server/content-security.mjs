import { randomBytes } from "node:crypto";
export function createNonce() {
  return randomBytes(24).toString("base64");
}
export function contentSecurityPolicy(nonce, development = false) {
  if (typeof nonce !== "string" || !/^[A-Za-z0-9+/]{32}$/.test(nonce))
    throw new Error("Nonce CSP tidak valid.");
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    "script-src-attr 'none'",
    `style-src 'self' ${development ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    `style-src-attr ${development ? "'unsafe-inline'" : "'none'"}`,
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self'${development ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "worker-src 'none'",
    ...(development ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}
