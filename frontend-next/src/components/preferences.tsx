"use client";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useData } from "@/lib/client";
import { date as formatDate } from "@/lib/utils";
type Preferences = {
  system_name: string;
  institution_name: string;
  display_timezone: string;
};
const defaults: Preferences = {
  system_name: "Central SSO",
  institution_name: "Administrasi institusi",
  display_timezone: "Asia/Jakarta",
};
const Context = createContext({ value: defaults, reload: () => {} });
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const data = useData<Preferences>("preferences.get");
  const value = useMemo(
    () => ({ value: data.data || defaults, reload: data.reload }),
    [data.data, data.reload],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const usePreferences = () => useContext(Context);
export function useDate() {
  const { value } = usePreferences();
  return (date?: string) => formatDate(date, value.display_timezone);
}
export function timezoneLabel(value: string) {
  return (
    (
      {
        "Asia/Jakarta": "WIB",
        "Asia/Makassar": "WITA",
        "Asia/Jayapura": "WIT",
        UTC: "UTC",
      } as Record<string, string>
    )[value] || "UTC"
  );
}
