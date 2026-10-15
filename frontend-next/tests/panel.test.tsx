import { test, expect, vi } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Identity, UserRecord } from "../src/lib/panel-schema";
import { AuthForm } from "../src/components/auth-form";
import { UsersPanel } from "../src/components/users-panel";
import { ApplicationsPanel } from "../src/components/applications-panel";
import { CredentialsPanel } from "../src/components/credentials-panel";
import { ProfilePanel } from "../src/components/profile-panel";
import { Shell } from "../src/components/shell";
const actor: Identity = {
  sso_user_id: "usr_admin",
  username: "admin.utama",
  full_name: "Admin Utama",
  global_role: "admin",
  account_status: "active",
  identity_version: 1,
};
const superAdmin: Identity = { ...actor, global_role: "super_admin" };
const user: UserRecord = {
  user_id: "usr_user",
  username: "guru.utama",
  full_name: "Guru Utama",
  email: "guru@example.sch.id",
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
const app = {
  application_id: "app_utama",
  application_name: "Aplikasi Uji",
  application_url: "https://app.example.sch.id",
  application_description: "Aplikasi untuk tes UI",
  application_type: "web",
  application_status: "active",
  api_access_enabled: true,
  created_at: "2026-10-01T00:00:00.000Z",
  updated_at: "2026-10-01T00:00:00.000Z",
  record_version: 1,
};
type Request = { action: string; input: Record<string, unknown> };
function server(handler: (request: Request) => unknown) {
  const calls: Request[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) => {
      const request = JSON.parse(options.body) as Request;
      calls.push(request);
      const data = handler(request);
      return Response.json({ success: true, data });
    }),
  );
  return calls;
}
test("UI01 login gagal menampilkan error aman dan dapat dicoba kembali", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json(
        {
          success: false,
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Kredensial tidak valid.",
          },
        },
        { status: 401 },
      ),
    ),
  );
  render(<AuthForm />);
  const u = userEvent.setup();
  await u.type(screen.getByLabelText("Username"), "admin.utama");
  await u.type(screen.getByLabelText("Password"), "frasa sandi salah");
  await u.click(screen.getByRole("button", { name: "Masuk ke dashboard" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Kredensial tidak valid",
  );
  expect(
    screen
      .getByRole("button", { name: "Masuk ke dashboard" })
      .hasAttribute("disabled"),
  ).toBe(false);
});
test("UI02 password tidak tampil sebelum tombol visibilitas ditekan", async () => {
  render(<AuthForm />);
  const input = screen.getByLabelText("Password") as HTMLInputElement;
  expect(input.type).toBe("password");
  await userEvent.click(
    screen.getByRole("button", { name: "Tampilkan password" }),
  );
  expect(input.type).toBe("text");
  await userEvent.click(
    screen.getByRole("button", { name: "Sembunyikan password" }),
  );
  expect(input.type).toBe("password");
});
test("UI03 navigasi Admin menyembunyikan aplikasi, kredensial, log dan pengaturan", () => {
  render(
    <Shell user={actor} section="users">
      <p>Konten panel</p>
    </Shell>,
  );
  const nav = screen.getByRole("navigation");
  expect(within(nav).queryByText("Aplikasi")).toBeNull();
  expect(within(nav).queryByText("Kredensial API")).toBeNull();
  expect(within(nav).queryByText("Pengaturan")).toBeNull();
  expect(within(nav).getByText("Pengguna")).toBeTruthy();
});
test("UI04 edit pengguna membawa ID permanen, versi dan operation ID ke server", async () => {
  const calls = server(({ action, input }) =>
    action === "users.list"
      ? { items: [user], pagination }
      : {
          user: { ...user, full_name: "Nama Terbaru", identity_version: 3 },
          operation_id: input.operation_id,
          reauthentication_required: false,
        },
  );
  render(<UsersPanel user={actor} />);
  const u = userEvent.setup();
  await u.click(await screen.findByRole("button", { name: "Edit guru.utama" }));
  const dialog = screen.getByRole("dialog");
  expect(
    (within(dialog).getByLabelText(/Role global/) as HTMLSelectElement)
      .disabled,
  ).toBe(true);
  expect(
    within(dialog).queryByRole("option", { name: "Super Admin" }),
  ).toBeNull();
  const name = within(dialog).getByLabelText("Nama lengkap");
  await u.clear(name);
  await u.type(name, "Nama Terbaru");
  await u.click(
    within(dialog).getByRole("button", { name: "Simpan perubahan" }),
  );
  await waitFor(() =>
    expect(calls.some((c) => c.action === "users.update")).toBe(true),
  );
  const call = calls.find((c) => c.action === "users.update")!;
  expect(call.input.user_id).toBe(user.user_id);
  expect(call.input.expected_version).toBe(2);
  expect(call.input.operation_id).toMatch(/^op_/);
  expect(call.input.patch).toMatchObject({
    full_name: "Nama Terbaru",
    global_role: "user",
  });
});
test("UI05 arsip menunggu konfirmasi dan mempertahankan versi data saat dikirim", async () => {
  const calls = server(({ action, input }) =>
    action === "users.list"
      ? { items: [user], pagination }
      : {
          user: {
            ...user,
            identity_version: 3,
            status: "inactive",
            archived_at: "2026-10-15T00:00:00.000Z",
          },
          operation_id: input.operation_id,
          reauthentication_required: false,
        },
  );
  render(<UsersPanel user={superAdmin} />);
  const u = userEvent.setup();
  await u.click(
    await screen.findByRole("button", { name: "Arsipkan guru.utama" }),
  );
  expect(calls.some((c) => c.action === "users.archive")).toBe(false);
  const dialog = screen.getByRole("dialog");
  expect(dialog.textContent).toContain("diarsipkan permanen");
  await u.click(
    within(dialog).getByRole("button", { name: "Arsipkan pengguna" }),
  );
  await waitFor(() =>
    expect(
      calls.find((c) => c.action === "users.archive")?.input,
    ).toMatchObject({ user_id: user.user_id, expected_version: 2 }),
  );
});
test("UI06 pagination pengguna meminta halaman berikutnya dan query baru kembali ke halaman pertama", async () => {
  const calls = server(({ input }) => ({
    items: [user],
    pagination: {
      ...pagination,
      page: Number(input.page ?? 1),
      page_size: 1,
      total: 2,
      total_pages: 2,
      has_next: Number(input.page ?? 1) < 2,
    },
  }));
  render(<UsersPanel user={actor} />);
  await screen.findByText("Guru Utama");
  await userEvent.click(
    screen.getByRole("button", { name: "Halaman berikutnya" }),
  );
  await waitFor(() => expect(calls.at(-1)?.input.page).toBe(2));
  await screen.findByText("Guru Utama");
  await userEvent.type(
    screen.getByRole("textbox", { name: "Kata pencarian" }),
    "Guru",
  );
  await userEvent.click(screen.getByRole("button", { name: "Cari" }));
  await waitFor(() =>
    expect(calls.at(-1)?.input).toMatchObject({ query: "Guru", page: 1 }),
  );
});
test("UI07 pendaftaran aplikasi baru memakai default nonaktif dan API tidak diizinkan", async () => {
  server(() => ({
    items: [],
    pagination: { ...pagination, total: 0, total_pages: 0 },
  }));
  render(<ApplicationsPanel />);
  await userEvent.click(
    screen.getByRole("button", { name: "Daftarkan aplikasi" }),
  );
  const dialog = screen.getByRole("dialog");
  expect(
    (within(dialog).getByLabelText("Status aplikasi") as HTMLSelectElement)
      .value,
  ).toBe("inactive");
  expect(
    (
      within(dialog).getByRole("checkbox", {
        name: "Izinkan akses API",
      }) as HTMLInputElement
    ).checked,
  ).toBe(false);
  expect(
    within(dialog).getByText(/tidak membuat aplikasi eksternal/),
  ).toBeTruthy();
});
test("UI08 secret penerbitan hilang dari DOM setelah ditutup dan tidak ditulis ke storage", async () => {
  const value = "d".repeat(64),
    storage = vi.spyOn(Storage.prototype, "setItem");
  const calls = server(({ action, input }) =>
    action === "apps.list"
      ? { items: [app], pagination }
      : action === "credentials.list"
        ? { items: [], pagination: { ...pagination, total: 0, total_pages: 0 } }
        : {
            client_secret: value,
            operation_id: input.operation_id,
            previous_credential_id: null,
            credential: {
              credential_id: "cred_test",
              credential_name: "Kunci uji",
              credential_fingerprint: "e".repeat(64),
              revision: "f".repeat(64),
              allowed_scopes: ["auth:verify"],
              status: "active",
              effective_status: "active",
              lifecycle_committed: true,
              usable: true,
              created_at: "2026-10-01T00:00:00.000Z",
              rotated_at: "",
              revoked_at: "",
              application_id: app.application_id,
              key_id: "key_test",
              expires_at: "2026-12-01T00:00:00.000Z",
            },
          },
  );
  render(<CredentialsPanel />);
  const u = userEvent.setup();
  await screen.findByRole("option", { name: "Aplikasi Uji (aktif)" });
  await u.selectOptions(
    screen.getByLabelText("Aplikasi terdaftar"),
    app.application_id,
  );
  await u.click(screen.getByRole("button", { name: "Terbitkan kredensial" }));
  const dialog = screen.getByRole("dialog");
  await u.type(within(dialog).getByLabelText("Nama kredensial"), "Kunci uji");
  await u.click(within(dialog).getByRole("checkbox", { name: /auth:verify/ }));
  await u.click(
    within(dialog).getByRole("button", { name: "Terbitkan secret" }),
  );
  expect(await screen.findByDisplayValue(value)).toBeTruthy();
  expect(storage).not.toHaveBeenCalled();
  expect(
    calls.find((c) => c.action === "credentials.issue")?.input,
  ).toMatchObject({
    application_id: app.application_id,
    options: { allowed_scopes: ["auth:verify"] },
  });
  await u.click(screen.getByRole("button", { name: "Selesai dan tutup" }));
  expect(screen.queryByDisplayValue(value)).toBeNull();
});
test("UI09 kegagalan backend menampilkan retry dan tidak menampilkan angka buatan", async () => {
  let fail = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      fail
        ? Response.json(
            {
              success: false,
              error: {
                code: "SERVICE_UNAVAILABLE",
                message: "GAS belum tersedia.",
              },
            },
            { status: 503 },
          )
        : Response.json({ success: true, data: { items: [user], pagination } }),
    ),
  );
  render(<UsersPanel user={actor} />);
  expect((await screen.findByRole("alert")).textContent).toContain(
    "GAS belum tersedia",
  );
  expect(screen.queryByText("Guru Utama")).toBeNull();
  fail = false;
  await userEvent.click(screen.getByRole("button", { name: "Coba kembali" }));
  expect(await screen.findByText("Guru Utama")).toBeTruthy();
});
test("UI10 konfirmasi password yang berbeda tidak mengirim perubahan ke backend", async () => {
  const calls = server(() => ({ user }));
  render(<ProfilePanel />);
  await screen.findByText("Informasi profil");
  const u = userEvent.setup();
  await u.type(
    screen.getByLabelText(/^Password baru/),
    "Frasa sandi panjang satu",
  );
  await u.type(
    screen.getByLabelText("Konfirmasi password baru"),
    "Frasa sandi panjang dua",
  );
  await u.click(
    screen.getByRole("button", { name: "Ubah password & masuk ulang" }),
  );
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Konfirmasi password belum sama",
  );
  expect(calls.some((c) => c.action === "password.change")).toBe(false);
});
test("UI11 preferensi institusi dan zona waktu berasal dari backend dan berubah setelah penyimpanan", async () => {
  let timezone = "Asia/Jakarta";
  server(({ action, input }) =>
    action === "preferences.get"
      ? {
          system_name: "Central SSO",
          institution_name: "Madrasah Uji",
          display_timezone: timezone,
        }
      : action === "settings.get"
        ? {
            items: [
              {
                setting_key: "display_timezone",
                setting_value: timezone,
                description: "Zona waktu tampilan",
                updated_at: "2026-10-01T00:00:00.000Z",
              },
            ],
          }
        : ((timezone = input.setting_value as string),
          {
            setting: {
              setting_key: "display_timezone",
              setting_value: timezone,
              description: "Zona waktu tampilan",
              updated_at: "2026-10-01T00:00:00.000Z",
            },
          }),
  );
  const { Panel } = await import("../src/components/panel");
  render(
    <Shell user={superAdmin} section="settings">
      <Panel user={superAdmin} section="settings" />
    </Shell>,
  );
  expect(await screen.findByText("Waktu tampilan: WIB")).toBeTruthy();
  await userEvent.click(await screen.findByRole("button", { name: "Ubah" }));
  const dialog = screen.getByRole("dialog");
  await userEvent.selectOptions(
    within(dialog).getByLabelText("Nilai pengaturan"),
    "Asia/Makassar",
  );
  await userEvent.click(
    within(dialog).getByRole("button", { name: "Simpan perubahan" }),
  );
  expect(await screen.findByText("Waktu tampilan: WITA")).toBeTruthy();
  expect(screen.getAllByText("Madrasah Uji").length).toBeGreaterThan(0);
});
test("UI12 nama pengguna berisi markup dirender sebagai teks, tanpa elemen injeksi", () => {
  server(() => ({
    system_name: "Central SSO",
    institution_name: "Uji",
    display_timezone: "Asia/Jakarta",
  }));
  const text = "<img src=x onerror=alert(1)><script>alert(2)</script>";
  render(
    <Shell user={{ ...actor, full_name: text }} section="users">
      <p>Konten</p>
    </Shell>,
  );
  expect(document.querySelector("img")).toBeNull();
  expect(document.querySelector("script")).toBeNull();
  expect(screen.getByText(text)).toBeTruthy();
});
