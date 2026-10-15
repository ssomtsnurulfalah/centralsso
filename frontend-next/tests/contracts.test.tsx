// @vitest-environment node
import { test, expect, vi } from "vitest";
import { validatePanelData } from "../src/lib/panel-contract";
import { api } from "../src/lib/client";
const user = {
  user_id: "usr_test",
  username: "guru.test",
  full_name: "Guru Uji",
  email: "uji@example.invalid",
  global_role: "user",
  status: "active",
  created_at: "2026-10-01T00:00:00.000Z",
  updated_at: "2026-10-01T00:00:00.000Z",
  last_login: "",
  password_changed_at: "2026-10-01T00:00:00.000Z",
  identity_version: 2,
  archived_at: "",
};
const pagination = {
  page: 1,
  page_size: 25,
  total: 1,
  total_pages: 1,
  has_next: false,
};
test("C01 response null atau action tidak dikenal ditolak", () => {
  for (const value of [null, {}, [], { items: [] }])
    expect(() => validatePanelData("users.list", value)).toThrow();
  expect(() => validatePanelData("__proto__", {})).toThrow();
});
test("C02 timestamp invalid ditolak sebelum sampai komponen", () => {
  for (const timestamp of [
    "bukan-waktu",
    "2026-02-30T00:00:00.000Z",
    "2026-01-01",
  ])
    expect(() =>
      validatePanelData("profile.get", {
        user: { ...user, created_at: timestamp },
      }),
    ).toThrow();
});
test("C03 metadata pagination rusak dan jumlah row tidak cocok ditolak", () => {
  for (const patch of [
    { page: 0 },
    { page_size: 0 },
    { total: -1 },
    { total_pages: 2 },
    { has_next: true },
  ])
    expect(() =>
      validatePanelData("users.list", {
        items: [user],
        pagination: { ...pagination, ...patch },
      }),
    ).toThrow();
  expect(() =>
    validatePanelData("users.list", { items: [], pagination }),
  ).toThrow();
});
test("C04 halaman response harus sama dengan halaman yang diminta", () => {
  expect(() =>
    validatePanelData("users.list", { items: [user], pagination }, { page: 2 }),
  ).toThrow();
});
test("C05 identitas dan versi mutasi harus cocok dengan request", () => {
  const input = {
      user_id: "usr_test",
      expected_version: 1,
      operation_id: "op_test",
    },
    value = { user, operation_id: "op_test", reauthentication_required: false };
  expect(() => validatePanelData("users.update", value, input)).not.toThrow();
  for (const change of [
    { user: { ...user, user_id: "usr_lain" } },
    { user: { ...user, identity_version: 1 } },
    { operation_id: "op_lain" },
  ])
    expect(() =>
      validatePanelData("users.update", { ...value, ...change }, input),
    ).toThrow();
});
test("C06 respons arsip harus nonaktif dan memiliki archived_at", () => {
  const input = {
      user_id: user.user_id,
      expected_version: 1,
      operation_id: "op_test",
    },
    value = { user, operation_id: "op_test", reauthentication_required: false };
  expect(() => validatePanelData("users.archive", value, input)).toThrow();
  expect(() =>
    validatePanelData(
      "users.archive",
      {
        ...value,
        user: {
          ...user,
          status: "inactive",
          archived_at: "2026-10-15T00:00:00.000Z",
        },
      },
      input,
    ),
  ).not.toThrow();
});
test("C07 hash tidak boleh ikut proyeksi pengguna", () => {
  expect(() =>
    validatePanelData("profile.get", {
      user: { ...user, password_hash: "rahasia" },
    }),
  ).toThrow();
  const result = validatePanelData("password.change", {
    changed: true,
    reauthentication_required: true,
    password_hash: "rahasia",
  });
  expect(JSON.stringify(result)).not.toContain("rahasia");
});
test("C08 sukses password palsu dan reset token bukan hex ditolak", () => {
  expect(() =>
    validatePanelData("password.change", {
      changed: false,
      reauthentication_required: true,
    }),
  ).toThrow();
  expect(() =>
    validatePanelData("reset.issue", {
      reset_id: "rst_test",
      expires_at: "2026-11-01T00:00:00.000Z",
      resetToken: "token-palsu",
    }),
  ).toThrow();
});
test("C09 hasil kosong yang sah tetap diterima", () => {
  expect(
    validatePanelData("users.list", {
      items: [],
      pagination: { ...pagination, total: 0, total_pages: 0 },
    }),
  ).toMatchObject({ items: [] });
});
test("C10 frontend API menolak JSON null dengan error aman", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(null)),
  );
  await expect(api("dashboard")).rejects.toMatchObject({
    code: "SERVICE_UNAVAILABLE",
  });
});
test("C11 frontend API tidak menerima data sukses berbentuk salah", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ success: true, data: { users_total: "seribu" } }),
    ),
  );
  await expect(api("dashboard")).rejects.toMatchObject({
    code: "SERVICE_UNAVAILABLE",
  });
});
test("C12 frontend API membuang field tak dikenal dari hasil valid", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        success: true,
        data: {
          changed: true,
          reauthentication_required: true,
          private: "rahasia",
        },
      }),
    ),
  );
  expect(await api("password.change")).toEqual({
    changed: true,
    reauthentication_required: true,
  });
});
