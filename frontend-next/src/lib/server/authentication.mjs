import { frame, decode } from "./protocol.mjs";
import { verifyPassword, secret, digest, hashPassword } from "./password.mjs";
if (typeof window !== "undefined") throw new Error("Hanya server.");
function invalid() {
  return Object.assign(
    new Error(
      "Username atau password tidak valid, atau akun tidak dapat digunakan.",
    ),
    { code: "INVALID_CREDENTIALS" },
  );
}
function unavailable() {
  throw Object.assign(new Error("Respons autentikasi tidak valid."), {
    code: "SERVICE_UNAVAILABLE",
  });
}
function iso(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}
function changed(value, reauth = false) {
  if (
    value?.changed !== true ||
    (reauth && value.reauthentication_required !== true)
  )
    unavailable();
  return {
    changed: true,
    ...(reauth ? { reauthentication_required: true } : {}),
  };
}
function publicIdentity(data) {
  if (
    !data ||
    typeof data.sso_user_id !== "string" ||
    !/^[a-zA-Z0-9_.:-]{1,160}$/.test(data.sso_user_id) ||
    typeof data.username !== "string" ||
    !/^[a-z0-9][a-z0-9._-]{2,63}$/.test(data.username) ||
    typeof data.full_name !== "string" ||
    data.full_name.length > 40000 ||
    data.account_status !== "active" ||
    !Number.isSafeInteger(data.identity_version) ||
    data.identity_version < 1 ||
    typeof data.authenticated_at !== "string" ||
    !Number.isFinite(Date.parse(data.authenticated_at)) ||
    typeof data.request_id !== "string"
  )
    throw Object.assign(new Error("Respons server tidak valid."), {
      code: "SERVICE_UNAVAILABLE",
    });
  return {
    sso_user_id: data.sso_user_id,
    username: data.username,
    full_name: data.full_name,
    account_status: "active",
    identity_version: data.identity_version,
    authenticated_at: data.authenticated_at,
    request_id: data.request_id,
  };
}
export function createAuthentication(call) {
  async function runPassword(prepared, password) {
    if (
      !prepared ||
      !Object.hasOwn(prepared, "material") ||
      !Object.hasOwn(prepared, "challenge_id") ||
      (prepared.challenge_id !== null &&
        !/^chl_[0-9a-f]{64}$/.test(prepared.challenge_id)) ||
      (prepared.challenge_id === null && prepared.material !== null)
    )
      throw Object.assign(new Error("Respons persiapan tidak valid."), {
        code: "SERVICE_UNAVAILABLE",
      });
    const valid = await verifyPassword(password, prepared.material);
    return prepared.challenge_id ? valid : false;
  }
  return {
    async authenticateUser(envelope) {
      frame(envelope, "central-sso-app");
      if (envelope.op !== "authenticate.user")
        throw Object.assign(new Error("Operasi tidak diizinkan."), {
          code: "PERMISSION_DENIED",
        });
      const data = decode(envelope);
      if (
        Object.keys(data).sort().join(",") !== "password,username" ||
        typeof data.username !== "string" ||
        typeof data.password !== "string" ||
        !data.password.length ||
        Array.from(data.password).length > 1024 ||
        Buffer.byteLength(data.password) > 4096
      )
        throw Object.assign(new Error("Kredensial tidak valid."), {
          code: "VALIDATION_ERROR",
        });
      const prepared = await call("user.prepare", { client: envelope });
      const valid = await runPassword(prepared, data.password);
      return publicIdentity(
        await call("user.finish", {
          challenge_id: prepared.challenge_id,
          client: envelope,
          password_valid: valid,
        }),
      );
    },
    async loginAdministrator(username, password) {
      const nonce = secret();
      const prepared = await call("admin.prepare", {
        username,
        challenge_nonce: nonce,
      });
      const valid = await runPassword(prepared, password);
      const token = secret();
      const result = await call("admin.finish", {
        challenge_id: prepared.challenge_id,
        challenge_nonce: nonce,
        password_valid: valid,
        session_token_hash: digest(token),
      });
      const user = publicIdentity(result);
      if (
        !["super_admin", "admin"].includes(result.global_role) ||
        !iso(result.session_expires_at) ||
        Date.parse(result.session_expires_at) <= Date.now()
      )
        throw Object.assign(new Error("Respons sesi tidak valid."), {
          code: "SERVICE_UNAVAILABLE",
        });
      return {
        user: { ...user, global_role: result.global_role },
        sessionToken: token,
        expiresAt: result.session_expires_at,
      };
    },
    validateSession(token) {
      if (!/^[0-9a-f]{64}$/.test(token || "")) throw invalid();
      return call("session.validate", { session_token_hash: digest(token) });
    },
    async logout(token) {
      if (!/^[0-9a-f]{64}$/.test(token || "")) throw invalid();
      const result = await call("session.revoke", {
        session_token_hash: digest(token),
      });
      if (result?.revoked !== true) unavailable();
      return { revoked: true };
    },
    async replacePassword(sessionToken, password) {
      const policy = await call("password.policy", {}),
        material = await hashPassword(password, policy);
      return changed(
        await call("password.replace", {
          session_token_hash: digest(sessionToken),
          material,
          password_length: Array.from(password).length,
        }),
        true,
      );
    },
    async issueReset(sessionToken, userId) {
      const token = secret();
      const result = await call("password.reset.issue", {
        session_token_hash: digest(sessionToken),
        user_id: userId,
        token_hash: digest(token),
      });
      if (
        typeof result?.reset_id !== "string" ||
        !/^[a-zA-Z0-9_.:-]{1,160}$/.test(result.reset_id) ||
        !iso(result.expires_at) ||
        Date.parse(result.expires_at) <= Date.now()
      )
        unavailable();
      return {
        reset_id: result.reset_id,
        expires_at: result.expires_at,
        resetToken: token,
      };
    },
    async completeReset(resetToken, password) {
      if (!/^[0-9a-f]{64}$/.test(resetToken || ""))
        throw Object.assign(new Error("Token tidak valid."), {
          code: "VALIDATION_ERROR",
        });
      if (
        (await call("password.reset.check", { token_hash: digest(resetToken) }))
          ?.valid !== true
      )
        unavailable();
      const policy = await call("password.policy", {}),
        material = await hashPassword(password, policy);
      return changed(
        await call("password.reset.complete", {
          token_hash: digest(resetToken),
          material,
          password_length: Array.from(password).length,
        }),
      );
    },
  };
}
