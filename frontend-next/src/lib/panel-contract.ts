import { z } from "zod";
import * as s from "./panel-schema";
const hex = z.string().regex(/^[a-f0-9]{64}$/);
const iso = z.iso.datetime({ precision: 3 });
const optionalDate = z.union([iso, z.literal("")]);
const operationId = z.string().regex(/^op_[a-zA-Z0-9_-]{1,100}$/);
const application = z.object({
  application_id: s.id,
  application_name: z.string().min(1).max(320),
  application_description: z.string().max(4000),
  application_url: z.url().startsWith("https://"),
  application_type: z.string().regex(/^[a-z][a-z0-9_-]{1,31}$/),
  application_status: z.enum(["active", "inactive"]),
  api_access_enabled: z.boolean(),
  created_at: iso,
  updated_at: iso,
  record_version: s.version,
});
const scopes = z
  .array(z.enum(["auth:verify", "directory:read", "user:status"]))
  .min(1)
  .max(3)
  .refine((v) => new Set(v).size === v.length);
const credential = z
  .object({
    credential_id: s.id,
    application_id: s.id,
    credential_name: z.string().min(1).max(240),
    key_id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
    credential_fingerprint: hex,
    allowed_scopes: scopes,
    status: z.enum(["active", "revoked", "expired"]),
    effective_status: z.enum(["active", "revoked", "expired"]),
    lifecycle_committed: z.boolean(),
    usable: z.boolean(),
    created_at: iso,
    expires_at: iso,
    rotated_at: optionalDate,
    revoked_at: optionalDate,
    revision: hex,
  })
  .refine(
    (v) =>
      !v.usable || (v.lifecycle_committed && v.effective_status === "active"),
  );
const setting = z.object({
  setting_key: z.string().regex(/^[a-z_]{1,64}$/),
  setting_value: z.string().min(1).max(1024),
  description: z.string().max(2000),
  updated_at: iso,
});
function page<T extends z.ZodType>(item: T) {
  return z
    .object({ items: z.array(item).max(100), pagination: s.pagination })
    .refine(
      (v) =>
        v.items.length ===
        Math.min(
          v.pagination.page_size,
          Math.max(
            0,
            v.pagination.total -
              (v.pagination.page - 1) * v.pagination.page_size,
          ),
        ),
    );
}
const userMutation = z.object({
  user: s.userRecord,
  operation_id: operationId,
  reauthentication_required: z.boolean(),
});
const appMutation = z.object({ application, operation_id: operationId });
const credentialMutation = z.object({ credential, operation_id: operationId });
const issuedCredential = credentialMutation.extend({
  client_secret: hex,
  previous_credential_id: z.union([s.id, z.null()]),
});
export const panelResponses = {
  "integration.preflight": z.object({
    environment: z.enum(["development", "staging", "production"]),
    schema_version: z.literal("1"),
    integration_version: z.literal(1),
  }),
  login: z.object({ redirect: z.literal("/admin") }),
  "reset.complete": z.object({ redirect: z.literal("/login?changed=1") }),
  logout: z.object({ redirect: z.literal("/login") }),
  "preferences.get": z.object({
    system_name: z.string().min(1).max(160),
    institution_name: z.string().min(1).max(160),
    display_timezone: z.enum([
      "Asia/Jakarta",
      "Asia/Makassar",
      "Asia/Jayapura",
      "UTC",
    ]),
  }),
  dashboard: s.dashboard,
  "users.list": page(s.userRecord),
  "users.create": userMutation.omit({ reauthentication_required: true }),
  "users.update": userMutation,
  "users.archive": userMutation,
  "profile.get": z.object({ user: s.userRecord }),
  "profile.update": userMutation.extend({
    reauthentication_required: z.literal(true),
  }),
  "password.change": z.object({
    changed: z.literal(true),
    reauthentication_required: z.literal(true),
  }),
  "reset.issue": z.object({ reset_id: s.id, expires_at: iso, resetToken: hex }),
  "apps.list": page(application),
  "apps.create": appMutation,
  "apps.update": appMutation,
  "apps.disable": appMutation,
  "credentials.list": page(credential),
  "credentials.issue": issuedCredential.extend({
    previous_credential_id: z.null(),
  }),
  "credentials.rotate": issuedCredential.extend({
    previous_credential_id: s.id,
  }),
  "credentials.revoke": credentialMutation,
  "credentials.scopes": credentialMutation,
  "operation.get": z.object({
    operation: z.object({
      operation_id: operationId,
      operation_type: z.string().regex(/^(application|credential)\.[a-z]+$/),
      target_type: z.enum(["application", "credential", "credential_key"]),
      target_id: s.id,
      state: z.enum(["pending", "completed", "failed", "needs_reconciliation"]),
      created_at: iso,
      updated_at: iso,
      error_code: z.string().regex(/^[A-Z_]*$/),
    }),
  }),
  "logs.list": page(s.logRecord),
  "settings.get": z.object({ items: z.array(setting).max(100) }),
  "settings.update": z.object({ setting }),
};
export type PanelAction = keyof typeof panelResponses;
export function validatePanelData(
  action: string,
  value: unknown,
  input: Record<string, unknown> = {},
) {
  function fail(): never {
    throw Object.assign(new Error("Respons layanan tidak sesuai kontrak."), {
      code: "SERVICE_UNAVAILABLE",
    });
  }
  if (!Object.hasOwn(panelResponses, action)) fail();
  const result = panelResponses[action as PanelAction].safeParse(value);
  if (!result.success) fail();
  const data = result.data as Record<string, unknown>;
  if (
    input.operation_id !== undefined &&
    action !== "operation.get" &&
    data.operation_id !== input.operation_id
  )
    fail();
  if (["users.update", "users.archive"].includes(action)) {
    const user = data.user as z.infer<typeof s.userRecord>;
    if (
      user.user_id !== input.user_id ||
      user.identity_version !== Number(input.expected_version) + 1
    )
      fail();
    if (
      action === "users.archive" &&
      (!user.archived_at || user.status !== "inactive")
    )
      fail();
  }
  if (
    action === "profile.update" &&
    (data.user as z.infer<typeof s.userRecord>).identity_version !==
      Number(input.expected_version) + 1
  )
    fail();
  if ("pagination" in data) {
    const filters =
      action === "logs.list"
        ? (input.filters as Record<string, unknown> | undefined)
        : input;
    const p = data.pagination as z.infer<typeof s.pagination>;
    if (
      p.page !== (filters?.page ?? 1) ||
      (filters?.page_size !== undefined && p.page_size !== filters.page_size)
    )
      fail();
  }
  return result.data;
}
