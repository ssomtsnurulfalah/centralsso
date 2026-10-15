import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createGasClient } from "./gas-client.mjs";
import { createAuthentication } from "./authentication.mjs";
import { createApplicationRegistry } from "./application-registry.mjs";
import { digest, hashPassword } from "./password.mjs";
import { cookieName } from "./web-security.mjs";
import * as schemas from "../panel-schema";
const envSchema = z.object({
  SSO_GAS_URL: z.url(),
  SSO_GATEWAY_KEY_ID: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
  SSO_GATEWAY_SECRET: z.string().regex(/^[a-f0-9]{64}$/),
  SSO_APP_ORIGIN: z.url(),
});
export function services() {
  const result = envSchema.safeParse(process.env);
  if (!result.success)
    throw Object.assign(new Error("Konfigurasi server belum lengkap."), {
      code: "SERVICE_UNAVAILABLE",
    });
  const env = result.data,
    call = createGasClient({
      url: env.SSO_GAS_URL,
      keyId: env.SSO_GATEWAY_KEY_ID,
      key: env.SSO_GATEWAY_SECRET,
    });
  return {
    call,
    auth: createAuthentication(call),
    registry: createApplicationRegistry(call),
  };
}
export async function sessionToken() {
  return (
    (await cookies()).get(cookieName(process.env.NODE_ENV === "production"))
      ?.value || ""
  );
}
function checked<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw Object.assign(new Error("Respons backend tidak valid."), {
      code: "SERVICE_UNAVAILABLE",
    });
  return result.data;
}
export async function validatedSession() {
  const token = await sessionToken();
  if (!/^[a-f0-9]{64}$/.test(token))
    throw Object.assign(new Error("Sesi tidak valid."), {
      code: "UNAUTHENTICATED",
    });
  return {
    token,
    user: checked(
      schemas.identity,
      await services().auth.validateSession(token),
    ),
  };
}
export const requireSession = cache(async () => {
  try {
    return await validatedSession();
  } catch (e) {
    if (
      (e as { code?: string }).code === "UNAUTHENTICATED" ||
      (e as { code?: string }).code === "INVALID_CREDENTIALS"
    )
      redirect("/login?expired=1");
    throw e;
  }
});
export async function panelCall<T>(
  token: string,
  op: string,
  input: Record<string, unknown>,
  schema: z.ZodType<T>,
): Promise<T> {
  return checked(
    schema,
    await services().call(op, { ...input, session_token_hash: digest(token) }),
  );
}
export async function createUser(
  token: string,
  input: z.infer<typeof schemas.userInput>,
  password: string,
  operation_id: string,
) {
  const { call } = services();
  // Authenticate and authorize before running an expensive KDF.
  const actor = checked(
    schemas.identity,
    await services().auth.validateSession(token),
  );
  if (actor.global_role !== "super_admin" && input.global_role !== "user")
    throw Object.assign(new Error("Akses ditolak."), {
      code: "PERMISSION_DENIED",
    });
  const policy = await call("password.policy", {}),
    material = await hashPassword(password, policy);
  return panelCall(
    token,
    "panel.users.create",
    {
      user: input,
      material,
      password_length: Array.from(password).length,
      operation_id,
    },
    z.object({ user: schemas.userRecord, operation_id: z.string() }),
  );
}
