/** HTTPS → Next produksi → gateway → source GAS → Spreadsheet test double. */
import http from "node:http";
import https from "node:https";
import { mkdtemp, readFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import {
  hashPassword,
  secret,
  digest,
} from "../frontend-next/src/lib/server/password.mjs";
import { runPanelIntegration } from "./lib/panel-integration-story.mjs";
import { createPanelHttpClient } from "./lib/panel-http-client.mjs";
const root = fileURLToPath(new URL("../", import.meta.url)),
  frontend = path.join(root, "frontend-next");
const { environment } = createRequire(import.meta.url)("../tests/gas-mock.cjs");
let folder, gas, proxy, child, report, currentSecurityCheck;
const receipts = new Map(),
  counts = { post: 0, redirect_get: 0, storage_assertions: 0 };
function ensure(value) {
  if (!value)
    throw Object.assign(new Error("Storage assertion failed."), {
      code: "STORAGE_ASSERTION_FAILED",
    });
}
function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}
function close(server) {
  return server
    ? new Promise((resolve) => server.close(resolve))
    : Promise.resolve();
}
try {
  await access(path.join(frontend, ".next/BUILD_ID"));
  folder = await mkdtemp(path.join(tmpdir(), "central-sso-stage7-"));
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-days",
      "1",
      "-keyout",
      path.join(folder, "key.pem"),
      "-out",
      path.join(folder, "cert.pem"),
      "-subj",
      "/CN=localhost",
      "-addext",
      "subjectAltName=DNS:localhost,IP:127.0.0.1",
    ],
    { stdio: "ignore" },
  );
  const key = await readFile(path.join(folder, "key.pem")),
    cert = await readFile(path.join(folder, "cert.pem"));
  const e = environment();
  e.initialize();
  const db = e.db();
  const password = "Fixture HTTPS " + secret(),
    gateway = secret();
  Object.assign(e.state.properties, {
    SSO_SPREADSHEET_ID: "test-id",
    SSO_ENVIRONMENT: "staging",
    SSO_GATEWAY_KEY_ID: "fixture_gateway",
    SSO_GATEWAY_SECRET: gateway,
    SSO_RATE_LIMIT_SECRET: secret(),
  });
  db.insert("Users", {
    username: "fixture.super",
    full_name: "Super Admin Fixture",
    email: "fixture@example.invalid",
    global_role: "super_admin",
    status: "active",
    ...(await hashPassword(password)),
  });
  gas = http.createServer(async (req, res) => {
    try {
      if (req.method === "POST" && req.url === "/gas") {
        let body = "";
        for await (const part of req) {
          body += part;
          if (Buffer.byteLength(body) > 50000) throw new Error();
        }
        const value = e.context.SsoApiRouter.handle_({
            contentLength: Buffer.byteLength(body),
            postData: { contents: body, type: "application/json" },
          }),
          receipt = randomUUID();
        receipts.set(receipt, value);
        counts.post++;
        res.writeHead(303, {
          Location:
            "https://script.googleusercontent.com/stage7-fixture?receipt=" +
            receipt,
        });
        res.end();
        return;
      }
      if (req.method === "GET" && req.url?.startsWith("/content/")) {
        const receipt = req.url.slice("/content/".length),
          value = receipts.get(receipt);
        if (!value) {
          res.writeHead(404);
          res.end();
          return;
        }
        receipts.delete(receipt);
        counts.redirect_get++;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(value));
        return;
      }
      res.writeHead(404);
      res.end();
    } catch {
      res.writeHead(500);
      res.end();
    }
  });
  const gasPort = await listen(gas),
    reservation = http.createServer(),
    nextPort = await listen(reservation);
  await close(reservation);
  proxy = https.createServer({ key, cert }, (req, res) => {
    const upstream = http.request(
      {
        hostname: "127.0.0.1",
        port: nextPort,
        path: req.url,
        method: req.method,
        headers: {
          ...req.headers,
          "x-forwarded-proto": "https",
          "x-forwarded-host": req.headers.host,
        },
      },
      (response) => {
        res.writeHead(response.statusCode, response.headers);
        response.pipe(res);
      },
    );
    upstream.on("error", () => {
      if (!res.headersSent) res.writeHead(503);
      res.end();
    });
    req.pipe(upstream);
  });
  const tlsPort = await listen(proxy),
    origin = "https://127.0.0.1:" + tlsPort;
  const fetchImpl = (url, options = {}) =>
    new Promise((resolve, reject) => {
      const request = https.request(
        url,
        {
          method: options.method || "GET",
          headers: options.headers,
          ca: cert,
          signal: options.signal,
        },
        (response) => {
          const chunks = [];
          response.on("data", (part) => chunks.push(part));
          response.on("end", () =>
            resolve(
              new Response(
                [204, 205, 304].includes(response.statusCode)
                  ? null
                  : Buffer.concat(chunks),
                {
                  status: response.statusCode,
                  headers: response.headers,
                },
              ),
            ),
          );
        },
      );
      request.on("error", reject);
      if (options.body) request.write(options.body);
      request.end();
    });
  child = spawn(
    process.execPath,
    [
      "--import",
      path.join(root, "tests/integration/gas-preload.mjs"),
      path.join(frontend, "node_modules/next/dist/bin/next"),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(nextPort),
    ],
    {
      cwd: frontend,
      env: {
        ...process.env,
        NODE_ENV: "production",
        NEXT_TELEMETRY_DISABLED: "1",
        SSO_TEST_FIXTURE: "stage7-local-only",
        SSO_TEST_TRANSPORT_URL: "http://127.0.0.1:" + gasPort,
        SSO_GAS_URL:
          "https://script.google.com/macros/s/central_sso_stage7_fixture/exec",
        SSO_GATEWAY_KEY_ID: "fixture_gateway",
        SSO_GATEWAY_SECRET: gateway,
        SSO_APP_ORIGIN: origin,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout.resume();
  child.stderr.resume();
  let ready = false;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) break;
    try {
      const response = await fetchImpl(origin + "/login", {
        signal: AbortSignal.timeout(1000),
      });
      if (response.status === 200) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (!ready)
    throw Object.assign(new Error("Next startup failed."), {
      code: "NEXT_START_FAILED",
    });
  report = await runPanelIntegration({
    origin,
    username: "fixture.super",
    password,
    fetchImpl,
    verifyStorage: async (point, state) => {
      counts.storage_assertions++;
      if (point.startsWith("user.")) {
        const u = db.findById("Users", state.user.user_id);
        ensure(
          u &&
            u.identity_version === state.user.identity_version &&
            u.status === state.user.status &&
            u.full_name === state.user.full_name,
        );
        if (point === "user.archived") ensure(!!u.archived_at);
      }
      if (point === "profile.updated")
        ensure(
          db.findById("Users", state.admin.user_id).full_name ===
            "Profil Admin Diperbarui",
        );
      if (point === "application.created" || point === "application.disabled") {
        const a = db.findById("Applications", state.application.application_id);
        ensure(
          a.record_version === state.application.record_version &&
            a.application_status === state.application.application_status,
        );
      }
      if (point === "credential.issued") {
        const c = state.credentials[0];
        ensure(
          e.state.properties["SSO_CLIENT_SECRET_" + c.credential.key_id] ===
            c.client_secret,
        );
        ensure(
          db.findById("ApplicationCredentials", c.credential.credential_id)
            .credential_fingerprint === digest(c.client_secret),
        );
      }
      if (point === "credential.rotated") {
        const [old, next] = state.credentials;
        ensure(
          !e.state.properties["SSO_CLIENT_SECRET_" + old.credential.key_id],
        );
        ensure(
          db.findById("ApplicationCredentials", old.credential.credential_id)
            .status === "revoked",
        );
        ensure(
          e.state.properties["SSO_CLIENT_SECRET_" + next.credential.key_id] ===
            next.client_secret,
        );
      }
      if (point === "password.reset")
        ensure(
          db.findById("Users", state.user.user_id).identity_version >
            state.user.identity_version,
        );
      if (point === "settings.restored")
        ensure(
          db.findById("Settings", "display_timezone").setting_value ===
            "Asia/Jakarta",
        );
    },
  });
  ensure(
    counts.post === counts.redirect_get &&
      counts.post > 0 &&
      receipts.size === 0,
  );
  for (const id of [
    report.records.user_id,
    report.records.admin_user_id,
  ].filter(Boolean))
    ensure(!!db.findById("Users", id).archived_at);
  if (report.records.application_id)
    ensure(
      db.findById("Applications", report.records.application_id)
        .application_status === "inactive",
    );
  if (report.success) {
    const expiring = createPanelHttpClient(origin, { fetchImpl });
    await expiring.ok("login", { username: "fixture.super", password });
    const session = db.all_("AdminSessions").findLast((r) => !r.revoked_at);
    db.update("AdminSessions", session.session_id, {
      idle_expires_at: new Date(Date.now() + 150).toISOString(),
    });
    await new Promise((resolve) => setTimeout(resolve, 220));
    const expired = await expiring.panel("dashboard");
    ensure(expired.status === 401 && !expiring.hasCookie());
    report.local_additional = [
      {
        test: "I25 idle expiry GAS menolak sesi dan menghapus cookie melalui HTTP",
        status: "PASS",
      },
    ];
  }
  if (report.success && process.argv.includes("--security")) {
    const anonymous = createPanelHttpClient(origin, { fetchImpl }),
      secured = createPanelHttpClient(origin, { fetchImpl }),
      checks = [];
    let firstNonce;
    function validateHtml(response, html) {
      const policy = response.headers.get("content-security-policy") || "",
        nonce = /'nonce-([A-Za-z0-9+/]{32})'/.exec(policy)?.[1];
      ensure(
        nonce &&
          !policy.includes("'unsafe-inline'") &&
          !policy.includes("'unsafe-eval'"),
      );
      const tags = html.match(/<script\b[^>]*>/gi) || [];
      ensure(
        tags.length > 0 &&
          tags.every((tag) => tag.includes('nonce="' + nonce + '"')),
      );
      ensure(response.headers.get("cache-control")?.includes("no-store"));
      return nonce;
    }
    async function securityCheck(name, fn) {
      currentSecurityCheck = name;
      await fn();
      checks.push({ test: name, status: "PASS" });
    }
    await securityCheck(
      "H01 CSP nonce, script SSR dan header produksi",
      async () => {
        const r = await anonymous.request("/login", {
          headers: {
            "x-nonce": "attacker_nonce",
            "Content-Security-Policy": "attacker_policy",
          },
        });
        ensure(r.status === 200);
        firstNonce = validateHtml(r, await r.text());
        ensure(
          r.headers.get("x-content-type-options") === "nosniff" &&
            r.headers.get("x-frame-options") === "DENY" &&
            r.headers.get("referrer-policy") === "no-referrer" &&
            r.headers.get("strict-transport-security")?.includes("31536000"),
        );
      },
    );
    await securityCheck(
      "H02 nonce berubah antar request dan tidak memakai input client",
      async () => {
        const r = await anonymous.request("/login");
        ensure(validateHtml(r, await r.text()) !== firstNonce);
      },
    );
    await securityCheck(
      "H03 header subrequest tidak melewati otorisasi",
      async () => {
        const headers = {
          "x-middleware-subrequest": "proxy:proxy:proxy:proxy:proxy",
          "Content-Type": "application/json",
          Origin: origin,
        };
        const r = await anonymous.request("/api/panel", {
          method: "POST",
          headers,
          body: JSON.stringify({ action: "dashboard", input: {} }),
        });
        ensure([400, 401, 403].includes(r.status));
        const page = await anonymous.request("/admin", {
          headers: {
            "x-middleware-subrequest": headers["x-middleware-subrequest"],
          },
        });
        ensure([307, 400, 403].includes(page.status));
      },
    );
    await securityCheck(
      "H04 metode GET dan CORS lintas origin ditolak",
      async () => {
        for (const path of ["/api/panel", "/api/v1/auth/verify"])
          ensure((await anonymous.request(path)).status === 405);
        const response = await anonymous.request("/api/panel", {
          method: "OPTIONS",
          headers: {
            Origin: "https://invalid.example",
            "Access-Control-Request-Method": "POST",
          },
        });
        ensure(!response.headers.has("access-control-allow-origin"));
      },
    );
    const attack = "<img src=x onerror=alert(1)><script>alert(2)</script>";
    await securityCheck(
      "H05 token reset lama ditolak setelah perubahan profil",
      async () => {
        await secured.ok("login", { username: "fixture.super", password });
        const user = (await secured.ok("profile.get")).user,
          reset = await secured.ok("reset.issue", { user_id: user.user_id });
        await secured.ok("profile.update", {
          patch: { full_name: attack, email: user.email },
          expected_version: user.identity_version,
          operation_id: "op_" + randomUUID(),
        });
        const result = await anonymous.panel("reset.complete", {
          token: reset.resetToken,
          password: "Password baru tidak boleh dipakai " + secret(),
        });
        ensure(
          result.status === 401 &&
            result.body.error.code === "INVALID_CREDENTIALS",
        );
        ensure(
          db.findById("PasswordResetTokens", reset.reset_id).status ===
            "revoked",
        );
      },
    );
    await securityCheck(
      "H06 markup identitas di-escape pada SSR dengan nonce sah",
      async () => {
        await secured.ok("login", { username: "fixture.super", password });
        const r = await secured.request("/admin"),
          html = await r.text();
        ensure(
          r.status === 200 &&
            !html.includes(attack) &&
            html.includes("&lt;img"),
        );
        validateHtml(r, html);
        await secured.ok("logout");
      },
    );
    report.security_additional = checks;
  }
  report = {
    ...report,
    environment:
      "HTTPS local; production Next; GAS source; Google/Spreadsheet test doubles",
    native_google_verified: false,
    counts,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.success) process.exitCode = 1;
} catch (error) {
  console.log(
    JSON.stringify(
      {
        success: false,
        ...(currentSecurityCheck
          ? { security_check: currentSecurityCheck }
          : {}),
        error: /^[A-Z_]+$/.test(error?.code || "")
          ? error.code
          : error?.code === "ENOENT"
            ? "BUILD_OR_OPENSSL_REQUIRED"
            : "LOCAL_INTEGRATION_FAILED",
        ...(report ? { report } : {}),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
  await close(proxy);
  await close(gas);
  if (folder) await rm(folder, { recursive: true, force: true });
}
