// @vitest-environment node
import { test, expect } from "vitest";
import { NextRequest } from "next/server";
import {
  createNonce,
  contentSecurityPolicy,
} from "../src/lib/server/content-security.mjs";
import { proxy } from "../src/proxy";
test("CSP01 nonce acak 192 bit tidak berulang dalam 1.000 sampel", () => {
  const values = Array.from({ length: 1000 }, () => createNonce());
  expect(new Set(values).size).toBe(1000);
  expect(values.every((n) => /^[A-Za-z0-9+/]{32}$/.test(n))).toBe(true);
});
test("CSP02 produksi menolak inline/eval umum dan membatasi sumber", () => {
  const n = createNonce(),
    p = contentSecurityPolicy(n);
  expect(p).toContain(`'nonce-${n}'`);
  expect(p).toContain("'strict-dynamic'");
  expect(p).not.toContain("'unsafe-inline'");
  expect(p).not.toContain("'unsafe-eval'");
  for (const directive of [
    "script-src-attr 'none'",
    "style-src-attr 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ])
    expect(p).toContain(directive);
});
test("CSP03 kelonggaran debugger hanya berada pada development", () => {
  const n = createNonce(),
    p = contentSecurityPolicy(n, true);
  expect(p).toContain("'unsafe-eval'");
  expect(p).toContain("style-src 'self' 'unsafe-inline'");
  expect(p).not.toContain("upgrade-insecure-requests");
  expect(
    p.split(";").find((v) => v.trim().startsWith("script-src ")),
  ).not.toContain("unsafe-inline");
});
test("CSP04 nonce berisi karakter injeksi ditolak", () => {
  for (const nonce of ["", "x'; script-src *", "a".repeat(31), "a".repeat(33)])
    expect(() => contentSecurityPolicy(nonce)).toThrow();
});
test("CSP05 header nonce dan CSP dari pengirim selalu diganti", () => {
  const response = proxy(
    new NextRequest("https://example.invalid/admin", {
      headers: {
        "x-nonce": "injected-nonce",
        "Content-Security-Policy": "injected-policy",
      },
    }),
  );
  const nonce = response.headers.get("x-middleware-request-x-nonce")!;
  expect(nonce).toMatch(/^[A-Za-z0-9+/]{32}$/);
  expect(response.headers.get("Content-Security-Policy")).toContain(
    `'nonce-${nonce}'`,
  );
  expect(response.headers.get("Content-Security-Policy")).not.toContain(
    "injected",
  );
  expect(
    response.headers.get("x-middleware-request-content-security-policy"),
  ).toBe(response.headers.get("Content-Security-Policy"));
});
test("CSP06 dua request tidak memakai nonce atau response cache yang sama", () => {
  const a = proxy(new NextRequest("https://example.invalid/login")),
    b = proxy(new NextRequest("https://example.invalid/login"));
  expect(a.headers.get("Content-Security-Policy")).not.toBe(
    b.headers.get("Content-Security-Policy"),
  );
  expect(a.headers.get("Cache-Control")).toContain("no-store");
});
