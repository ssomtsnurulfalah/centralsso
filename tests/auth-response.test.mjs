import { test } from "node:test";
import assert from "node:assert/strict";
import { createAuthentication } from "../frontend-next/src/lib/server/authentication.mjs";
import { secret } from "../frontend-next/src/lib/server/password.mjs";
const unavailable = (error) => {
  assert.equal(error.code, "SERVICE_UNAVAILABLE");
  return true;
};
test("R01 logout menolak revoked=false dan memproyeksikan revoked=true", async () => {
  await assert.rejects(
    createAuthentication(async () => ({ revoked: false })).logout(secret()),
    unavailable,
  );
  assert.deepEqual(
    await createAuthentication(async () => ({
      revoked: true,
      private: "jangan-kirim",
    })).logout(secret()),
    { revoked: true },
  );
});
test("R02 reset issue menolak expiry invalid atau ID invalid", async () => {
  for (const result of [
    { reset_id: "rst_ok", expires_at: "invalid" },
    {
      reset_id: "bad id",
      expires_at: new Date(Date.now() + 900000).toISOString(),
    },
    { reset_id: "rst_ok", expires_at: "2020-01-01T00:00:00.000Z" },
  ])
    await assert.rejects(
      createAuthentication(async () => result).issueReset(secret(), "usr_ok"),
      unavailable,
    );
});
test("R03 reset issue hanya mengembalikan DTO yang diizinkan", async () => {
  const expires_at = new Date(Date.now() + 900000).toISOString(),
    value = await createAuthentication(async () => ({
      reset_id: "rst_ok",
      expires_at,
      private: "jangan-kirim",
    })).issueReset(secret(), "usr_ok");
  assert.equal(value.reset_id, "rst_ok");
  assert.match(value.resetToken, /^[a-f0-9]{64}$/);
  assert.equal("private" in value, false);
});
test("R04 reset.check palsu ditolak sebelum kebijakan/KDF diakses", async () => {
  const calls = [],
    auth = createAuthentication(async (op) => {
      calls.push(op);
      return { valid: false };
    });
  await assert.rejects(
    auth.completeReset(secret(), "Password uji panjang 2026"),
    unavailable,
  );
  assert.deepEqual(calls, ["password.reset.check"]);
});
test("R05 password.replace memproyeksikan sukses, tidak memantulkan material KDF", async () => {
  const auth = createAuthentication(async (op, input) => {
    if (op === "password.policy") return { min_length: 15, max_length: 128 };
    assert.equal(op, "password.replace");
    assert.match(input.material.password_hash, /^[a-f0-9]{128}$/);
    return {
      changed: true,
      reauthentication_required: true,
      password_hash: "jangan-kirim",
    };
  });
  assert.deepEqual(
    await auth.replacePassword(secret(), "Password uji panjang 2026"),
    { changed: true, reauthentication_required: true },
  );
});
test("R06 password.replace menolak tanda sukses yang salah", async () => {
  const auth = createAuthentication(async (op) =>
    op === "password.policy"
      ? { min_length: 15, max_length: 128 }
      : { changed: true, reauthentication_required: false },
  );
  await assert.rejects(
    auth.replacePassword(secret(), "Password uji panjang 2026"),
    unavailable,
  );
});
