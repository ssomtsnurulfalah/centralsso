import { randomBytes, randomUUID } from "node:crypto";
import { createPanelHttpClient } from "./panel-http-client.mjs";
import { sign } from "../../frontend-next/src/lib/server/protocol.mjs";
const operation = () => "op_" + randomUUID();
function ensure(value) {
  if (!value)
    throw Object.assign(new Error("Bukti integrasi tidak sesuai."), {
      code: "INTEGRATION_ASSERTION_FAILED",
    });
}
/** Cerita sama dipakai pada HTTPS lokal dan deployment staging, tanpa melewati auth. */
export async function runPanelIntegration({
  origin,
  username,
  password,
  fetchImpl = fetch,
  verifyStorage = async () => {},
}) {
  const main = createPanelHttpClient(origin, { fetchImpl }),
    admin = createPanelHttpClient(origin, { fetchImpl }),
    publicClient = createPanelHttpClient(origin, { fetchImpl });
  const prefix = "it7_" + randomBytes(6).toString("hex"),
    userPassword = "Uji integrasi pengguna " + randomBytes(16).toString("hex"),
    adminPassword = "Uji integrasi admin " + randomBytes(16).toString("hex"),
    newPassword = "Password baru integrasi " + randomBytes(16).toString("hex");
  const state = {
    prefix,
    user: null,
    admin: null,
    application: null,
    credentials: [],
    operations: [],
    primaryAuthenticated: false,
  };
  const results = [],
    cleanup = [];
  let current = "setup";
  async function step(name, callback) {
    current = name;
    await callback();
    results.push({ test: name, status: "PASS" });
  }
  async function denied(client, action, input, code) {
    const r = await client.panel(action, input);
    ensure(r.body.success === false && r.body.error?.code === code);
  }
  const mutate = () => {
    const id = operation();
    state.operations.push(id);
    return id;
  };
  async function publicApi(path, key, op, payload) {
    const envelope = sign(
      {
        aud: "central-sso-app",
        op,
        application_id: state.application.application_id,
        key_id: key.credential.key_id,
        payload,
      },
      key.client_secret,
    );
    const r = await main.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope),
    });
    return { status: r.status, body: await r.json() };
  }
  try {
    await step(
      "I01 halaman login dan redirect halaman terlindungi",
      async () => {
        const r = await publicClient.request("/login");
        ensure(
          r.status === 200 && (await r.text()).includes("PORTAL ADMINISTRATOR"),
        );
        const protectedPage = await publicClient.request("/admin");
        ensure(
          [307, 303].includes(protectedPage.status) &&
            protectedPage.headers.get("location")?.includes("/login"),
        );
      },
    );
    await step("I02 Origin asing ditolak", async () => {
      const r = await main.request("/api/panel", {
        method: "POST",
        headers: {
          Origin: "https://invalid.example",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "login",
          input: { username, password },
        }),
      });
      ensure(r.status === 403);
    });
    await step("I03 login Super Admin dan cookie produksi", async () => {
      const r = await main.panel("login", { username, password });
      ensure(r.status === 200 && r.body.data.redirect === "/admin");
      state.primaryAuthenticated = true;
      const cookie = r.headers.get("set-cookie") || "";
      ensure(
        cookie.startsWith("__Host-central_sso_session=") &&
          /;\s*HttpOnly/i.test(cookie) &&
          /;\s*Secure/i.test(cookie) &&
          /;\s*SameSite=Lax/i.test(cookie) &&
          /;\s*Path=\//i.test(cookie) &&
          !/;\s*Domain=/i.test(cookie),
      );
      ensure((await main.ok("profile.get")).user.global_role === "super_admin");
      const preflight = await main.ok("integration.preflight");
      if (
        !["staging", "development"].includes(preflight.environment) ||
        preflight.schema_version !== "1" ||
        preflight.integration_version !== 1
      )
        throw Object.assign(new Error(), { code: "STAGING_BACKEND_REQUIRED" });
    });
    await step("I04 seluruh halaman admin dapat dirender server", async () => {
      for (const path of [
        "/admin",
        "/admin/users",
        "/admin/applications",
        "/admin/credentials",
        "/admin/logs",
        "/admin/settings",
        "/admin/profile",
      ]) {
        const r = await main.request(path);
        const html = await r.text();
        ensure(
          r.status === 200 &&
            html.includes("main-content") &&
            !html.includes("NEXT_HTTP_ERROR_FALLBACK"),
        );
      }
    });
    await step("I05 dashboard, log, setting dan preferensi", async () => {
      ensure(Number.isInteger((await main.ok("dashboard")).users_total));
      await main.ok("logs.list", { kind: "authentication", filters: {} });
      await main.ok("logs.list", { kind: "audit", filters: {} });
      ensure((await main.ok("settings.get")).items.length > 0);
      ensure((await main.ok("preferences.get")).institution_name.length > 0);
    });
    await step("I06 tambah pengguna dan pembacaan ulang", async () => {
      state.user = (
        await main.ok("users.create", {
          user: {
            username: prefix,
            full_name: "Pengguna Integrasi Tahap 7",
            email: prefix + "@example.invalid",
            global_role: "user",
            status: "active",
          },
          password: userPassword,
          operation_id: mutate(),
        })
      ).user;
      const r = await main.ok("users.list", { query: prefix, page_size: 1 });
      ensure(
        r.items.some((u) => u.user_id === state.user.user_id) &&
          !JSON.stringify(r).includes("password_hash"),
      );
      await verifyStorage("user.created", state);
    });
    await step("I07 edit identitas, status dan konflik versi", async () => {
      const old = state.user;
      state.user = (
        await main.ok("users.update", {
          user_id: old.user_id,
          expected_version: old.identity_version,
          patch: { full_name: "Identitas Diperbarui", status: "inactive" },
          operation_id: mutate(),
        })
      ).user;
      ensure(
        state.user.user_id === old.user_id &&
          state.user.identity_version === old.identity_version + 1,
      );
      await denied(
        main,
        "users.update",
        {
          user_id: old.user_id,
          expected_version: old.identity_version,
          patch: { full_name: "Versi Lama" },
          operation_id: mutate(),
        },
        "VERSION_CONFLICT",
      );
      const r = await main.ok("users.list", {
        query: prefix,
        status: "inactive",
      });
      ensure(r.items[0].status === "inactive");
      await verifyStorage("user.updated", state);
    });
    await step("I08 aktifkan kembali dan buat admin uji", async () => {
      state.user = (
        await main.ok("users.update", {
          user_id: state.user.user_id,
          expected_version: state.user.identity_version,
          patch: { status: "active" },
          operation_id: mutate(),
        })
      ).user;
      state.admin = (
        await main.ok("users.create", {
          user: {
            username: prefix + "_admin",
            full_name: "Admin Integrasi",
            email: prefix + "_admin@example.invalid",
            global_role: "admin",
            status: "active",
          },
          password: adminPassword,
          operation_id: mutate(),
        })
      ).user;
    });
    await step("I09 login Admin dan penolakan operasi global", async () => {
      await admin.ok("login", {
        username: state.admin.username,
        password: adminPassword,
      });
      for (const action of ["apps.list", "settings.get", "reset.issue"])
        await denied(admin, action, {}, "PERMISSION_DENIED");
      ensure(
        (await admin.ok("users.list", { query: prefix })).items.every(
          (u) => u.global_role === "user",
        ),
      );
      await denied(
        admin,
        "users.update",
        {
          user_id: state.user.user_id,
          expected_version: state.user.identity_version,
          patch: { global_role: "super_admin" },
          operation_id: mutate(),
        },
        "PERMISSION_DENIED",
      );
    });
    await step("I10 profil membatalkan sesi dan cookie lama", async () => {
      state.admin = (
        await admin.ok("profile.update", {
          patch: {
            full_name: "Profil Admin Diperbarui",
            email: state.admin.email,
          },
          expected_version: state.admin.identity_version,
          operation_id: mutate(),
        })
      ).user;
      ensure(!admin.hasCookie());
      await denied(admin, "dashboard", {}, "UNAUTHENTICATED");
      await admin.ok("login", {
        username: state.admin.username,
        password: adminPassword,
      });
      await verifyStorage("profile.updated", state);
    });
    await step("I11 perubahan password dan login kembali", async () => {
      await admin.ok("password.change", { password: newPassword });
      ensure(!admin.hasCookie());
      await denied(admin, "dashboard", {}, "UNAUTHENTICATED");
      await admin.ok("login", {
        username: state.admin.username,
        password: newPassword,
      });
      await admin.ok("logout");
      await denied(admin, "dashboard", {}, "UNAUTHENTICATED");
    });
    await step("I12 registrasi aplikasi nonaktif", async () => {
      state.application = (
        await main.ok("apps.create", {
          application: {
            application_name: "Integrasi " + prefix,
            application_url:
              "https://" + prefix.replaceAll("_", "-") + ".example.invalid",
          },
          operation_id: mutate(),
        })
      ).application;
      ensure(
        state.application.application_status === "inactive" &&
          !state.application.api_access_enabled,
      );
      await verifyStorage("application.created", state);
    });
    await step(
      "I13 edit aplikasi, aktifkan API dan konflik versi",
      async () => {
        const old = state.application;
        state.application = (
          await main.ok("apps.update", {
            application_id: old.application_id,
            expected_version: old.record_version,
            patch: {
              application_description: "Integrasi frontend ke GAS",
              application_status: "active",
              api_access_enabled: true,
            },
            operation_id: mutate(),
          })
        ).application;
        await denied(
          main,
          "apps.disable",
          {
            application_id: old.application_id,
            expected_version: old.record_version,
            operation_id: mutate(),
          },
          "VERSION_CONFLICT",
        );
        ensure(
          (await main.ok("apps.list", { query: prefix })).items.some(
            (a) => a.application_id === old.application_id,
          ),
        );
      },
    );
    await step("I14 issue kredensial dan metadata tanpa secret", async () => {
      const c = await main.ok("credentials.issue", {
        application_id: state.application.application_id,
        options: {
          credential_name: "Kunci Integrasi",
          allowed_scopes: ["auth:verify", "directory:read", "user:status"],
          expires_in_seconds: 900,
        },
        operation_id: mutate(),
      });
      state.credentials.push(c);
      ensure(/^[a-f0-9]{64}$/.test(c.client_secret));
      const r = await main.ok("credentials.list", {
        application_id: state.application.application_id,
      });
      ensure(
        r.items.some((x) => x.credential_id === c.credential.credential_id) &&
          !JSON.stringify(r).includes(c.client_secret),
      );
      await verifyStorage("credential.issued", state);
    });
    await step("I15 API publik direktori, identitas dan status", async () => {
      const key = state.credentials[0];
      for (const [path, op, payload] of [
        ["/api/v1/directory/search", "directory.search", { query: prefix }],
        [
          "/api/v1/directory/get",
          "directory.get",
          { user_id: state.user.user_id },
        ],
        [
          "/api/v1/users/status",
          "user.status",
          { user_id: state.user.user_id },
        ],
      ]) {
        const r = await publicApi(path, key, op, payload);
        ensure(
          r.status === 200 &&
            r.body.success === true &&
            !JSON.stringify(r.body).includes("password_hash"),
        );
      }
    });
    await step("I16 autentikasi publik memakai identitas pusat", async () => {
      const r = await publicApi(
        "/api/v1/auth/verify",
        state.credentials[0],
        "authenticate.user",
        { username: state.user.username, password: userPassword },
      );
      ensure(
        r.status === 200 && r.body.data.sso_user_id === state.user.user_id,
      );
    });
    await step("I17 reset token satu kali dan password baru", async () => {
      const reset = await main.ok("reset.issue", {
        user_id: state.user.user_id,
      });
      await publicClient.ok("reset.complete", {
        token: reset.resetToken,
        password: newPassword,
      });
      await denied(
        publicClient,
        "reset.complete",
        { token: reset.resetToken, password: newPassword },
        "INVALID_CREDENTIALS",
      );
      const r = await publicApi(
        "/api/v1/auth/verify",
        state.credentials[0],
        "authenticate.user",
        { username: state.user.username, password: newPassword },
      );
      ensure(r.status === 200);
      await verifyStorage("password.reset", state);
    });
    await step("I18 ubah scope dan tolak direktori", async () => {
      const key = state.credentials[0];
      key.credential = (
        await main.ok("credentials.scopes", {
          credential_id: key.credential.credential_id,
          expected_revision: key.credential.revision,
          allowed_scopes: ["user:status"],
          operation_id: mutate(),
        })
      ).credential;
      const r = await publicApi(
        "/api/v1/directory/search",
        key,
        "directory.search",
        { query: prefix },
      );
      ensure(r.status === 403 && r.body.error.code === "PERMISSION_DENIED");
    });
    await step(
      "I19 rotasi, key lama ditolak dan key baru berfungsi",
      async () => {
        const old = state.credentials[0],
          next = await main.ok("credentials.rotate", {
            credential_id: old.credential.credential_id,
            expected_revision: old.credential.revision,
            options: { expires_in_seconds: 900 },
            operation_id: mutate(),
          });
        state.credentials.push(next);
        ensure(
          (
            await publicApi("/api/v1/users/status", old, "user.status", {
              user_id: state.user.user_id,
            })
          ).body.error?.code === "INVALID_CLIENT",
        );
        ensure(
          (
            await publicApi("/api/v1/users/status", next, "user.status", {
              user_id: state.user.user_id,
            })
          ).status === 200,
        );
        await verifyStorage("credential.rotated", state);
      },
    );
    await step("I20 pencabutan dan penolakan key", async () => {
      const key = state.credentials[1];
      key.credential = (
        await main.ok("credentials.revoke", {
          credential_id: key.credential.credential_id,
          expected_revision: key.credential.revision,
          operation_id: mutate(),
        })
      ).credential;
      ensure(
        (
          await publicApi("/api/v1/users/status", key, "user.status", {
            user_id: state.user.user_id,
          })
        ).body.error?.code === "INVALID_CLIENT",
      );
    });
    await step("I21 status operation registry dan audit", async () => {
      const id = state.operations.findLast(Boolean);
      ensure(
        (await main.ok("operation.get", { operation_id: id })).operation
          .state === "completed",
      );
      ensure(
        (
          await main.ok("logs.list", {
            kind: "audit",
            filters: { query: state.user.user_id },
          })
        ).items.length > 0,
      );
    });
    await step("I22 preferensi tersimpan dan terbaca ulang", async () => {
      const before = (await main.ok("settings.get")).items.find(
        (s) => s.setting_key === "display_timezone",
      );
      const value = before.setting_value === "UTC" ? "Asia/Jakarta" : "UTC";
      state.setting = { before: before.setting_value, current: value };
      await main.ok("settings.update", {
        setting_key: "display_timezone",
        setting_value: value,
        expected_value: before.setting_value,
      });
      ensure((await main.ok("preferences.get")).display_timezone === value);
      await main.ok("settings.update", {
        setting_key: "display_timezone",
        setting_value: before.setting_value,
        expected_value: value,
      });
      state.setting = null;
      await verifyStorage("settings.restored", state);
    });
    await step("I23 nonaktif aplikasi dengan ID tetap", async () => {
      state.application = (
        await main.ok("apps.disable", {
          application_id: state.application.application_id,
          expected_version: state.application.record_version,
          operation_id: mutate(),
        })
      ).application;
      ensure(state.application.application_status === "inactive");
      await verifyStorage("application.disabled", state);
    });
    await step("I24 arsip pengguna dan riwayat permanen", async () => {
      const list = await main.ok("users.list", { query: prefix });
      state.user = list.items.find((u) => u.user_id === state.user.user_id);
      state.user = (
        await main.ok("users.archive", {
          user_id: state.user.user_id,
          expected_version: state.user.identity_version,
          operation_id: mutate(),
        })
      ).user;
      ensure(
        (
          await main.ok("users.list", { query: prefix, status: "archived" })
        ).items.some((u) => u.user_id === state.user.user_id),
      );
      await verifyStorage("user.archived", state);
    });
  } catch (error) {
    results.push({
      test: current,
      status: "FAIL",
      code: /^[A-Z_]+$/.test(error?.code || "")
        ? error.code
        : "INTEGRATION_CHECK_FAILED",
      ...(Number.isInteger(error.http_status)
        ? { http_status: error.http_status }
        : {}),
    });
  } finally {
    if (state.primaryAuthenticated) {
      async function clean(name, fn) {
        try {
          await fn();
          cleanup.push({ test: name, status: "PASS" });
        } catch (error) {
          cleanup.push({
            test: name,
            status: "FAIL",
            code: /^[A-Z_]+$/.test(error?.code || "")
              ? error.code
              : "CLEANUP_FAILED",
          });
        }
      }
      if (state.setting)
        await clean("Pulihkan zona waktu", () =>
          main.ok("settings.update", {
            setting_key: "display_timezone",
            setting_value: state.setting.before,
            expected_value: state.setting.current,
          }),
        );
      if (state.application)
        await clean("Cabut semua key uji dan nonaktif aplikasi", async () => {
          const r = await main.ok("credentials.list", {
            application_id: state.application.application_id,
          });
          for (const c of r.items)
            if (c.status === "active")
              await main.ok("credentials.revoke", {
                credential_id: c.credential_id,
                expected_revision: c.revision,
                operation_id: operation(),
              });
          const apps = await main.ok("apps.list", { query: prefix });
          const app = apps.items.find(
            (a) => a.application_id === state.application.application_id,
          );
          if (app?.application_status === "active")
            await main.ok("apps.disable", {
              application_id: app.application_id,
              expected_version: app.record_version,
              operation_id: operation(),
            });
        });
      for (const [label, record] of [
        ["pengguna", state.user],
        ["admin", state.admin],
      ])
        if (record)
          await clean("Arsipkan " + label + " uji", async () => {
            const r = await main.ok("users.list", { query: record.username });
            const u = r.items.find((x) => x.user_id === record.user_id);
            if (u)
              await main.ok("users.archive", {
                user_id: u.user_id,
                expected_version: u.identity_version,
                operation_id: operation(),
              });
          });
      await clean("Logout Super Admin", async () => {
        await main.ok("logout");
        await denied(main, "dashboard", {}, "UNAUTHENTICATED");
      });
    }
  }
  return {
    success:
      results.length === 24 &&
      results.every((r) => r.status === "PASS") &&
      cleanup.every((r) => r.status === "PASS"),
    mode: "http-integration",
    results,
    cleanup,
    records: {
      user_id: state.user?.user_id,
      admin_user_id: state.admin?.user_id,
      application_id: state.application?.application_id,
      credential_ids: state.credentials.map((c) => c.credential.credential_id),
      operation_ids: state.operations,
    },
  };
}
