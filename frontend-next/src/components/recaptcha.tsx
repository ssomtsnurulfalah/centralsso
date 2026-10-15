"use client";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { Notice } from "./common";
type Api = {
  ready(callback: () => void): void;
  render(
    element: HTMLElement,
    options: {
      sitekey: string;
      size: "compact";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ): number;
  reset(id: number): void;
};
declare global {
  interface Window {
    grecaptcha?: Api;
  }
}
export function Recaptcha({
  siteKey,
  nonce,
  resetVersion,
  onToken,
}: {
  siteKey: string;
  nonce: string;
  resetVersion: number;
  onToken: (token: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null),
    widget = useRef<number | null>(null),
    alive = useRef(true);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (widget.current !== null) {
        try {
          window.grecaptcha?.reset(widget.current);
        } catch {
          /* Widget may already be detached. */
        }
      }
    };
  }, []);
  useEffect(() => {
    if (widget.current !== null) window.grecaptcha?.reset(widget.current);
    onToken("");
  }, [resetVersion, onToken]);
  useEffect(() => {
    if (status !== "loading") return;
    const timeout = setTimeout(() => {
      setStatus("error");
      onToken("");
    }, 15000);
    return () => clearTimeout(timeout);
  }, [status, onToken]);
  function loaded() {
    const api = window.grecaptcha;
    if (!api) {
      setStatus("error");
      return;
    }
    api.ready(() => {
      if (!alive.current || !container.current || widget.current !== null)
        return;
      try {
        widget.current = api.render(container.current, {
          sitekey: siteKey,
          size: "compact",
          callback: (token) => {
            if (alive.current) {
              setStatus("ready");
              onToken(token);
            }
          },
          "expired-callback": () => {
            if (alive.current) onToken("");
          },
          "error-callback": () => {
            if (alive.current) {
              onToken("");
              setStatus("error");
            }
          },
        });
        setStatus("ready");
      } catch {
        setStatus("error");
        onToken("");
      }
    });
  }
  return (
    <div className="captcha-field">
      <Script
        id="sso-recaptcha"
        src="https://www.google.com/recaptcha/api.js?render=explicit&hl=id"
        nonce={nonce}
        strategy="afterInteractive"
        onReady={loaded}
        onError={() => {
          onToken("");
          setStatus("error");
        }}
      />
      <div ref={container} aria-label="Verifikasi reCAPTCHA" />
      {status === "loading" ? (
        <p role="status" className="muted">
          Memuat verifikasi keamanan…
        </p>
      ) : null}
      {status === "error" ? (
        <Notice error>
          Verifikasi keamanan gagal dimuat. Periksa koneksi, lalu{" "}
          <button type="button" onClick={() => window.location.reload()}>
            muat ulang halaman
          </button>
          .
        </Notice>
      ) : null}
    </div>
  );
}
