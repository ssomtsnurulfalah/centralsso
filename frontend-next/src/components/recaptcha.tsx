"use client";
import Script from "next/script";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
    mounted = useRef(true),
    callback = useRef(onToken);
  const widget = useRef<{
    api: Api;
    id: number;
    invalidate: () => void;
  } | null>(null);
  const [scriptReady, setScriptReady] = useState(false),
    [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  callback.current = onToken;
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  function unavailable() {
    if (mounted.current) {
      callback.current("");
      setStatus("error");
    }
  }
  // Reset while the iframe host is still attached, before React removes it.
  useLayoutEffect(() => {
    if (!scriptReady || !container.current) return;
    let active = true;
    const host = document.createElement("div");
    container.current.appendChild(host);
    callback.current("");
    setStatus("loading");
    const failed = () => {
      if (active) {
        callback.current("");
        setStatus("error");
      }
    };
    const api = window.grecaptcha;
    let owned: { api: Api; id: number; invalidate: () => void } | null = null;
    try {
      if (!api || typeof api.ready !== "function")
        throw Error("API unavailable");
      api.ready(() => {
        if (!active || owned) return;
        try {
          if (
            typeof api.render !== "function" ||
            typeof api.reset !== "function"
          )
            throw Error("Incomplete API");
          const id = api.render(host, {
            sitekey: siteKey,
            size: "compact",
            callback: (token) => {
              if (!active) return;
              if (
                typeof token !== "string" ||
                !token ||
                token.length > 4096 ||
                /\s/.test(token)
              ) {
                failed();
                return;
              }
              setStatus("ready");
              callback.current(token);
            },
            "expired-callback": () => {
              if (active) callback.current("");
            },
            "error-callback": failed,
          });
          if (!Number.isInteger(id) || id < 0) throw Error("Invalid widget");
          owned = {
            api,
            id,
            invalidate: () => {
              active = false;
            },
          };
          widget.current = owned;
          setStatus("ready");
        } catch {
          failed();
        }
      });
    } catch {
      failed();
    }
    return () => {
      active = false;
      if (widget.current === owned) widget.current = null;
      if (owned) {
        try {
          owned.api.reset(owned.id);
        } catch {
          /* Detached widget; callbacks already disabled. */
        }
      }
      host.remove();
    };
  }, [scriptReady, siteKey]);
  useEffect(() => {
    callback.current("");
    const current = widget.current;
    if (current) {
      try {
        current.api.reset(current.id);
      } catch {
        current.invalidate();
        unavailable();
      }
    }
  }, [resetVersion]);
  useEffect(() => {
    if (status !== "loading") return;
    const timeout = setTimeout(unavailable, 15000);
    return () => clearTimeout(timeout);
  }, [status, siteKey]);
  return (
    <div>
      <Script
        id="sso-recaptcha"
        src="https://www.google.com/recaptcha/api.js?render=explicit&hl=id"
        nonce={nonce}
        strategy="afterInteractive"
        onReady={() => {
          if (mounted.current) setScriptReady(true);
        }}
        onError={unavailable}
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
