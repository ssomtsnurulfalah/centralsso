import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export function date(value?: string, timezone = "Asia/Jakarta") {
  return value
    ? new Intl.DateTimeFormat("id-ID", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: timezone,
      }).format(new Date(value)) +
        " " +
        ({
          "Asia/Jakarta": "WIB",
          "Asia/Makassar": "WITA",
          "Asia/Jayapura": "WIT",
          UTC: "UTC",
        }[timezone] || timezone)
    : "Belum pernah";
}
export function operationId() {
  return "op_" + crypto.randomUUID();
}
