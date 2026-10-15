import { timingSafeEqual } from "node:crypto";
export const cookieName = (production) =>
  production ? "__Host-central_sso_session" : "central_sso_dev_session";
export function cookieOptions(production, expiresAt) {
  return {
    httpOnly: true,
    secure: production,
    sameSite: "lax",
    path: "/",
    ...(expiresAt ? { expires: new Date(expiresAt) } : {}),
  };
}
export function checkOrigin(request, expected, production) {
  let url;
  try {
    url = new URL(expected);
  } catch {
    throw Object.assign(new Error("Konfigurasi origin belum tersedia."), {
      code: "SERVICE_UNAVAILABLE",
    });
  }
  if (
    url.origin !== expected ||
    url.username ||
    url.password ||
    (production
      ? url.protocol !== "https:"
      : !["http:", "https:"].includes(url.protocol))
  )
    throw Object.assign(new Error("Origin tidak valid."), {
      code: "SERVICE_UNAVAILABLE",
    });
  const actual = request.headers.get("origin") || "";
  const a = Buffer.from(actual),
    b = Buffer.from(expected);
  if (
    a.length !== b.length ||
    !timingSafeEqual(a, b) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw Object.assign(new Error("Asal permintaan ditolak."), {
      code: "PERMISSION_DENIED",
    });
}
export const messages = {
  CAPTCHA_REQUIRED: "Selesaikan verifikasi reCAPTCHA sebelum masuk.",
  CAPTCHA_INVALID:
    "Verifikasi reCAPTCHA tidak valid atau kedaluwarsa. Silakan ulangi.",
  CAPTCHA_UNAVAILABLE:
    "Layanan reCAPTCHA belum dapat dihubungi. Silakan coba kembali.",
  CAPTCHA_CONFIGURATION_ERROR:
    "Konfigurasi reCAPTCHA belum lengkap. Hubungi pengelola aplikasi.",
  AUTH_CONFIGURATION_ERROR:
    "Konfigurasi atau data autentikasi GAS tidak valid. Minta pengelola menjalankan diagnoseAdminLoginSetup di editor Apps Script.",
  INVALID_CREDENTIALS:
    "Kredensial tidak valid atau akun tidak dapat digunakan.",
  UNAUTHENTICATED: "Sesi berakhir. Silakan masuk kembali.",
  PERMISSION_DENIED:
    "Akses ditolak. Untuk operasi sensitif, masuk ulang agar sesi berusia kurang dari 5 menit.",
  RATE_LIMITED: "Terlalu banyak permintaan. Tunggu sebelum mencoba lagi.",
  VERSION_CONFLICT: "Data telah berubah. Muat ulang sebelum menyimpan.",
  OPERATION_ALREADY_PROCESSED:
    "Operasi telah diterima sebelumnya. Periksa data terbaru sebelum melanjutkan.",
  LAST_SUPER_ADMIN: "Super Admin aktif terakhir harus dipertahankan.",
  NOT_FOUND: "Data tidak ditemukan.",
  VALIDATION_ERROR:
    "Periksa kembali format isian. Untuk password baru, ikuti kebijakan institusi.",
  INVALID_STATE: "Data tidak dapat diubah dalam kondisi saat ini.",
  APPLICATION_INACTIVE:
    "Aktifkan aplikasi dan akses API sebelum menerbitkan kredensial.",
  CREDENTIAL_LIMIT: "Batas kredensial aktif telah tercapai.",
  SERVICE_UNAVAILABLE:
    "Layanan GAS belum tersedia. Periksa konfigurasi server atau coba kembali nanti.",
};
export function safeError(error) {
  const code = Object.hasOwn(messages, error?.code)
    ? error.code
    : "SERVICE_UNAVAILABLE";
  return {
    code,
    message: messages[code],
    status: ["UNAUTHENTICATED", "INVALID_CREDENTIALS"].includes(code)
      ? 401
      : code === "PERMISSION_DENIED"
        ? 403
        : code === "NOT_FOUND"
          ? 404
          : code === "RATE_LIMITED"
            ? 429
            : [
                  "SERVICE_UNAVAILABLE",
                  "AUTH_CONFIGURATION_ERROR",
                  "CAPTCHA_UNAVAILABLE",
                  "CAPTCHA_CONFIGURATION_ERROR",
                ].includes(code)
              ? 503
              : code === "VERSION_CONFLICT"
                ? 409
                : 400,
    ...(/^op_[a-zA-Z0-9_-]{1,100}$/.test(error?.operation_id || "")
      ? { operation_id: error.operation_id }
      : {}),
  };
}
