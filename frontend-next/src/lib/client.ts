"use client";
import { useCallback, useEffect, useState } from "react";
import { validatePanelData } from "./panel-contract";
export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public operation_id?: string,
  ) {
    super(message);
  }
}
export async function api<T>(action: string, input: unknown = {}): Promise<T> {
  const response = await fetch("/api/panel", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, input }),
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new ApiError(
      "Respons layanan tidak dapat dibaca.",
      "SERVICE_UNAVAILABLE",
    );
  }
  if (
    !result ||
    typeof result !== "object" ||
    typeof result.success !== "boolean"
  )
    throw new ApiError(
      "Respons layanan tidak dapat dibaca.",
      "SERVICE_UNAVAILABLE",
    );
  if (!response.ok || result.success !== true) {
    if (response.status === 401 && result.error?.code === "UNAUTHENTICATED")
      window.location.assign("/login?expired=1");
    throw new ApiError(
      result.error?.message || "Permintaan gagal.",
      result.error?.code || "SERVICE_UNAVAILABLE",
      result.error?.operation_id,
    );
  }
  try {
    return validatePanelData(
      action,
      result.data,
      input as Record<string, unknown>,
    ) as T;
  } catch {
    throw new ApiError(
      "Respons layanan tidak sesuai kontrak.",
      "SERVICE_UNAVAILABLE",
    );
  }
}
export function useData<T>(
  action: string,
  input: unknown = {},
  enabled = true,
) {
  const [state, setState] = useState<{
    data?: T;
    error?: string;
    loading: boolean;
  }>({ loading: true });
  const [revision, setRevision] = useState(0);
  const key = JSON.stringify(input);
  useEffect(() => {
    let alive = true;
    if (!enabled) {
      setState({ loading: false });
      return;
    }
    setState({ loading: true });
    api<T>(action, JSON.parse(key))
      .then((data) => {
        if (alive) setState({ data, loading: false });
      })
      .catch((error) => {
        if (alive) setState({ error: error.message, loading: false });
      });
    return () => {
      alive = false;
    };
  }, [action, key, enabled, revision]);
  const reload = useCallback(() => setRevision((v) => v + 1), []);
  return { ...state, reload };
}
export function errorMessage(error: unknown) {
  return error instanceof ApiError && error.operation_id
    ? `${error.message} ID operasi: ${error.operation_id}. Periksa status sebelum mengulangi.`
    : error instanceof Error
      ? error.message
      : "Permintaan gagal.";
}
