// @vitest-environment node
import { beforeAll, beforeEach, afterEach, test, expect, vi } from "vitest";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { hashPassword, digest, secret } from "../src/lib/server/password.mjs";
import { POST } from "../src/app/api/panel/route";
const cookies = vi.hoisted(() => ({
  values: new Map<string, string>(),
  writes: [] as {
    name: string;
    value: string;
    options: Record<string, unknown>;
  }[],
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookies.values.has(name)
        ? { value: cookies.values.get(name) }
        : undefined,
    set: (name: string, value: string, options: Record<string, unknown>) => {
      cookies.values.set(name, value);
      cookies.writes.push({ name, value, options });
    },
  }),
}));
const { environment } = createRequire(import.meta.url)(
  "../../tests/gas-mock.cjs",
);
const password = "Frasa sandi pengujian route 2026";
let material: Awaited<ReturnType<typeof hashPassword>>;
let e: ReturnType<typeof environment>, transport: ReturnType<typeof vi.fn>;
const tokens: Record<string, string> = {},
  users: Record<string, Record<string, unknown>> = {};
beforeAll(async () => {
  material = await hashPassword(password);
});
beforeEach(() => {
  cookies.values.clear();
  cookies.writes.length = 0;
  e = environment();
  e.initialize();
  e.db = e.db();
  const key = secret();
  Object.assign(e.state.properties, {
    SSO_SPREADSHEET_ID: "test-id",
    SSO_ENVIRONMENT: "development",
    SSO_GATEWAY_KEY_ID: "gateway",
    SSO_GATEWAY_SECRET: key,
    SSO_RATE_LIMIT_SECRET: secret(),
  });
  vi.stubEnv("SSO_GAS_URL", "https://script.google.com/macros/s/test/exec");
  vi.stubEnv("SSO_GATEWAY_KEY_ID", "gateway");
  vi.stubEnv("SSO_GATEWAY_SECRET", key);
  vi.stubEnv("SSO_APP_ORIGIN", "https://sso.example.sch.id");
  for (const role of ["super_admin", "admin", "user"]) {
    const u = e.db.insert("Users", {
        ...material,
        username: role + ".utama",
        full_name: "Nama " + role,
        email: role + "@example.sch.id",
        global_role: role,
        status: "active",
      }),
      token = secret();
    tokens[role] = token;
    users[role] = u;
    e.db.insert("AdminSessions", {
      user_id: u.user_id,
      session_token_hash: digest(token),
      identity_version: 1,
      expires_at: new Date(Date.now() + 28800000).toISOString(),
      idle_expires_at: new Date(Date.now() + 1800000).toISOString(),
      last_activity_at: new Date().toISOString(),
    });
  }
  transport = vi.fn(
    async (_url: string, request: { body: string; method: string }) => {
      expect(_url).toBe("https://script.google.com/macros/s/test/exec");
      expect(request.method).toBe("POST");
      return Response.json(
        e.context.SsoApiRouter.handle_({
          contentLength: Buffer.byteLength(request.body),
          postData: { contents: request.body, type: "application/json" },
        }),
      );
    },
  );
  vi.stubGlobal("fetch", transport);
});
afterEach(() => vi.unstubAllEnvs());
function loginAs(role: string) {
  cookies.values.set("central_sso_dev_session", tokens[role]);
}
function request(
  action: string,
  input: Record<string, unknown> = {},
  origin: string | null = "https://sso.example.sch.id",
) {
  return new NextRequest("https://sso.example.sch.id/api/panel", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(origin ? { Origin: origin } : {}),
    },
    body: JSON.stringify({ action, input }),
  });
}
test("HTTP01 cross-site dan origin kosong ditolak sebelum panggilan GAS", async () => {
  for (const origin of [null, "https://evil.example"])
    expect(
      (
        await POST(
          request("login", { username: "admin.utama", password }, origin),
        )
      ).status,
    ).toBe(403);
  expect(transport).not.toHaveBeenCalled();
});
test("HTTP02 tanpa cookie tidak dapat memuat dashboard", async () => {
  expect((await POST(request("dashboard"))).status).toBe(401);
  expect(transport).not.toHaveBeenCalled();
});
test("HTTP03 login melalui gateway HMAC dan KDF nyata membuat cookie HttpOnly, tanpa token pada body", async () => {
  const response = await POST(
      request("login", { username: "admin.utama", password }),
    ),
    body = await response.json();
  expect(response.status).toBe(200);
  expect(body.data.redirect).toBe("/admin");
  expect(JSON.stringify(body)).not.toContain("sessionToken");
  expect(cookies.writes).toHaveLength(1);
  expect(cookies.writes[0].options).toMatchObject({
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  expect(cookies.writes[0].value).toMatch(/^[a-f0-9]{64}$/);
  const rows = e.db.list("AdminSessions").items;
  expect(
    rows.some(
      (r: Record<string, string>) =>
        r.session_token_hash === digest(cookies.writes[0].value),
    ),
  ).toBe(true);
  expect(transport).toHaveBeenCalledTimes(2);
});
test("HTTP04 user biasa dan password salah tidak mendapatkan cookie administrator", async () => {
  expect(
    (await POST(request("login", { username: "user.utama", password }))).status,
  ).toBe(401);
  expect(cookies.writes).toHaveLength(0);
  expect(
    (
      await POST(
        request("login", {
          username: "admin.utama",
          password: "password salah",
        }),
      )
    ).status,
  ).toBe(401);
  expect(cookies.writes).toHaveLength(0);
});
test("HTTP05 Admin ditolak dari operasi aplikasi dan log, tetapi dapat membaca direktori role user", async () => {
  loginAs("admin");
  for (const action of [
    "apps.list",
    "logs.list",
    "settings.get",
    "reset.issue",
  ])
    expect((await POST(request(action))).status).toBe(403);
  const response = await POST(request("users.list"));
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.data.items).toHaveLength(1);
  expect(body.data.items[0].global_role).toBe("user");
  expect(JSON.stringify(body)).not.toContain("password_hash");
});
test("HTTP06 CRUD pengguna browser API tersimpan pada Spreadsheet test double dan konflik versi ditolak", async () => {
  loginAs("super_admin");
  const response = await POST(
    request("users.create", {
      user: {
        username: "guru.baru",
        full_name: "Guru Baru",
        email: "baru@example.sch.id",
        global_role: "user",
        status: "active",
      },
      password,
      operation_id: "op_" + randomUUID(),
    }),
  );
  expect(response.status).toBe(200);
  const body = await response.json(),
    id = body.data.user.user_id;
  expect(e.db.findById("Users", id).username).toBe("guru.baru");
  expect(JSON.stringify(body)).not.toContain("password_hash");
  const update = {
    user_id: id,
    expected_version: 1,
    patch: { full_name: "Nama terbaru" },
    operation_id: "op_" + randomUUID(),
  };
  expect((await POST(request("users.update", update))).status).toBe(200);
  expect(
    (
      await POST(
        request("users.update", {
          ...update,
          operation_id: "op_" + randomUUID(),
        }),
      )
    ).status,
  ).toBe(409);
  expect(e.db.findById("Users", id).full_name).toBe("Nama terbaru");
});
test("HTTP07 perubahan profil membatalkan sesi, lalu permintaan selanjutnya mengembalikan 401", async () => {
  loginAs("admin");
  expect(
    (
      await POST(
        request("profile.update", {
          patch: {
            full_name: "Nama Diperbarui",
            email: "admin@example.sch.id",
          },
          expected_version: 1,
          operation_id: "op_" + randomUUID(),
        }),
      )
    ).status,
  ).toBe(200);
  expect((await POST(request("dashboard"))).status).toBe(401);
});
test("HTTP08 logout mencabut sesi GAS dan menghapus cookie lokal", async () => {
  loginAs("admin");
  expect((await POST(request("logout"))).status).toBe(200);
  expect(cookies.writes.at(-1)?.value).toBe("");
  expect(cookies.writes.at(-1)?.options.expires).toEqual(new Date(0));
  const session = e.db.list("AdminSessions", {
    filters: { session_token_hash: digest(tokens.admin) },
  }).items[0];
  expect(session.revoked_at).toBeTruthy();
});
test("HTTP09 validasi input dan ukuran body ditolak tanpa memuat material password", async () => {
  loginAs("super_admin");
  const before = e.db.list("Users").total;
  expect(
    (
      await POST(
        request("users.create", {
          user: { username: "rusak" },
          password: "pendek",
          operation_id: "op_" + randomUUID(),
        }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await POST(
        request("login", {
          username: "admin.utama",
          password: "a".repeat(40000),
        }),
      )
    ).status,
  ).toBe(400);
  expect(e.db.list("Users").total).toBe(before);
});
test("HTTP10 error konfigurasi aman dan tidak membocorkan secret/stack", async () => {
  vi.stubEnv("SSO_GATEWAY_SECRET", "invalid-private-secret");
  loginAs("super_admin");
  const response = await POST(request("dashboard")),
    body = await response.json();
  expect(response.status).toBe(503);
  expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
  expect(JSON.stringify(body)).not.toContain("invalid-private-secret");
  expect(JSON.stringify(body)).not.toContain("stack");
  expect(response.headers.get("cache-control")).toBe("no-store");
});
test("HTTP11 login produksi menggunakan cookie __Host dengan Secure dan HttpOnly", async () => {
  vi.stubEnv("NODE_ENV", "production");
  const response = await POST(
    request("login", { username: "admin.utama", password }),
  );
  expect(response.status).toBe(200);
  expect(cookies.writes[0].name).toBe("__Host-central_sso_session");
  expect(cookies.writes[0].options).toMatchObject({
    secure: true,
    httpOnly: true,
    path: "/",
    sameSite: "lax",
  });
  expect("domain" in cookies.writes[0].options).toBe(false);
});
test("HTTP12 logout saat GAS terputus tetap menghapus cookie lokal dan melaporkan kegagalan", async () => {
  loginAs("admin");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("network private failure");
    }),
  );
  const response = await POST(request("logout"));
  expect(response.status).toBe(503);
  expect(cookies.writes.at(-1)?.value).toBe("");
  expect(cookies.writes.at(-1)?.options.expires).toEqual(new Date(0));
  expect(JSON.stringify(await response.json())).not.toContain(
    "private failure",
  );
});
test("HTTP13 perubahan zona waktu lolos seluruh validasi GAS dan terbaca sebagai preferensi Admin", async () => {
  loginAs("super_admin");
  const response = await POST(
    request("settings.update", {
      setting_key: "display_timezone",
      setting_value: "Asia/Makassar",
      expected_value: "Asia/Jakarta",
    }),
  );
  expect(response.status).toBe(200);
  expect(e.db.findById("Settings", "display_timezone").setting_value).toBe(
    "Asia/Makassar",
  );
  loginAs("admin");
  const preferences = await (await POST(request("preferences.get"))).json();
  expect(preferences.data.display_timezone).toBe("Asia/Makassar");
  expect(preferences.data.password_min_length).toBeUndefined();
});
test("HTTP14 edit profil menghapus cookie lama pada respons yang sama", async () => {
  loginAs("admin");
  const response = await POST(
    request("profile.update", {
      patch: { full_name: "Profil Baru", email: "admin@example.invalid" },
      expected_version: 1,
      operation_id: "op_" + randomUUID(),
    }),
  );
  expect(response.status).toBe(200);
  expect(cookies.writes.at(-1)?.value).toBe("");
});
test("HTTP15 sesi dicabut dibersihkan dari cookie pada error 401", async () => {
  loginAs("admin");
  const row = e.db.list("AdminSessions", {
    filters: { session_token_hash: digest(tokens.admin) },
  }).items[0];
  e.db.update("AdminSessions", row.session_id, {
    revoked_at: new Date().toISOString(),
  });
  expect((await POST(request("dashboard"))).status).toBe(401);
  expect(cookies.writes.at(-1)?.value).toBe("");
});
test("HTTP16 malformed response pengguna menjadi 503, tanpa memantulkan hash", async () => {
  loginAs("super_admin");
  const original = transport.getMockImplementation() as (
    ...args: unknown[]
  ) => Promise<Response>;
  transport.mockImplementation(async (...args: unknown[]) => {
    const response = await original(...args),
      value = await response.json();
    if (
      JSON.parse((args[1] as { body: string }).body).op === "panel.users.list"
    )
      value.data.items[0].password_hash = "rahasia-private";
    return Response.json(value);
  });
  const response = await POST(request("users.list"));
  expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toContain(
    "rahasia-private",
  );
});
test("HTTP17 preflight mensyaratkan Super Admin dan memuat environment GAS", async () => {
  loginAs("admin");
  expect((await POST(request("integration.preflight"))).status).toBe(403);
  loginAs("super_admin");
  const response = await POST(request("integration.preflight"));
  expect(response.status).toBe(200);
  expect((await response.json()).data).toEqual({
    environment: "development",
    schema_version: "1",
    integration_version: 1,
  });
});
test("HTTP18 Content-Type mirip JSON bukan application/json ditolak", async () => {
  loginAs("super_admin");
  const r = new NextRequest("https://sso.example.sch.id/api/panel", {
    method: "POST",
    headers: {
      Origin: "https://sso.example.sch.id",
      "Content-Type": "application/jsonp",
    },
    body: JSON.stringify({ action: "dashboard", input: {} }),
  });
  expect((await POST(r)).status).toBe(400);
  expect(transport).not.toHaveBeenCalled();
});
test("HTTP19 Sec-Fetch-Site cross-site ditolak meskipun Origin dipalsukan cocok", async () => {
  loginAs("super_admin");
  const r = request("dashboard");
  r.headers.set("sec-fetch-site", "cross-site");
  expect((await POST(r)).status).toBe(403);
  expect(transport).not.toHaveBeenCalled();
});
test("HTTP20 token reset yang diterbitkan sebelum perubahan profil ditolak", async () => {
  loginAs("super_admin");
  const issued = await (
    await POST(request("reset.issue", { user_id: users.admin.user_id }))
  ).json();
  loginAs("admin");
  expect(
    (
      await POST(
        request("profile.update", {
          patch: {
            full_name: "Profil terbaru",
            email: "admin@example.invalid",
          },
          expected_version: 1,
          operation_id: "op_" + randomUUID(),
        }),
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await POST(
        request("reset.complete", { token: issued.data.resetToken, password }),
      )
    ).status,
  ).toBe(401);
});
