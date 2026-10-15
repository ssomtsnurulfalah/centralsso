import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { runPanelIntegration } from "../scripts/lib/panel-integration-story.mjs";
test("L01 runner live menolak input tanpa konfirmasi staging sebelum koneksi jaringan", () => {
  const r = spawnSync(
    process.execPath,
    [new URL("../scripts/test-live-panel.mjs", import.meta.url).pathname],
    {
      input: JSON.stringify({ confirm_staging: false }),
      encoding: "utf8",
      timeout: 10000,
    },
  );
  assert.equal(r.status, 1);
  assert.equal(JSON.parse(r.stderr).error, "STAGING_CONFIRMATION_REQUIRED");
});
test("L02 runner menolak origin HTTP sebelum koneksi jaringan", async () => {
  let calls = 0;
  await assert.rejects(
    runPanelIntegration({
      origin: "http://example.invalid",
      username: "test",
      password: "private",
      fetchImpl: async () => {
        calls++;
        throw new Error();
      },
    }),
    (e) => e.code === "INVALID_TEST_ORIGIN",
  );
  assert.equal(calls, 0);
});
test("L03 preflight production menghentikan cerita sebelum mutasi dan tetap logout", async () => {
  const actions = [];
  const report = await runPanelIntegration({
    origin: "https://example.invalid",
    username: "test.super",
    password: "private",
    fetchImpl: async (url, options) => {
      const path = new URL(url).pathname;
      if (path === "/login") return new Response("PORTAL ADMINISTRATOR");
      if (path === "/admin")
        return new Response(null, {
          status: 307,
          headers: { Location: "/login" },
        });
      if (options.headers?.Origin === "https://invalid.example")
        return Response.json(
          { success: false, error: { code: "PERMISSION_DENIED" } },
          { status: 403 },
        );
      const { action } = JSON.parse(options.body);
      actions.push(action);
      const data =
        action === "login"
          ? { redirect: "/admin" }
          : action === "profile.get"
            ? { user: { global_role: "super_admin" } }
            : action === "integration.preflight"
              ? {
                  environment: "production",
                  schema_version: "1",
                  integration_version: 1,
                }
              : action === "logout"
                ? { redirect: "/login" }
                : null;
      if (action === "dashboard")
        return Response.json(
          { success: false, error: { code: "UNAUTHENTICATED" } },
          { status: 401 },
        );
      return Response.json(
        { success: true, data },
        {
          headers:
            action === "login"
              ? {
                  "Set-Cookie":
                    "__Host-central_sso_session=" +
                    "a".repeat(64) +
                    "; Path=/; Secure; HttpOnly; SameSite=Lax",
                }
              : action === "logout"
                ? {
                    "Set-Cookie":
                      "__Host-central_sso_session=; Path=/; Secure; HttpOnly; SameSite=Lax",
                  }
                : {},
        },
      );
    },
  });
  assert.equal(report.success, false);
  assert.equal(report.results.at(-1).code, "STAGING_BACKEND_REQUIRED");
  assert.ok(
    !actions.some(
      (a) =>
        a.startsWith("users.") ||
        a.startsWith("apps.") ||
        a.startsWith("settings."),
    ),
  );
  assert.equal(report.cleanup.at(-1).status, "PASS");
  assert.ok(actions.includes("logout"));
});
