import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { sign } from "../frontend-next/src/lib/server/protocol.mjs";
import { secret, digest } from "../frontend-next/src/lib/server/password.mjs";
const { environment } = createRequire(import.meta.url)("./gas-mock.cjs");
const material = {
  password_hash: "a".repeat(128),
  password_salt: "b".repeat(32),
  password_algorithm: "scrypt",
  password_parameters: '{"N":131072,"r":8,"p":1,"keylen":64}',
};
const code = (expected) => (error) => {
  assert.equal(error.code, expected);
  return true;
};
const operation = () => "op_" + randomUUID();
function fixture() {
  const e = environment();
  e.initialize();
  e.db = e.db();
  e.gateway = secret();
  e.tokens = {};
  e.users = {};
  Object.assign(e.state.properties, {
    SSO_SPREADSHEET_ID: "test-id",
    SSO_ENVIRONMENT: "staging",
    SSO_GATEWAY_KEY_ID: "gateway",
    SSO_GATEWAY_SECRET: e.gateway,
    SSO_RATE_LIMIT_SECRET: secret(),
  });
  for (const role of ["super_admin", "admin", "user"]) {
    const u = e.db.insert("Users", {
        ...material,
        username: role + ".utama",
        full_name: "Nama " + role,
        email: role + "@example.invalid",
        global_role: role,
        status: "active",
      }),
      token = secret();
    e.users[role] = u;
    e.tokens[role] = token;
    e.db.insert("AdminSessions", {
      user_id: u.user_id,
      session_token_hash: digest(token),
      identity_version: 1,
      expires_at: new Date(Date.now() + 28800000).toISOString(),
      idle_expires_at: new Date(Date.now() + 1800000).toISOString(),
      last_activity_at: new Date().toISOString(),
    });
  }
  e.envelope = (op, payload = {}, extra = {}) =>
    sign(
      {
        aud: "central-sso-internal",
        key_id: "gateway",
        op,
        payload,
        timestamp: String(e.state.clock ?? Date.now()),
        ...extra,
      },
      e.gateway,
    );
  e.raw = (op, payload = {}, extra = {}) =>
    e.context.SsoAuthentication.create_(
      e.db,
      e.context.PropertiesService.getScriptProperties(),
    ).handle_(e.envelope(op, payload, extra));
  e.panel = (op, payload = {}, role = "super_admin") =>
    e.raw(op, { session_token_hash: digest(e.tokens[role]), ...payload });
  e.issue = (role = "admin") => {
    const token = secret(),
      result = e.panel("password.reset.issue", {
        user_id: e.users[role].user_id,
        token_hash: digest(token),
      });
    return { token, ...result };
  };
  return e;
}
test("S01 token reset lama ditolak setelah pengguna mengganti password", () => {
  const e = fixture(),
    reset = e.issue();
  e.panel(
    "password.replace",
    {
      material: { ...material, password_hash: "c".repeat(128) },
      password_length: 20,
    },
    "admin",
  );
  assert.throws(
    () => e.raw("password.reset.check", { token_hash: digest(reset.token) }),
    code("INVALID_CREDENTIALS"),
  );
  assert.equal(
    e.db.findById("PasswordResetTokens", reset.reset_id).status,
    "revoked",
  );
});
test("S02 token reset dicabut setelah profil berubah", () => {
  const e = fixture(),
    reset = e.issue();
  e.panel(
    "panel.profile.update",
    {
      patch: { full_name: "Profil berubah" },
      expected_version: 1,
      operation_id: operation(),
    },
    "admin",
  );
  assert.throws(
    () => e.raw("password.reset.check", { token_hash: digest(reset.token) }),
    code("INVALID_CREDENTIALS"),
  );
});
test("S03 token reset dicabut setelah perubahan role/status/username/arsip", () => {
  for (const patch of [
    { global_role: "user" },
    { status: "suspended" },
    { username: "admin.baru" },
    { status: "inactive", archived_at: new Date().toISOString() },
  ]) {
    const e = fixture(),
      reset = e.issue();
    e.db.update("Users", e.users.admin.user_id, patch, 1);
    assert.equal(
      e.db.findById("PasswordResetTokens", reset.reset_id).status,
      "revoked",
    );
  }
});
test("S04 kegagalan pencabutan reset menghentikan perubahan identitas", () => {
  const e = fixture(),
    reset = e.issue();
  e.spreadsheet.getSheetByName("PasswordResetTokens").failWrite = true;
  assert.throws(
    () =>
      e.db.update(
        "Users",
        e.users.admin.user_id,
        { full_name: "Tidak boleh tersimpan" },
        1,
      ),
    /Injected write failure/,
  );
  assert.equal(
    e.db.findById("Users", e.users.admin.user_id).identity_version,
    1,
  );
  assert.equal(
    e.db.findById("PasswordResetTokens", reset.reset_id).status,
    "active",
  );
});
test("S05 kegagalan write identitas tidak mengaktifkan kembali token yang sudah dicabut", () => {
  const e = fixture(),
    reset = e.issue();
  e.spreadsheet.getSheetByName("Users").failWrite = true;
  assert.throws(
    () =>
      e.db.update("Users", e.users.admin.user_id, { full_name: "Gagal" }, 1),
    /Injected write failure/,
  );
  assert.equal(
    e.db.findById("Users", e.users.admin.user_id).identity_version,
    1,
  );
  assert.equal(
    e.db.findById("PasswordResetTokens", reset.reset_id).status,
    "revoked",
  );
});
test("S06 percobaan update invalid tidak menghanguskan token reset", () => {
  const e = fixture(),
    reset = e.issue("super_admin");
  assert.throws(
    () =>
      e.db.update(
        "Users",
        e.users.super_admin.user_id,
        { status: "inactive" },
        1,
      ),
    code("LAST_SUPER_ADMIN"),
  );
  assert.equal(
    e.db.findById("PasswordResetTokens", reset.reset_id).status,
    "active",
  );
});
test("S07 perubahan identitas pengguna A tidak mencabut token pengguna B", () => {
  const e = fixture(),
    a = e.issue("admin"),
    b = e.issue("user");
  e.db.update("Users", e.users.admin.user_id, { full_name: "Nama baru" }, 1);
  assert.equal(
    e.db.findById("PasswordResetTokens", a.reset_id).status,
    "revoked",
  );
  assert.equal(
    e.db.findById("PasswordResetTokens", b.reset_id).status,
    "active",
  );
});
test("S08 pembaruan last_login tidak mencabut token reset atau mengubah versi identitas", () => {
  const e = fixture(),
    reset = e.issue();
  e.db.atomic_((tx) =>
    tx.touchLastLogin_(e.users.admin.user_id, 1, new Date().toISOString()),
  );
  assert.equal(
    e.db.findById("Users", e.users.admin.user_id).identity_version,
    1,
  );
  assert.equal(
    e.db.findById("PasswordResetTokens", reset.reset_id).status,
    "active",
  );
});
test("S09 aplikasi login terkunci tidak membuat counter baru untuk username acak", () => {
  const e = fixture();
  e.db.insert("AuthenticationRateLimits", {
    subject_key: e.context.SsoRequestSecurity.hmac(
      "application:",
      e.state.properties.SSO_RATE_LIMIT_SECRET,
    ),
    application_id: "",
    attempt_count: 100,
    window_started_at: new Date().toISOString(),
    locked_until: new Date(Date.now() + 900000).toISOString(),
  });
  const before = e.db.list("AuthenticationRateLimits").total;
  assert.throws(
    () =>
      e.raw("admin.prepare", {
        username: "acak.tidak.ada",
        challenge_nonce: secret(),
      }),
    code("RATE_LIMITED"),
  );
  assert.equal(e.db.list("AuthenticationRateLimits").total, before);
});
test("S10 cleanup hanya menghapus counter nonaktif lebih dari 48 jam dan dibatasi 500", () => {
  const e = fixture(),
    old = new Date(Date.now() - 3 * 86400000).toISOString();
  for (let start = 0; start < 503; start += 100)
    e.db.insertMany(
      "AuthenticationRateLimits",
      Array.from({ length: Math.min(100, 503 - start) }, (_, i) => ({
        subject_key: "old_" + (start + i),
        application_id: "",
        attempt_count: 1,
        window_started_at: old,
        updated_at: old,
      })),
    );
  e.db.insert("AuthenticationRateLimits", {
    subject_key: "active",
    application_id: "",
    attempt_count: 1,
    window_started_at: new Date().toISOString(),
  });
  e.db.insert("AuthenticationRateLimits", {
    subject_key: "future_lock",
    application_id: "",
    attempt_count: 1,
    window_started_at: old,
    updated_at: old,
    locked_until: new Date(Date.now() + 60000).toISOString(),
  });
  const logs = e.db.list("AuditLogs").total;
  assert.equal(e.context.cleanupSecurityState().AuthenticationRateLimits, 500);
  assert.equal(e.db.list("AuthenticationRateLimits").total, 5);
  assert.equal(e.context.cleanupSecurityState().AuthenticationRateLimits, 3);
  assert.equal(e.db.list("AuthenticationRateLimits").total, 2);
  assert.equal(e.db.list("AuditLogs").total, logs);
});
test("S11 cleanup rate limit menolak pemanggilan tanpa lock dan batas di luar 1–500", () => {
  const e = fixture();
  assert.throws(() => e.db.pruneRateLimits_(1), code("LOCK_REQUIRED"));
  for (const limit of [0, 501, "5"])
    assert.throws(
      () => e.db.atomic_((tx) => tx.pruneRateLimits_(limit)),
      code("VALIDATION_ERROR"),
    );
});
test("S12 gateway signature yang rusak ditolak sebelum menulis nonce atau sesi", () => {
  const e = fixture(),
    env = e.envelope("session.validate", {
      session_token_hash: digest(e.tokens.super_admin),
    });
  env.signature = "0".repeat(64);
  assert.throws(
    () =>
      e.context.SsoAuthentication.create_(
        e.db,
        e.context.PropertiesService.getScriptProperties(),
      ).handle_(env),
    code("INVALID_SIGNATURE"),
  );
  assert.equal(e.db.list("ReplayNonces").total, 0);
  assert.equal(e.db.list("AdminSessions").total, 3);
});
test("S13 nonce gateway sama tidak dapat dipakai dengan operation/request ID baru", () => {
  const e = fixture(),
    nonce = secret();
  e.raw(
    "session.validate",
    { session_token_hash: digest(e.tokens.super_admin) },
    { nonce },
  );
  assert.throws(
    () =>
      e.raw(
        "panel.dashboard",
        { session_token_hash: digest(e.tokens.super_admin) },
        { nonce },
      ),
    code("REPLAY_DETECTED"),
  );
});
test("S14 token sesi palsu, kosong dan akun user tidak bisa membaca panel", () => {
  const e = fixture();
  for (const hash of ["", digest(secret()), digest(e.tokens.user)])
    assert.throws(
      () => e.raw("panel.dashboard", { session_token_hash: hash }),
      code("UNAUTHENTICATED"),
    );
});
test("S15 admin tidak dapat menulis setting atau mempromosikan user melalui gateway", () => {
  const e = fixture();
  assert.throws(
    () =>
      e.panel(
        "panel.settings.update",
        {
          setting_key: "system_name",
          setting_value: "Ganti",
          expected_value: "Central SSO",
        },
        "admin",
      ),
    code("PERMISSION_DENIED"),
  );
  assert.throws(
    () =>
      e.panel(
        "panel.users.update",
        {
          user_id: e.users.user.user_id,
          expected_version: 1,
          patch: { global_role: "super_admin" },
          operation_id: operation(),
        },
        "admin",
      ),
    code("PERMISSION_DENIED"),
  );
  assert.equal(
    e.db.findById("Users", e.users.user.user_id).global_role,
    "user",
  );
});
test("S16 account suspended, archived, dan identity_version berubah membatalkan sesi", () => {
  for (const patch of [
    { status: "suspended" },
    { status: "inactive", archived_at: new Date().toISOString() },
    { email: "baru@example.invalid" },
  ]) {
    const e = fixture();
    e.db.update("Users", e.users.admin.user_id, patch, 1);
    assert.throws(
      () => e.panel("session.validate", {}, "admin"),
      code("UNAUTHENTICATED"),
    );
  }
});
test("S17 idle expiry dan revoked_at ditolak tanpa memperpanjang sesi", () => {
  for (const revoke of [false, true]) {
    const e = fixture(),
      row = e.db.list("AdminSessions", {
        filters: { user_id: e.users.admin.user_id },
      }).items[0];
    if (revoke)
      e.db.update("AdminSessions", row.session_id, {
        revoked_at: new Date().toISOString(),
      });
    else e.state.clock = Date.now() + 1801000;
    assert.throws(
      () => e.panel("session.validate", {}, "admin"),
      code("UNAUTHENTICATED"),
    );
    assert.equal(
      e.db.findById("AdminSessions", row.session_id).idle_expires_at,
      row.idle_expires_at,
    );
  }
});
test("S18 stale version, ID/actor injection dan duplicate operation tidak menimpa identitas", () => {
  const e = fixture(),
    id = operation(),
    payload = {
      user_id: e.users.user.user_id,
      expected_version: 1,
      patch: { full_name: "Nama sah" },
      operation_id: id,
    };
  e.panel("panel.users.update", payload);
  assert.throws(
    () =>
      e.panel("panel.users.update", { ...payload, operation_id: operation() }),
    code("VERSION_CONFLICT"),
  );
  assert.throws(
    () =>
      e.panel("panel.users.update", {
        ...payload,
        expected_version: 2,
        actor_user_id: e.users.user.user_id,
      }),
    code("VALIDATION_ERROR"),
  );
  assert.throws(
    () => e.panel("panel.users.update", { ...payload, expected_version: 2 }),
    code("OPERATION_ALREADY_PROCESSED"),
  );
  assert.equal(
    e.db.findById("Users", e.users.user.user_id).full_name,
    "Nama sah",
  );
});
test("S19 payload __proto__/constructor tidak mengubah prototipe atau role", () => {
  const e = fixture();
  for (const patch of [
    JSON.parse('{"__proto__":{"global_role":"super_admin"}}'),
    { constructor: { prototype: { global_role: "super_admin" } } },
  ])
    assert.throws(
      () =>
        e.panel("panel.users.update", {
          user_id: e.users.user.user_id,
          expected_version: 1,
          patch,
          operation_id: operation(),
        }),
      code("VALIDATION_ERROR"),
    );
  assert.equal({}.global_role, undefined);
  assert.equal(
    e.db.findById("Users", e.users.user.user_id).global_role,
    "user",
  );
});
test("S20 pencarian literal dan formula injection tidak dieksekusi sebagai formula", () => {
  const e = fixture(),
    name = '=IMPORTXML("https://example.invalid","//a")';
  e.db.update("Users", e.users.user.user_id, { full_name: name }, 1);
  const sheet = e.spreadsheet.getSheetByName("Users"),
    col = e.context.SsoSchema.tables.Users.columns.indexOf("full_name"),
    row = sheet.cells.find((r) => r[0] === e.users.user.user_id);
  assert.ok(row[col].startsWith("\u200b="));
  assert.equal(e.db.findById("Users", e.users.user.user_id).full_name, name);
  const r = e.panel("panel.users.list", { filters: { query: ".*" } });
  assert.equal(r.pagination.total, 0);
});
test("S21 corrupt header atau formula pada Sheet gagal tertutup", () => {
  for (const alter of [
    (e) => {
      e.spreadsheet.getSheetByName("Users").cells[0][1] = "header_salah";
    },
    (e) => {
      const sheet = e.spreadsheet.getSheetByName("Users");
      sheet.cells[1][2] = "=NOW()";
    },
  ]) {
    const e = fixture();
    alter(e);
    assert.throws(
      () => e.panel("panel.dashboard"),
      (error) =>
        ["SCHEMA_MISMATCH", "DATA_INTEGRITY_ERROR"].includes(error.code),
    );
  }
});
test("S22 lock contention tidak menerbitkan challenge/sesi atau menulis identitas", () => {
  const e = fixture();
  e.state.busy = true;
  assert.throws(
    () =>
      e.raw("admin.prepare", {
        username: e.users.admin.username,
        challenge_nonce: secret(),
      }),
    code("DATABASE_BUSY"),
  );
  assert.equal(
    e.spreadsheet.getSheetByName("AuthenticationChallenges").getLastRow(),
    1,
  );
  assert.equal(e.spreadsheet.getSheetByName("Users").getLastRow(), 4);
});
function clientFixture() {
  const e = fixture();
  e.app = e.db.insert("Applications", {
    application_name: "Aplikasi Keamanan",
    application_description: "Uji keamanan",
    application_url: "https://security.example.invalid",
    application_type: "web",
    application_status: "active",
    api_access_enabled: true,
  });
  e.clientSecret = secret();
  e.keyId = "key_" + randomUUID().replaceAll("-", "");
  e.issueOperation = operation();
  e.credential = e.panel("registry.credential.issue", {
    application_id: e.app.application_id,
    options: {
      credential_name: "Security key",
      allowed_scopes: ["auth:verify", "directory:read", "user:status"],
      expires_in_seconds: 900,
    },
    key_id: e.keyId,
    secret: e.clientSecret,
    operation_id: e.issueOperation,
  }).credential;
  e.client = (extra = {}) =>
    sign(
      {
        aud: "central-sso-app",
        op: "user.status",
        application_id: e.app.application_id,
        key_id: e.keyId,
        payload: { user_id: e.users.user.user_id },
        timestamp: String(e.state.clock ?? Date.now()),
        ...extra,
      },
      e.clientSecret,
    );
  return e;
}
test("S23 key aplikasi A tidak dapat dipakai untuk aplikasi B", () => {
  const e = clientFixture(),
    b = e.db.insert("Applications", {
      application_name: "B",
      application_url: "https://b.example.invalid",
      application_type: "web",
      application_status: "active",
      api_access_enabled: true,
    });
  assert.throws(
    () =>
      e.raw("directory.execute", {
        client: e.client({ application_id: b.application_id }),
      }),
    code("INVALID_CLIENT"),
  );
});
test("S24 replay client dan perubahan payload tanpa signature baru ditolak", () => {
  const e = clientFixture(),
    client = e.client();
  e.raw("directory.execute", { client });
  assert.throws(
    () => e.raw("directory.execute", { client }),
    code("REPLAY_DETECTED"),
  );
  const tampered = e.client();
  tampered.payload = Buffer.from(
    JSON.stringify({ user_id: e.users.admin.user_id }),
  ).toString("base64url");
  assert.throws(
    () => e.raw("directory.execute", { client: tampered }),
    code("INVALID_SIGNATURE"),
  );
});
test("S25 scope dipersempit segera menolak operasi di luar scope", () => {
  const e = clientFixture();
  e.panel("registry.credential.scopes", {
    credential_id: e.credential.credential_id,
    expected_revision: e.credential.revision,
    allowed_scopes: ["user:status"],
    operation_id: operation(),
  });
  assert.throws(
    () =>
      e.raw("directory.execute", {
        client: e.client({ op: "directory.search", payload: { query: "" } }),
      }),
    code("PERMISSION_DENIED"),
  );
  assert.equal(
    e.raw("directory.execute", { client: e.client() }).sso_user_id,
    e.users.user.user_id,
  );
});
test("S26 rotasi mencabut key lama dan hanya key baru yang dapat dipakai", () => {
  const e = clientFixture(),
    nextSecret = secret(),
    nextKey = "key_" + randomUUID().replaceAll("-", ""),
    r = e.panel("registry.credential.rotate", {
      credential_id: e.credential.credential_id,
      expected_revision: e.credential.revision,
      options: { expires_in_seconds: 900 },
      key_id: nextKey,
      secret: nextSecret,
      operation_id: operation(),
    });
  assert.equal(e.state.properties["SSO_CLIENT_SECRET_" + e.keyId], undefined);
  assert.throws(
    () => e.raw("directory.execute", { client: e.client() }),
    code("INVALID_CLIENT"),
  );
  const client = sign(
    {
      aud: "central-sso-app",
      op: "user.status",
      application_id: e.app.application_id,
      key_id: nextKey,
      payload: { user_id: e.users.user.user_id },
    },
    nextSecret,
  );
  assert.equal(
    e.raw("directory.execute", { client }).sso_user_id,
    e.users.user.user_id,
  );
  assert.equal(r.credential.usable, true);
});
test("S27 kegagalan hapus secret saat rotasi tetap mencabut key lama", () => {
  const e = clientFixture();
  e.state.propertyDeleteFailure = "SSO_CLIENT_SECRET_" + e.keyId;
  assert.throws(
    () =>
      e.panel("registry.credential.rotate", {
        credential_id: e.credential.credential_id,
        expected_revision: e.credential.revision,
        options: { expires_in_seconds: 900 },
        key_id: "new_key",
        secret: secret(),
        operation_id: operation(),
      }),
    /Injected property delete failure/,
  );
  assert.equal(
    e.db.findById("ApplicationCredentials", e.credential.credential_id).status,
    "revoked",
  );
  assert.throws(
    () => e.raw("directory.execute", { client: e.client() }),
    code("INVALID_CLIENT"),
  );
});
test("S28 key yang dicabut tetap ditolak walaupun secret yatim masih ada", () => {
  const e = clientFixture();
  e.panel("registry.credential.revoke", {
    credential_id: e.credential.credential_id,
    expected_revision: e.credential.revision,
    operation_id: operation(),
  });
  e.state.properties["SSO_CLIENT_SECRET_" + e.keyId] = e.clientSecret;
  assert.throws(
    () => e.raw("directory.execute", { client: e.client() }),
    code("INVALID_CLIENT"),
  );
});
test("S29 credential expired ditolak walaupun HMAC dan timestamp baru benar", () => {
  const e = clientFixture();
  e.state.clock = Date.now() + 901000;
  assert.throws(
    () => e.raw("directory.execute", { client: e.client() }),
    code("INVALID_CLIENT"),
  );
});
test("S30 credential dengan jurnal pending tidak dapat digunakan", () => {
  const e = clientFixture();
  e.db.update("OperationJournal", e.issueOperation, { state: "pending" });
  assert.throws(
    () => e.raw("directory.execute", { client: e.client() }),
    code("INVALID_CLIENT"),
  );
});
